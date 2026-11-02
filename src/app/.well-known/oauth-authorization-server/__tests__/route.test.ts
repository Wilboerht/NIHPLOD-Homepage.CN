import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { GET, HEAD } from "../route";
import { buildOAuthProtectedResourceMetadata } from "@/lib/oauth-protected-resource";

describe("GET /.well-known/oauth-authorization-server", () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = "https://nihplod.cn";
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("issuer 与 PRM 一致并包含 agent_auth", async () => {
    const prm = buildOAuthProtectedResourceMetadata();
    const res = GET();
    const doc = (await res.json()) as {
      issuer: string;
      resource: string;
      agent_auth: {
        skill: string;
        register_uri: string;
        identity_types_supported: string[];
        identity_assertion: { assertion_types_supported: string[] };
      };
    };

    expect(res.status).toBe(200);
    expect(doc.issuer).toBe(prm.authorization_servers[0]);
    expect(doc.resource).toBe(prm.resource);
    expect(doc.agent_auth.skill).toBe("https://nihplod.cn/auth.md");
    expect(doc.agent_auth.register_uri).toBe("https://nihplod.cn/agent/auth");
    expect(doc.agent_auth.identity_types_supported).toEqual(["identity_assertion"]);
    expect(doc.agent_auth.identity_assertion.assertion_types_supported).toContain(
      "urn:ietf:params:oauth:token-type:id-jag"
    );
  });

  it("HEAD 返回 200 且无响应体", async () => {
    const res = HEAD();

    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(await res.text()).toBe("");
  });
});
