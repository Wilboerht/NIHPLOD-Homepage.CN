/**
 * 企业微信机器人通知工具
 *
 * 分发规则：
 * - WECOM_BOT_WEBHOOK（综合管理群）：接收全部通知
 * - WECOM_OPS_WEBHOOK（运营群，可选）：留言 / 积分申请 / 积分兑换申请
 * - WECOM_JOBS_WEBHOOK（招聘群，可选）：求职申请
 * 同一 webhook 配置多次时自动去重，避免重复推送。
 */
import { apiConsole } from "@/lib/logger";

interface WecomBotMessage {
  msgtype: "markdown" | "text";
  markdown?: {
    content: string;
  };
  text?: {
    content: string;
    mentioned_list?: string[];
    mentioned_mobile_list?: string[];
  };
}

export type WecomNotificationType = "admin" | "contact" | "job" | "points" | "redemption" | "ops";

const TYPE_LABELS: Record<WecomNotificationType, string> = {
  admin: "管理端",
  contact: "留言",
  job: "招聘",
  points: "积分申请",
  redemption: "兑换申请",
  ops: "运营",
};

/** 运营群接收的业务通知类型 */
const OPS_TYPES: ReadonlySet<WecomNotificationType> = new Set([
  "contact",
  "points",
  "redemption",
  "ops",
]);

/** 解析某类通知应投递的全部 webhook（综合管理群始终包含，其余按类型追加并去重） */
export function resolveWecomWebhookUrls(type: WecomNotificationType): string[] {
  const urls: string[] = [];
  const add = (url: string | undefined) => {
    const trimmed = url?.trim();
    if (trimmed && !urls.includes(trimmed)) urls.push(trimmed);
  };

  add(process.env.WECOM_BOT_WEBHOOK);
  if (type === "job") add(process.env.WECOM_JOBS_WEBHOOK);
  if (OPS_TYPES.has(type)) add(process.env.WECOM_OPS_WEBHOOK);
  return urls;
}

async function postWecomMarkdown(
  webhookUrl: string,
  content: string
): Promise<{ success: boolean; error?: string }> {
  // 10秒超时控制，防止接口由于网络原因挂起请求
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const message: WecomBotMessage = {
      msgtype: "markdown",
      markdown: {
        content: content,
      },
    };

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(message),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const data = await response.json();

    if (data.errcode === 0) {
      return { success: true };
    }
    apiConsole.error("企业微信通知发送失败:", data.errmsg);
    return { success: false, error: data.errmsg };
  } catch (error) {
    clearTimeout(timeoutId);
    apiConsole.error("企业微信通知请求异常:", error);
    const errorMsg =
      error instanceof Error
        ? error.name === "AbortError"
          ? "请求超时 (10s)"
          : error.message
        : String(error);
    return { success: false, error: errorMsg };
  }
}

/**
 * 发送企业微信群机器人通知
 * @param content 消息内容 (支持 Markdown)
 * @param type 通知类型，决定除综合管理群外是否追加运营群/招聘群
 */
export async function sendWecomNotification(
  content: string,
  type: WecomNotificationType = "admin"
): Promise<{ success: boolean; error?: string }> {
  const webhookUrls = resolveWecomWebhookUrls(type);
  if (webhookUrls.length === 0) {
    // 记录日志告警：生产环境不应静默丢失通知
    apiConsole.warn(`[WeCom] ${TYPE_LABELS[type]}机器人 Webhook 未配置，通知不会发送`);
    return { success: false, error: "WECOM_BOT_WEBHOOK not configured" };
  }
  if (!process.env.WECOM_BOT_WEBHOOK?.trim()) {
    apiConsole.warn("[WeCom] WECOM_BOT_WEBHOOK 未配置，综合管理群将收不到通知");
  }

  const results = await Promise.all(webhookUrls.map((url) => postWecomMarkdown(url, content)));
  const errors = results
    .map((result, index) =>
      result.success ? null : `目标${index + 1}: ${result.error ?? "unknown"}`
    )
    .filter((error): error is string => error !== null);

  return errors.length === 0 ? { success: true } : { success: false, error: errors.join("; ") };
}

/**
 * 转义 WeCom Markdown 特殊字符，防止用户输入注入链接/格式
 * 转义字符：\ ` * [ ] ( ) # + - . ! ~ > |
 */
export function escapeWecomMarkdown(text: string): string {
  return String(text).replace(/([\\`*[\]()#+\-.!~>|])/g, "\\$1");
}

/**
 * 格式化联系表单消息为 WeCom Markdown 格式
 */
export function formatContactToWecom(data: {
  name: string;
  phone: string;
  type?: string;
  content: string;
  location?: string;
}) {
  const lines = [
    `> **留言人**: ${escapeWecomMarkdown(data.name)}`,
    `> **咨询类型**: ${escapeWecomMarkdown(data.type || "通用")}`,
  ];

  if (data.location) {
    lines.push(`> **所在地**: ${escapeWecomMarkdown(data.location)}`);
  }
  if (data.phone) {
    lines.push(`> **手机号**: ${escapeWecomMarkdown(data.phone)}`);
  }

  lines.push(`> **时间**: ${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}`);

  return `### 留言通知
${lines.join("\n")}

**留言内容**:
${escapeWecomMarkdown(data.content)}`;
}

/**
 * 格式化职位申请消息为 WeCom Markdown 格式
 */
export function formatJobApplicationToWecom(data: {
  name: string;
  phone: string;
  position: string;
}) {
  return `### 求职申请
> **申请人**: ${escapeWecomMarkdown(data.name)}
> **应聘职位**: ${escapeWecomMarkdown(data.position)}
> **手机号**: ${escapeWecomMarkdown(data.phone)}
> **提交时间**: ${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}`;
}

/**
 * 格式化新积分申请（消费补录）消息为 WeCom Markdown 格式
 */
export function formatSpentApplicationToWecom(data: {
  userLabel: string;
  channel: string;
  orderNo: string;
  amountClaimed?: number | null;
  purchasedAt?: Date | null;
  submittedAt: Date;
  note?: string | null;
  /** 管理员代客填写时显示操作管理员，便于审核人识别来源 */
  onBehalfByName?: string | null;
}) {
  const lines = [
    `> **用户**: ${escapeWecomMarkdown(data.userLabel)}`,
    `> **渠道**: ${escapeWecomMarkdown(data.channel)}`,
    `> **订单号**: ${escapeWecomMarkdown(data.orderNo)}`,
  ];
  if (data.onBehalfByName) {
    lines.unshift(`> **提交方式**: 管理员代填（${escapeWecomMarkdown(data.onBehalfByName)}）`);
  }

  if (data.amountClaimed) {
    lines.push(`> **申报金额**: ¥${data.amountClaimed.toLocaleString("zh-CN")}`);
  }
  if (data.purchasedAt) {
    lines.push(
      `> **消费日期**: ${data.purchasedAt.toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" })}`
    );
  }
  lines.push(
    `> **提交时间**: ${data.submittedAt.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}`
  );
  if (data.note) {
    lines.push("", "**备注**:", escapeWecomMarkdown(data.note));
  }

  return `### 积分申请
${lines.join("\n")}`;
}

/**
 * 格式化新积分兑换申请消息为 WeCom Markdown 格式
 */
export function formatRedemptionToWecom(data: {
  userLabel: string;
  productName: string;
  points: number;
  levelLabel: string;
  submittedAt: Date;
}) {
  return `### 兑换申请
> **用户**: ${escapeWecomMarkdown(data.userLabel)}
> **礼品**: ${escapeWecomMarkdown(data.productName)}
> **扣减积分**: ${data.points}
> **会员等级**: ${escapeWecomMarkdown(data.levelLabel)}
> **提交时间**: ${data.submittedAt.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}`;
}
