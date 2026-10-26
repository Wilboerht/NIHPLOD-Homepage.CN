import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

/**
 * 健康检查 API
 * GET /api/health - 检查服务和关键依赖状态
 */
export const dynamic = "force-dynamic";

async function checkHttp(url: string, timeoutMs = 3000): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    return res.ok ? "ok" : `http_${res.status}`;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return msg.includes("abort") ? "timeout" : "unreachable";
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET() {
  const checks: Record<
    string,
    { status: string; latency?: number; error?: string; detail?: Record<string, unknown> }
  > = {
    server: { status: "ok" },
  };

  // 数据库连接
  const dbStart = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = {
      status: "ok",
      latency: Date.now() - dbStart,
    };
  } catch {
    // 不暴露原始 DB 错误信息（可能含连接字符串片段），仅返回通用状态
    checks.database = {
      status: "error",
      latency: Date.now() - dbStart,
    };
  }

  // OSS 连通性（仅已配置时检查）
  if (process.env.ALI_OSS_REGION && process.env.ALI_OSS_BUCKET) {
    const ossHost =
      process.env.ALI_OSS_PUBLIC_DOMAIN ||
      `https://${process.env.ALI_OSS_BUCKET}.${process.env.ALI_OSS_REGION}.aliyuncs.com`;
    const ossResult = await checkHttp(ossHost, 3000);
    checks.oss = {
      status: ossResult === "ok" ? "ok" : "error",
      error: ossResult !== "ok" ? ossResult : undefined,
    };
  }

  // 审计链路：锚点、PENDING、归档目录配置
  try {
    const [auditAnchor, ssoAnchor, pendingCount] = await Promise.all([
      prisma.auditLogAnchor.findFirst({
        where: { stream: "audit", signatureVersion: 2 },
        orderBy: { day: "desc" },
        select: { day: true, count: true, archivedAt: true },
      }),
      prisma.auditLogAnchor.findFirst({
        where: { stream: "sso", signatureVersion: 2 },
        orderBy: { day: "desc" },
        select: { day: true, count: true, archivedAt: true },
      }),
      prisma.auditLog.count({ where: { outcome: "PENDING" } }),
    ]);
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const stale = !auditAnchor || auditAnchor.day < yesterday;
    checks.audit = {
      status: stale || pendingCount > 50 ? "warn" : "ok",
      detail: {
        auditAnchor: auditAnchor
          ? {
              day: auditAnchor.day,
              count: auditAnchor.count,
              archived: Boolean(auditAnchor.archivedAt),
            }
          : null,
        ssoAnchor: ssoAnchor ? { day: ssoAnchor.day, count: ssoAnchor.count } : null,
        pendingCount,
        archiveDir: process.env.AUDIT_ARCHIVE_DIR || "var/audit-archive",
      },
    };
  } catch {
    checks.audit = { status: "error", error: "audit_pipeline_unavailable" };
  }

  const allOk = Object.values(checks).every((c) => !c.error);

  return NextResponse.json(
    {
      status: allOk ? "healthy" : "unhealthy",
      timestamp: new Date().toISOString(),
      checks,
    },
    { status: allOk ? 200 : 503 }
  );
}
