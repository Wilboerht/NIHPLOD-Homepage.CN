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
import { prisma } from "./prisma";

/**
 * 单条验证码最大校验失败次数。
 * 达到上限后该验证码即作废（used=true），需重新发送，
 * 防止攻击者对同一验证码无限次爆破（6 位码空间仅 10^6）。
 */
export const SMS_CODE_MAX_ATTEMPTS = 5;

/**
 * 记录一次验证码校验失败：原子递增 attempts，达到上限后作废该验证码。
 *
 * 并发安全说明：
 * - 第一步 updateMany 用 Prisma 原子 increment，并发失败不会丢失计数；
 * - 第二步把已达上限的码标记 used（同样是幂等原子操作）。
 * 两步之间存在极短窗口，极端并发下可能多放行 1~2 次尝试，可接受——
 * 爆破成本仅从 5 次变为约 5+并发数次，相对 10^6 码空间无实际影响。
 * 消费端在核销前的查询均带 attempts < SMS_CODE_MAX_ATTEMPTS 条件兜底。
 *
 * 注意：register / 微信绑定等消费路径刻意不做手机号级锁定（避免零门槛锁号 DoS），
 * 单码作废机制是这些路径唯一的验证码防爆破防线。
 */
export async function recordSmsCodeFailure(smsCodeId: string): Promise<void> {
  await prisma.smsCode.updateMany({
    where: { id: smsCodeId, used: false },
    data: { attempts: { increment: 1 } },
  });
  await prisma.smsCode.updateMany({
    where: { id: smsCodeId, used: false, attempts: { gte: SMS_CODE_MAX_ATTEMPTS } },
    data: { used: true },
  });
}

/**
 * 计算验证码哈希
 * 使用 phone + code + type 组合，增加彩虹表攻击难度
 */
export function hashVerifyCode(phone: string, code: string, type: string): string {
  // 使用独立的 SMS_CODE_HMAC_KEY，不与其他密钥复用。
  // 生产环境必须设置此环境变量，否则服务将无法启动。
  const hmacSecret = process.env.SMS_CODE_HMAC_KEY;
  if (!hmacSecret) {
    throw new Error(
      "[SMS] SMS_CODE_HMAC_KEY 环境变量未设置，无法进行验证码哈希。请联系管理员配置。"
    );
  }
  return crypto.createHmac("sha256", hmacSecret).update(`${phone}:${code}:${type}`).digest("hex");
}

/**
 * 安全地比较验证码
 * 使用 timingSafeEqual 防止时序攻击。
 * 存储的 codeHash 为 HMAC-SHA256(phone:code:type)，不与明文 code 直接比对。
 */
export function verifyCode(
  phone: string,
  code: string,
  type: string,
  storedCodeHash: string
): boolean {
  if (!storedCodeHash) {
    return false;
  }
  const expectedHash = hashVerifyCode(phone, code, type);
  try {
    const a = Buffer.from(storedCodeHash);
    const b = Buffer.from(expectedHash);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
import { fetchWithTimeout } from "./fetch-utils";
import * as tencentcloud from "tencentcloud-sdk-nodejs/tencentcloud/services/sms/v20210111/index.js";
import { apiConsole } from "@/lib/logger";

export type SMSTemplate = "LOGIN_CODE" | "PASSWORD_RESET" | "SPENT_REVIEW";

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
  const provider = process.env.SMS_PROVIDER;

  if (!provider || provider === "mock") {
    if (process.env.NODE_ENV === "production") {
      apiConsole.error("[SMS] 生产环境 SMS_PROVIDER 未设置或为 mock，短信功能不可用");
    }
    return sendMockSMS(options);
  }

  switch (provider) {
    case "aliyun":
      return sendAliyunSMS(options);
    case "tencent":
      return sendTencentSMS(options);
    default:
      apiConsole.error(`[SMS] 未知的 SMS_PROVIDER: ${provider}，回退 mock`);
      return sendMockSMS(options);
  }
}

/**
 * Mock 短信（开发测试用）
 *
 * 安全约定：默认不记录 params（含明文验证码）。
 * 仅在显式设置 SMS_DEBUG_LOG_CODE=true 时打印明文验证码，
 * 用于未接入真实短信服务商期间的联调测试；正式启用短信服务前必须移除该变量。
 */
async function sendMockSMS(options: SMSParams): Promise<SMSResult> {
  // 生产环境守卫：SMS_DEBUG_LOG_CODE 在生产环境一律忽略（不抛错，避免阻断业务），
  // 仅打 warning 提醒移除该变量——明文验证码绝不能出现在生产日志中。
  const debugLogCode =
    process.env.SMS_DEBUG_LOG_CODE === "true" && process.env.NODE_ENV !== "production";
  if (process.env.SMS_DEBUG_LOG_CODE === "true" && process.env.NODE_ENV === "production") {
    apiConsole.warn(
      "[Mock SMS] 生产环境下 SMS_DEBUG_LOG_CODE 已忽略（明文验证码不会打印），请从环境变量中移除"
    );
  }
  if (debugLogCode) {
    // 注意：apiConsole.warn 会把对象 String() 化成 [object Object]，必须拼成字符串
    apiConsole.warn(
      `[Mock SMS] SMS_DEBUG_LOG_CODE 已开启，明文打印验证码（仅限联调，上线前必须关闭）: phone=${options.phone} template=${options.template} params=${JSON.stringify(options.params)}`
    );
  } else {
    apiConsole.info("[Mock SMS] 发送短信:", {
      phone: options.phone,
      template: options.template,
      // 不记录 params（含明文验证码）
    });
  }

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

    // 生成签名（HTTP 方法参与签名，与下方 POST 请求保持一致）
    const signature = generateAliyunSignature(params, accessKeySecret);
    params.Signature = signature;

    // 使用 POST + form-urlencoded body 提交参数：
    // 避免明文验证码（TemplateParam）出现在 URL query 中，
    // 防止经网关/CDN/访问日志等链路泄漏。签名逻辑与 GET 完全一致。
    const body = Object.entries(params)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join("&");

    const response = await fetchWithTimeout(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });

    const result = await response.json();

    if (result.Code === "OK") {
      apiConsole.info("[Aliyun SMS] 发送成功:", result.BizId);
      return { success: true, messageId: result.BizId };
    } else {
      apiConsole.error("[Aliyun SMS] 发送失败:", result);
      return { success: false, error: "短信发送失败" };
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
    .map((key) => `${percentEncode(key)}=${percentEncode(params[key])}`)
    .join("&");

  // 3. 构建待签名字符串（HTTP 方法固定为 POST，与 sendAliyunSMS 的请求方式一致）
  const stringToSign = `POST&${percentEncode("/")}&${percentEncode(canonicalizedQueryString)}`;

  // 4. 计算签名
  const hmac = crypto.createHmac("sha1", secret + "&");
  hmac.update(stringToSign);
  return hmac.digest("base64");
}

/**
 * 特殊 URL 编码（阿里云要求）
 */
function percentEncode(str: string): string {
  return encodeURIComponent(str).replace(/\+/g, "%20").replace(/\*/g, "%2A").replace(/%7E/g, "~");
}

/**
 * 获取阿里云模板ID
 */
function getAliyunTemplateCode(template: SMSTemplate): string | null {
  const templates: Record<SMSTemplate, string | undefined> = {
    LOGIN_CODE: process.env.SMS_TEMPLATE_CODE_LOGIN,
    PASSWORD_RESET: process.env.SMS_TEMPLATE_CODE_PASSWORD_RESET,
    SPENT_REVIEW: process.env.SMS_TEMPLATE_CODE_SPENT_REVIEW,
  };
  return templates[template] || null;
}

/**
 * 腾讯云模板参数顺序定义。
 * TemplateParamSet 是位置数组，顺序必须与控制台模板中的变量顺序严格一致，
 * 不能依赖 Object.values 的键序（依赖对象键的插入顺序，属于隐式契约）。
 * 当前模板均为单参数：
 * - LOGIN_CODE：{1} 为验证码
 * - PASSWORD_RESET：{1} 为密码变更时间（安全通知文案）
 * 若未来模板改为多参数，在此按模板变量顺序追加键名即可。
 */
const TENCENT_TEMPLATE_PARAM_KEYS: Record<SMSTemplate, string[]> = {
  LOGIN_CODE: ["code"],
  PASSWORD_RESET: ["time"],
  SPENT_REVIEW: ["result"],
};

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

    // 按模板参数顺序显式映射为位置数组，不依赖 Object.values 的键序。
    // 缺失的参数键给空串占位并告警（防御性处理，避免参数错位发送到用户手机）。
    const paramKeys = TENCENT_TEMPLATE_PARAM_KEYS[options.template];
    const templateParams = paramKeys.map((key) => {
      const value = options.params[key];
      if (value === undefined) {
        apiConsole.warn(
          `[Tencent SMS] 模板 ${options.template} 缺少参数键 ${key}，以空串占位，请检查模板变量配置`
        );
        return "";
      }
      return value;
    });

    const countryCode = process.env.SMS_COUNTRY_CODE || "+86";
    const res = await client.SendSms({
      SmsSdkAppId: appId,
      SignName: signName,
      TemplateId: templateId,
      TemplateParamSet: templateParams,
      PhoneNumberSet: [`${countryCode}${options.phone}`],
    });

    if (res.SendStatusSet && res.SendStatusSet[0].Code === "Ok") {
      apiConsole.info("[Tencent SMS] 发送成功:", res.SendStatusSet[0].SerialNo);
      return { success: true, messageId: res.SendStatusSet[0].SerialNo };
    } else {
      apiConsole.error("[Tencent SMS] 发送失败:", res.SendStatusSet?.[0]);
      return {
        success: false,
        error: "短信发送失败",
      };
    }
  } catch (error: unknown) {
    apiConsole.error("[Tencent SMS] 发送异常:", error);
    return { success: false, error: "短信发送异常" };
  }
}

/**
 * 获取腾讯云模板ID
 */
function getTencentTemplateId(template: SMSTemplate): string | null {
  const templates: Record<SMSTemplate, string | undefined> = {
    LOGIN_CODE: process.env.TENCENT_SMS_TEMPLATE_ID_LOGIN,
    PASSWORD_RESET: process.env.TENCENT_SMS_TEMPLATE_ID_PASSWORD_RESET,
    SPENT_REVIEW: process.env.TENCENT_SMS_TEMPLATE_ID_SPENT_REVIEW,
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
 * 发送密码变更安全通知（密码重置/修改后调用）
 * 通知用户其密码已被修改，若非本人操作请及时联系客服
 */
export async function sendPasswordChangedNotification(phone: string): Promise<void> {
  try {
    const result = await sendSMS({
      phone,
      template: "PASSWORD_RESET",
      params: { time: new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }) },
    });
    if (!result.success) {
      apiConsole.error("[PasswordNotification] 短信发送失败:", result.error);
    }
  } catch (error) {
    apiConsole.error("[PasswordNotification] 发送异常:", error);
  }
}

/**
 * 发送消费补录审核结果通知（审核通过/驳回后调用）
 * 模板单参数：{1} 为审核结果（如"已通过"/"未通过"）
 */
export async function sendSpentReviewNotification(phone: string, result: string): Promise<void> {
  try {
    const smsResult = await sendSMS({
      phone,
      template: "SPENT_REVIEW",
      params: { result },
    });
    if (!smsResult.success) {
      apiConsole.error("[SpentReviewNotification] 短信发送失败:", smsResult.error);
    }
  } catch (error) {
    apiConsole.error("[SpentReviewNotification] 发送异常:", error);
  }
}

/**
 * 生成6位数字验证码
 */
export function generateVerifyCode(): string {
  return randomInt(100000, 1000000).toString();
}
