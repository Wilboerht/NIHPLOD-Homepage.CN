import { NextRequest, NextResponse } from "next/server";
import { checkAdminRateLimit, verifyAuth } from "@/lib/auth";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { baBaseUrl } from "@/lib/ba-internal";

export const dynamic = "force-dynamic";

const MAX_BYTES = 5 * 1024 * 1024;
const UPSTREAM_TIMEOUT_MS = 5000;

function upstreamError(message: string) {
  return NextResponse.json(
    { success: false, error: { code: "UPSTREAM_ERROR", message } },
    { status: 502, headers: { "Cache-Control": "no-store, private" } }
  );
}

/**
 * 同源代理 BA 子站的默认签章图片。
 *
 * 管理端不能直接依赖 BA 的域名/端口：同源代理可以规避 CSP、跨域和开发环境地址差异，
 * 也不把 BA 内网地址暴露给浏览器。
 */
export async function GET(request: NextRequest) {
  const admin = await verifyAuth(request);
  if (!admin) {
    return NextResponse.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "未授权" } },
      { status: 401, headers: { "Cache-Control": "no-store, private" } }
    );
  }
  if (!hasAdminPermission(admin, "ba:certificates:read")) {
    return NextResponse.json(
      { success: false, error: { code: "FORBIDDEN", message: "无权限查看证书签章" } },
      { status: 403, headers: { "Cache-Control": "no-store, private" } }
    );
  }
  const rate = await checkAdminRateLimit(request, "admin-read", admin.id);
  if (rate) return rate;

  try {
    const response = await fetch(`${baBaseUrl()}/default-seal.png`, {
      method: "GET",
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    if (!response.ok) return upstreamError("默认签章读取失败");

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) {
      return upstreamError("默认签章文件格式异常");
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength === 0 || buffer.byteLength > MAX_BYTES) {
      return upstreamError("默认签章文件异常");
    }

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(buffer.byteLength),
        "Cache-Control": "private, max-age=60",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return upstreamError("默认签章服务暂不可用");
  }
}
