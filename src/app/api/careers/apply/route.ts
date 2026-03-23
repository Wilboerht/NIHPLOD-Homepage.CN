import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { uploadFile } from "@/lib/upload";
import { sendJobApplicationNotification } from "@/lib/email";
import { sendWecomNotification, formatJobApplicationToWecom } from "@/lib/wecom";

// 表单验证 schema
const ApplyFormSchema = z.object({
  jobId: z.string().min(1, "职位ID不能为空"),
  jobTitle: z.string().min(1, "职位名称不能为空"),
  name: z.string().min(2, "姓名至少2个字符").max(50, "姓名最多50个字符"),
  phone: z.string().regex(/^1[3-9]\d{9}$/, "请输入有效的手机号"),
});

// 允许的文件类型
const ALLOWED_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

// 最大文件大小 10MB
const MAX_FILE_SIZE = 10 * 1024 * 1024;

// POST /api/careers/apply - 提交简历申请
// 强制动态渲染，禁止静态预渲染
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  console.log("🚀 [Apply API] Received request");
  try {
    const formData = await request.formData();
    console.log("📄 [Apply API] FormData parsed");

    // 获取表单字段
    const jobId = formData.get("jobId") as string;
    const jobTitle = formData.get("jobTitle") as string;
    const name = formData.get("name") as string;
    const phone = formData.get("phone") as string;
    const resumeFile = formData.get("resume") as File | null;

    console.log(`📝 [Apply API] Fields: JobId=${jobId}, Name=${name}, File=${resumeFile?.name}, Size=${resumeFile?.size}, Type=${resumeFile?.type}`);

    // 验证表单数据
    const result = ApplyFormSchema.safeParse({
      jobId,
      jobTitle,
      name,
      phone,
    });

    if (!result.success) {
      console.log("❌ [Apply API] Validation failed", result.error.flatten().fieldErrors);
      return NextResponse.json(
        { error: "表单验证失败", details: result.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    // 验证简历文件
    if (!resumeFile) {
      console.log("❌ [Apply API] No resume file");
      return NextResponse.json(
        { error: "请上传简历文件" },
        { status: 400 }
      );
    }

    // 检查文件类型
    if (!ALLOWED_TYPES.includes(resumeFile.type)) {
      console.log("❌ [Apply API] Invalid file type:", resumeFile.type);
      return NextResponse.json(
        { error: "仅支持 PDF、DOC、DOCX 格式的简历" },
        { status: 400 }
      );
    }

    // 检查文件大小
    if (resumeFile.size > MAX_FILE_SIZE) {
      console.log("❌ [Apply API] File too large:", resumeFile.size);
      return NextResponse.json(
        { error: "简历文件大小不能超过 10MB" },
        { status: 400 }
      );
    }

    // 验证职位是否存在且处于招聘状态
    console.log("🔍 [Apply API] Looking up job:", jobId);
    const job = await prisma.job.findFirst({
      where: {
        id: jobId,
        published: true,
      },
    });

    if (!job) {
      console.log("❌ [Apply API] Job not found or not published");
      return NextResponse.json(
        { error: "该职位不存在或已关闭招聘" },
        { status: 400 }
      );
    }
    console.log("✅ [Apply API] Job found:", job.title);

    // 上传文件到存储 (自动处理 Local/Supabase)
    const fileBuffer = Buffer.from(await resumeFile.arrayBuffer());
    const uploadResult = await uploadFile(
      fileBuffer,
      resumeFile.name,
      resumeFile.type,
      "resumes"
    );

    console.log("✅ [Apply API] File uploaded:", uploadResult.url);

    // 保存申请记录到数据库
    console.log("💾 [Apply API] Creating DB record");
    await prisma.jobApplication.create({
      data: {
        jobId,
        name,
        phone,
        resumePath: uploadResult.url,
      },
    });
    console.log("✅ [Apply API] DB record created");

    // 发送邮件通知
    console.log("📧 [Apply API] Sending emails");
    try {
      // 1. 发送通知给管理员
      await sendJobApplicationNotification({
        name,
        phone,
        position: jobTitle,
      });
      console.log("✅ [Apply API] Notification sent to admin");

      // 2. 发送企业微信群机器人通知
      const wecomMsg = formatJobApplicationToWecom({
        name,
        phone,
        position: jobTitle,
        resumeUrl: uploadResult.url,
      });
      await sendWecomNotification(wecomMsg, "job");
      console.log("✅ [Apply API] WeCom bot notification sent to recruitment group");
    } catch (emailError) {
      console.error("❌ [Apply API] Email sending failed:", emailError);
      // 邮件发送失败不影响主流程，只记录日志
    }

    return NextResponse.json({
      success: true,
      message: "简历投递成功！我们会尽快与您联系。",
    });
  } catch (error) {
    console.error("💥 [Apply API] Error:", error);
    // @ts-expect-error - error is unknown type
    if (error.code) console.error("Error Code:", error.code);
    // @ts-expect-error - error is unknown type
    if (error.message) console.error("Error Message:", error.message);

    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const errorStack = error instanceof Error ? error.stack : undefined;

    return NextResponse.json(
      {
        error: `投递失败: ${errorMessage}`,
        details: errorStack
      },
      { status: 500 }
    );
  }
}

