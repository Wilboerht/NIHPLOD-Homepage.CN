/**
 * NotificationOutbox 渠道适配器。
 * 统一返回可重试/可跳过分类，worker 据此决定 PENDING/SKIPPED/DEAD。
 */
import { sendSMS, type SMSTemplate } from "@/lib/sms";
import {
  sendSpentAdjustmentReviewMessage,
  sendSpentAdjustmentSubmittedMessage,
} from "@/lib/wechat-template";
import { sendMiniprogramSubscribeMessage } from "@/lib/wechat";
import { resolveMiniprogramCredentials } from "@/lib/miniprogram-clients";
import { POINTS_MP_CLIENT_ID } from "@/lib/miniprogram-notify";
import { sendWecomNotification, type WecomNotificationType } from "@/lib/wecom";
import { prisma } from "@/lib/prisma";

export interface NotificationOutboxJob {
  id: string;
  channel: "SMS" | "WECHAT_TEMPLATE" | "MINIPROGRAM" | "WECOM";
  eventType: string;
  userId: string | null;
  recipient: unknown;
  templateKey: string | null;
  payload: unknown;
}

export interface NotificationSendResult {
  ok: boolean;
  skipped?: boolean;
  retryable?: boolean;
  error?: string;
  providerMessageId?: string;
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return record(parsed);
    } catch {
      return {};
    }
  }
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function str(value: unknown): string {
  return typeof value === "string"
    ? value
    : value === undefined || value === null
      ? ""
      : String(value);
}

function truncate(value: string, max: number): string {
  const trimmed = value.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

function formatWxTime(date: Date): string {
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}

function formatWxDate(date: Date): string {
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}年${get("month")}月${get("day")}日 ${get("hour")}:${get("minute")}`;
}

function nonRetryable(message: string): boolean {
  return /未配置|模板|not configured|未绑定|无小程序身份|未订阅/i.test(message);
}

async function sendSmsJob(job: NotificationOutboxJob): Promise<NotificationSendResult> {
  const phone = str(record(job.recipient).phone) || str(record(job.payload).phone);
  if (!phone) return { ok: false, skipped: true, error: "缺少手机号快照" };

  const payload = record(job.payload);
  const key = job.templateKey ?? job.eventType;
  let template: SMSTemplate;
  let params: Record<string, string>;

  switch (key) {
    case "spent_review_undo":
    case "spent_review_result":
      template = "SPENT_REVIEW";
      params = {
        result:
          str(payload.status) === "UNDONE"
            ? "已撤销待复核"
            : str(payload.status) === "APPROVED"
              ? "已通过"
              : "未通过",
      };
      break;
    case "spent_submitted":
      template = "SPENT_SUBMITTED";
      params = { orderNo: str(payload.orderNo) };
      break;
    case "security_action":
      template = "SECURITY_ACTION";
      params = {
        action: truncate(str(payload.action) || "账户安全信息变更", 20),
        time: formatWxTime(new Date(str(payload.time))),
      };
      break;
    case "password_changed":
      template = "PASSWORD_RESET";
      params = { time: formatWxTime(new Date()) };
      break;
    case "admin_password_reset":
      template = "ADMIN_PASSWORD_RESET";
      params = { time: formatWxTime(new Date()) };
      break;
    case "phone_changed":
      template = "PHONE_CHANGED";
      params = { time: formatWxTime(new Date()) };
      break;
    case "account_deleted": {
      template = "ACCOUNT_DELETED";
      const deletedAt = new Date(str(payload.deletedAt));
      params = {
        time: Number.isNaN(deletedAt.getTime())
          ? formatWxTime(new Date())
          : formatWxTime(deletedAt),
      };
      break;
    }
    case "account_deletion_reminder": {
      template = "ACCOUNT_DELETION_REMINDER";
      const scheduledAt = new Date(str(payload.scheduledAt));
      params = {
        time: Number.isNaN(scheduledAt.getTime())
          ? formatWxTime(new Date())
          : formatWxTime(scheduledAt),
      };
      break;
    }
    case "redemption_status":
      template = "REDEMPTION_STATUS";
      params = {
        product: truncate(str(payload.productName) || "积分礼品", 20),
        status: truncate(str(payload.statusLabel) || "状态更新", 20),
      };
      break;
    default:
      return { ok: false, skipped: true, error: `未支持的短信模板：${key}` };
  }

  const result = await sendSMS({ phone, template, params });
  if (result.success) return { ok: true, providerMessageId: result.messageId };
  const error = result.error ?? "短信发送失败";
  return {
    ok: false,
    skipped: nonRetryable(error),
    retryable: !nonRetryable(error),
    error,
  };
}

async function sendWechatJob(job: NotificationOutboxJob): Promise<NotificationSendResult> {
  if (!job.userId) return { ok: false, skipped: true, error: "缺少用户 ID" };
  const payload = record(job.payload);
  const key = job.templateKey ?? job.eventType;

  if (key === "spent_review_result" || key === "spent_review_undo") {
    const result = await sendSpentAdjustmentReviewMessage({
      userId: job.userId,
      status:
        str(payload.status) === "UNDONE"
          ? "UNDONE"
          : str(payload.status) === "APPROVED"
            ? "APPROVED"
            : "REJECTED",
      orderNo: str(payload.orderNo),
      reviewAmount: typeof payload.reviewAmount === "number" ? payload.reviewAmount : undefined,
      reviewNote: typeof payload.reviewNote === "string" ? payload.reviewNote : undefined,
    });
    if (result.sent) return { ok: true };
    if (result.reason) return { ok: false, skipped: true, error: result.reason };
    return {
      ok: false,
      retryable: !nonRetryable(result.error?.message ?? ""),
      error: result.error?.message ?? "微信模板消息未发送",
    };
  }

  if (key === "spent_submitted") {
    const result = await sendSpentAdjustmentSubmittedMessage({
      userId: job.userId,
      orderNo: str(payload.orderNo),
    });
    if (result.sent) return { ok: true };
    if (result.reason) return { ok: false, skipped: true, error: result.reason };
    return {
      ok: false,
      retryable: !nonRetryable(result.error?.message ?? ""),
      error: result.error?.message ?? "微信模板消息未发送",
    };
  }

  return { ok: false, skipped: true, error: `未支持的微信模板：${key}` };
}

async function sendMiniprogramJob(job: NotificationOutboxJob): Promise<NotificationSendResult> {
  if (!job.userId) return { ok: false, skipped: true, error: "缺少用户 ID" };
  const payload = record(job.payload);
  const key = job.templateKey ?? job.eventType;

  let templateId: string | undefined;
  let page: string;
  let data: Record<string, { value: string }>;

  switch (key) {
    case "redemption_shipped":
      templateId = process.env.MP_POINTS_TEMPLATE_SHIPPED;
      page = "pages/records/records";
      data = {
        thing1: { value: truncate(str(payload.productName), 20) },
        character_string2: { value: truncate(str(payload.waybillNo) || "-", 32) },
        thing3: { value: "顺丰速运" },
      };
      break;
    case "spent_review_undo":
    case "spent_review_result":
      templateId = process.env.MP_POINTS_TEMPLATE_SPENT_REVIEW;
      page = "pages/spent-adjustments/spent-adjustments";
      data = {
        date1: { value: formatWxDate(new Date()) },
        thing2: {
          value:
            str(payload.status) === "UNDONE"
              ? "已撤销待复核"
              : str(payload.status) === "APPROVED"
                ? "已通过"
                : "未通过",
        },
      };
      break;
    case "spent_submitted":
      templateId = process.env.MP_POINTS_TEMPLATE_SPENT_SUBMITTED;
      page = "pages/spent-adjustments/spent-adjustments";
      data = {
        date1: { value: formatWxDate(new Date()) },
        thing2: { value: "已提交待审核" },
      };
      break;
    case "redemption_status":
      templateId = process.env.MP_POINTS_TEMPLATE_REDEMPTION_STATUS;
      page = "pages/records/records";
      data = {
        thing1: { value: truncate(str(payload.productName) || "积分礼品", 20) },
        thing2: { value: truncate(str(payload.statusLabel) || "状态更新", 20) },
        date3: { value: formatWxDate(new Date()) },
      };
      break;
    default:
      return { ok: false, skipped: true, error: `未支持的小程序模板：${key}` };
  }

  if (!templateId) return { ok: false, skipped: true, error: "小程序模板未配置" };
  const credentials = resolveMiniprogramCredentials(POINTS_MP_CLIENT_ID);
  if (!credentials) return { ok: false, skipped: true, error: "小程序凭证未配置" };

  const identities = await prisma.externalIdentity.findMany({
    where: { userId: job.userId, provider: "wechat_miniprogram" },
    select: { subjectId: true },
  });
  if (identities.length === 0) {
    return { ok: false, skipped: true, error: "用户无小程序身份" };
  }

  let lastError = "小程序订阅消息未发送";
  for (const identity of identities) {
    const result = await sendMiniprogramSubscribeMessage({
      openid: identity.subjectId,
      templateId,
      page,
      data,
      credentials,
    });
    if (result.ok) return { ok: true };
    if (result.errcode === 40003) {
      lastError = "openid 不属于当前小程序";
      continue;
    }
    return {
      ok: false,
      skipped: result.errcode === 43101,
      retryable: result.errcode !== 43101,
      error: `${result.errcode ?? "?"} ${result.errmsg ?? ""}`.trim() || lastError,
    };
  }
  return { ok: false, skipped: true, error: lastError };
}

async function sendWecomJob(job: NotificationOutboxJob): Promise<NotificationSendResult> {
  const payload = record(job.payload);
  const content = str(payload.content);
  if (!content) return { ok: false, skipped: true, error: "缺少 WeCom 内容" };
  const type = (str(payload.wecomType) || "admin") as WecomNotificationType;
  const result = await sendWecomNotification(content, type);
  if (result.success) return { ok: true };
  return {
    ok: false,
    skipped: nonRetryable(result.error ?? ""),
    retryable: !nonRetryable(result.error ?? ""),
    error: result.error ?? "WeCom 发送失败",
  };
}

export async function dispatchNotificationOutbox(
  job: NotificationOutboxJob
): Promise<NotificationSendResult> {
  switch (job.channel) {
    case "SMS":
      return sendSmsJob(job);
    case "WECHAT_TEMPLATE":
      return sendWechatJob(job);
    case "MINIPROGRAM":
      return sendMiniprogramJob(job);
    case "WECOM":
      return sendWecomJob(job);
  }
}
