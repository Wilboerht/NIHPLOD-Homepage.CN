import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { prisma } from "@/lib/prisma";

const NO_STORE_HEADERS = { "Cache-Control": "no-store, private" } as const;

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const admin = await verifyAuth(request);
  if (!admin) {
    return NextResponse.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "未授权" } },
      { status: 401 }
    );
  }
  if (!hasAdminPermission(admin, "audit:retention:read")) {
    return NextResponse.json(
      { success: false, error: { code: "FORBIDDEN", message: "权限不足：审计保留查看" } },
      { status: 403 }
    );
  }
  const rateLimitResponse = await checkAdminRateLimit(request, "admin-read");
  if (rateLimitResponse) return rateLimitResponse;

  const jobs = await prisma.auditRetentionJob.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return NextResponse.json(
    {
      success: true,
      data: {
        items: jobs.map((job) => ({
          ...job,
          createdAt: job.createdAt.toISOString(),
          startedAt: job.startedAt?.toISOString() ?? null,
          finishedAt: job.finishedAt?.toISOString() ?? null,
          expiresAt: job.expiresAt.toISOString(),
          totpVerifiedAt: job.totpVerifiedAt.toISOString(),
          cutoff: job.cutoff.toISOString(),
          approvalSignature: undefined,
        })),
      },
    },
    { headers: NO_STORE_HEADERS }
  );
}
