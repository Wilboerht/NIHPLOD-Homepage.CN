/**
 * 微信支付服务
 * 实现 JSAPI 支付和回调处理
 */
import crypto from "crypto";
import { prisma } from "./prisma";
import { OrderStatus } from "@/generated/prisma/client";

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
  openId: string
): Promise<{
  success: boolean;
  payParams?: {
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

    // 构建统一下单请求
    const unifiedOrderParams = {
      appid: WECHAT_PAY_CONFIG.appId,
      mch_id: WECHAT_PAY_CONFIG.mchId,
      nonce_str: generateNonceStr(),
      body: `你好朵朵-${order.items[0]?.productName || "商品"}`,
      out_trade_no: order.orderNo,
      total_fee: Math.round(Number(order.payAmount) * 100), // 转换为分
      spbill_create_ip: "127.0.0.1",
      notify_url: WECHAT_PAY_CONFIG.notifyUrl,
      trade_type: "JSAPI",
      openid: openId,
    };

    // 生成签名
    const sign = generateSign(unifiedOrderParams, WECHAT_PAY_CONFIG.apiKey);
    
    // 构建 XML 请求体
    const xmlBody = `<xml>
      <appid>${unifiedOrderParams.appid}</appid>
      <mch_id>${unifiedOrderParams.mch_id}</mch_id>
      <nonce_str>${unifiedOrderParams.nonce_str}</nonce_str>
      <sign>${sign}</sign>
      <body><![CDATA[${unifiedOrderParams.body}]]></body>
      <out_trade_no>${unifiedOrderParams.out_trade_no}</out_trade_no>
      <total_fee>${unifiedOrderParams.total_fee}</total_fee>
      <spbill_create_ip>${unifiedOrderParams.spbill_create_ip}</spbill_create_ip>
      <notify_url>${unifiedOrderParams.notify_url}</notify_url>
      <trade_type>${unifiedOrderParams.trade_type}</trade_type>
      <openid>${unifiedOrderParams.openid}</openid>
    </xml>`;

    // 调用微信统一下单接口
    const response = await fetch("https://api.mch.weixin.qq.com/pay/unifiedorder", {
      method: "POST",
      headers: { "Content-Type": "text/xml" },
      body: xmlBody,
    });

    const responseText = await response.text();
    
    // 解析响应（简化处理）
    const prepayIdMatch = responseText.match(/<prepay_id><!\[CDATA\[(.*?)\]\]><\/prepay_id>/);
    if (!prepayIdMatch) {
      console.error("[WechatPay] 统一下单失败:", responseText);
      return { success: false, error: "支付创建失败" };
    }

    const prepayId = prepayIdMatch[1];

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
 * 处理支付回调
 */
export async function handlePaymentNotify(xmlBody: string): Promise<{
  success: boolean;
  message?: string;
}> {
  try {
    // 解析 XML（简化处理）
    const returnCodeMatch = xmlBody.match(/<return_code><!\[CDATA\[(.*?)\]\]><\/return_code>/);
    const resultCodeMatch = xmlBody.match(/<result_code><!\[CDATA\[(.*?)\]\]><\/result_code>/);
    const outTradeNoMatch = xmlBody.match(/<out_trade_no><!\[CDATA\[(.*?)\]\]><\/out_trade_no>/);
    const transactionIdMatch = xmlBody.match(/<transaction_id><!\[CDATA\[(.*?)\]\]><\/transaction_id>/);

    if (returnCodeMatch?.[1] !== "SUCCESS" || resultCodeMatch?.[1] !== "SUCCESS") {
      return { success: false, message: "支付失败" };
    }

    const orderNo = outTradeNoMatch?.[1];
    const transactionId = transactionIdMatch?.[1];

    if (!orderNo) {
      return { success: false, message: "订单号缺失" };
    }

    // 更新订单状态
    await prisma.order.update({
      where: { orderNo },
      data: {
        status: OrderStatus.PAID,
        paymentNo: transactionId,
        paymentTime: new Date(),
      },
    });

    console.log(`[WechatPay] 订单支付成功: ${orderNo}`);
    return { success: true };
  } catch (error) {
    console.error("[WechatPay] 处理回调失败:", error);
    return { success: false, message: "处理失败" };
  }
}

