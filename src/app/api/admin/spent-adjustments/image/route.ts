/**
 * 私有凭证图片访问端点（管理端）
 * GET /api/admin/spent-adjustments/image?key=<key>
 *
 * 管理员审核时查看凭证：验证管理员登录态 + spent:read 权限 + 申请存在后：
 * - 本地私有对象：流式返回文件；
 * - 历史私有 OSS 对象：302 到短时效签名 URL。
 * 查看动作写严格审计。
 */
import { NextRequest, NextResponse } from "next/server";
import { createReadStream } from "fs";
import { stat } from "fs/promises";
import { Readable } from "stream";
import { prisma } from "@/lib/prisma";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { apiConsole } from "@/lib/logger";
import { createAuditLogStrict } from "@/lib/audit";
import { resolveSpentProofImage } from "@/lib/spent-adjustment-files";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, private",
  Pragma: "no-cache",
  "X-Content-Type-Options": "nosniff",
} as const;

export async function GET(request: NextRequest) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权" } },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    if (!hasAdminPermission(admin, "spent:read")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "权限不足：消费凭证查看" } },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }

    const rateLimitResponse = await checkAdminRateLimit(request, "admin-read", admin.id);
    if (rateLimitResponse) return rateLimitResponse;

    const key = request.nextUrl.searchParams.get("key");
    if (!key || key.length > 200 || key.includes("..") || key.includes("\\")) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_PARAMS", message: "参数错误" } },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    // 对象必须存在于某条申请记录中，防止对任意私有对象签名/读取
    const application = await prisma.spentAdjustmentApplication.findFirst({
      where: { images: { has: key } },
      select: { id: true, userId: true },
    });

    if (!application) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "图片不存在" } },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    await createAuditLogStrict({
      action: "spent_receipt_view",
      targetType: "spent_adjustment",
      targetId: application.id,
      actorType: "ADMIN",
      actorEmail: admin.email,
      actorName: admin.name,
      actorRole: admin.role,
      authMethod: "session",
      adminId: admin.id,
      request,
    });

    const result = await resolveSpentProofImage(application.userId, key);
    if (!result.ok) {
      return NextResponse.json(
        { success: false, error: { code: result.code, message: result.message } },
        { status: result.status, headers: NO_STORE_HEADERS }
      );
    }

    if (result.kind === "redirect") {
      return NextResponse.redirect(result.signedUrl, {
        status: 302,
        headers: NO_STORE_HEADERS,
      });
    }

    const fileStat = await stat(result.path);
    const stream = Readable.toWeb(createReadStream(result.path)) as unknown as ReadableStream;

    return new NextResponse(stream, {
      headers: {
        ...NO_STORE_HEADERS,
        "Content-Type": result.contentType,
        "Content-Length": String(fileStat.size),
        "Content-Disposition": 'inline; filename="receipt.webp"',
      },
    });
  } catch (error) {
    apiConsole.error("[AdminSpentAdjustment] 凭证图片访问失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
