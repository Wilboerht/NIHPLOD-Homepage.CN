/**
 * 短信服务
 * 
 * 支持多个服务商，通过环境变量配置：
 * - SMS_PROVIDER: aliyun | tencent | mock
 * - SMS_ACCESS_KEY_ID: 阿里云 AccessKeyId
 * - SMS_ACCESS_KEY_SECRET: 阿里云 AccessKeySecret
 * - SMS_SIGN_NAME: 短信签名
 * - SMS_TEMPLATE_CODE_VERIFY: 验证码模板ID
 */

export interface SMSParams {
  phone: string;
  template: "LOTTERY_VERIFY" | "LOTTERY_WINNER";
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
    // 阿里云短信 API 调用
    // 这里使用 REST API 方式，避免引入 SDK
    const _endpoint = "https://dysmsapi.aliyuncs.com";
    const params = new URLSearchParams({
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
      SignatureNonce: Math.random().toString(36).substring(2),
      Timestamp: new Date().toISOString(),
    });

    // 生成签名（简化版，实际需要完整的签名算法）
    // TODO: 实现完整的阿里云签名算法
    console.log("[Aliyun SMS] 请求参数:", params.toString());

    return { success: false, error: "阿里云短信需要完整实现签名算法" };
  } catch (error) {
    console.error("[Aliyun SMS] 发送失败:", error);
    return { success: false, error: "短信发送失败" };
  }
}

/**
 * 获取阿里云模板ID
 */
function getAliyunTemplateCode(template: string): string | null {
  const templates: Record<string, string | undefined> = {
    LOTTERY_VERIFY: process.env.SMS_TEMPLATE_CODE_VERIFY,
    LOTTERY_WINNER: process.env.SMS_TEMPLATE_CODE_WINNER,
  };
  return templates[template] || null;
}

/**
 * 腾讯云短信
 * TODO: 实现腾讯云短信
 */
async function sendTencentSMS(options: SMSParams): Promise<SMSResult> {
  console.log("[Tencent SMS] 腾讯云短信待实现:", options);
  return { success: false, error: "腾讯云短信待实现" };
}

