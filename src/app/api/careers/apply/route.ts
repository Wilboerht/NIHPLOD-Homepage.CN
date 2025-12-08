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
  try {
    const formData = await request.formData();

    // 获取表单字段
    const jobId = formData.get("jobId") as string;
    const jobTitle = formData.get("jobTitle") as string;
    const name = formData.get("name") as string;
    const phone = formData.get("phone") as string;
    const email = formData.get("email") as string;
    const resumeFile = formData.get("resume") as File | null;

    // 验证表单数据
    const result = ApplyFormSchema.safeParse({
      jobId,
      jobTitle,
      name,
      phone,
      email,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: "表单验证失败", details: result.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    // 验证简历文件
    if (!resumeFile) {
      return NextResponse.json(
        { error: "请上传简历文件" },
        { status: 400 }
      );
    }

    // 检查文件类型
    if (!ALLOWED_TYPES.includes(resumeFile.type)) {
      return NextResponse.json(
        { error: "仅支持 PDF、DOC、DOCX 格式的简历" },
        { status: 400 }
      );
    }

    // 检查文件大小
    if (resumeFile.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "简历文件大小不能超过 10MB" },
        { status: 400 }
      );
    }

    // 验证职位是否存在且处于招聘状态
    const job = await prisma.job.findFirst({
      where: {
        id: jobId,
        published: true,
      },
    });

    if (!job) {
      return NextResponse.json(
        { error: "该职位不存在或已关闭招聘" },
        { status: 400 }
      );
    }

    // 创建上传目录
    const uploadDir = path.join(process.cwd(), "public", "uploads", "resumes");
    await mkdir(uploadDir, { recursive: true });

    // 生成唯一文件名
    const timestamp = Date.now();
    const ext = path.extname(resumeFile.name);
    const safeJobTitle = jobTitle.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, "_");
    const safeName = name.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, "_");
    const fileName = `【应聘】${safeJobTitle}_${safeName}_${timestamp}${ext}`;
    const filePath = path.join(uploadDir, fileName);

    // 保存文件
    const buffer = Buffer.from(await resumeFile.arrayBuffer());
    await writeFile(filePath, buffer);

    // 保存申请记录到数据库
    await prisma.jobApplication.create({
      data: {
        jobId,
        name,
        phone,
        email,
        resumePath: `/uploads/resumes/${fileName}`,
      },
    });

    return NextResponse.json({
      success: true,
      message: "简历投递成功！我们会尽快与您联系。",
    });
  } catch (error) {
    console.error("简历投递失败:", error);
    return NextResponse.json(
      { error: "投递失败，请稍后重试" },
      { status: 500 }
    );
  }
}

