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
  const webhookUrl = type === "job" 
    ? (process.env.WECOM_JOBS_WEBHOOK || process.env.WECOM_BOT_WEBHOOK)
    : process.env.WECOM_BOT_WEBHOOK;

  if (!webhookUrl) {
    // 未配置 Webhook 时静默跳过
    return { success: false, error: "WECOM_BOT_WEBHOOK not configured" };
  }

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
    });

    const data = await response.json();

    if (data.errcode === 0) {
      return { success: true };
    } else {
      console.error("企业微信通知发送失败:", data.errmsg);
      return { success: false, error: data.errmsg };
    }
  } catch (error) {
    console.error("企业微信通知请求异常:", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
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
    `> **留言人**: ${data.name}`,
    `> **咨询类型**: ${data.type || '通用'}`,
  ];

  if (data.location) {
    lines.push(`> **所在地**: ${data.location}`);
  }
  if (data.phone) {
    lines.push(`> **手机号**: ${data.phone}`);
  }

  lines.push(`> **时间**: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`);

  return `### 📢 NIHPLOD 新留言通知
${lines.join('\n')}

**留言内容**:
${data.content}

[点击后台查看](https://nihplod.cn/admin/messages)`;
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
  return `### 💼 NIHPLOD 新求职申请
> **申请人**: ${data.name}
> **应聘职位**: ${data.position}
> **手机号**: ${data.phone}
> **提交时间**: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}

**简历详情**: [点击查看简历](${data.resumeUrl})

[点击进入后台](https://nihplod.cn/admin/jobs)`;
}
