/**
 * 微信模板消息发送逻辑
 *
 * 被以下路由复用：
 * - /api/internal/wechat/send-template (旧版，兼容 INTERNAL_API_SECRET)
 * - /api/v1/internal/wechat/send-template (新版，签名鉴权)
 */
import { prisma } from "@/lib/prisma";
import { apiConsole } from "@/lib/logger";
import { getWechatAccessToken } from "@/lib/wechat";

export interface SendTemplateMessageInput {
  userId: string;
  score: number;
  primaryConcern: string;
  reportUrl: string;
}

export interface SendTemplateMessageResult {
  success: boolean;
  sent: boolean;
  reason?: string;
  error?: {
    code: string;
    message: string;
  };
}

/**
 * 代子站发送微信模板消息
 */
export async function sendWechatTemplateMessage(
  input: SendTemplateMessageInput
): Promise<SendTemplateMessageResult> {
  const { userId, score, primaryConcern, reportUrl } = input;

  // 1. 查询用户微信 OpenID
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { wechatOpenId: true, phone: true },
  });

  if (!user?.wechatOpenId) {
    return {
      success: true,
      sent: false,
      reason: "用户未绑定微信",
    };
  }

  // 2. 获取 AccessToken
  let accessToken: string;
  try {
    accessToken = await getWechatAccessToken();
  } catch (error) {
    apiConsole.error("[WechatInternal] 获取 AccessToken 失败:", error);
    return {
      success: false,
      sent: false,
      error: { code: "WECHAT_TOKEN_ERROR", message: "获取微信 AccessToken 失败" },
    };
  }

  // 3. 发送模板消息
  const templateId = process.env.WECHAT_TEMPLATE_ID;
  if (!templateId) {
    apiConsole.error("[WechatInternal] WECHAT_TEMPLATE_ID 未配置");
    return {
      success: false,
      sent: false,
      error: { code: "CONFIG_ERROR", message: "模板 ID 未配置" },
    };
  }

  const payload = {
    touser: user.wechatOpenId,
    template_id: templateId,
    url: reportUrl,
    topcolor: "#171717",
    data: {
      result: { value: "深度面部分析已完成", color: "#171717" },
      score: { value: score.toString(), color: "#d97706" },
      concern: { value: primaryConcern, color: "#dc2626" },
      time: {
        value: new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }),
        color: "#6b7280",
      },
      remark: {
        value: "👉 点击本卡片立即查看您的详细数字分析大屏及抗老护肤建议。",
        color: "#059669",
      },
    },
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const wxResponse = await fetch(
      `https://api.weixin.qq.com/cgi-bin/message/template/send?access_token=${accessToken}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      }
    );
    clearTimeout(timeout);

    const wxData = await wxResponse.json();

    if (wxData.errcode === 0) {
      apiConsole.info(
        `[WechatInternal] 模板消息发送成功: ${user.phone?.slice(0, 3)}****${user.phone?.slice(-4)}`
      );
      return {
        success: true,
        sent: true,
      };
    }

    apiConsole.error("[WechatInternal] 微信模板消息发送失败:", wxData);
    return {
      success: false,
      sent: false,
      error: { code: "WECHAT_API_ERROR", message: wxData.errmsg || "发送失败" },
    };
  } catch (error) {
    clearTimeout(timeout);
    apiConsole.error("[WechatInternal] 微信请求异常:", error);
    return {
      success: false,
      sent: false,
      error: { code: "WECHAT_REQUEST_ERROR", message: "微信请求超时或失败" },
    };
  }
}
