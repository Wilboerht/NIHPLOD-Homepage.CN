import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

/**
 * 健康检查 API
 * GET /api/health - 检查服务和数据库状态
 */
// 强制动态渲染，禁止静态预渲染
export const dynamic = 'force-dynamic';

export async function GET() {
  const checks: Record<string, { status: string; latency?: number; error?: string }> = {
    server: { status: "ok" },
  };

  // 检查数据库连接
  const dbStart = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = {
      status: "ok",
      latency: Date.now() - dbStart,
    };
  } catch (error) {
    checks.database = {
      status: "error",
      latency: Date.now() - dbStart,
      error: error instanceof Error ? error.message : "Unknown error",
    };
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
