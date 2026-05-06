/**
 * 微信支付服务 (API v3) - 终极修复版
 * 包含：延迟加载、严谨的证书解析、详细的错误日志、完整的 H5 风控场景
 */
import { prisma } from "./prisma";
import { OrderStatus } from "@/generated/prisma/client";
import { Wechatpay, Rsa, Formatter, Aes } from "wechatpay-axios-plugin";
import { yuanToFen, moneyStrictEqual } from "./money";

// 格式化证书/私钥：处理 \n、引号以及多行格式
const formatKey = (key?: string) => {
  if (!key) return "";
  return key
    .replace(/^["']|["']$/g, "") // 移除首尾引号
    .replace(/\\n/g, "\n")      // 将 \n 转换为真实换行
    .trim();
};

const getConfig = () => ({
  appId: process.env.WECHAT_PAY_APP_ID || process.env.WECHAT_APP_ID || "",
  mchId: process.env.WECHAT_PAY_MCH_ID || "",
  apiV3Key: process.env.WECHAT_PAY_API_V3_KEY || "",
  notifyUrl: process.env.WECHAT_PAY_NOTIFY_URL || "",
  serialNo: process.env.WECHAT_PAY_SERIAL_NO || "",
  privateKey: formatKey(process.env.WECHAT_PAY_KEY_PEM),
  platformPublicKey: formatKey(process.env.WECHAT_PAY_PLATFORM_PUBLIC_KEY),
  platformPublicKeyId: process.env.WECHAT_PAY_PLATFORM_PUBLIC_KEY_ID || "",
  siteUrl: process.env.NEXT_PUBLIC_APP_URL || "https://nihplod.cn",
  siteName: process.env.NEXT_PUBLIC_APP_NAME || "NIHPLOD",
});

let _wxpay: Wechatpay | null = null;
function getWxPay() {
  if (!_wxpay) {
    const config = getConfig();
    const required = ["privateKey", "mchId", "apiV3Key", "platformPublicKey", "platformPublicKeyId"];
    const missing = required.filter((k) => !config[k as keyof typeof config]);
    if (missing.length > 0) {
      console.warn(`⚠️ 微信支付配置不完整，缺少: ${missing.join(", ")}`);
      throw new Error("WECHAT_PAY_NOT_CONFIGURED");
    }
    _wxpay = new Wechatpay({
      mchid: config.mchId,
      serial: config.serialNo,
      privateKey: config.privateKey,
      certs: {
        [config.platformPublicKeyId]: config.platformPublicKey,
      },
    });
  }
  return _wxpay;
}

/**
 * 创建支付订单 (API v3)
 */
export async function createPayment(
  orderId: string,
  tradeType: "JSAPI" | "NATIVE" | "H5" = "JSAPI",
  openId?: string,
  clientIp: string = "127.0.0.1"
): Promise<{
  success: boolean;
  codeUrl?: string;
  mwebUrl?: string;
  payParams?: Record<string, string>;
  error?: string;
}> {
  try {
    const config = getConfig();
    const wxpay = getWxPay();
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });

    if (!order) return { success: false, error: "订单不存在" };
    if (order.status !== OrderStatus.PENDING && order.status !== OrderStatus.PAYING) {
      return { success: false, error: "订单状态不可支付" };
    }

    const amount = yuanToFen(order.payAmount);
    const description = `${config.siteName}-${order.items[0]?.productName || "订单"}`;

    let response: { data: { code_url?: string; prepay_id?: string; h5_url?: string } };

    if (tradeType === "NATIVE") {
      response = await wxpay.v3.pay.transactions.native.post({
        appid: config.appId,
        mchid: config.mchId,
        description,
        out_trade_no: order.orderNo,
        notify_url: config.notifyUrl,
        amount: { total: amount, currency: "CNY" },
      });
      return { success: true, codeUrl: response.data.code_url };
    }

    if (tradeType === "JSAPI") {
      if (!openId) return { success: false, error: "JSAPI支付需要OpenID" };
      response = await wxpay.v3.pay.transactions.jsapi.post({
        appid: config.appId,
        mchid: config.mchId,
        description,
        out_trade_no: order.orderNo,
        notify_url: config.notifyUrl,
        amount: { total: amount, currency: "CNY" },
        payer: { openid: openId },
      });

      const prepayId = response.data.prepay_id;
      const timeStamp = `${Formatter.timestamp()}`;
      const nonceStr = Formatter.nonce();
      const packageStr = `prepay_id=${prepayId}`;
      const paySign = Rsa.sign(
        Formatter.joinedByLineFeed(config.appId, timeStamp, nonceStr, packageStr),
        Rsa.from(config.privateKey, Rsa.KEY_TYPE_PRIVATE)
      );

      return {
        success: true,
        payParams: {
          appId: config.appId,
          timeStamp,
          nonceStr,
          package: packageStr,
          signType: "RSA",
          paySign,
        },
      };
    }

    if (tradeType === "H5") {
      response = await wxpay.v3.pay.transactions.h5.post({
        appid: config.appId,
        mchid: config.mchId,
        description,
        out_trade_no: order.orderNo,
        notify_url: config.notifyUrl,
        amount: { total: amount, currency: "CNY" },
        scene_info: {
          payer_client_ip: clientIp,
          h5_info: {
            type: "Wap",
            wap_url: config.siteUrl,
            wap_name: config.siteName,
          }
        },
      });
      return { success: true, mwebUrl: response.data.h5_url };
    }

    return { success: false, error: "不支持的支付类型" };
  } catch (error) {
    const err = error as { response?: { data?: { message?: string } }; message?: string };
    const errorMsg = err.response?.data?.message || err.message || "未知错误";
    console.error(`[WechatPay] 下单失败 (${orderId}):`, err.response?.data || err.message);
    return { success: false, error: errorMsg };
  }
}

/**
 * 通用的验签与解密逻辑
 */
async function verifyAndDecrypt(headers: Record<string, string>, rawBody: string) {
  const config = getConfig();
  const signature = headers["wechatpay-signature"];
  const timestamp = headers["wechatpay-timestamp"];
  const nonce = headers["wechatpay-nonce"];

  if (!signature || !timestamp || !nonce) throw new Error("MISSING_HEADERS");

  // 校验时间戳 freshness，防止重放攻击（±5 分钟窗口）
  const now = Math.floor(Date.now() / 1000);
  const ts = parseInt(timestamp, 10);
  if (isNaN(ts) || Math.abs(now - ts) > 300) {
    throw new Error("TIMESTAMP_EXPIRED");
  }

  // 使用平台公钥验签原始文本
  const verified = Rsa.verify(
    Formatter.response(timestamp, nonce, rawBody),
    signature,
    Rsa.from(config.platformPublicKey, Rsa.KEY_TYPE_PUBLIC)
  );

  if (!verified) throw new Error("VERIFY_SIGNATURE_FAILED");

  const body = JSON.parse(rawBody);
  const { resource } = body;

  const result = Aes.AesGcm.decrypt(
    resource.nonce,
    config.apiV3Key,
    resource.ciphertext,
    resource.associated_data
  ) as string;

  return JSON.parse(result);
}

/**
 * 处理支付成功通知
 */
export async function handlePaymentNotify(
  headers: Record<string, string>,
  rawBody: string
): Promise<{ success: boolean; message?: string }> {
  try {
    const data = await verifyAndDecrypt(headers, rawBody);
    console.log(`[WechatPay] 收到支付通知: ${data.out_trade_no}, 状态: ${data.trade_state}`);

    if (data.trade_state !== "SUCCESS") return { success: false, message: "支付未成功" };

    const orderNo = data.out_trade_no;
    const transactionId = data.transaction_id;
    const totalFee = data.amount.total;

    await prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { orderNo },
        include: { items: true },
      });
      if (!order) throw new Error("ORDER_NOT_FOUND");
      
      // 支付回调金额必须严格相等，不容忍任何差异
      if (!moneyStrictEqual(order.payAmount, totalFee / 100)) {
        throw new Error("AMOUNT_MISMATCH");
      }
      
      // 终态拦截：已取消/已退款/退款中/已完成 的订单不应再被支付激活
      const terminalStatuses: OrderStatus[] = [
        OrderStatus.CANCELLED,
        OrderStatus.REFUNDED,
        OrderStatus.REFUNDING,
        OrderStatus.COMPLETED,
        OrderStatus.DELIVERED,
      ];
      if (terminalStatuses.includes(order.status)) {
        console.warn(`[WechatPay] 订单 ${orderNo} 已处于终态 ${order.status}，忽略支付通知`);
        return;
      }

      if (order.status === OrderStatus.PAID) return;

      await tx.order.update({
        where: { orderNo },
        data: {
          status: OrderStatus.PAID,
          paymentMethod: "wechat",
          paymentNo: transactionId,
          paymentTime: new Date(),
        },
      });

      // 更新商品销量
      for (const item of order.items) {
        await tx.product.update({
          where: { id: item.productId },
          data: { salesCount: { increment: item.quantity } },
        });
      }

      // 将锁定的优惠券标记为已使用
      const lockedCoupon = await tx.userCoupon.findFirst({
        where: { orderId: order.id, status: "LOCKED" },
      });
      if (lockedCoupon) {
        await tx.userCoupon.update({
          where: { id: lockedCoupon.id },
          data: { status: "USED", usedAt: new Date() },
        });
      }
    });

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知错误";
    console.error("[WechatPay] 处理支付通知失败:", message);
    // 对外返回模糊错误，避免信息泄露
    return { success: false, message: "PROCESSING_FAILED" };
  }
}

/**
 * 申请退款
 */
export async function applyWechatRefund(
  orderNo: string,
  refundNo: string,
  totalFee: number,
  refundFee: number,
  reason?: string
): Promise<{ success: boolean; refundId?: string; error?: string }> {
  try {
    const wxpay = getWxPay();
    const response = (await wxpay.v3.refund.domestic.refunds.post({
      out_trade_no: orderNo,
      out_refund_no: refundNo,
      reason: reason || "客户申请退款",
      notify_url: process.env.WECHAT_PAY_REFUND_NOTIFY_URL || "",
      amount: {
        refund: Math.round(refundFee * 100),
        total: Math.round(totalFee * 100),
        currency: "CNY",
      },
    })) as { data: { refund_id: string } };

    return { success: true, refundId: response.data.refund_id };
  } catch (error) {
    const err = error as { response?: { data?: { message?: string } }; message?: string };
    const detail = err.response?.data;
    console.error("[WechatPay] 申请退款失败:", detail || err.message);
    return { success: false, error: detail?.message || "退款申请失败" };
  }
}

/**
 * 处理退款成功通知
 */
export async function handleRefundNotify(
  headers: Record<string, string>,
  rawBody: string
): Promise<{ success: boolean; message?: string }> {
  try {
    const data = await verifyAndDecrypt(headers, rawBody);
    console.log(`[WechatPay] 收到退款通知: ${data.out_trade_no}, 状态: ${data.refund_status}`);

    if (data.refund_status === "SUCCESS") {
      const order = await prisma.order.findUnique({
        where: { orderNo: data.out_trade_no },
      });

      if (!order) {
        return { success: false, message: "订单不存在" };
      }

      if (order.status === OrderStatus.REFUNDED) {
        return { success: true, message: "订单已退款" };
      }

      // 调用统一退款确认逻辑（恢复库存、回滚销量、释放优惠券）
      const { finalizeRefund } = await import("./refund");
      const refundAmount = (data.amount?.refund || 0) / 100;
      await finalizeRefund(order.id, data.refund_id, refundAmount);

      // 追加 adminNote
      await prisma.order.update({
        where: { orderNo: data.out_trade_no },
        data: {
          adminNote: order.adminNote
            ? `${order.adminNote}\n微信自动退款成功 (单号: ${data.refund_id}, 时间: ${data.success_time})`
            : `微信自动退款成功 (单号: ${data.refund_id}, 时间: ${data.success_time})`,
        },
      });
    }

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知错误";
    console.error("[WechatPay] 处理退款通知失败:", message);
    return { success: false, message: message };
  }
}

export function generateRefundNo(orderNo: string): string {
  return `R${orderNo}${Date.now().toString().slice(-4)}`;
}
