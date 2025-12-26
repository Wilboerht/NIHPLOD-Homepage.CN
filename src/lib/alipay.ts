/**
 * 支付宝支付服务
 * 实现手机网站支付（H5）
 */
import crypto from "crypto";
import { prisma } from "./prisma";
import { OrderStatus } from "@/generated/prisma/client";

// 支付宝配置
const ALIPAY_CONFIG = {
  appId: process.env.ALIPAY_APP_ID || "",
  privateKey: process.env.ALIPAY_PRIVATE_KEY || "",
  alipayPublicKey: process.env.ALIPAY_PUBLIC_KEY || "",
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

    if (order.status !== OrderStatus.PENDING) {
      return { success: false, error: "订单状态不正确" };
    }

    // 构建业务参数
    const bizContent = {
      out_trade_no: order.orderNo,
      total_amount: Number(order.payAmount).toFixed(2),
      subject: `你好朵朵-${order.items[0]?.productName || "商品"}`,
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
    
    // 移除 sign 和 sign_type 后验签
    const verifyParams = { ...params };
    delete verifyParams.sign;
    delete verifyParams.sign_type;
    
    const signContent = buildSignContent(verifyParams);
    
    if (signType === "RSA2" && !verifyWithRSA2(signContent, sign, ALIPAY_CONFIG.alipayPublicKey)) {
      console.error("[Alipay] 签名验证失败");
      return { success: false, message: "签名验证失败" };
    }

    // 检查交易状态
    if (params.trade_status !== "TRADE_SUCCESS" && params.trade_status !== "TRADE_FINISHED") {
      return { success: false, message: "交易未成功" };
    }

    const orderNo = params.out_trade_no;
    const tradeNo = params.trade_no;

    // 购买奖励比例：每消费 1 元获得 1 点
    const PURCHASE_REWARD_RATIO = 1;

    // 使用事务更新订单状态和发放积分
    await prisma.$transaction(async (tx) => {
      // 获取订单信息
      const order = await tx.order.findUnique({
        where: { orderNo },
      });

      if (!order) {
        throw new Error("订单不存在");
      }

      // 计算购买奖励点数
      const pointsEarned = Math.floor(Number(order.payAmount) * PURCHASE_REWARD_RATIO);

      // 更新订单状态
      await tx.order.update({
        where: { orderNo },
        data: {
          status: OrderStatus.PAID,
          paymentMethod: "alipay",
          paymentNo: tradeNo,
          paymentTime: new Date(),
          pointsEarned,
        },
      });

      // 发放积分
      if (pointsEarned > 0) {
        const user = await tx.user.update({
          where: { id: order.userId },
          data: {
            points: { increment: pointsEarned },
            totalPoints: { increment: pointsEarned },
          },
        });

        // 记录积分变动
        await tx.pointRecord.create({
          data: {
            userId: order.userId,
            type: "PURCHASE_REWARD",
            amount: pointsEarned,
            balance: user.points,
            description: `订单支付奖励 (${orderNo})`,
            relatedId: order.id,
          },
        });

        console.log(`[Alipay] 发放积分: ${pointsEarned} 点`);
      }
    });

    console.log(`[Alipay] 订单支付成功: ${orderNo}`);
    return { success: true };
  } catch (error) {
    console.error("[Alipay] 处理回调失败:", error);
    return { success: false, message: "处理失败" };
  }
}

