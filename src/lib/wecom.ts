import { apiConsole } from "@/lib/logger";
/**
 * 企业微信机器人通知工具
 */
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

/**
 * 发送企业微信群机器人通知
 * @param content 消息内容 (支持 Markdown)
 * @param type 通知类型 (contact 或 job)
 */
export async function sendWecomNotification(
  content: string,
  type: "contact" | "job" = "contact"
): Promise<{ success: boolean; error?: string }> {
  // 根据类型选择不同的 Webhook 链接
  const webhookUrl =
    type === "job"
      ? process.env.WECOM_JOBS_WEBHOOK || process.env.WECOM_BOT_WEBHOOK
      : process.env.WECOM_BOT_WEBHOOK;

  if (!webhookUrl) {
    // 记录日志告警：生产环境不应静默丢失通知
    apiConsole.warn(
      `[WeCom] ${type === "job" ? "招聘" : "联系表单"}机器人 Webhook 未配置，通知不会发送`
    );
    return { success: false, error: "WECOM_BOT_WEBHOOK not configured" };
  }

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
    } else {
      apiConsole.error("企业微信通知发送失败:", data.errmsg);
      return { success: false, error: data.errmsg };
    }
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
 * 获取基础站点链接
 */
function getBaseUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || "https://nihplod.cn").replace(/\/$/, "");
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

  const baseUrl = getBaseUrl();

  return `### 📢 NIHPLOD 新留言通知
${lines.join("\n")}

**留言内容**:
${escapeWecomMarkdown(data.content)}

[点击后台查看](${baseUrl}/admin/messages)`;
}

/**
 * 格式化职位申请消息为 WeCom Markdown 格式
 */
export function formatJobApplicationToWecom(data: {
  name: string;
  phone: string;
  position: string;
  resumeUrl: string;
}) {
  const baseUrl = getBaseUrl();

  return `### 💼 NIHPLOD 新求职申请
> **申请人**: ${escapeWecomMarkdown(data.name)}
> **应聘职位**: ${escapeWecomMarkdown(data.position)}
> **手机号**: ${escapeWecomMarkdown(data.phone)}
> **提交时间**: ${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}

**简历详情**: [点击查看简历](${data.resumeUrl})

[点击进入后台](${baseUrl}/admin/applications)`;
}
