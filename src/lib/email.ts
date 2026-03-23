/**
 * 邮件发送工具
 */
import nodemailer from "nodemailer";
import { emailConfig } from "./env";

// 创建邮件传输器
const transporter = nodemailer.createTransport({
  host: emailConfig.host,
  port: emailConfig.port,
  secure: emailConfig.port === 465, // 465 端口使用 SSL
  auth: {
    user: emailConfig.user,
    pass: emailConfig.password,
  },
});

// 邮件选项接口
export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  attachments?: Array<{
    filename: string;
    content?: string | Buffer;
    path?: string;
    contentType?: string;
  }>;
}

// 邮件发送结果接口
export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: Error;
}

/**
 * 发送邮件
 */
export async function sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
  try {
    const info = await transporter.sendMail({
      from: emailConfig.from,
      to: Array.isArray(options.to) ? options.to.join(", ") : options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
      replyTo: options.replyTo,
      attachments: options.attachments,
    });

    return {
      success: true,
      messageId: info.messageId,
    };
  } catch (error) {
    console.error("邮件发送失败:", error);
    return {
      success: false,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

/**
 * 发送联系表单通知邮件
 */
export async function sendContactNotification(data: {
  name: string;
  phone: string;
  content: string;
}): Promise<SendEmailResult> {
  const { contactNotificationTemplate } = await import("./email-templates");
  const html = contactNotificationTemplate(data);

  return sendEmail({
    to: emailConfig.notificationEmail || emailConfig.from,
    subject: `[NIHPLOD] 新留言 - ${data.name}`,
    html,
  });
}

/**
 * 发送招聘申请通知邮件
 */
export async function sendJobApplicationNotification(data: {
  name: string;
  phone: string;
  position: string;
  coverLetter?: string;
}): Promise<SendEmailResult> {
  const { jobApplicationTemplate } = await import("./email-templates");
  const html = jobApplicationTemplate(data);

  return sendEmail({
    to: emailConfig.notificationEmail || emailConfig.from,
    subject: `[NIHPLOD] 新求职申请 - ${data.position} - ${data.name}`,
    html,
  });
}

/**
 * 发送自动回复邮件给用户
 */
export async function sendAutoReply(data: {
  to: string;
  name: string;
  type: "contact" | "job";
}): Promise<SendEmailResult> {
  const { autoReplyTemplate } = await import("./email-templates");
  const html = autoReplyTemplate(data);

  const subjectMap = {
    contact: "感谢您的留言 - NIHPLOD",
    job: "收到您的求职申请 - NIHPLOD",
  };

  return sendEmail({
    to: data.to,
    subject: subjectMap[data.type],
    html,
  });
}

/**
 * 验证邮件配置是否有效
 */
export async function verifyEmailConfig(): Promise<boolean> {
  try {
    await transporter.verify();
    console.log("邮件服务配置验证成功");
    return true;
  } catch (error) {
    console.error("邮件服务配置验证失败:", error);
    return false;
  }
}
