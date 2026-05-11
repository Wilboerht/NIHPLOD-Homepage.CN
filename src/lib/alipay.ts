/**
 * 支付宝支付服务
 * 实现手机网站支付（H5）
 */
import crypto from "crypto";
import { prisma } from "./prisma";
import { OrderStatus } from "@/generated/prisma/client";
import { formatMoney, moneyStrictEqual } from "./money";
import { formatKey, validateKeyFormat } from "./crypto-utils";
import { fetchWithTimeout } from "./fetch-utils";
import { recordTransaction } from "./transaction";

// 支付宝配置（延迟校验）
const ALIPAY_CONFIG = {
  appId: process.env.ALIPAY_APP_ID || "",
  privateKey: formatKey(process.env.ALIPAY_PRIVATE_KEY),
  alipayPublicKey: formatKey(process.env.ALIPAY_PUBLIC_KEY),
  notifyUrl: process.env.ALIPAY_NOTIFY_URL || "",
  returnUrl: process.env.ALIPAY_RETURN_URL || "",
  gateway: "https://openapi.alipay.com/gateway.do",
};

// 启动时密钥格式校验（非阻塞，仅日志告警）
function validateAlipayKeys(): void {
  // 如果支付宝未配置（如开发环境），跳过校验
  if (!process.env.ALIPAY_APP_ID) return;

  const privateKeyCheck = validateKeyFormat(
    process.env.ALIPAY_PRIVATE_KEY,
    "private",
    "ALIPAY_PRIVATE_KEY"
  );
  if (!privateKeyCheck.valid) {
    console.error(`[Alipay] 密钥配置错误: ${privateKeyCheck.error}`);
  }

  const publicKeyCheck = validateKeyFormat(
    process.env.ALIPAY_PUBLIC_KEY,
    "public",
    "ALIPAY_PUBLIC_KEY"
  );
  if (!publicKeyCheck.valid) {
    console.error(`[Alipay] 密钥配置错误: ${publicKeyCheck.error}`);
  }
}
// 模块加载时执行一次校验
validateAlipayKeys();

/**
 * 生成北京时间戳（YYYY-MM-DD HH:MM:SS）
 * 支付宝接口要求使用北京时间
 */
function getBeijingTimestamp(): string {
  const now = new Date();
  const beijingTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return beijingTime.toISOString().replace("T", " ").slice(0, 19);
}

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
export function verifyWithRSA2(content: string, sign: string, publicKey: string): boolean {
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
export function buildSignContent(params: Record<string, string>): string {
  return Object.keys(params)
    .filter((key) => {
      const val = params[key];
      return val !== undefined && val !== "" && val !== "null" && val !== "undefined";
    })
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");
}

/**
 * 从原始响应文本中提取 alipay_xxx_response 的 JSON 字符串
 * 用于响应签名验证
 * 正确处理字符串内的 { } 字符（遵循 JSON 字符串转义规则）
 */
function extractResponseText(rawText: string, method: string): string | null {
  const key = method.replace(/\./g, "_") + "_response";
  const idx = rawText.indexOf(`"${key}":`);
  if (idx === -1) return null;

  let start = idx + `"${key}":`.length;
  while (start < rawText.length && rawText[start] !== "{") start++;
  if (start >= rawText.length) return null;

  let depth = 0;
  let inString = false;
  let escapeNext = false;

  for (let i = start; i < rawText.length; i++) {
    const ch = rawText[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (ch === "\\") {
      escapeNext = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (!inString) {
      if (ch === "{") {
        depth++;
      } else if (ch === "}") {
        depth--;
        if (depth === 0) {
          return rawText.slice(start, i + 1);
        }
      }
    }
  }

  return null;
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
      body: `订单号: ${order.orderNo}, 商品数量: ${order.items.length}`,
      product_code: "QUICK_WAP_WAY",
    };

    // 构建公共参数
    const params: Record<string, string> = {
      app_id: ALIPAY_CONFIG.appId,
      method: "alipay.trade.wap.pay",
      format: "JSON",
      charset: "utf-8",
      sign_type: "RSA2",
      timestamp: getBeijingTimestamp(),
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

    // 用于记录交易流水
    let capturedOrderId: string | undefined;
    let capturedPayAmount: number | undefined;
    let shouldRecordTransaction = false;

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

      capturedOrderId = order.id;
      capturedPayAmount = Number(order.payAmount);

      // 支付回调金额必须严格相等，不容忍任何差异
      const notifyAmount = parseFloat(params.total_amount || "0");
      if (!moneyStrictEqual(order.payAmount, notifyAmount)) {
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
        console.warn(`[Alipay] 订单 ${orderNo} 已处于终态 ${order.status}，忽略支付通知`);
        return;
      }

      if (order.status === OrderStatus.PAID) return;

      // CAS 乐观锁：只有 PENDING 或 PAYING 状态的订单才能被更新为 PAID
      // create/route.ts 发起支付时会将 PENDING → PAYING，回调需兼容 PAYING 状态
      const updatedOrder = await tx.order.updateMany({
        where: { orderNo, status: { in: [OrderStatus.PENDING, OrderStatus.PAYING] } },
        data: {
          status: OrderStatus.PAID,
          paymentMethod: "alipay",
          paymentNo: tradeNo,
          paymentTime: new Date(),
        },
      });

      if (updatedOrder.count === 0) {
        // 已被其他请求处理，直接返回
        console.warn(`[Alipay] 订单 ${orderNo} 已被并发处理，跳过`);
        return;
      }

      shouldRecordTransaction = true;

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

    // 记录交易流水（仅在成功更新订单时记录，避免重复流水）
    if (shouldRecordTransaction && capturedOrderId && capturedPayAmount !== undefined) {
      await recordTransaction({
        orderId: capturedOrderId,
        type: "PAYMENT",
        gateway: "alipay",
        amount: capturedPayAmount,
        status: "SUCCESS",
        gatewayTrxId: tradeNo,
        rawData: JSON.stringify(params),
      });
    }

    console.log(`[Alipay] 订单支付成功: ${orderNo}`);
    return { success: true };
  } catch (error) {
    console.error("[Alipay] 处理回调失败:", error);
    return { success: false, message: "处理失败" };
  }
}

/**
 * 支付宝退款（同步接口）
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
      timestamp: getBeijingTimestamp(),
      version: "1.0",
      biz_content: JSON.stringify(bizContent),
    };

    // 签名
    const signContent = buildSignContent(params);
    params.sign = signWithRSA2(signContent, ALIPAY_CONFIG.privateKey);

    // 构建请求体（使用 POST）
    const body = Object.keys(params)
      .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
      .join("&");

    const res = await fetchWithTimeout(ALIPAY_CONFIG.gateway, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
      body,
      timeout: 30000,
    });

    const rawText = await res.text();
    const data = JSON.parse(rawText);

    // 验证响应签名，防止中间人攻击
    if (data.sign) {
      const responseText = extractResponseText(rawText, "alipay.trade.refund");
      if (responseText) {
        const verified = verifyWithRSA2(
          responseText,
          data.sign,
          ALIPAY_CONFIG.alipayPublicKey
        );
        if (!verified) {
          console.error("[Alipay] 退款响应签名验证失败");
          return { success: false, error: "退款响应签名验证失败" };
        }
      } else {
        console.error("[Alipay] 无法提取退款响应内容用于验签");
        return { success: false, error: "退款响应格式异常" };
      }
    } else {
      console.warn("[Alipay] 退款响应缺少签名字段");
    }

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
