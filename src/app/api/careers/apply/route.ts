import { NextRequest, NextResponse, after } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  deleteResumeFile,
  sanitizeResumeFileName,
  uploadResumeFile,
} from "@/lib/resume-files";
import { sendWecomNotification, formatJobApplicationToWecom } from "@/lib/wecom";
import { rateLimit, getClientIP } from "@/lib/ratelimit";
import {
  isBodyTooLargeError,
  payloadTooLargeResponse,
  readFormDataBody,
} from "@/lib/request-body";
import { fileTypeFromBuffer } from "file-type";
import { apiConsole } from "@/lib/logger";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";

// 表单验证 schema
const ApplyFormSchema = z.object({
  jobId: z.string().min(1, "职位ID不能为空"),
  name: z.string().trim().min(2, "姓名至少2个字符").max(50, "姓名最多50个字符"),
  phone: z.string().trim().regex(/^1[3-9]\d{9}$/, "请输入有效的手机号"),
  // 蜜罐字段 - 有值说明是机器人
  website: z.string().max(200).optional(),
  // 隐私政策同意（FormData 中是字符串）
  consent: z.string().refine((value) => value === "true", "请阅读并同意隐私政策"),
});

// 最大文件大小 10MB；multipart 请求体再预留 2MB 给表单字段
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_RESUME_MULTIPART_BYTES = MAX_FILE_SIZE + 2 * 1024 * 1024;

function isUploadedFile(value: FormDataEntryValue | null): value is File {
  return (
    typeof value === "object" &&
    value !== null &&
    "arrayBuffer" in value &&
    "size" in value &&
    "name" in value
  );
}

// POST /api/careers/apply - 提交简历申请
// 强制动态渲染，禁止静态预渲染
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// 10MB 上传 + 存储/DB 处理需要比默认更长的执行窗口（Vercel 等平台生效）
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  if (!validateCSRFToken(request)) {
    return csrfForbiddenResponse();
  }

  try {
    // 速率限制检查
    const ip = getClientIP(request);
    const limitResult = await rateLimit(ip, "form");
    if (!limitResult.success) {
      return NextResponse.json(
        { success: false, error: { code: "RATE_LIMITED", message: "请求过于频繁，请稍后再试" } },
        { status: 429 }
      );
    }

    // 解析前先按 Content-Length 粗筛，避免超大请求体完整缓冲进内存
    const contentLengthHeader = request.headers.get("content-length");
    if (contentLengthHeader) {
      const contentLength = Number(contentLengthHeader);
      if (Number.isFinite(contentLength) && contentLength > MAX_RESUME_MULTIPART_BYTES) {
        return NextResponse.json(
          { success: false, error: { code: "FILE_TOO_LARGE", message: "简历文件大小不能超过 10MB" } },
          { status: 413 }
        );
      }
    }

    if (process.env.NODE_ENV === "development") apiConsole.debug("🚀 [Apply API] Received request");
    const formData = await readFormDataBody(request, MAX_RESUME_MULTIPART_BYTES);
    if (process.env.NODE_ENV === "development") apiConsole.debug("📄 [Apply API] FormData parsed");

    // 获取表单字段
    const jobId = formData.get("jobId");
    const name = formData.get("name");
    const phone = formData.get("phone");
    const website = formData.get("website");
    const consent = formData.get("consent");
    const resumeField = formData.get("resume");

    // 验证表单数据
    const result = ApplyFormSchema.safeParse({
      jobId,
      name,
      phone,
      website,
      consent,
    });

    if (!result.success) {
      if (process.env.NODE_ENV === "development")
        apiConsole.debug("❌ [Apply API] Validation failed", result.error.flatten().fieldErrors);
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_PARAMS",
            message: "表单验证失败",
            details: result.error.flatten().fieldErrors,
          },
        },
        { status: 400 }
      );
    }

    const { jobId: validatedJobId, name: validatedName, phone: validatedPhone, website: honeypot } =
      result.data;

    // 蜜罐命中：不写库、不发通知，直接返回成功，避免机器人探测
    if (honeypot) {
      return NextResponse.json({
        success: true,
        message: "简历投递成功！我们会尽快与您联系。",
      });
    }

    // 验证简历文件（必须是真的 File/Blob，普通字符串字段直接拒绝）
    if (!isUploadedFile(resumeField)) {
      if (process.env.NODE_ENV === "development") apiConsole.debug("❌ [Apply API] No resume file");
      return NextResponse.json(
        { success: false, error: { code: "MISSING_RESUME", message: "请上传简历文件" } },
        { status: 400 }
      );
    }

    if (resumeField.size === 0) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_FILE_TYPE", message: "简历文件不能为空" } },
        { status: 400 }
      );
    }

    // 先检查 size，再读入内存：避免超大文件占用内存
    if (resumeField.size > MAX_FILE_SIZE) {
      if (process.env.NODE_ENV === "development")
        apiConsole.debug("❌ [Apply API] File too large:", resumeField.size);
      return NextResponse.json(
        { success: false, error: { code: "FILE_TOO_LARGE", message: "简历文件大小不能超过 10MB" } },
        { status: 413 }
      );
    }

    const fileBuffer = Buffer.from(await resumeField.arrayBuffer());

    // Magic bytes 校验真实文件类型（防止 MIME 伪造）
    const fileTypeResult = await fileTypeFromBuffer(fileBuffer);
    if (!fileTypeResult || fileTypeResult.mime !== "application/pdf") {
      if (process.env.NODE_ENV === "development")
        apiConsole.debug("❌ [Apply API] Invalid file type (magic bytes):", fileTypeResult?.mime);
      return NextResponse.json(
        { success: false, error: { code: "INVALID_FILE_TYPE", message: "仅支持 PDF 格式的简历" } },
        { status: 400 }
      );
    }

    // 验证职位是否存在且处于招聘状态
    if (process.env.NODE_ENV === "development")
      apiConsole.debug("🔍 [Apply API] Looking up job:", validatedJobId);
    const job = await prisma.job.findFirst({
      where: {
        id: validatedJobId,
        published: true,
      },
    });

    if (!job) {
      if (process.env.NODE_ENV === "development")
        apiConsole.debug("❌ [Apply API] Job not found or not published");
      return NextResponse.json(
        { success: false, error: { code: "JOB_NOT_FOUND", message: "该职位不存在或已关闭招聘" } },
        { status: 400 }
      );
    }
    if (process.env.NODE_ENV === "development")
      apiConsole.debug("✅ [Apply API] Job found:", job.title);

    // 简历含 PII：只允许私有存储（OSS 私有 bucket 或服务器 private 目录）
    let resumeKey: string;
    try {
      const uploadResult = await uploadResumeFile(fileBuffer);
      resumeKey = uploadResult.key;
    } catch (uploadError) {
      if (process.env.NODE_ENV === "development")
        apiConsole.debug("❌ [Apply API] Private resume upload failed:", uploadError);
      const storageNotConfigured =
        uploadError instanceof Error && uploadError.message === "RESUME_STORAGE_NOT_CONFIGURED";
      const unsafePdf =
        uploadError instanceof Error && uploadError.message.startsWith("UNSAFE_RESUME_PDF");
      if (unsafePdf) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "UNSAFE_FILE",
              message: uploadError.message.replace("UNSAFE_RESUME_PDF: ", ""),
            },
          },
          { status: 400 }
        );
      }
      return NextResponse.json(
        {
          success: false,
          error: {
            code: storageNotConfigured ? "STORAGE_NOT_CONFIGURED" : "STORAGE_UNAVAILABLE",
            message: storageNotConfigured
              ? "简历存储未配置，请联系管理员（需配置 ALI_OSS_PRIVATE_BUCKET）"
              : "简历存储暂不可用，请稍后重试",
          },
        },
        { status: 503 }
      );
    }

    if (process.env.NODE_ENV === "development")
      apiConsole.debug("✅ [Apply API] Resume stored privately:", resumeKey);

    // 保存申请记录到数据库
    if (process.env.NODE_ENV === "development")
      apiConsole.debug("💾 [Apply API] Creating DB record");
    try {
      await prisma.jobApplication.create({
        data: {
          jobId: validatedJobId,
          name: validatedName,
          phone: validatedPhone,
          resumePath: resumeKey,
          resumeFileName: sanitizeResumeFileName(resumeField.name),
          resumeSize: resumeField.size,
          jobTitleSnapshot: job.title,
          consentAt: new Date(),
        },
      });
      if (process.env.NODE_ENV === "development")
        apiConsole.debug("✅ [Apply API] DB record created");
    } catch (dbError) {
      // 数据库写入失败，清理已上传的私有文件（等待完成，避免 serverless 提前回收）
      try {
        await deleteResumeFile(resumeKey);
      } catch (cleanupError) {
        apiConsole.error("❌ [Apply API] Failed to clean up orphan resume:", cleanupError);
      }
      throw dbError;
    }

    // 通知不阻塞候选人响应：响应发出后由 after 执行。
    const adminBaseUrl = (
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.NEXT_PUBLIC_BASE_URL ||
      "https://nihplod.cn"
    ).replace(/\/$/, "");
    const wecomMsg = formatJobApplicationToWecom({
      name: validatedName,
      phone: validatedPhone,
      // 使用数据库中的职位标题，而非用户提交的标题（防篡改）
      position: job.title,
      // 通知只给后台入口，不把私有简历 URL 外发给群机器人
      resumeUrl: `${adminBaseUrl}/admin/applications`,
    });
    after(async () => {
      try {
        const result = await sendWecomNotification(wecomMsg, "job");
        if (!result.success) {
          apiConsole.error("❌ [Apply API] WeCom notification failed:", result.error);
        }
      } catch (notifError) {
        apiConsole.error("❌ [Apply API] Notification system error:", notifError);
      }
    });

    return NextResponse.json({
      success: true,
      message: "简历投递成功！我们会尽快与您联系。",
    });
  } catch (error) {
    if (isBodyTooLargeError(error)) return payloadTooLargeResponse(error.limit);
    apiConsole.error("💥 [Apply API] Error:", error);

    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "投递失败，请稍后重试" } },
      { status: 500 }
    );
  }
}
