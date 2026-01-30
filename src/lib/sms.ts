/**
 * 短信服务
 *
 * 支持多个服务商，通过环境变量配置：
 * - SMS_PROVIDER: aliyun | tencent | mock
 * - SMS_ACCESS_KEY_ID: 阿里云 AccessKeyId
 * - SMS_ACCESS_KEY_SECRET: 阿里云 AccessKeySecret
 * - SMS_SIGN_NAME: 短信签名
 * - SMS_TEMPLATE_CODE_VERIFY: 验证码模板ID
 * - SMS_TEMPLATE_CODE_LOGIN: 登录验证码模板ID
 */

import crypto from "crypto";

export type SMSTemplate = "LOTTERY_VERIFY" | "LOTTERY_WINNER" | "LOGIN_CODE";

export interface SMSParams {
  phone: string;
  template: SMSTemplate;
  params: Record<string, string>;
}

export interface SMSResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * 发送短信
 */
export async function sendSMS(options: SMSParams): Promise<SMSResult> {
  const provider = process.env.SMS_PROVIDER || "mock";

  switch (provider) {
    case "aliyun":
      return sendAliyunSMS(options);
    case "tencent":
      return sendTencentSMS(options);
    case "mock":
    default:
      return sendMockSMS(options);
  }
}

/**
 * Mock 短信（开发测试用）
 */
async function sendMockSMS(options: SMSParams): Promise<SMSResult> {
  console.log("[Mock SMS] 发送短信:", {
    phone: options.phone,
    template: options.template,
    params: options.params,
  });

  // 模拟延迟
  await new Promise((resolve) => setTimeout(resolve, 100));

  return {
    success: true,
    messageId: `mock_${Date.now()}`,
  };
}

/**
 * 阿里云短信
 * 文档: https://help.aliyun.com/document_detail/101414.html
 */
async function sendAliyunSMS(options: SMSParams): Promise<SMSResult> {
  const accessKeyId = process.env.SMS_ACCESS_KEY_ID;
  const accessKeySecret = process.env.SMS_ACCESS_KEY_SECRET;
  const signName = process.env.SMS_SIGN_NAME;

  if (!accessKeyId || !accessKeySecret || !signName) {
    console.error("[Aliyun SMS] 缺少配置");
    return { success: false, error: "短信服务未配置" };
  }

  // 获取模板ID
  const templateCode = getAliyunTemplateCode(options.template);
  if (!templateCode) {
    return { success: false, error: "短信模板未配置" };
  }

  try {
    const endpoint = "https://dysmsapi.aliyuncs.com";

    // 构建请求参数
    const params: Record<string, string> = {
      Action: "SendSms",
      Version: "2017-05-25",
      RegionId: "cn-hangzhou",
      PhoneNumbers: options.phone,
      SignName: signName,
      TemplateCode: templateCode,
      TemplateParam: JSON.stringify(options.params),
      AccessKeyId: accessKeyId,
      Format: "JSON",
      SignatureMethod: "HMAC-SHA1",
      SignatureVersion: "1.0",
      SignatureNonce: crypto.randomUUID(),
      Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    };

    // 生成签名
    const signature = generateAliyunSignature(params, accessKeySecret);
    params.Signature = signature;

    // 发送请求
    const queryString = Object.entries(params)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join("&");

    const response = await fetch(`${endpoint}?${queryString}`, {
      method: "GET",
    });

    const result = await response.json();

    if (result.Code === "OK") {
      console.log("[Aliyun SMS] 发送成功:", result.BizId);
      return { success: true, messageId: result.BizId };
    } else {
      console.error("[Aliyun SMS] 发送失败:", result);
      return { success: false, error: result.Message || "短信发送失败" };
    }
  } catch (error) {
    console.error("[Aliyun SMS] 发送异常:", error);
    return { success: false, error: "短信发送失败" };
  }
}

/**
 * 生成阿里云 API 签名
 */
function generateAliyunSignature(params: Record<string, string>, secret: string): string {
  // 1. 按参数名排序
  const sortedKeys = Object.keys(params).sort();

  // 2. 构建规范化查询字符串
  const canonicalizedQueryString = sortedKeys
    .map(key => `${percentEncode(key)}=${percentEncode(params[key])}`)
    .join("&");

  // 3. 构建待签名字符串
  const stringToSign = `GET&${percentEncode("/")}&${percentEncode(canonicalizedQueryString)}`;

  // 4. 计算签名
  const hmac = crypto.createHmac("sha1", secret + "&");
  hmac.update(stringToSign);
  return hmac.digest("base64");
}

/**
 * 特殊 URL 编码（阿里云要求）
 */
function percentEncode(str: string): string {
  return encodeURIComponent(str)
    .replace(/\+/g, "%20")
    .replace(/\*/g, "%2A")
    .replace(/%7E/g, "~");
}

/**
 * 获取阿里云模板ID
 */
function getAliyunTemplateCode(template: SMSTemplate): string | null {
  const templates: Record<SMSTemplate, string | undefined> = {
    LOTTERY_VERIFY: process.env.SMS_TEMPLATE_CODE_VERIFY,
    LOTTERY_WINNER: process.env.SMS_TEMPLATE_CODE_WINNER,
    LOGIN_CODE: process.env.SMS_TEMPLATE_CODE_LOGIN,
  };
  return templates[template] || null;
}

/**
/**
 * 腾讯云短信
 * 使用 API V3 鉴权
 */
async function sendTencentSMS(options: SMSParams): Promise<SMSResult> {
  const secretId = process.env.TENCENT_SMS_SECRET_ID;
  const secretKey = process.env.TENCENT_SMS_SECRET_KEY;
  const appId = process.env.TENCENT_SMS_APP_ID;
  const signName = process.env.TENCENT_SMS_SIGN_NAME;

  if (!secretId || !secretKey || !appId || !signName) {
    console.error("[Tencent SMS] 缺少配置");
    return { success: false, error: "腾讯云短信服务未配置" };
  }

  const templateId = getTencentTemplateId(options.template);
  if (!templateId) {
    return { success: false, error: "短信模板未配置" };
  }

  try {
    const endpoint = "sms.tencentcloudapi.com";
    const service = "sms";
    const region = "ap-guangzhou";
    const action = "SendSms";
    const version = "2021-01-11";
    const timestamp = Math.floor(Date.now() / 1000);
    // 格式化日期 YYYY-MM-DD
    const date = new Date(timestamp * 1000).toISOString().split("T")[0];

    // 构建请求体 (参数转换: object -> array for Tencent)
    // 腾讯云模板参数顺序很重要，通常是 [code] 或 [code, time]
    // 这里简单处理：取 params 中的第一个值作为模板参数
    // 或者根据模板类型定制参数顺序
    const templateParamSet = Object.values(options.params);

    const payload = {
      PhoneNumberSet: [`+86${options.phone}`], // 必须带 +86
      SmsSdkAppId: appId,
      SignName: signName,
      TemplateId: templateId,
      TemplateParamSet: templateParamSet,
    };

    const payloadStr = JSON.stringify(payload);

    // ************* 签名过程 *************
    // 1. 拼接规范请求串
    const httpRequestMethod = "POST";
    const canonicalUri = "/";
    const canonicalQueryString = "";
    const canonicalHeaders = `content-type:application/json\nhost:${endpoint}\n`;
    const signedHeaders = "content-type;host";
    const hashedRequestPayload = crypto
      .createHash("sha256")
      .update(payloadStr)
      .digest("hex")
      .toLowerCase();

    const canonicalRequest =
      httpRequestMethod +
      "\n" +
      canonicalUri +
      "\n" +
      canonicalQueryString +
      "\n" +
      canonicalHeaders +
      "\n" +
      signedHeaders +
      "\n" +
      hashedRequestPayload;

    // 2. 拼接待签名字符串
    const algorithm = "TC3-HMAC-SHA256";
    const credentialScope = date + "/" + service + "/" + "tc3_request";
    const hashedCanonicalRequest = crypto
      .createHash("sha256")
      .update(canonicalRequest)
      .digest("hex")
      .toLowerCase();

    const stringToSign =
      algorithm +
      "\n" +
      timestamp +
      "\n" +
      credentialScope +
      "\n" +
      hashedCanonicalRequest;

    // 3. 计算签名
    const kDate = crypto
      .createHmac("sha256", "TC3" + secretKey)
      .update(date)
      .digest();
    const kService = crypto.createHmac("sha256", kDate).update(service).digest();
    const kSigning = crypto.createHmac("sha256", kService).update("tc3_request").digest();
    const signature = crypto
      .createHmac("sha256", kSigning)
      .update(stringToSign)
      .digest("hex")
      .toLowerCase();

    // 4. 拼接 Authorization
    const authorization =
      algorithm +
      " " +
      "Credential=" +
      secretId +
      "/" +
      credentialScope +
      ", " +
      "SignedHeaders=" +
      signedHeaders +
      ", " +
      "Signature=" +
      signature;

    // 发送请求
    const response = await fetch(`https://${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authorization,
        Host: endpoint,
        "X-TC-Action": action,
        "X-TC-Version": version,
        "X-TC-Timestamp": timestamp.toString(),
        "X-TC-Region": region,
      },
      body: payloadStr,
    });

    const result = await response.json();

    if (result.Response && result.Response.SendStatusSet && result.Response.SendStatusSet[0].Code === "Ok") {
      console.log("[Tencent SMS] 发送成功:", result.Response.RequestId);
      return { success: true, messageId: result.Response.RequestId };
    } else {
      console.error("[Tencent SMS] 发送失败:", JSON.stringify(result));
      const errorMsg = result.Response?.Error?.Message ||
        result.Response?.SendStatusSet?.[0]?.Message ||
        "发送失败";
      return { success: false, error: errorMsg };
    }
  } catch (error) {
    console.error("[Tencent SMS] 发送异常:", error);
    return { success: false, error: "短信发送异常" };
  }
}

/**
 * 获取腾讯云模板ID
 */
function getTencentTemplateId(template: SMSTemplate): string | null {
  const templates: Record<SMSTemplate, string | undefined> = {
    LOTTERY_VERIFY: process.env.TENCENT_SMS_TEMPLATE_ID_VERIFY,
    LOTTERY_WINNER: process.env.TENCENT_SMS_TEMPLATE_ID_WINNER,
    LOGIN_CODE: process.env.TENCENT_SMS_TEMPLATE_ID_LOGIN,
  };
  return templates[template] || null;
}

/**
 * 发送登录验证码
 */
export async function sendLoginCode(phone: string, code: string): Promise<SMSResult> {
  return sendSMS({
    phone,
    template: "LOGIN_CODE",
    params: { code },
  });
}

/**
 * 生成6位数字验证码
 */
export function generateVerifyCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

