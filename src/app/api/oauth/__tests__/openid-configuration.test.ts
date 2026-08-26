/**
 * OpenID Connect Discovery 端点单元测试
 * GET /.well-known/openid-configuration（标准路径）
 * GET /api/oauth/.well-known/openid-configuration（历史兼容路径）
 *
 * 两个入口共用 buildOpenIdConfiguration，返回内容必须完全一致。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// === Mock ratelimit ===
vi.mock("@/lib/ratelimit", () => ({
  rateLimit: vi.fn().mockResolvedValue({ success: true }),
  getClientIP: vi.fn().mockReturnValue("127.0.0.1"),
}));

import { buildOpenIdConfiguration } from "@/lib/oidc-discovery";
import { GET as legacyGET } from "../.well-known/openid-configuration/route";
import { GET as standardGET } from "../../../.well-known/openid-configuration/route";

describe("OIDC Discovery 文档", () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = "https://nihplod.cn";
    delete process.env.JWT_ID_TOKEN_PUBLIC_KEY;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("issuer 使用 NEXT_PUBLIC_APP_URL（公网地址），各端点指向 /api/oauth/...", () => {
    const doc = buildOpenIdConfiguration();
    expect(doc.issuer).toBe("https://nihplod.cn");
    expect(doc.authorization_endpoint).toBe("https://nihplod.cn/api/oauth/authorize");
    expect(doc.token_endpoint).toBe("https://nihplod.cn/api/oauth/token");
    expect(doc.userinfo_endpoint).toBe("https://nihplod.cn/api/oauth/userinfo");
    expect(doc.jwks_uri).toBe("https://nihplod.cn/api/oauth/jwks");
  });

  it("scopes_supported 包含 birthday，claims_supported 包含 phone_number 与 birthday", () => {
    const doc = buildOpenIdConfiguration();
    expect(doc.scopes_supported).toContain("birthday");
    expect(doc.claims_supported).toContain("phone_number");
    expect(doc.claims_supported).toContain("birthday");
  });

  it("标准路径与历史路径返回完全一致的 Discovery 文档", async () => {
    const standardReq = new NextRequest("http://localhost/.well-known/openid-configuration");
    const legacyReq = new NextRequest(
      "http://localhost/api/oauth/.well-known/openid-configuration"
    );
    const standardRes = await standardGET(standardReq);
    const legacyRes = await legacyGET(legacyReq);

    expect(standardRes.status).toBe(200);
    expect(legacyRes.status).toBe(200);
    expect(await standardRes.json()).toEqual(await legacyRes.json());
  });

  it("响应带公共缓存与 CORS 头", async () => {
    const req = new NextRequest("http://localhost/.well-known/openid-configuration");
    const res = await standardGET(req);
    expect(res.headers.get("cache-control")).toBe("public, max-age=3600");
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });
});
