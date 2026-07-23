/**
 * 支付宝支付服务
 * 实现手机网站支付（H5）、支付结果查询、退款
 */
import crypto from "crypto";
import { prisma } from "./prisma";
import { OrderStatus } from "@/generated/prisma/client";
import { formatMoney, moneyStrictEqual, ensureMoneyPrecision } from "./money";
import { formatKey, validateKeyFormat, toPrivateKeyPem, toPublicKeyPem } from "./crypto-utils";
import { fetchWithTimeout } from "./fetch-utils";
import { apiConsole } from "@/lib/logger";

// 支付宝配置（延迟校验）
const ALIPAY_CONFIG = {
  appId: process.env.ALIPAY_APP_ID || "",
  privateKey: toPrivateKeyPem(process.env.ALIPAY_PRIVATE_KEY),
  alipayPublicKey: toPublicKeyPem(process.env.ALIPAY_PUBLIC_KEY),
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
    apiConsole.error(`[Alipay] 密钥配置错误: ${privateKeyCheck.error}`);
  }

  const publicKeyCheck = validateKeyFormat(
    process.env.ALIPAY_PUBLIC_KEY,
    "public",
    "ALIPAY_PUBLIC_KEY"
  );
  if (!publicKeyCheck.valid) {
    apiConsole.error(`[Alipay] 密钥配置错误: ${publicKeyCheck.error}`);
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
 * 支持传入完整 PEM 或纯 base64 body（已由 toPrivateKeyPem 统一格式化）
 */
export function signWithRSA2(content: string, privateKey: string): string {
  const sign = crypto.createSign("RSA-SHA256");
  sign.update(content, "utf8");
  return sign.sign(privateKey, "base64");
}

/**
 * RSA2 验签
 * 支持传入完整 PEM 或纯 base64 body（已由 toPublicKeyPem 统一格式化）
 */
export function verifyWithRSA2(content: string, sign: string, publicKey: string): boolean {
  try {
    const verify = crypto.createVerify("RSA-SHA256");
    verify.update(content, "utf8");
    return verify.verify(publicKey, sign, "base64");
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
 * 发起一次支付宝通用 API 请求（已签名、已验签响应）
 */
async function callAlipayApi(
  method: string,
  bizContent: Record<string, unknown>
): Promise<{ success: boolean; data?: unknown; rawText: string; error?: string }> {
  const params: Record<string, string> = {
    app_id: ALIPAY_CONFIG.appId,
    method,
    format: "JSON",
    charset: "utf-8",
    sign_type: "RSA2",
    timestamp: getBeijingTimestamp(),
    version: "1.0",
    biz_content: JSON.stringify(bizContent),
  };

  const signContent = buildSignContent(params);
  params.sign = signWithRSA2(signContent, ALIPAY_CONFIG.privateKey);

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

  let data: { sign?: string } | undefined;
  try {
    data = JSON.parse(rawText) as { sign?: string };
  } catch {
    return { success: false, rawText, error: "响应解析失败" };
  }

  // 验证响应签名
  if (data?.sign) {
    const responseText = extractResponseText(rawText, method);
    if (responseText) {
      const verified = verifyWithRSA2(responseText, data.sign, ALIPAY_CONFIG.alipayPublicKey);
      if (!verified) {
        return { success: false, rawText, error: "响应签名验证失败" };
      }
    } else {
      return { success: false, rawText, error: "无法提取响应内容用于验签" };
    }
  } else {
    return { success: false, rawText, error: "响应缺少签名字段" };
  }

  const responseKey = method.replace(/\./g, "_") + "_response";
  const response = (data as Record<string, unknown>)[responseKey];
  const responseObj = response as { code?: string; sub_msg?: string; msg?: string } | undefined;

  if (responseObj && responseObj.code === "10000") {
    return { success: true, data: response, rawText };
  }

  return {
    success: false,
    rawText,
    error: responseObj?.sub_msg || responseObj?.msg || `${method} 请求失败`,
  };
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
    if (!ALIPAY_CONFIG.notifyUrl || !ALIPAY_CONFIG.returnUrl) {
      return { success: false, error: "支付宝回调/返回地址未配置" };
    }

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
    apiConsole.error("[Alipay] 创建支付失败:", error);
    return { success: false, error: "支付创建失败" };
  }
}

/**
 * 查询支付宝订单状态
 * 用于回调缺失时的主动兜底查询
 */
export async function queryAlipayOrder(orderNo: string): Promise<{
  success: boolean;
  paid?: boolean;
  tradeNo?: string;
  amount?: number;
  error?: string;
}> {
  try {
    const result = await callAlipayApi("alipay.trade.query", {
      out_trade_no: orderNo,
    });

    if (!result.success) {
      return { success: false, error: result.error };
    }

    const response = result.data as {
      trade_status?: string;
      trade_no?: string;
      total_amount?: string;
    };

    const paid = response.trade_status === "TRADE_SUCCESS" || response.trade_status === "TRADE_FINISHED";

    return {
      success: true,
      paid,
      tradeNo: response.trade_no,
      amount: response.total_amount ? parseFloat(response.total_amount) : undefined,
    };
  } catch (error) {
    apiConsole.error("[Alipay] 查询订单失败:", error);
    return { success: false, error: "查询失败" };
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
      apiConsole.error("[Alipay] 缺少签名参数");
      return { success: false, message: "缺少签名参数" };
    }

    // 移除 sign 和 sign_type 后验签
    const verifyParams = { ...params };
    delete verifyParams.sign;
    delete verifyParams.sign_type;

    const signContent = buildSignContent(verifyParams);

    if (signType !== "RSA2") {
      apiConsole.error("[Alipay] 不支持的签名类型");
      return { success: false, message: "不支持的签名类型" };
    }
    if (!verifyWithRSA2(signContent, sign, ALIPAY_CONFIG.alipayPublicKey)) {
      apiConsole.error("[Alipay] 签名验证失败");
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
      if (!params.total_amount) {
        throw new Error("MISSING_AMOUNT");
      }
      const notifyAmount = parseFloat(params.total_amount);
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

      // 记录交易流水（在事务内，保证与订单状态更新原子化）
      if (shouldRecordTransaction && capturedOrderId && capturedPayAmount !== undefined) {
        await tx.transaction.create({
          data: {
            orderId: capturedOrderId,
            type: "PAYMENT",
            gateway: "alipay",
            amount: capturedPayAmount,
            status: "SUCCESS",
            gatewayTrxId: tradeNo,
            rawData: JSON.stringify(params),
          },
        });
      }
    });

    console.log(`[Alipay] 订单支付成功: ${orderNo}`);
    return { success: true };
  } catch (error) {
    apiConsole.error("[Alipay] 处理回调失败:", error);
    return { success: false, message: "处理失败" };
  }
}

/**
 * 支付宝退款（同步接口）
 */
export async function refundAlipayOrder(
  outTradeNo: string,
  refundAmount: number,
  refundReason: string,
  maxAmount?: number
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

    // 防御性校验：退款金额不得超过订单实付金额
    if (maxAmount !== undefined && refundAmount > ensureMoneyPrecision(maxAmount)) {
      return { success: false, error: "退款金额不能超过订单实付金额" };
    }

    const safeRefundAmount = ensureMoneyPrecision(refundAmount);

    const result = await callAlipayApi("alipay.trade.refund", {
      out_trade_no: outTradeNo,
      refund_amount: safeRefundAmount.toFixed(2),
      refund_reason: refundReason,
    });

    if (!result.success) {
      apiConsole.error("[Alipay] 退款失败:", result.error);
      return { success: false, error: result.error || "退款失败" };
    }

    console.log(`[Alipay] 退款成功: ${outTradeNo}, 退款金额: ${safeRefundAmount}`);
    return { success: true };
  } catch (e) {
    apiConsole.error("[Alipay] 退款异常:", e);
    return { success: false, error: "Alipay Refund API Error" };
  }
}
