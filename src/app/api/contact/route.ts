import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { sendWecomNotification, formatContactToWecom } from "@/lib/wecom";
import { rateLimit, getClientIP } from "@/lib/ratelimit";
import { apiConsole } from "@/lib/logger";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";

// 表单验证 schema
const ContactFormSchema = z.object({
  name: z.string().min(2, "姓名至少2个字符").max(50, "姓名最多50个字符"),
  phone: z.string().regex(/^1[3456789]\d{9}$/, "请输入有效的手机号"),
  content: z.string().min(10, "留言内容至少10个字符").max(2000, "留言内容最多2000个字符"),
  // 可选的其他字段
  type: z.string().optional(),
  location: z.string().max(100, "所在地最多100个字符").optional(),
  // 蜜罐字段 - 如果有值说明是机器人
  website: z.string().optional(),
});

// POST /api/contact - 提交联系表单
// 强制动态渲染，禁止静态预渲染
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!validateCSRFToken(request)) {
    return csrfForbiddenResponse();
  }

  try {
    // 速率限制检查
    const ip = getClientIP(request);
    const limitResult = await rateLimit(ip, "form");
    if (!limitResult.success) {
      return NextResponse.json({ error: "请求过于频繁，请稍后再试" }, { status: 429 });
    }
    const body = await request.json();

    // 验证表单数据
    const result = ContactFormSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: "表单验证失败", details: result.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { name, phone, content, website, type: _type, location } = result.data;

    // 蜜罐检测
    if (website) {
      return NextResponse.json({ success: true, message: "留言已提交" });
    }

    // 映射咨询类型为中文
    const typeMap: Record<string, string> = {
      consultation: "产品咨询",
      cooperation: "商务合作",
      feedback: "使用反馈",
      complaint: "投诉建议",
      application: "入驻申请",
      other: "其他问题",
    };
    const readableType = typeMap[_type || ""] || _type || "其他";

    // 保存留言到数据库
    await prisma.contactMessage.create({
      data: {
        name,
        phone,
        type: _type, // 保存原始英文枚举值到 DB
        content,
      },
    });
    if (process.env.NODE_ENV === "development") apiConsole.debug("✅ [Contact API] DB record created");

    // 发送通知
    if (process.env.NODE_ENV === "development")
      apiConsole.debug("📧 [Contact API] Sending notifications");
    try {
      // 1. 发送企业微信机器人通知
      const wecomContent = formatContactToWecom({
        name,
        phone,
        content,
        type: readableType,
        location,
      });
      await sendWecomNotification(wecomContent);
      if (process.env.NODE_ENV === "development")
        apiConsole.debug("✅ [Contact API] WeCom bot notification sent");

      // 暂不支持向手机发送短信自动回复
    } catch (notifError) {
      // 通知类错误不影响主流程，仅记录
      apiConsole.error("❌ [Contact API] Notification failed:", notifError);
    }

    return NextResponse.json({ success: true, message: "感谢您的留言，我们会尽快回复！" });
  } catch (error) {
    apiConsole.error("Contact form error:", error);
    return NextResponse.json({ error: "提交失败，请稍后重试" }, { status: 500 });
  }
}
