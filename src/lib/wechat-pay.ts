/**
 * 微信支付服务
 * 实现 JSAPI 支付和回调处理
 */
import crypto from "crypto";
import { prisma } from "./prisma";
import { OrderStatus } from "@/generated/prisma/client";

import https from "https";

// 微信支付配置
const WECHAT_PAY_CONFIG = {
  appId: process.env.WECHAT_PAY_APP_ID || process.env.WECHAT_APP_ID || "",
  mchId: process.env.WECHAT_PAY_MCH_ID || "",
  apiKey: process.env.WECHAT_PAY_API_KEY || "",
  apiV3Key: process.env.WECHAT_PAY_API_V3_KEY || "",
  notifyUrl: process.env.WECHAT_PAY_NOTIFY_URL || "",
  serialNo: process.env.WECHAT_PAY_SERIAL_NO || "",
};

/**
 * 生成随机字符串
 */
function generateNonceStr(length = 32): string {
  return crypto.randomBytes(length / 2).toString("hex");
}

/**
 * 生成签名（用于 JSAPI 调用）
 */
function generateSign(params: Record<string, string | number>, key: string): string {
  const sortedKeys = Object.keys(params).sort();
  const stringA = sortedKeys.map((k) => `${k}=${params[k]}`).join("&");
  const stringSignTemp = `${stringA}&key=${key}`;
  return crypto.createHash("md5").update(stringSignTemp).digest("hex").toUpperCase();
}

/**
 * 创建支付订单
 */
export async function createPayment(
  orderId: string,
  tradeType: "JSAPI" | "NATIVE" | "MWEB" = "JSAPI",
  openId?: string
): Promise<{
  success: boolean;
  codeUrl?: string; // For NATIVE
  mwebUrl?: string; // For MWEB
  payParams?: {     // For JSAPI
    appId: string;
    timeStamp: string;
    nonceStr: string;
    package: string;
    signType: string;
    paySign: string;
  };
  error?: string;
}> {
  try {
    // 获取订单信息
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

    // JSAPI 必须要有 openId
    if (tradeType === "JSAPI" && !openId) {
      return { success: false, error: "JSAPI 支付需要 OpenID" };
    }

    // 构建统一下单请求
    const unifiedOrderParams: Record<string, string | number> = {
      appid: WECHAT_PAY_CONFIG.appId,
      mch_id: WECHAT_PAY_CONFIG.mchId,
      nonce_str: generateNonceStr(),
      body: `NIHPLOD-${order.items[0]?.productName || "商品"}`,
      out_trade_no: order.orderNo,
      total_fee: Math.round(Number(order.payAmount) * 100), // 转换为分
      spbill_create_ip: "127.0.0.1", // 建议传入真实 IP
      notify_url: WECHAT_PAY_CONFIG.notifyUrl,
      trade_type: tradeType,
    };

    if (openId && tradeType === "JSAPI") {
      unifiedOrderParams.openid = openId;
    }

    // 生成签名
    const sign = generateSign(unifiedOrderParams, WECHAT_PAY_CONFIG.apiKey);

    // 构建 XML 请求体
    const xmlBody = buildXml({ ...unifiedOrderParams, sign });

    // 调用微信统一下单接口
    const response = await fetch("https://api.mch.weixin.qq.com/pay/unifiedorder", {
      method: "POST",
      headers: { "Content-Type": "text/xml" },
      body: xmlBody,
    });

    const responseText = await response.text();

    // 检查返回结果
    const returnCode = extractXmlValue(responseText, "return_code");
    const resultCode = extractXmlValue(responseText, "result_code");

    if (returnCode !== "SUCCESS" || resultCode !== "SUCCESS") {
      const errMsg = extractXmlValue(responseText, "err_code_des") || extractXmlValue(responseText, "return_msg");
      console.error("[WechatPay] 統一下单失败:", errMsg);
      return { success: false, error: errMsg || "支付创建失败" };
    }

    const prepayId = extractXmlValue(responseText, "prepay_id");

    // 处理 Native 支付（返回二维码链接）
    if (tradeType === "NATIVE") {
      const codeUrl = extractXmlValue(responseText, "code_url");
      if (!codeUrl) {
        return { success: false, error: "获取支付二维码失败" };
      }
      return { success: true, codeUrl };
    }

    // 处理 MWEB 支付（返回跳转链接）
    if (tradeType === "MWEB") {
      const mwebUrl = extractXmlValue(responseText, "mweb_url");
      if (!mwebUrl) {
        return { success: false, error: "获取支付链接失败" };
      }
      return { success: true, mwebUrl };
    }

    // 处理 JSAPI 支付
    if (!prepayId) {
      return { success: false, error: "支付创建失败 (PrepayID Missing)" };
    }

    // 构建 JSAPI 支付参数
    const timeStamp = Math.floor(Date.now() / 1000).toString();
    const nonceStr = generateNonceStr();
    const packageStr = `prepay_id=${prepayId}`;

    const paySignParams = {
      appId: WECHAT_PAY_CONFIG.appId,
      timeStamp,
      nonceStr,
      package: packageStr,
      signType: "MD5",
    };

    const paySign = generateSign(paySignParams, WECHAT_PAY_CONFIG.apiKey);

    return {
      success: true,
      payParams: {
        appId: WECHAT_PAY_CONFIG.appId,
        timeStamp,
        nonceStr,
        package: packageStr,
        signType: "MD5",
        paySign,
      },
    };
  } catch (error) {
    console.error("[WechatPay] 创建支付失败:", error);
    return { success: false, error: "支付创建失败" };
  }
}

/**
 * 解析简单 XML 为对象
 */
function parseXml(xml: string): Record<string, string> {
  const result: Record<string, string> = {};
  const reg = /<(\w+)>(?:<!\[CDATA\[(.*?)]]>|(.*?))<\/\1>/g;
  let match;
  while ((match = reg.exec(xml)) !== null) {
    const key = match[1];
    const value = match[2] || match[3] || "";
    result[key] = value.trim();
  }
  return result;
}

/**
 * 处理支付回调
 */
export async function handlePaymentNotify(xmlBody: string): Promise<{
  success: boolean;
  message?: string;
}> {
  try {
    const params = parseXml(xmlBody);

    // 1. 验证通信与业务结果
    if (params.return_code !== "SUCCESS" || params.result_code !== "SUCCESS") {
      return { success: false, message: params.return_msg || "支付失败" };
    }

    // 2. 验证签名
    if (!params.sign) {
      return { success: false, message: "签名缺失" };
    }

    // 过滤空值和 sign 本身
    const signParams: Record<string, string | number> = {};
    for (const key in params) {
      if (key !== "sign" && params[key] !== "") {
        signParams[key] = params[key];
      }
    }

    const calculatedSign = generateSign(signParams, WECHAT_PAY_CONFIG.apiKey);

    if (calculatedSign !== params.sign) {
      console.error(`[WechatPay] 签名验证失败: 收到=${params.sign}, 计算=${calculatedSign}`);
      return { success: false, message: "签名验证失败" };
    }

    const orderNo = params.out_trade_no;
    const transactionId = params.transaction_id;
    const totalFee = parseInt(params.total_fee);

    if (!orderNo) {
      return { success: false, message: "订单号缺失" };
    }


    // 使用事务更新订单状态和发放积分
    await prisma.$transaction(async (tx) => {
      // 获取订单信息
      const order = await tx.order.findUnique({
        where: { orderNo },
      });

      if (!order) {
        throw new Error("订单不存在");
      }

      // 3. ✅ 严格验证金额（防止金额篡改攻击）
      const expectedFee = Math.round(Number(order.payAmount) * 100);
      if (expectedFee !== totalFee) {
        // 金额不一致：记录告警日志并抛出错误中断事务，禁止放行订单
        console.error(
          `[WechatPay] ⚠️ 金额篡改警报！订单=${order.orderNo} 期望=${expectedFee}分, 实付=${totalFee}分. 已拒绝该回调。`
        );
        throw new Error(`支付金额不匹配: 期望 ${expectedFee} 分，实付 ${totalFee} 分`);
      }

      // 如果订单已经是 PAID，幂等处理
      if (order.status === OrderStatus.PAID) {
        return;
      }

      // 计算订单状态

      // 更新订单状态
      await tx.order.update({
        where: { orderNo },
        data: {
          status: OrderStatus.PAID,
          paymentMethod: "wechat",
          paymentNo: transactionId,
          paymentTime: new Date(),
        },
      });
    });

    console.log(`[WechatPay] 订单支付成功: ${orderNo}`);
    return { success: true };
  } catch (error) {
    console.error("[WechatPay] 处理回调失败:", error);
    return { success: false, message: "处理失败" };
  }
}

/**
 * 退款配置
 */
const WECHAT_REFUND_CONFIG = {
  ...WECHAT_PAY_CONFIG,
  refundNotifyUrl: process.env.WECHAT_PAY_REFUND_NOTIFY_URL || "",
  certPem: process.env.WECHAT_PAY_CERT_PEM?.replace(/\\n/g, "\n") || "",
  keyPem: process.env.WECHAT_PAY_KEY_PEM?.replace(/\\n/g, "\n") || "",
};

/**
 * 退款结果类型
 */
export interface RefundResult {
  success: boolean;
  refundId?: string;        // 微信退款单号
  outRefundNo?: string;     // 商户退款单号
  error?: string;
}

/**
 * 退款状态类型
 */
export type RefundStatus = "PROCESSING" | "SUCCESS" | "CLOSED" | "ABNORMAL";

export interface RefundQueryResult {
  success: boolean;
  status?: RefundStatus;
  refundRecvAccount?: string;  // 退款入账账户
  successTime?: Date;          // 退款成功时间
  error?: string;
}

/**
 * 申请退款
 * @param orderNo 商户订单号
 * @param refundNo 商户退款单号（建议用 R + orderNo 或自定义规则）
 * @param totalFee 订单总金额（单位：元）
 * @param refundFee 退款金额（单位：元）
 * @param reason 退款原因（可选）
 */
export async function applyWechatRefund(
  orderNo: string,
  refundNo: string,
  totalFee: number,
  refundFee: number,
  reason?: string
): Promise<RefundResult> {
  try {
    // 验证证书配置
    if (!WECHAT_REFUND_CONFIG.certPem || !WECHAT_REFUND_CONFIG.keyPem) {
      console.error("[WechatPay] 退款失败: 缺少支付证书配置");
      return { success: false, error: "退款服务未配置" };
    }

    if (!WECHAT_REFUND_CONFIG.mchId || !WECHAT_REFUND_CONFIG.apiKey) {
      console.error("[WechatPay] 退款失败: 缺少商户配置");
      return { success: false, error: "支付服务未配置" };
    }

    // 金额转换为分
    const totalFeeCent = Math.round(totalFee * 100);
    const refundFeeCent = Math.round(refundFee * 100);

    // 构建退款请求参数
    const refundParams: Record<string, string | number> = {
      appid: WECHAT_REFUND_CONFIG.appId,
      mch_id: WECHAT_REFUND_CONFIG.mchId,
      nonce_str: generateNonceStr(),
      out_trade_no: orderNo,
      out_refund_no: refundNo,
      total_fee: totalFeeCent,
      refund_fee: refundFeeCent,
    };

    // 添加可选参数
    if (reason) {
      refundParams.refund_desc = reason;
    }

    if (WECHAT_REFUND_CONFIG.refundNotifyUrl) {
      refundParams.notify_url = WECHAT_REFUND_CONFIG.refundNotifyUrl;
    }

    // 生成签名
    const sign = generateSign(refundParams, WECHAT_REFUND_CONFIG.apiKey);

    // 构建 XML 请求体
    const xmlBody = buildXml({ ...refundParams, sign });

    console.log(`[WechatPay] 申请退款: ${orderNo} -> ${refundNo}, 金额: ${refundFee}元`);

    // 调用微信退款接口（需要双向证书）

    const response = await fetchWithCert(
      "https://api.mch.weixin.qq.com/secapi/pay/refund",
      xmlBody,
      WECHAT_REFUND_CONFIG.certPem,
      WECHAT_REFUND_CONFIG.keyPem
    );

    // 解析响应
    const returnCode = extractXmlValue(response, "return_code");
    const resultCode = extractXmlValue(response, "result_code");

    if (returnCode !== "SUCCESS") {
      const returnMsg = extractXmlValue(response, "return_msg");
      console.error("[WechatPay] 退款请求失败:", returnMsg);
      return { success: false, error: returnMsg || "退款请求失败" };
    }

    if (resultCode !== "SUCCESS") {
      const errCode = extractXmlValue(response, "err_code");
      const errMsg = extractXmlValue(response, "err_code_des");
      console.error(`[WechatPay] 退款失败: ${errCode} - ${errMsg}`);
      return { success: false, error: errMsg || `退款失败: ${errCode}` };
    }

    // 退款成功
    const refundId = extractXmlValue(response, "refund_id");
    const outRefundNo = extractXmlValue(response, "out_refund_no");

    console.log(`[WechatPay] 退款申请成功: ${refundId}`);

    return {
      success: true,
      refundId: refundId || undefined,
      outRefundNo: outRefundNo || undefined,
    };
  } catch (error) {
    console.error("[WechatPay] 退款异常:", error);
    return { success: false, error: "退款服务异常" };
  }
}

/**
 * 查询退款状态
 * @param refundNo 商户退款单号
 */
export async function queryRefundStatus(refundNo: string): Promise<RefundQueryResult> {
  try {
    if (!WECHAT_REFUND_CONFIG.mchId || !WECHAT_REFUND_CONFIG.apiKey) {
      return { success: false, error: "支付服务未配置" };
    }

    const queryParams: Record<string, string> = {
      appid: WECHAT_REFUND_CONFIG.appId,
      mch_id: WECHAT_REFUND_CONFIG.mchId,
      nonce_str: generateNonceStr(),
      out_refund_no: refundNo,
    };

    const sign = generateSign(queryParams, WECHAT_REFUND_CONFIG.apiKey);
    const xmlBody = buildXml({ ...queryParams, sign });

    const response = await fetch("https://api.mch.weixin.qq.com/pay/refundquery", {
      method: "POST",
      headers: { "Content-Type": "text/xml" },
      body: xmlBody,
    });

    const responseText = await response.text();

    const returnCode = extractXmlValue(responseText, "return_code");
    const resultCode = extractXmlValue(responseText, "result_code");

    if (returnCode !== "SUCCESS" || resultCode !== "SUCCESS") {
      const errMsg = extractXmlValue(responseText, "err_code_des") ||
        extractXmlValue(responseText, "return_msg");
      return { success: false, error: errMsg || "查询失败" };
    }

    // 获取退款状态（第一笔退款）
    const refundStatus = extractXmlValue(responseText, "refund_status_0") as RefundStatus;
    const refundRecvAccount = extractXmlValue(responseText, "refund_recv_accout_0");
    const refundSuccessTime = extractXmlValue(responseText, "refund_success_time_0");

    return {
      success: true,
      status: refundStatus,
      refundRecvAccount: refundRecvAccount || undefined,
      successTime: refundSuccessTime ? new Date(refundSuccessTime) : undefined,
    };
  } catch (error) {
    console.error("[WechatPay] 查询退款状态异常:", error);
    return { success: false, error: "查询失败" };
  }
}

/**
 * 处理退款回调通知
 * 注意：退款通知的数据需要使用 AES-256-ECB 解密
 */
export async function handleRefundNotify(xmlBody: string): Promise<{
  success: boolean;
  orderNo?: string;
  refundNo?: string;
  refundStatus?: RefundStatus;
  message?: string;
}> {
  try {
    const returnCode = extractXmlValue(xmlBody, "return_code");
    if (returnCode !== "SUCCESS") {
      return { success: false, message: "通知失败" };
    }

    // 获取加密信息
    const reqInfo = extractXmlValue(xmlBody, "req_info");
    if (!reqInfo) {
      return { success: false, message: "加密数据缺失" };
    }

    // 解密退款通知数据
    // Step 1: 对 API V3 密钥做 MD5 得到解密密钥
    const decryptKey = crypto
      .createHash("md5")
      .update(WECHAT_REFUND_CONFIG.apiV3Key || WECHAT_REFUND_CONFIG.apiKey)
      .digest("hex")
      .toLowerCase();

    // Step 2: Base64 解码
    const encrypted = Buffer.from(reqInfo, "base64");

    // Step 3: AES-256-ECB 解密
    const decipher = crypto.createDecipheriv("aes-256-ecb", decryptKey, null);
    decipher.setAutoPadding(true);
    let decrypted = decipher.update(encrypted, undefined, "utf8");
    decrypted += decipher.final("utf8");

    console.log("[WechatPay] 退款通知解密成功");

    // 解析解密后的 XML
    const orderNo = extractXmlValue(decrypted, "out_trade_no");
    const refundNo = extractXmlValue(decrypted, "out_refund_no");
    const refundStatus = extractXmlValue(decrypted, "refund_status") as RefundStatus;
    const refundId = extractXmlValue(decrypted, "refund_id");
    const successTime = extractXmlValue(decrypted, "success_time");

    console.log(`[WechatPay] 退款通知: 订单=${orderNo}, 退款单=${refundNo}, 状态=${refundStatus}`);

    // 更新订单退款状态
    if (orderNo && refundStatus === "SUCCESS") {
      await prisma.order.update({
        where: { orderNo },
        data: {
          status: OrderStatus.REFUNDED,
          adminNote: `微信退款成功 (${refundId})，时间: ${successTime || new Date().toISOString()}`,
        },
      });
      console.log(`[WechatPay] 订单已更新为已退款: ${orderNo}`);
    } else if (orderNo && refundStatus === "CLOSED") {
      // 退款关闭，恢复订单状态
      const order = await prisma.order.findUnique({ where: { orderNo } });
      if (order && order.status === OrderStatus.REFUNDING) {
        await prisma.order.update({
          where: { orderNo },
          data: {
            status: order.trackingNo ? OrderStatus.SHIPPED : OrderStatus.PAID,
            adminNote: `微信退款已关闭 (${refundId})`,
          },
        });
      }
    } else if (orderNo && refundStatus === "ABNORMAL") {
      // 退款异常，记录但不改变状态
      await prisma.order.update({
        where: { orderNo },
        data: {
          adminNote: `微信退款异常 (${refundId})，请联系客服处理`,
        },
      });
    }

    return {
      success: true,
      orderNo: orderNo || undefined,
      refundNo: refundNo || undefined,
      refundStatus,
    };
  } catch (error) {
    console.error("[WechatPay] 处理退款通知失败:", error);
    return { success: false, message: "处理失败" };
  }
}

/**
 * 构建 XML 请求体
 */
function buildXml(params: Record<string, string | number>): string {
  const entries = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== "")
    .map(([key, value]) => {
      // CDATA 包装字符串值
      if (typeof value === "string" && /[<>&]/.test(value)) {
        return `<${key}><![CDATA[${value}]]></${key}>`;
      }
      return `<${key}>${value}</${key}>`;
    });

  return `<xml>${entries.join("")}</xml>`;
}

/**
 * 从 XML 中提取值
 */
function extractXmlValue(xml: string, tag: string): string | null {
  // 匹配 CDATA 格式
  const cdataMatch = xml.match(new RegExp(`<${tag}><!\\[CDATA\\[(.+?)\\]\\]><\\/${tag}>`));
  if (cdataMatch) return cdataMatch[1];

  // 匹配普通格式
  const normalMatch = xml.match(new RegExp(`<${tag}>(.+?)<\\/${tag}>`));
  if (normalMatch) return normalMatch[1];

  return null;
}

/**
 * 使用证书发送 HTTPS 请求
 */
async function fetchWithCert(
  url: string,
  body: string,
  certPem: string,
  keyPem: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);

    const options = {
      hostname: urlObj.hostname,
      port: 443,
      path: urlObj.pathname,
      method: "POST",
      headers: {
        "Content-Type": "text/xml",
        "Content-Length": Buffer.byteLength(body),
      },
      cert: certPem,
      key: keyPem,
    };

    const req = https.request(options, (res: import("http").IncomingMessage) => {
      let data = "";

      res.on("data", (chunk: Buffer) => {
        data += chunk.toString();
      });

      res.on("end", () => {
        resolve(data);
      });
    });

    req.on("error", (error: Error) => {
      reject(error);
    });

    req.write(body);
    req.end();
  });
}

/**
 * 生成退款单号
 * 格式：R + 订单号 + 时间戳后4位
 */
export function generateRefundNo(orderNo: string): string {
  const timestamp = Date.now().toString().slice(-4);
  return `R${orderNo}${timestamp}`;
}


