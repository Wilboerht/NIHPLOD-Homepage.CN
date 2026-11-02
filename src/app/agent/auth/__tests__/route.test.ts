import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/ratelimit", () => ({
  rateLimit: vi.fn().mockResolvedValue({ success: true }),
  getClientIP: vi.fn().mockReturnValue("127.0.0.1"),
}));

import { GET, POST } from "../route";
import { ID_JAG_ASSERTION_TYPE } from "@/lib/agent-auth";

function fakeJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "oauth-id-jag+jwt" })).toString(
    "base64url"
  );
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.c2ln`;
}

function post(body: unknown): NextRequest {
  return new NextRequest("http://localhost/agent/auth", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /agent/auth", () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    delete process.env.AGENT_AUTH_TRUSTED_ISSUERS;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("拒绝非 identity_assertion 请求", async () => {
    const res = await POST(post({ type: "anonymous" }));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "invalid_request" });
  });

  it("未配置可信 issuer 时返回 issuer_not_enabled（fail-closed）", async () => {
    const now = Math.floor(Date.now() / 1000);
    const assertion = fakeJwt({
      iss: "https://auth.example.com",
      aud: "https://nihplod.cn",
      client_id: "client_1",
      jti: "jti-1",
      iat: now,
      exp: now + 300,
      auth_time: now,
      phone_number: "+8613800138000",
      phone_number_verified: true,
    });

    const res = await POST(
      post({
        type: "identity_assertion",
        assertion_type: ID_JAG_ASSERTION_TYPE,
        assertion,
      })
    );

    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toContain("issuer_not_enabled");
    await expect(res.json()).resolves.toMatchObject({ error: "issuer_not_enabled" });
  });

  it("GET 返回 405", async () => {
    const res = GET();

    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toContain("POST");
  });
});
