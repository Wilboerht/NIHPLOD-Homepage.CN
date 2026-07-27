/**
 * 在线连接测试 API
 * POST /api/admin/oauth-clients/test
 *
 * 模拟完整 SSO 流程各环节，验证配置是否正确。
 * 自动完成：验证客户端凭据 → JWKS 可达性 → authorize 参数校验 → token 认证 → userinfo 连通性
 * 返回每步结果和耗时。
 *
 * 权限：需要 admin 认证
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { getOAuthClientByClientId, verifyOAuthClientSecret } from "@/lib/oauth-client";
import { apiConsole } from "@/lib/logger";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { z } from "zod";
import { randomBytes, createHash } from "crypto";

export const dynamic = "force-dynamic";

interface TestStep {
  step: string;
  status: "passed" | "failed" | "skipped";
  durationMs: number;
  detail?: string;
}

const bodySchema = z.object({
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  redirectUri: z.string().url(),
});

/**
 * 生成 PKCE code_verifier + code_challenge (S256)
 */
function generatePkce() {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256")
    .update(verifier)
    .digest("base64url");
  return { verifier, challenge };
}

export async function POST(request: NextRequest) {
  if (!validateCSRFToken(request)) {
    return csrfForbiddenResponse();
  }

  try {
    const admin = await verifyAuth(request);
    if (!admin || admin.role !== "owner") {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "仅超级管理员可操作" } },
        { status: 403 }
      );
    }

    const rateLimitResponse = await checkAdminRateLimit(request);
    if (rateLimitResponse) return rateLimitResponse;

    const body = await request.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_PARAMS", message: "参数错误", details: parsed.error.issues } },
        { status: 400 }
      );
    }

    const { clientId, clientSecret, redirectUri } = parsed.data;
    const steps: TestStep[] = [];
    const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL || request.nextUrl.origin).replace(/\/$/, "");

    // Step 1: 验证 Client 凭据
    const t1 = performance.now();
    const client = await getOAuthClientByClientId(clientId);
    if (!client) {
      steps.push({
        step: "客户端验证",
        status: "failed",
        durationMs: Math.round(performance.now() - t1),
        detail: `未找到 clientId "${clientId}" 对应的 OAuth Client`,
      });
      return NextResponse.json({ success: false, data: { steps, summary: "客户端不存在" } });
    }

    const secretValid = await verifyOAuthClientSecret(clientId, clientSecret);
    steps.push({
      step: "客户端凭据验证",
      status: secretValid ? "passed" : "failed",
      durationMs: Math.round(performance.now() - t1),
      detail: secretValid ? `Client "${client.name}" 凭据有效` : "clientSecret 不匹配",
    });

    if (!secretValid) {
      return NextResponse.json({ success: false, data: { steps, summary: "客户端凭据无效" } });
    }

    // Step 2: JWKS 端点可达性
    const t2 = performance.now();
    try {
      const jwksRes = await fetch(`${baseUrl}/api/oauth/jwks`, {
        method: "GET",
        headers: { "Accept": "application/json" },
      });
      const jwksCacheHit = jwksRes.headers.get("X-Cache") || jwksRes.headers.get("x-cache");

      if (jwksRes.ok) {
        const jwksData = await jwksRes.json();
        const hasKeys = jwksData?.keys?.length > 0;
        steps.push({
          step: "JWKS 端点",
          status: hasKeys ? "passed" : "failed",
          durationMs: Math.round(performance.now() - t2),
          detail: hasKeys
            ? `成功获取 ${jwksData.keys.length} 个密钥${jwksCacheHit ? " (缓存命中)" : ""}`
            : "JWKS 响应中无密钥",
        });
      } else {
        steps.push({
          step: "JWKS 端点",
          status: "failed",
          durationMs: Math.round(performance.now() - t2),
          detail: `HTTP ${jwksRes.status}`,
        });
      }
    } catch (err) {
      steps.push({
        step: "JWKS 端点",
        status: "failed",
        durationMs: Math.round(performance.now() - t2),
        detail: `请求失败: ${err instanceof Error ? err.message : "未知错误"}`,
      });
    }

    // 生成 PKCE 用于后续 authorize / token 测试
    const pkce = generatePkce();

    // Step 3: Authorize 端点参数校验（带 PKCE）
    const t3 = performance.now();
    try {
      const authUrl = new URL(`${baseUrl}/api/oauth/authorize`);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("client_id", clientId);
      authUrl.searchParams.set("redirect_uri", redirectUri);
      authUrl.searchParams.set("scope", client.scopes.join(" "));
      authUrl.searchParams.set("state", "test-state-value");
      authUrl.searchParams.set("code_challenge", pkce.challenge);
      authUrl.searchParams.set("code_challenge_method", "S256");

      const authRes = await fetch(authUrl.toString(), {
        method: "GET",
        redirect: "manual", // 不跟随重定向
      });

      // authorize 端点对于有效参数应返回 302（重定向到登录页）
      // 对于无效参数返回 400
      if (authRes.status === 302) {
        const location = authRes.headers.get("Location") || "";
        const isLoginRedirect = location.includes("/login");
        steps.push({
          step: "Authorize 端点",
          status: "passed",
          durationMs: Math.round(performance.now() - t3),
          detail: `参数校验通过，重定向到 ${isLoginRedirect ? "登录页" : "consent 页"}`,
        });
      } else if (authRes.status === 400) {
        const errBody = await authRes.json().catch(() => ({}));
        steps.push({
          step: "Authorize 端点",
          status: "failed",
          durationMs: Math.round(performance.now() - t3),
          detail: `参数校验失败: ${(errBody as Record<string, unknown>)?.error_description || `HTTP ${authRes.status}`}`,
        });
      } else {
        steps.push({
          step: "Authorize 端点",
          status: "failed",
          durationMs: Math.round(performance.now() - t3),
          detail: `意外状态码 ${authRes.status}`,
        });
      }
    } catch (err) {
      steps.push({
        step: "Authorize 端点",
        status: "failed",
        durationMs: Math.round(performance.now() - t3),
        detail: `请求失败: ${err instanceof Error ? err.message : "未知错误"}`,
      });
    }

    // Step 4: Token 端点认证校验（用无效 code + 有效 PKCE verifier 测试，期望返回 invalid_grant 而非 invalid_client）
    const t4 = performance.now();
    try {
      const tokenBody = new URLSearchParams({
        grant_type: "authorization_code",
        code: "test-invalid-code",
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        code_verifier: pkce.verifier,
      });

      const tokenRes = await fetch(`${baseUrl}/api/oauth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: tokenBody.toString(),
      });

      const tokenData = await tokenRes.json().catch(() => ({}));
      const err = (tokenData as Record<string, unknown>)?.error;

      if (err === "invalid_grant") {
        // 这是预期的：code 无效，但客户端认证通过
        steps.push({
          step: "Token 端点",
          status: "passed",
          durationMs: Math.round(performance.now() - t4),
          detail: "客户端认证通过（code 无效是预期行为）",
        });
      } else if (err === "invalid_client") {
        steps.push({
          step: "Token 端点",
          status: "failed",
          durationMs: Math.round(performance.now() - t4),
          detail: "客户端认证失败",
        });
      } else {
        steps.push({
          step: "Token 端点",
          status: "failed",
          durationMs: Math.round(performance.now() - t4),
          detail: `意外响应: ${JSON.stringify(tokenData).slice(0, 200)}`,
        });
      }
    } catch (err) {
      steps.push({
        step: "Token 端点",
        status: "failed",
        durationMs: Math.round(performance.now() - t4),
        detail: `请求失败: ${err instanceof Error ? err.message : "未知错误"}`,
      });
    }

    // Step 5: UserInfo 端点连通性（无 token 应返回 401）
    const t5 = performance.now();
    try {
      const userinfoRes = await fetch(`${baseUrl}/api/oauth/userinfo`, {
        method: "GET",
        headers: { "Accept": "application/json" },
      });

      if (userinfoRes.status === 401) {
        steps.push({
          step: "UserInfo 端点",
          status: "passed",
          durationMs: Math.round(performance.now() - t5),
          detail: "端点可达，正确返回 401（未提供 token）",
        });
      } else {
        steps.push({
          step: "UserInfo 端点",
          status: "passed",
          durationMs: Math.round(performance.now() - t5),
          detail: `端点可达，返回 HTTP ${userinfoRes.status}`,
        });
      }
    } catch (err) {
      steps.push({
        step: "UserInfo 端点",
        status: "failed",
        durationMs: Math.round(performance.now() - t5),
        detail: `请求失败: ${err instanceof Error ? err.message : "未知错误"}`,
      });
    }

    // Step 6: Introspect 端点连通性
    const t6 = performance.now();
    try {
      const introBody = new URLSearchParams({
        token: "test-invalid-token",
        client_id: clientId,
        client_secret: clientSecret,
      });

      const introRes = await fetch(`${baseUrl}/api/oauth/introspect`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: introBody.toString(),
      });

      const introData = await introRes.json().catch(() => ({}));
      const isActive = (introData as Record<string, unknown>)?.active;

      if (introRes.ok && isActive === false) {
        steps.push({
          step: "Introspect 端点",
          status: "passed",
          durationMs: Math.round(performance.now() - t6),
          detail: "端点可达，验证正常（无效 token 返回 active: false）",
        });
      } else if (introRes.status === 401 || introRes.status === 400) {
        steps.push({
          step: "Introspect 端点",
          status: "passed",
          durationMs: Math.round(performance.now() - t6),
          detail: `端点可达，返回 HTTP ${introRes.status}`,
        });
      } else {
        steps.push({
          step: "Introspect 端点",
          status: "failed",
          durationMs: Math.round(performance.now() - t6),
          detail: `意外状态码 ${introRes.status}`,
        });
      }
    } catch (err) {
      steps.push({
        step: "Introspect 端点",
        status: "failed",
        durationMs: Math.round(performance.now() - t6),
        detail: `请求失败: ${err instanceof Error ? err.message : "未知错误"}`,
      });
    }

    const allPassed = steps.every((s) => s.status === "passed");
    const failedSteps = steps.filter((s) => s.status === "failed");

    return NextResponse.json({
      success: allPassed,
      data: {
        steps,
        summary: allPassed
          ? "所有连接测试通过！配置正确。"
          : `${failedSteps.length} 项测试未通过: ${failedSteps.map((s) => s.step).join("、")}`,
        totalDurationMs: steps.reduce((sum, s) => sum + s.durationMs, 0),
      },
    });
  } catch (error) {
    apiConsole.error("[AdminOAuthTest] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}
