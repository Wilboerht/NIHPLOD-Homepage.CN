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
 */
export async function sendWecomNotification(content: string): Promise<{ success: boolean; error?: string }> {
  const webhookUrl = process.env.WECOM_BOT_WEBHOOK;

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
  email: string;
  type?: string;
  content: string;
  location?: string;
  memberAccount?: string;
}) {
  let details = `### 📢 NIHPLOD 新留言通知
> **留言人**: ${data.name}
> **咨询类型**: ${data.type || '通用'}`;

  if (data.location) {
    details += `\n> **所在地**: ${data.location}`;
  }
  if (data.memberAccount) {
    details += `\n> **会员账号**: ${data.memberAccount}`;
  }

  details += `\n> **邮件**: ${data.email || '未填写'}
> **时间**: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}

**留言内容**:
${data.content}

[点击后台查看](https://nihplod.cn/admin/messages)`;

  return details;
}
