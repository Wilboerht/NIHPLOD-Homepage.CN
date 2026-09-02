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

export interface SendSpentAdjustmentMessageInput {
  userId: string;
  status: "APPROVED" | "REJECTED";
  orderNo: string;
  reviewAmount?: number;
  reviewNote?: string;
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

/**
 * 发送消费补录审核结果微信模板消息（仅已绑定微信的用户生效）
 * 模板 ID 通过 WECHAT_TEMPLATE_ID_SPENT_ADJUSTMENT 配置；
 * 未配置时优雅降级（返回 sent: false），不阻断审核主流程。
 */
export async function sendSpentAdjustmentReviewMessage(
  input: SendSpentAdjustmentMessageInput
): Promise<SendTemplateMessageResult> {
  const { userId, status, orderNo, reviewAmount, reviewNote } = input;

  // 1. 查询用户微信 OpenID
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { wechatOpenId: true },
  });

  if (!user?.wechatOpenId) {
    return { success: true, sent: false, reason: "用户未绑定微信" };
  }

  // 2. 获取 AccessToken
  let accessToken: string;
  try {
    accessToken = await getWechatAccessToken();
  } catch (error) {
    apiConsole.error("[SpentAdjustment] 获取 AccessToken 失败:", error);
    return {
      success: false,
      sent: false,
      error: { code: "WECHAT_TOKEN_ERROR", message: "获取微信 AccessToken 失败" },
    };
  }

  // 3. 模板 ID
  const templateId = process.env.WECHAT_TEMPLATE_ID_SPENT_ADJUSTMENT;
  if (!templateId) {
    apiConsole.warn("[SpentAdjustment] WECHAT_TEMPLATE_ID_SPENT_ADJUSTMENT 未配置，跳过微信通知");
    return {
      success: true,
      sent: false,
      reason: "审核结果模板未配置",
    };
  }

  const approved = status === "APPROVED";
  const payload = {
    touser: user.wechatOpenId,
    template_id: templateId,
    topcolor: "#171717",
    data: {
      result: {
        value: approved ? "审核通过" : "审核未通过",
        color: approved ? "#059669" : "#dc2626",
      },
      // 微信模板 data 字段单值上限 20 字符，超长截断防止 API 报错
      orderNo: { value: orderNo.slice(0, 20), color: "#171717" },
      ...(approved && reviewAmount !== undefined
        ? { amount: { value: `¥${reviewAmount.toLocaleString()}`, color: "#d97706" } }
        : {}),
      remark: {
        // remark 上限 30 字符
        value: (
          approved
            ? "历史消费金额已累加，会员等级已按最新金额更新。"
            : (reviewNote ?? "凭证未通过审核，如有疑问请联系客服。")
        ).slice(0, 30),
        color: "#6b7280",
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
      apiConsole.info(`[SpentAdjustment] 审核结果模板消息发送成功: userId=${userId}`);
      return { success: true, sent: true };
    }

    apiConsole.error("[SpentAdjustment] 微信模板消息发送失败:", wxData);
    return {
      success: false,
      sent: false,
      error: { code: "WECHAT_API_ERROR", message: wxData.errmsg || "发送失败" },
    };
  } catch (error) {
    clearTimeout(timeout);
    apiConsole.error("[SpentAdjustment] 微信请求异常:", error);
    return {
      success: false,
      sent: false,
      error: { code: "WECHAT_REQUEST_ERROR", message: "微信请求超时或失败" },
    };
  }
}
