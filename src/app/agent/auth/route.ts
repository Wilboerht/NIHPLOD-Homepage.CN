import { NextRequest, NextResponse } from "next/server";
import { AgentAuthError, ID_JAG_ASSERTION_TYPE, registerAgentWithIdJag } from "@/lib/agent-auth";
import { rateLimit, getClientIP } from "@/lib/ratelimit";
import { BODY_LIMITS } from "@/lib/body-limits";
import { isBodyTooLargeError, payloadTooLargeResponse, readJsonBody } from "@/lib/request-body";
import { apiConsole } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(body: unknown, status = 200, extraHeaders?: Record<string, string>) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      Pragma: "no-cache",
      ...CORS_HEADERS,
      ...extraHeaders,
    },
  });
}

export async function POST(request: NextRequest) {
  const ip = getClientIP(request);
  const limitResult = await rateLimit(ip, "agent-auth");
  if (!limitResult.success) {
    return json({ error: "rate_limited", error_description: "请求过于频繁" }, 429, {
      "Retry-After": "60",
    });
  }

  let body: Record<string, unknown>;
  try {
    body = await readJsonBody<Record<string, unknown>>(request, BODY_LIMITS.oauthJson);
  } catch (error) {
    if (isBodyTooLargeError(error)) return payloadTooLargeResponse(error.limit);
    return json({ error: "invalid_request", error_description: "请求体不是合法的 JSON" }, 400);
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return json({ error: "invalid_request", error_description: "请求体必须是 JSON 对象" }, 400);
  }

  if (body.type !== "identity_assertion") {
    return json(
      {
        error: "invalid_request",
        error_description: "仅支持 type=identity_assertion",
      },
      400
    );
  }

  if (body.assertion_type !== ID_JAG_ASSERTION_TYPE) {
    return json(
      {
        error: "invalid_request",
        error_description: `assertion_type 必须为 ${ID_JAG_ASSERTION_TYPE}`,
      },
      400
    );
  }

  if (typeof body.assertion !== "string" || body.assertion.length < 32) {
    return json({ error: "invalid_request", error_description: "缺少合法的 assertion" }, 400);
  }

  try {
    const result = await registerAgentWithIdJag(body.assertion, { ip });
    return json(result);
  } catch (error) {
    if (error instanceof AgentAuthError) {
      const headers =
        error.headers ??
        (error.status === 401
          ? { "WWW-Authenticate": `AgentAuth error="${error.code}"` }
          : undefined);
      return json(
        { error: error.code, error_description: error.description },
        error.status,
        headers
      );
    }
    apiConsole.error("[AgentAuth] registration failed", error);
    return json({ error: "server_error", error_description: "服务器内部错误" }, 500);
  }
}

export function GET() {
  return json({ error: "invalid_request", error_description: "请使用 POST" }, 405, {
    Allow: "POST, OPTIONS",
  });
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}
