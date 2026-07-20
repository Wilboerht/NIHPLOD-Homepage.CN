import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { uploadFile } from "@/lib/upload";
import { sendWecomNotification, formatJobApplicationToWecom } from "@/lib/wecom";
import { rateLimit, getClientIP } from "@/lib/ratelimit";
import { fileTypeFromBuffer } from "file-type";
import { apiConsole } from "@/lib/logger";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";

// 表单验证 schema
const ApplyFormSchema = z.object({
  jobId: z.string().min(1, "职位ID不能为空"),
  jobTitle: z.string().min(1, "职位名称不能为空"),
  name: z.string().min(2, "姓名至少2个字符").max(50, "姓名最多50个字符"),
  phone: z.string().regex(/^1[3-9]\d{9}$/, "请输入有效的手机号"),
});

// 最大文件大小 10MB
const MAX_FILE_SIZE = 10 * 1024 * 1024;

// POST /api/careers/apply - 提交简历申请
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
    if (process.env.NODE_ENV === "development") console.log("🚀 [Apply API] Received request");
    const formData = await request.formData();
    if (process.env.NODE_ENV === "development") console.log("📄 [Apply API] FormData parsed");

    // 获取表单字段
    const jobId = formData.get("jobId") as string;
    const jobTitle = formData.get("jobTitle") as string;
    const name = formData.get("name") as string;
    const phone = formData.get("phone") as string;
    const resumeFile = formData.get("resume") as File | null;

    if (process.env.NODE_ENV === "development")
      console.log(
        `📝 [Apply API] Fields: JobId=${jobId}, Name=${name}, File=${resumeFile?.name}, Size=${resumeFile?.size}, Type=${resumeFile?.type}`
      );

    // 验证表单数据
    const result = ApplyFormSchema.safeParse({
      jobId,
      jobTitle,
      name,
      phone,
    });

    if (!result.success) {
      if (process.env.NODE_ENV === "development")
        console.log("❌ [Apply API] Validation failed", result.error.flatten().fieldErrors);
      return NextResponse.json(
        { error: "表单验证失败", details: result.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    // 验证简历文件
    if (!resumeFile) {
      if (process.env.NODE_ENV === "development") console.log("❌ [Apply API] No resume file");
      return NextResponse.json({ error: "请上传简历文件" }, { status: 400 });
    }

    // 读取文件内容用于真实类型检测
    const fileBuffer = Buffer.from(await resumeFile.arrayBuffer());

    // Magic bytes 校验真实文件类型（防止 MIME 伪造）
    const fileTypeResult = await fileTypeFromBuffer(fileBuffer);
    if (!fileTypeResult || fileTypeResult.mime !== "application/pdf") {
      if (process.env.NODE_ENV === "development")
        console.log("❌ [Apply API] Invalid file type (magic bytes):", fileTypeResult?.mime);
      return NextResponse.json({ error: "仅支持 PDF 格式的简历" }, { status: 400 });
    }

    // 检查文件大小
    if (resumeFile.size > MAX_FILE_SIZE) {
      if (process.env.NODE_ENV === "development")
        console.log("❌ [Apply API] File too large:", resumeFile.size);
      return NextResponse.json({ error: "简历文件大小不能超过 10MB" }, { status: 400 });
    }

    // 验证职位是否存在且处于招聘状态
    if (process.env.NODE_ENV === "development")
      console.log("🔍 [Apply API] Looking up job:", jobId);
    const job = await prisma.job.findFirst({
      where: {
        id: jobId,
        published: true,
      },
    });

    if (!job) {
      if (process.env.NODE_ENV === "development")
        console.log("❌ [Apply API] Job not found or not published");
      return NextResponse.json({ error: "该职位不存在或已关闭招聘" }, { status: 400 });
    }
    if (process.env.NODE_ENV === "development") console.log("✅ [Apply API] Job found:", job.title);

    // 上传文件到存储 (自动处理 Local/Supabase)，限制为 PDF
    const uploadResult = await uploadFile(fileBuffer, resumeFile.name, resumeFile.type, "resumes", [
      "application/pdf",
    ]);

    // 验证最终扩展名为 pdf
    if (!uploadResult.filename.toLowerCase().endsWith(".pdf")) {
      if (process.env.NODE_ENV === "development")
        console.log("❌ [Apply API] Uploaded file extension is not pdf");
      return NextResponse.json({ error: "简历文件格式异常" }, { status: 400 });
    }

    if (process.env.NODE_ENV === "development")
      console.log("✅ [Apply API] File uploaded:", uploadResult.url);

    // 保存申请记录到数据库
    if (process.env.NODE_ENV === "development") console.log("💾 [Apply API] Creating DB record");
    await prisma.jobApplication.create({
      data: {
        jobId,
        name,
        phone,
        resumePath: uploadResult.url,
      },
    });
    if (process.env.NODE_ENV === "development") console.log("✅ [Apply API] DB record created");

    // 发送通知
    if (process.env.NODE_ENV === "development") console.log("📢 [Apply API] Sending notifications");
    try {
      // 发送企业微信群机器人通知 (强制路由至招聘群)
      const wecomMsg = formatJobApplicationToWecom({
        name,
        phone,
        position: jobTitle,
        resumeUrl: uploadResult.url,
      });
      const result = await sendWecomNotification(wecomMsg, "job");
      if (result.success) {
        if (process.env.NODE_ENV === "development")
          console.log("✅ [Apply API] WeCom bot notification sent to recruitment group");
      } else {
        apiConsole.error("❌ [Apply API] WeCom notification failed:", result.error);
      }
    } catch (notifError) {
      apiConsole.error("❌ [Apply API] Notification system error:", notifError);
    }

    return NextResponse.json({
      success: true,
      message: "简历投递成功！我们会尽快与您联系。",
    });
  } catch (error) {
    apiConsole.error("💥 [Apply API] Error:", error);
    // @ts-expect-error - error is unknown type
    if (error.code) apiConsole.error("Error Code:", error.code);
    // @ts-expect-error - error is unknown type
    if (error.message) apiConsole.error("Error Message:", error.message);

    return NextResponse.json(
      {
        error: "投递失败，请稍后重试",
      },
      { status: 500 }
    );
  }
}
