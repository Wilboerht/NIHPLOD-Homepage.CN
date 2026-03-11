import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { sendContactNotification, sendAutoReply } from "@/lib/email";

// 表单验证 schema
const ContactFormSchema = z.object({
  name: z.string().min(2, "姓名至少2个字符").max(50, "姓名最多50个字符"),
  email: z.string().email("请输入有效的邮箱地址"),
  content: z.string().min(10, "留言内容至少10个字符").max(2000, "留言内容最多2000个字符"),
  // 蜜罐字段 - 如果有值说明是机器人
  website: z.string().optional(),
});

// POST /api/contact - 提交联系表单
// 强制动态渲染，禁止静态预渲染
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // 验证表单数据
    const result = ContactFormSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: "表单验证失败", details: result.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { name, email, content, website } = result.data;

    // 蜜罐检测 - 如果 website 字段有值，静默成功但不保存
    if (website) {
      // 假装成功，但实际不保存（防机器人）
      return NextResponse.json({ success: true, message: "留言已提交" });
    }

    // 保存留言到数据库
    await prisma.contactMessage.create({
      data: {
        name,
        email,
        content,
      },
    });
    console.log("✅ [Contact API] DB record created");

    // 发送邮件通知
    console.log("📧 [Contact API] Sending emails");
    try {
      // 1. 发送通知给管理员
      await sendContactNotification({
        name,
        email,
        content,
      });
      console.log("✅ [Contact API] Notification sent to admin");

      // 2. 发送自动回复给用户
      await sendAutoReply({
        to: email,
        name,
        type: "contact",
      });
      console.log("✅ [Contact API] Auto-reply sent to user");
    } catch (emailError) {
      console.error("❌ [Contact API] Email sending failed:", emailError);
      // 邮件发送失败不影响主流程，只记录日志
    }

    return NextResponse.json({ success: true, message: "感谢您的留言，我们会尽快回复！" });
  } catch (error) {
    console.error("Contact form error:", error);
    return NextResponse.json(
      { error: "提交失败，请稍后重试" },
      { status: 500 }
    );
  }
}
