import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

// 表单验证 schema
const ApplyFormSchema = z.object({
  jobId: z.string().min(1, "职位ID不能为空"),
  jobTitle: z.string().min(1, "职位名称不能为空"),
  name: z.string().min(2, "姓名至少2个字符").max(50, "姓名最多50个字符"),
  phone: z.string().regex(/^1[3-9]\d{9}$/, "请输入有效的手机号"),
  email: z.string().email("请输入有效的邮箱地址"),
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
    const email = formData.get("email") as string;
    const resumeFile = formData.get("resume") as File | null;

    console.log(`📝 [Apply API] Fields: JobId=${jobId}, Name=${name}, File=${resumeFile?.name}, Size=${resumeFile?.size}, Type=${resumeFile?.type}`);

    // 验证表单数据
    const result = ApplyFormSchema.safeParse({
      jobId,
      jobTitle,
      name,
      phone,
      email,
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

    // 创建上传目录
    const uploadDir = path.join(process.cwd(), "public", "uploads", "resumes");
    console.log("📂 [Apply API] Creating directory:", uploadDir);
    await mkdir(uploadDir, { recursive: true });

    // 生成唯一文件名
    const timestamp = Date.now();
    const ext = path.extname(resumeFile.name);
    const safeJobTitle = jobTitle.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, "_");
    const safeName = name.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, "_");
    const fileName = `【应聘】${safeJobTitle}_${safeName}_${timestamp}${ext}`;
    const filePath = path.join(uploadDir, fileName);

    console.log("💾 [Apply API] Saving file to:", filePath);
    // 保存文件
    const buffer = Buffer.from(await resumeFile.arrayBuffer());
    await writeFile(filePath, buffer);
    console.log("✅ [Apply API] File saved");

    // 保存申请记录到数据库
    console.log("💾 [Apply API] Creating DB record");
    await prisma.jobApplication.create({
      data: {
        jobId,
        name,
        phone,
        email,
        resumePath: `/uploads/resumes/${fileName}`,
      },
    });
    console.log("✅ [Apply API] DB record created");

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

    return NextResponse.json(
      { error: "投递失败，请稍后重试" },
      { status: 500 }
    );
  }
}

