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
import { randomInt } from "./random";

/**
 * 计算验证码哈希
 * 使用 phone + code + type 组合，增加彩虹表攻击难度
 */
export function hashVerifyCode(phone: string, code: string, type: string): string {
  return crypto.createHmac("sha256", process.env.JWT_SECRET || "default-secret")
    .update(`${phone}:${code}:${type}`)
    .digest("hex");
}

/**
 * 安全地比较验证码
 * 优先使用 codeHash，回退明文 code（兼容旧数据）
 */
export function verifyCode(
  phone: string,
  code: string,
  type: string,
  storedCode: string,
  storedCodeHash?: string | null
): boolean {
  if (storedCodeHash) {
    const expectedHash = hashVerifyCode(phone, code, type);
    try {
      const a = Buffer.from(storedCodeHash);
      const b = Buffer.from(expectedHash);
      return a.length === b.length && crypto.timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }
  // 兼容旧数据：明文比较
  return storedCode === code;
}
import { fetchWithTimeout } from "./fetch-utils";
import * as tencentcloud from "tencentcloud-sdk-nodejs/tencentcloud/services/sms/v20210111/index.js";
import { apiConsole } from "@/lib/logger";

export type SMSTemplate = "LOGIN_CODE";

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
    apiConsole.error("[Aliyun SMS] 缺少配置");
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

    const response = await fetchWithTimeout(`${endpoint}?${queryString}`, {
      method: "GET",
    });

    const result = await response.json();

    if (result.Code === "OK") {
      console.log("[Aliyun SMS] 发送成功:", result.BizId);
      return { success: true, messageId: result.BizId };
    } else {
      apiConsole.error("[Aliyun SMS] 发送失败:", result);
      return { success: false, error: result.Message || "短信发送失败" };
    }
  } catch (error) {
    apiConsole.error("[Aliyun SMS] 发送异常:", error);
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
    LOGIN_CODE: process.env.SMS_TEMPLATE_CODE_LOGIN,
  };
  return templates[template] || null;
}

/**
 * 腾讯云短信
 * 使用 SDK
 */
async function sendTencentSMS(options: SMSParams): Promise<SMSResult> {
  const secretId = process.env.TENCENT_SMS_SECRET_ID;
  const secretKey = process.env.TENCENT_SMS_SECRET_KEY;
  const appId = process.env.TENCENT_SMS_APP_ID;
  const signName = process.env.TENCENT_SMS_SIGN_NAME;

  if (!secretId || !secretKey || !appId || !signName) {
    apiConsole.error("[Tencent SMS] 缺少配置");
    return { success: false, error: "腾讯云短信服务未配置" };
  }

  const templateId = getTencentTemplateId(options.template);
  if (!templateId) {
    return { success: false, error: "短信模板未配置" };
  }

  try {
    const SmsClient = tencentcloud.v20210111.Client;
    const client = new SmsClient({
      credential: { secretId, secretKey },
      region: "ap-guangzhou",
      profile: {
        signMethod: "HmacSHA256",
        httpProfile: {
          reqMethod: "POST",
          reqTimeout: 30,
          endpoint: "sms.tencentcloudapi.com",
        },
      },
    });

    // 转换参数: 只取 value 数组，顺序必须与模板匹配
    // 例如 login code 模板参数 { code: "1234" } -> ["1234"]
    const templateParams = Object.values(options.params);

    const res = await client.SendSms({
      SmsSdkAppId: appId,
      SignName: signName,
      TemplateId: templateId,
      TemplateParamSet: templateParams,
      PhoneNumberSet: [`+86${options.phone}`],
    });

    if (res.SendStatusSet && res.SendStatusSet[0].Code === "Ok") {
      console.log("[Tencent SMS] 发送成功:", res.SendStatusSet[0].SerialNo);
      return { success: true, messageId: res.SendStatusSet[0].SerialNo };
    } else {
      apiConsole.error("[Tencent SMS] 发送失败:", res.SendStatusSet?.[0]);
      return {
        success: false,
        error: res.SendStatusSet?.[0]?.Message || "发送失败"
      };
    }
  } catch (error: unknown) {
    apiConsole.error("[Tencent SMS] 发送异常:", error);
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message || "短信发送异常" };
  }
}

/**
 * 获取腾讯云模板ID
 */
function getTencentTemplateId(template: SMSTemplate): string | null {
  const templates: Record<SMSTemplate, string | undefined> = {
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
  return randomInt(100000, 1000000).toString();
}

