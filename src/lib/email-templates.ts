/**
 * 邮件 HTML 模板
 */

// 品牌颜色
const BRAND_GOLD = "#C9A86C";
const BRAND_CHARCOAL = "#2C2C2C";
const BRAND_CREAM = "#FAF8F5";

// 基础邮件模板包装器
function baseTemplate(content: string): string {
  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>NIHPLOD</title>
</head>
<body style="margin: 0; padding: 0; background-color: ${BRAND_CREAM}; font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width: 600px; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td align="center" style="padding: 32px 40px; border-bottom: 1px solid #eee;">
              <h1 style="margin: 0; font-size: 28px; font-weight: 400; color: ${BRAND_CHARCOAL}; letter-spacing: 4px;">
                NIHPLOD
              </h1>
              <p style="margin: 8px 0 0 0; font-size: 12px; color: ${BRAND_GOLD}; letter-spacing: 2px;">
                高端婚礼花艺定制
              </p>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              ${content}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td align="center" style="padding: 24px 40px; border-top: 1px solid #eee; background-color: ${BRAND_CREAM}; border-radius: 0 0 8px 8px;">
              <p style="margin: 0 0 8px 0; font-size: 12px; color: #999;">
                此邮件由系统自动发送，请勿直接回复
              </p>
              <p style="margin: 0; font-size: 12px; color: #999;">
                © ${new Date().getFullYear()} NIHPLOD. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

/**
 * 联系表单通知模板（发给管理员）
 */
export function contactNotificationTemplate(data: {
  name: string;
  email: string;
  phone?: string;
  content: string;
}): string {
  const content = `
    <h2 style="margin: 0 0 24px 0; font-size: 20px; font-weight: 500; color: ${BRAND_CHARCOAL};">
      新的联系留言
    </h2>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom: 24px;">
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #eee;">
          <span style="color: #666; font-size: 14px;">姓名</span>
          <p style="margin: 4px 0 0 0; font-size: 16px; color: ${BRAND_CHARCOAL};">${escapeHtml(data.name)}</p>
        </td>
      </tr>
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #eee;">
          <span style="color: #666; font-size: 14px;">邮箱</span>
          <p style="margin: 4px 0 0 0; font-size: 16px; color: ${BRAND_CHARCOAL};">
            <a href="mailto:${escapeHtml(data.email)}" style="color: ${BRAND_GOLD}; text-decoration: none;">${escapeHtml(data.email)}</a>
          </p>
        </td>
      </tr>
      ${
        data.phone
          ? `
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #eee;">
          <span style="color: #666; font-size: 14px;">电话</span>
          <p style="margin: 4px 0 0 0; font-size: 16px; color: ${BRAND_CHARCOAL};">
            <a href="tel:${escapeHtml(data.phone)}" style="color: ${BRAND_GOLD}; text-decoration: none;">${escapeHtml(data.phone)}</a>
          </p>
        </td>
      </tr>
      `
          : ""
      }
    </table>
    <div style="background-color: ${BRAND_CREAM}; padding: 20px; border-radius: 4px;">
      <span style="color: #666; font-size: 14px;">留言内容</span>
      <p style="margin: 8px 0 0 0; font-size: 15px; line-height: 1.8; color: ${BRAND_CHARCOAL}; white-space: pre-wrap;">${escapeHtml(data.content)}</p>
    </div>
    <p style="margin: 24px 0 0 0; font-size: 12px; color: #999;">
      收到时间：${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}
    </p>
  `;

  return baseTemplate(content);
}

/**
 * 招聘申请通知模板（发给管理员）
 */
export function jobApplicationTemplate(data: {
  name: string;
  email: string;
  phone: string;
  position: string;
  coverLetter?: string;
}): string {
  const content = `
    <h2 style="margin: 0 0 24px 0; font-size: 20px; font-weight: 500; color: ${BRAND_CHARCOAL};">
      新的求职申请
    </h2>
    <div style="background-color: ${BRAND_GOLD}; color: white; padding: 12px 20px; border-radius: 4px; margin-bottom: 24px;">
      <span style="font-size: 14px;">申请职位</span>
      <p style="margin: 4px 0 0 0; font-size: 18px; font-weight: 500;">${escapeHtml(data.position)}</p>
    </div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom: 24px;">
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #eee;">
          <span style="color: #666; font-size: 14px;">姓名</span>
          <p style="margin: 4px 0 0 0; font-size: 16px; color: ${BRAND_CHARCOAL};">${escapeHtml(data.name)}</p>
        </td>
      </tr>
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #eee;">
          <span style="color: #666; font-size: 14px;">邮箱</span>
          <p style="margin: 4px 0 0 0; font-size: 16px; color: ${BRAND_CHARCOAL};">
            <a href="mailto:${escapeHtml(data.email)}" style="color: ${BRAND_GOLD}; text-decoration: none;">${escapeHtml(data.email)}</a>
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #eee;">
          <span style="color: #666; font-size: 14px;">电话</span>
          <p style="margin: 4px 0 0 0; font-size: 16px; color: ${BRAND_CHARCOAL};">
            <a href="tel:${escapeHtml(data.phone)}" style="color: ${BRAND_GOLD}; text-decoration: none;">${escapeHtml(data.phone)}</a>
          </p>
        </td>
      </tr>
    </table>
    ${
      data.coverLetter
        ? `
    <div style="background-color: ${BRAND_CREAM}; padding: 20px; border-radius: 4px;">
      <span style="color: #666; font-size: 14px;">求职信</span>
      <p style="margin: 8px 0 0 0; font-size: 15px; line-height: 1.8; color: ${BRAND_CHARCOAL}; white-space: pre-wrap;">${escapeHtml(data.coverLetter)}</p>
    </div>
    `
        : ""
    }
    <p style="margin: 24px 0 0 0; font-size: 12px; color: #999;">
      申请时间：${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}
    </p>
  `;

  return baseTemplate(content);
}

/**
 * 自动回复模板（发给用户）
 */
export function autoReplyTemplate(data: { name: string; type: "contact" | "job" }): string {
  const messageMap = {
    contact: {
      title: "感谢您的留言",
      body: `
        <p>亲爱的 ${escapeHtml(data.name)}，</p>
        <p>感谢您对 NIHPLOD 的关注！我们已收到您的留言。</p>
        <p>我们的团队会在 1-2 个工作日内与您联系，请留意您的邮箱和电话。</p>
        <p>如有紧急事项，欢迎直接致电我们。</p>
      `,
    },
    job: {
      title: "收到您的求职申请",
      body: `
        <p>亲爱的 ${escapeHtml(data.name)}，</p>
        <p>感谢您对 NIHPLOD 的关注并投递简历！</p>
        <p>我们已收到您的求职申请，HR 团队会认真审阅。如果您的条件符合岗位要求，我们将在 5 个工作日内与您联系。</p>
        <p>再次感谢您的申请，祝您一切顺利！</p>
      `,
    },
  };

  const { title, body } = messageMap[data.type];

  const content = `
    <h2 style="margin: 0 0 24px 0; font-size: 20px; font-weight: 500; color: ${BRAND_CHARCOAL};">
      ${title}
    </h2>
    <div style="font-size: 15px; line-height: 2; color: ${BRAND_CHARCOAL};">
      ${body}
    </div>
    <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid #eee;">
      <p style="margin: 0; font-size: 14px; color: #666;">
        此致<br>
        <span style="color: ${BRAND_GOLD};">NIHPLOD 团队</span>
      </p>
    </div>
  `;

  return baseTemplate(content);
}

/**
 * HTML 转义，防止 XSS
 */
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, (char) => map[char]);
}
