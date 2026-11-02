/**
 * OAuth Protected Resource Metadata 端点（RFC 9728）
 * GET /.well-known/oauth-protected-resource
 *
 * 供 AI Agent / MCP 客户端发现资源对应的授权服务器与支持 scope。
 * 注意：proxy.ts 中 isApiPath 已将 "/.well-known/" 视为 API 路径，
 * 不会被 CSP nonce 注入或后台认证逻辑拦截，无需额外 matcher 配置。
 */
import { NextResponse } from "next/server";
import { buildOAuthProtectedResourceMetadata } from "@/lib/oauth-protected-resource";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(buildOAuthProtectedResourceMetadata(), {
    headers: {
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
