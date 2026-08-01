import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { rateLimit, getClientIP } from "@/lib/ratelimit";

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

export async function GET(request: Request) {
  const ip = getClientIP(request);
  const limitResult = await rateLimit(ip, "health");
  if (!limitResult.success) {
    return NextResponse.json(
      { status: "rate_limited", message: "请求过于频繁" },
      { status: 429 }
    );
  }

  const checks: Record<string, { status: string; latency?: number; error?: string }> = {
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

  // 微信支付 API 可达性
  const wxResult = await checkHttp("https://api.mch.weixin.qq.com", 3000);
  checks.wechat_pay = {
    status: wxResult === "ok" ? "ok" : "degraded",
    error: wxResult !== "ok" ? wxResult : undefined,
  };

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
