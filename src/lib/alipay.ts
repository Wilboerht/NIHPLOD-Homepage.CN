/**
 * 支付宝支付服务
 * 实现手机网站支付（H5）
 */
import crypto from "crypto";
import { prisma } from "./prisma";
import { OrderStatus } from "@/generated/prisma/client";
import { formatMoney, moneyEqual } from "./money";

// 格式化密钥：处理 \n 和首尾引号
const formatKey = (key?: string) => {
  if (!key) return "";
  return key
    .replace(/^["']|["']$/g, "")
    .replace(/\\n/g, "\n")
    .trim();
};

// 支付宝配置
const ALIPAY_CONFIG = {
  appId: process.env.ALIPAY_APP_ID || "",
  privateKey: formatKey(process.env.ALIPAY_PRIVATE_KEY),
  alipayPublicKey: formatKey(process.env.ALIPAY_PUBLIC_KEY),
  notifyUrl: process.env.ALIPAY_NOTIFY_URL || "",
  returnUrl: process.env.ALIPAY_RETURN_URL || "",
  gateway: "https://openapi.alipay.com/gateway.do",
};

/**
 * RSA2 签名
 */
function signWithRSA2(content: string, privateKey: string): string {
  const sign = crypto.createSign("RSA-SHA256");
  sign.update(content, "utf8");
  return sign.sign(
    `-----BEGIN RSA PRIVATE KEY-----\n${privateKey}\n-----END RSA PRIVATE KEY-----`,
    "base64"
  );
}

/**
 * RSA2 验签
 */
function verifyWithRSA2(content: string, sign: string, publicKey: string): boolean {
  try {
    const verify = crypto.createVerify("RSA-SHA256");
    verify.update(content, "utf8");
    return verify.verify(
      `-----BEGIN PUBLIC KEY-----\n${publicKey}\n-----END PUBLIC KEY-----`,
      sign,
      "base64"
    );
  } catch {
    return false;
  }
}

/**
 * 生成待签名字符串
 */
function buildSignContent(params: Record<string, string>): string {
  return Object.keys(params)
    .filter((key) => params[key] !== undefined && params[key] !== "")
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");
}

/**
 * 创建支付宝支付（手机网站支付）
 */
export async function createAlipayPayment(orderId: string): Promise<{
  success: boolean;
  payUrl?: string;
  error?: string;
}> {
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });

    if (!order) {
      return { success: false, error: "订单不存在" };
    }

    if (order.status !== OrderStatus.PENDING && order.status !== OrderStatus.PAYING) {
      return { success: false, error: "订单状态不正确" };
    }

    // 构建业务参数
    const bizContent = {
      out_trade_no: order.orderNo,
      total_amount: formatMoney(order.payAmount),
      subject: `你好朵朵-${order.items[0]?.productName || "商品"}`,
      body: `订单号: ${order.orderNo}, 商品数量: ${order.items.length}`,  // 订单描述
      product_code: "QUICK_WAP_WAY",
    };

    // 构建公共参数
    const params: Record<string, string> = {
      app_id: ALIPAY_CONFIG.appId,
      method: "alipay.trade.wap.pay",
      format: "JSON",
      charset: "utf-8",
      sign_type: "RSA2",
      timestamp: new Date().toISOString().replace("T", " ").slice(0, 19),
      version: "1.0",
      notify_url: ALIPAY_CONFIG.notifyUrl,
      return_url: ALIPAY_CONFIG.returnUrl,
      biz_content: JSON.stringify(bizContent),
    };

    // 签名
    const signContent = buildSignContent(params);
    params.sign = signWithRSA2(signContent, ALIPAY_CONFIG.privateKey);

    // 构建跳转 URL
    const query = Object.keys(params)
      .map((key) => `${key}=${encodeURIComponent(params[key])}`)
      .join("&");

    const payUrl = `${ALIPAY_CONFIG.gateway}?${query}`;

    return { success: true, payUrl };
  } catch (error) {
    console.error("[Alipay] 创建支付失败:", error);
    return { success: false, error: "支付创建失败" };
  }
}

/**
 * 处理支付宝异步通知
 */
export async function handleAlipayNotify(
  params: Record<string, string>
): Promise<{ success: boolean; message?: string }> {
  try {
    // 验证签名
    const sign = params.sign;
    const signType = params.sign_type;

    if (!sign || !signType) {
      console.error("[Alipay] 缺少签名参数");
      return { success: false, message: "缺少签名参数" };
    }

    // 移除 sign 和 sign_type 后验签
    const verifyParams = { ...params };
    delete verifyParams.sign;
    delete verifyParams.sign_type;

    const signContent = buildSignContent(verifyParams);

    if (signType !== "RSA2") {
      console.error("[Alipay] 不支持的签名类型");
      return { success: false, message: "不支持的签名类型" };
    }
    if (!verifyWithRSA2(signContent, sign, ALIPAY_CONFIG.alipayPublicKey)) {
      console.error("[Alipay] 签名验证失败");
      return { success: false, message: "签名验证失败" };
    }

    // 检查交易状态
    if (params.trade_status !== "TRADE_SUCCESS" && params.trade_status !== "TRADE_FINISHED") {
      return { success: false, message: "交易未成功" };
    }

    const orderNo = params.out_trade_no;
    const tradeNo = params.trade_no;

    // 使用事务更新订单状态
    await prisma.$transaction(async (tx) => {
      // 获取订单信息
      const order = await tx.order.findUnique({
        where: { orderNo },
        include: { items: true },
      });

      if (!order) {
        throw new Error("订单不存在");
      }

      // 校验支付金额
      const notifyAmount = parseFloat(params.total_amount || "0");
      if (!moneyEqual(order.payAmount, notifyAmount)) {
        throw new Error("AMOUNT_MISMATCH");
      }

      // 订单已取消，不应再被支付激活（避免超卖）
      if (order.status === OrderStatus.CANCELLED) {
        console.error(`[Alipay] 订单 ${orderNo} 已取消，但收到支付成功通知，需人工介入处理`);
        // 返回成功让支付宝停止重试，但不做状态变更
        return;
      }

      if (order.status === OrderStatus.PAID) return;

      // 更新订单状态
      await tx.order.update({
        where: { orderNo },
        data: {
          status: OrderStatus.PAID,
          paymentMethod: "alipay",
          paymentNo: tradeNo,
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

    console.log(`[Alipay] 订单支付成功: ${orderNo}`);
    return { success: true };
  } catch (error) {
    console.error("[Alipay] 处理回调失败:", error);
    return { success: false, message: "处理失败" };
  }
}

/**
 * 支付宝退款（内部函数，已废弃，使用 applyAlipayRefund）
 */
export async function refundAlipayOrder(
  outTradeNo: string,
  refundAmount: number,
  refundReason: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // 验证退款金额
    if (!refundAmount || refundAmount <= 0) {
      return { success: false, error: "退款金额必须大于0" };
    }

    // 金额精度检查：确保金额精确到分
    const refundAmountInFen = Math.round(refundAmount * 100);
    if (refundAmountInFen <= 0) {
      return { success: false, error: "退款金额过小，最小为0.01元" };
    }

    const bizContent = {
      out_trade_no: outTradeNo,
      refund_amount: refundAmount.toFixed(2),
      refund_reason: refundReason,
    };

    const params: Record<string, string> = {
      app_id: ALIPAY_CONFIG.appId,
      method: "alipay.trade.refund",
      format: "JSON",
      charset: "utf-8",
      sign_type: "RSA2",
      timestamp: new Date().toISOString().replace("T", " ").slice(0, 19),
      version: "1.0",
      biz_content: JSON.stringify(bizContent),
    };

    // 签名
    const signContent = buildSignContent(params);
    params.sign = signWithRSA2(signContent, ALIPAY_CONFIG.privateKey);

    // 发起请求
    const query = Object.keys(params)
      .map((key) => `${key}=${encodeURIComponent(params[key])}`)
      .join("&");

    const url = `${ALIPAY_CONFIG.gateway}?${query}`;

    const res = await fetch(url);
    const data = await res.json();

    const response = data.alipay_trade_refund_response;
    if (response && response.code === "10000") {
      console.log(`[Alipay] 退款成功: ${outTradeNo}, 退款金额: ${refundAmount}`);
      return { success: true };
    } else {
      const errorMsg = response?.sub_msg || response?.msg || "退款失败";
      console.error("[Alipay] 退款失败:", response);
      return { success: false, error: errorMsg };
    }

  } catch (e) {
    console.error("[Alipay] 退款异常:", e);
    return { success: false, error: "Alipay Refund API Error" };
  }
}

/**
 * 申请支付宝退款
 */
export async function applyAlipayRefund(data: {
  tradeNo: string;
  refundAmount: string;
  refundReason: string;
}): Promise<{ success: boolean; refundNo?: string; error?: string }> {
  try {
    const result = await refundAlipayOrder(
      data.tradeNo,
      parseFloat(data.refundAmount),
      data.refundReason
    );

    if (result.success) {
      return {
        success: true,
        refundNo: `${data.tradeNo}-${Date.now()}`,
      };
    } else {
      return {
        success: false,
        error: result.error,
      };
    }
  } catch (e) {
    console.error("[Alipay] 申请退款异常:", e);
    return { success: false, error: "Alipay Refund API Error" };
  }
}
