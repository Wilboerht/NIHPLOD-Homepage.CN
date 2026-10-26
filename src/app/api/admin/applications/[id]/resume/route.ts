import { NextRequest, NextResponse } from "next/server";
import { createReadStream } from "fs";
import { stat } from "fs/promises";
import { Readable } from "stream";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { prisma } from "@/lib/prisma";
import { createAuditLogStrict } from "@/lib/audit";
import { contentDispositionAttachment, resolveResumeDownload } from "@/lib/resume-files";
import { validateCUID, invalidIdResponse } from "@/lib/validation";
import { apiConsole } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, private",
  Pragma: "no-cache",
  "X-Content-Type-Options": "nosniff",
} as const;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权访问" } },
        { status: 401 }
      );
    }
    if (!hasAdminPermission(admin, "applications:read")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "权限不足：简历查看" } },
        { status: 403 }
      );
    }

    const rateLimitResponse = await checkAdminRateLimit(request, "admin-read", admin.id);
    if (rateLimitResponse) return rateLimitResponse;

    const { id } = await params;
    if (!validateCUID(id)) return invalidIdResponse();

    const application = await prisma.jobApplication.findUnique({
      where: { id },
      select: { resumePath: true, resumeFileName: true },
    });
    if (!application?.resumePath) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "简历不存在" } },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    const download = await resolveResumeDownload(
      application.resumePath,
      application.resumeFileName ?? "resume.pdf"
    );
    if (!download) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "RESUME_MIGRATION_REQUIRED", message: "简历尚未迁移到私有存储" },
        },
        { status: 409, headers: NO_STORE_HEADERS }
      );
    }

    await createAuditLogStrict({
      action: "resume_download",
      targetType: "application",
      targetId: id,
      actorType: "ADMIN",
      actorEmail: admin.email,
      actorName: admin.name,
      actorRole: admin.role,
      authMethod: "session",
      adminId: admin.id,
      request,
    });

    if (download.kind === "redirect") {
      return NextResponse.redirect(download.url, {
        status: 302,
        headers: NO_STORE_HEADERS,
      });
    }

    const fileStat = await stat(download.path);
    const stream = Readable.toWeb(createReadStream(download.path)) as unknown as ReadableStream;

    return new NextResponse(stream, {
      headers: {
        ...NO_STORE_HEADERS,
        "Content-Type": "application/pdf",
        "Content-Length": String(fileStat.size),
        "Content-Disposition": contentDispositionAttachment(download.filename),
      },
    });
  } catch (error) {
    apiConsole.error("[AdminApplicationResume] 下载失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "下载失败" } },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
