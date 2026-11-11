import { describe, it, expect, beforeAll } from "vitest";
import {
  exportPKCS8,
  exportSPKI,
  generateKeyPair,
  importSPKI,
  jwtVerify,
} from "jose";
import {
  ADMIN_SSO_AUDIENCE,
  getAdminSsoConfig,
  hashAdminSsoCode,
  isTotpSatisfied,
  safeSecretEqual,
  signAdminSsoAssertion,
  type AdminSsoConfig,
} from "@/lib/admin-sso";
import { resolveAdvisorRole } from "@/lib/admin-permissions";
import { getIssuer } from "@/lib/oauth-constants";

let privateKeyPem: string;
let publicKeyPem: string;

beforeAll(async () => {
  const pair = await generateKeyPair("RS256", { modulusLength: 2048, extractable: true });
  privateKeyPem = await exportPKCS8(pair.privateKey);
  publicKeyPem = await exportSPKI(pair.publicKey);
});

function rs256Config(): AdminSsoConfig {
  return {
    clientId: "advisor-admin",
    clientSecret: "c".repeat(32),
    redirectUri: "https://smart.nihplod.cn/api/admin/auth/sso/callback",
    signing: {
      alg: "RS256",
      keyId: "advisor-admin-rs256-v1",
      privateKey: privateKeyPem,
    },
  };
}

const assertionInput = {
  id: "admin-1",
  email: "admin@example.com",
  name: "Admin",
  role: "admin",
  permissionOverrides: ["advisor:access", "users:read"],
  tokenVersion: 3,
  totpEnabled: true,
  mainSessionExp: Math.floor(Date.now() / 1000) + 600,
};

describe("admin-sso", () => {
  it("resolves advisor role from explicit permissions", () => {
    expect(resolveAdvisorRole("owner", [])).toBe("super_admin");
    expect(resolveAdvisorRole("admin", ["advisor:admin"])).toBe("super_admin");
    expect(resolveAdvisorRole("admin", ["advisor:access"])).toBe("admin");
    expect(resolveAdvisorRole("admin", [])).toBeNull();
    expect(resolveAdvisorRole("hr", [])).toBeNull();
  });

  it("hashes codes deterministically and compares secrets safely", () => {
    expect(hashAdminSsoCode("abc")).toBe(hashAdminSsoCode("abc"));
    expect(hashAdminSsoCode("abc")).not.toBe(hashAdminSsoCode("abd"));
    expect(safeSecretEqual("same", "same")).toBe(true);
    expect(safeSecretEqual("same", "diff")).toBe(false);
  });

  it("requires TOTP to be enabled with no grace period", () => {
    expect(isTotpSatisfied(true)).toBe(true);
    expect(isTotpSatisfied(false)).toBe(false);
  });

  it("signs an RS256 assertion with kid and advisor-only permissions", async () => {
    const assertion = await signAdminSsoAssertion(assertionInput, rs256Config());

    const { payload, protectedHeader } = await jwtVerify(
      assertion,
      await importSPKI(publicKeyPem, "RS256"),
      {
        issuer: getIssuer(),
        audience: ADMIN_SSO_AUDIENCE,
        algorithms: ["RS256"],
      }
    );

    expect(protectedHeader.alg).toBe("RS256");
    expect(protectedHeader.kid).toBe("advisor-admin-rs256-v1");
    expect(payload.sub).toBe("admin-1");
    expect(payload.email).toBe("admin@example.com");
    expect(payload.advisorRole).toBe("admin");
    expect(payload.token_use).toBe("admin_sso");
    expect(payload.ver).toBe(3);
    expect(payload.totp).toBe(true);
    expect(payload.permissions).toEqual(
      expect.arrayContaining(["advisor:access"])
    );
    expect(payload.permissions).not.toEqual(
      expect.arrayContaining(["users:read"])
    );
  });

  it("supports the explicit HS256 migration fallback", async () => {
    const secret = "s".repeat(32);
    const config: AdminSsoConfig = {
      ...rs256Config(),
      signing: { alg: "HS256", secret },
    };

    const assertion = await signAdminSsoAssertion(assertionInput, config);
    const { payload } = await jwtVerify(
      assertion,
      new TextEncoder().encode(secret),
      {
        issuer: getIssuer(),
        audience: ADMIN_SSO_AUDIENCE,
        algorithms: ["HS256"],
      }
    );

    expect(payload.advisorRole).toBe("admin");
    expect(payload.token_use).toBe("admin_sso");
  });

  it("defaults to RS256 when a private key is configured", () => {
    const keys = [
      "ADVISOR_ADMIN_SSO_CLIENT_ID",
      "ADVISOR_ADMIN_SSO_CLIENT_SECRET",
      "ADVISOR_ADMIN_SSO_REDIRECT_URI",
      "ADVISOR_ADMIN_SSO_PRIVATE_KEY",
      "ADVISOR_ADMIN_SSO_SIGNING_ALG",
      "ADVISOR_ADMIN_SSO_SECRET",
    ] as const;
    const saved = new Map(keys.map((key) => [key, process.env[key]] as const));

    try {
      process.env.ADVISOR_ADMIN_SSO_CLIENT_ID = "advisor-admin";
      process.env.ADVISOR_ADMIN_SSO_CLIENT_SECRET = "c".repeat(32);
      process.env.ADVISOR_ADMIN_SSO_REDIRECT_URI = "https://example.com/callback";
      process.env.ADVISOR_ADMIN_SSO_PRIVATE_KEY = "unused-in-config";
      delete process.env.ADVISOR_ADMIN_SSO_SIGNING_ALG;
      delete process.env.ADVISOR_ADMIN_SSO_SECRET;

      expect(getAdminSsoConfig().signing.alg).toBe("RS256");
    } finally {
      for (const key of keys) {
        const value = saved.get(key);
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
});
