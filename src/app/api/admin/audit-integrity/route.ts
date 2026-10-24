/**
 * 审计完整性概览
 * GET /api/admin/audit-integrity
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { prisma } from "@/lib/prisma";
import { getArchiveConfig } from "@/lib/audit-archive";
import { apiConsole } from "@/lib/logger";

const NO_STORE_HEADERS = { "Cache-Control": "no-store, private" } as const;

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权" } },
        { status: 401 }
      );
    }
    if (!hasAdminPermission(admin, "audit:read")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "权限不足：审计查看" } },
        { status: 403 }
      );
    }
    const rateLimitResponse = await checkAdminRateLimit(request, "admin-read");
    if (rateLimitResponse) return rateLimitResponse;

    const [anchors, pending, latestAudit, latestSso] = await Promise.all([
      prisma.auditLogAnchor.findMany({
        where: { signatureVersion: 2 },
        orderBy: [{ day: "desc" }, { stream: "asc" }],
        take: 180,
      }),
      prisma.auditLog.count({ where: { outcome: "PENDING" } }),
      prisma.auditLogAnchor.findFirst({
        where: { stream: "audit", signatureVersion: 2 },
        orderBy: { day: "desc" },
        select: { day: true, count: true },
      }),
      prisma.auditLogAnchor.findFirst({
        where: { stream: "sso", signatureVersion: 2 },
        orderBy: { day: "desc" },
        select: { day: true, count: true },
      }),
    ]);

    return NextResponse.json(
      {
        success: true,
        data: {
          config: getArchiveConfig(),
          pendingCount: pending,
          latest: { audit: latestAudit, sso: latestSso },
          anchors: anchors.map((anchor) => ({
            ...anchor,
            createdAt: anchor.createdAt.toISOString(),
            archivedAt: anchor.archivedAt?.toISOString() ?? null,
            verifiedAt: anchor.verifiedAt?.toISOString() ?? null,
          })),
        },
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    apiConsole.error("[AuditIntegrity] GET 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "查询失败" } },
      { status: 500 }
    );
  }
}
