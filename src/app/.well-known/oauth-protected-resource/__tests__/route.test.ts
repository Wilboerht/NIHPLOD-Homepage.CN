/**
 * OAuth Protected Resource Metadata 端点单元测试（RFC 9728）
 * GET /.well-known/oauth-protected-resource
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { GET } from "../route";
import { buildOAuthProtectedResourceMetadata } from "@/lib/oauth-protected-resource";
import { SUPPORTED_SCOPES } from "@/lib/oauth-constants";

describe("OAuth Protected Resource Metadata", () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = "https://nihplod.cn";
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("resource 与 authorization_servers 使用公网 issuer", () => {
    const doc = buildOAuthProtectedResourceMetadata();
    expect(doc.resource).toBe("https://nihplod.cn");
    expect(doc.authorization_servers).toEqual(["https://nihplod.cn"]);
    expect(doc.scopes_supported).toEqual([...SUPPORTED_SCOPES]);
    expect(doc.bearer_methods_supported).toEqual(["header"]);
  });

  it("返回 200 JSON、公共缓存与 CORS 头", async () => {
    const res = GET();

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(res.headers.get("cache-control")).toBe("public, max-age=3600");
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    await expect(res.json()).resolves.toMatchObject({
      resource: "https://nihplod.cn",
      authorization_servers: ["https://nihplod.cn"],
    });
  });
});
