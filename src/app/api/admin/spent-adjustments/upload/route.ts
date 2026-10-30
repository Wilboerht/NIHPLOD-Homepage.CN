/**
 * 消费补录凭证上传 API（管理端·代客填写）
 * POST /api/admin/spent-adjustments/upload
 *
 * multipart/form-data：file（凭证图片）+ userId（目标用户）。
 * 凭证按目标用户前缀私有存储，提交申请时沿用现有归属校验。
 * 权限：spent:create（代客填写）。
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { validateCUID } from "@/lib/validation";
import { prisma } from "@/lib/prisma";
import { apiConsole } from "@/lib/logger";
import { uploadSpentProofFile, isSpentProofMultipartTooLarge } from "@/lib/spent-adjustment-files";
import { BODY_LIMITS } from "@/lib/body-limits";
import { isBodyTooLargeError, payloadTooLargeResponse, readFormDataBody } from "@/lib/request-body";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权" } },
        { status: 401 }
      );
    }

    if (!hasAdminPermission(admin, "spent:create")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "权限不足：消费补录代客填写" } },
        { status: 403 }
      );
    }

    if (!validateCSRFToken(request)) {
      return csrfForbiddenResponse();
    }

    const rateLimitResponse = await checkAdminRateLimit(request, "spent-adjust:upload", admin.id);
    if (rateLimitResponse) return rateLimitResponse;

    // 解析 multipart 前先按 Content-Length 粗筛，避免超大请求体完整缓冲进内存
    if (isSpentProofMultipartTooLarge(request.headers.get("content-length"))) {
      return NextResponse.json(
        { success: false, error: { code: "FILE_TOO_LARGE", message: "文件过大" } },
        { status: 413 }
      );
    }

    let formData: FormData;
    try {
      formData = await readFormDataBody(request, BODY_LIMITS.imageUpload);
    } catch (error) {
      if (isBodyTooLargeError(error)) return payloadTooLargeResponse(error.limit);
      return NextResponse.json(
        { success: false, error: { code: "INVALID_FORM", message: "请求格式错误" } },
        { status: 400 }
      );
    }

    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json(
        { success: false, error: { code: "NO_FILE", message: "请选择要上传的图片" } },
        { status: 400 }
      );
    }

    const userId = formData.get("userId");
    if (typeof userId !== "string" || !validateCUID(userId)) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_PARAMS", message: "请选择有效的用户" } },
        { status: 400 }
      );
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { status: true },
    });
    if (!targetUser) {
      return NextResponse.json(
        { success: false, error: { code: "USER_NOT_FOUND", message: "用户不存在" } },
        { status: 404 }
      );
    }
    if (targetUser.status !== "ACTIVE") {
      return NextResponse.json(
        {
          success: false,
          error: { code: "USER_INACTIVE", message: "该用户当前状态不可提交消费补录" },
        },
        { status: 409 }
      );
    }

    const result = await uploadSpentProofFile(file, userId);
    if (!result.ok) {
      return NextResponse.json(
        { success: false, error: { code: result.code, message: result.message } },
        { status: result.status }
      );
    }

    return NextResponse.json({
      success: true,
      data: { url: result.url, private: result.private },
    });
  } catch (error) {
    apiConsole.error("[AdminSpentAdjustment] 代客凭证上传失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "上传失败，请稍后重试" } },
      { status: 500 }
    );
  }
}
