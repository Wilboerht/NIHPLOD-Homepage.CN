import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  ID_JAG_ASSERTION_TYPE,
  buildAuthMd,
  buildAuthorizationServerMetadata,
  getTrustedAgentIssuers,
} from "../agent-auth";
import { buildOAuthProtectedResourceMetadata } from "../oauth-protected-resource";

describe("Agent Auth discovery", () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = "https://nihplod.cn";
    delete process.env.AGENT_AUTH_TRUSTED_ISSUERS;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("Authorization Server issuer 与 PRM 的 authorization_servers 一致", () => {
    const prm = buildOAuthProtectedResourceMetadata();
    const as = buildAuthorizationServerMetadata();

    expect(as.issuer).toBe(prm.authorization_servers[0]);
    expect(as.resource).toBe(prm.resource);
    expect(as.bearer_methods_supported).toEqual(["header"]);
  });

  it("agent_auth 声明 skill、register_uri 与完整的 ID-JAG 方法", () => {
    const as = buildAuthorizationServerMetadata();

    expect(as.agent_auth.skill).toBe("https://nihplod.cn/auth.md");
    expect(as.agent_auth.register_uri).toBe("https://nihplod.cn/agent/auth");
    expect(as.agent_auth.revocation_uri).toBe("https://nihplod.cn/api/oauth/revoke");
    expect(as.agent_auth.identity_types_supported).toEqual(["identity_assertion"]);
    expect(as.agent_auth.identity_assertion.assertion_types_supported).toContain(
      ID_JAG_ASSERTION_TYPE
    );
    expect(as.agent_auth.identity_assertion.credential_types_supported.length).toBeGreaterThan(0);
  });

  it("auth.md 以包含 auth.md 的 H1 开头并列出发现与注册端点", () => {
    const md = buildAuthMd();

    expect(md.split("\n")[0]).toBe("# auth.md");
    expect(md).toContain("https://nihplod.cn/.well-known/oauth-protected-resource");
    expect(md).toContain("https://nihplod.cn/.well-known/oauth-authorization-server");
    expect(md).toContain("https://nihplod.cn/agent/auth");
    expect(md).toContain(ID_JAG_ASSERTION_TYPE);
  });

  it("解析可信 issuer 列表并补全默认 JWKS URI", () => {
    process.env.AGENT_AUTH_TRUSTED_ISSUERS = JSON.stringify([
      { issuer: "https://auth.example.com/", clientIds: ["client_1"] },
    ]);

    const issuers = getTrustedAgentIssuers();

    expect(issuers).toHaveLength(1);
    expect(issuers[0].issuer).toBe("https://auth.example.com");
    expect(issuers[0].jwksUri).toBe("https://auth.example.com/.well-known/jwks.json");
    expect(issuers[0].clientIds).toEqual(["client_1"]);
  });

  it("非法 JSON 配置时 fail-closed", () => {
    process.env.AGENT_AUTH_TRUSTED_ISSUERS = "{";

    expect(getTrustedAgentIssuers()).toEqual([]);
  });
});
