import { describe, it, expect, beforeAll } from "vitest";
import {
  exportPKCS8,
  exportSPKI,
  generateKeyPair,
  importSPKI,
  jwtVerify,
} from "jose";
import {
  getAdminSsoSigningConfig,
  hashAdminSsoCode,
  isTotpSatisfied,
  safeSecretEqual,
  signAdminSsoAssertion,
  type AdminSsoSigningConfig,
} from "@/lib/admin-sso";
import {
  filterClientPermissions,
  getAdminSsoClient,
  getAdminSsoClients,
  resolveClientRole,
} from "@/lib/admin-sso-clients";
import {
  canReadBaComplaints,
  resolveAdvisorRole,
  resolveBaRole,
} from "@/lib/admin-permissions";
import { getIssuer } from "@/lib/oauth-constants";

let privateKeyPem: string;
let publicKeyPem: string;

beforeAll(async () => {
  const pair = await generateKeyPair("RS256", { modulusLength: 2048, extractable: true });
  privateKeyPem = await exportPKCS8(pair.privateKey);
  publicKeyPem = await exportSPKI(pair.publicKey);
});

function rs256Signing(): AdminSsoSigningConfig {
  return {
    alg: "RS256",
    keyId: "advisor-admin-rs256-v1",
    privateKey: privateKeyPem,
  };
}

const advisorAssertionInput = {
  id: "admin-1",
  email: "admin@example.com",
  name: "Admin",
  role: "admin",
  clientId: "advisor-admin",
  audience: "advisor-admin",
  clientRole: "admin",
  roleResolver: "advisor" as const,
  permissions: ["advisor:access"],
  tokenVersion: 3,
  totpEnabled: true,
  mainSessionExp: Math.floor(Date.now() / 1000) + 600,
};

const baAssertionInput = {
  ...advisorAssertionInput,
  clientId: "ba-admin",
  audience: "ba-admin",
  clientRole: "auditor",
  roleResolver: "ba" as const,
  permissions: ["ba:access"],
};

describe("admin-sso", () => {
  it("resolves advisor and BA roles", () => {
    expect(resolveAdvisorRole("owner", [])).toBe("super_admin");
    expect(resolveAdvisorRole("admin", ["advisor:admin"])).toBe("super_admin");
    expect(resolveAdvisorRole("admin", ["advisor:access"])).toBe("admin");
    expect(resolveAdvisorRole("admin", [])).toBeNull();
    expect(resolveAdvisorRole("hr", [])).toBeNull();

    expect(resolveBaRole("owner", [])).toBe("super_admin");
    expect(resolveBaRole("admin", ["ba:admin"])).toBe("super_admin");
    expect(resolveBaRole("admin", ["ba:access"])).toBe("auditor");
    expect(resolveBaRole("admin", ["ba:complaints:read"])).toBeNull();
  });

  it("treats complaint write/delete/sensitive as read access", () => {
    expect(canReadBaComplaints({ role: "admin", permissionOverrides: ["ba:complaints:read"] })).toBe(true);
    expect(canReadBaComplaints({ role: "admin", permissionOverrides: ["ba:complaints:write"] })).toBe(true);
    expect(canReadBaComplaints({ role: "admin", permissionOverrides: ["ba:complaints:delete"] })).toBe(true);
    expect(
      canReadBaComplaints({ role: "admin", permissionOverrides: ["ba:complaints:sensitive:read"] })
    ).toBe(true);
    expect(canReadBaComplaints({ role: "admin", permissionOverrides: [] })).toBe(false);
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

  it("signs an advisor RS256 assertion with advisorRole compatibility", async () => {
    const assertion = await signAdminSsoAssertion(advisorAssertionInput, rs256Signing());

    const { payload, protectedHeader } = await jwtVerify(
      assertion,
      await importSPKI(publicKeyPem, "RS256"),
      {
        issuer: getIssuer(),
        audience: "advisor-admin",
        algorithms: ["RS256"],
      }
    );

    expect(protectedHeader.alg).toBe("RS256");
    expect(protectedHeader.kid).toBe("advisor-admin-rs256-v1");
    expect(payload.sub).toBe("admin-1");
    expect(payload.advisorRole).toBe("admin");
    expect(payload.client_id).toBe("advisor-admin");
    expect(payload.clientRole).toBe("admin");
    expect(payload.token_use).toBe("admin_sso");
    expect(payload.permissions).toEqual(["advisor:access"]);
  });

  it("signs a BA assertion with ba-admin audience and baRole", async () => {
    const assertion = await signAdminSsoAssertion(baAssertionInput, rs256Signing());

    const { payload } = await jwtVerify(
      assertion,
      await importSPKI(publicKeyPem, "RS256"),
      {
        issuer: getIssuer(),
        audience: "ba-admin",
        algorithms: ["RS256"],
      }
    );

    expect(payload.baRole).toBe("auditor");
    expect(payload.client_id).toBe("ba-admin");
    expect(payload.clientRole).toBe("auditor");
    expect(payload.permissions).toEqual(["ba:access"]);
  });

  it("supports the explicit HS256 migration fallback", async () => {
    const secret = "s".repeat(32);
    const assertion = await signAdminSsoAssertion(advisorAssertionInput, {
      alg: "HS256",
      secret,
    });
    const { payload } = await jwtVerify(
      assertion,
      new TextEncoder().encode(secret),
      {
        issuer: getIssuer(),
        audience: "advisor-admin",
        algorithms: ["HS256"],
      }
    );

    expect(payload.advisorRole).toBe("admin");
    expect(payload.token_use).toBe("admin_sso");
  });

  it("builds both clients and filters permissions by client prefix", () => {
    const keys = [
      "ADVISOR_ADMIN_SSO_ENABLED",
      "ADVISOR_ADMIN_SSO_CLIENT_ID",
      "ADVISOR_ADMIN_SSO_CLIENT_SECRET",
      "ADVISOR_ADMIN_SSO_REDIRECT_URI",
      "ADVISOR_ADMIN_SSO_PRIVATE_KEY",
      "ADVISOR_ADMIN_SSO_SIGNING_ALG",
      "ADVISOR_ADMIN_SSO_SECRET",
      "BA_ADMIN_SSO_ENABLED",
      "BA_ADMIN_SSO_CLIENT_ID",
      "BA_ADMIN_SSO_CLIENT_SECRET",
      "BA_ADMIN_SSO_REDIRECT_URI",
      "BA_ADMIN_SSO_AUDIENCE",
    ] as const;
    const saved = new Map(keys.map((key) => [key, process.env[key]] as const));

    try {
      process.env.ADVISOR_ADMIN_SSO_ENABLED = "true";
      process.env.ADVISOR_ADMIN_SSO_CLIENT_ID = "advisor-admin";
      process.env.ADVISOR_ADMIN_SSO_CLIENT_SECRET = "c".repeat(32);
      process.env.ADVISOR_ADMIN_SSO_REDIRECT_URI = "https://smart.nihplod.cn/callback";
      process.env.ADVISOR_ADMIN_SSO_PRIVATE_KEY = privateKeyPem;
      delete process.env.ADVISOR_ADMIN_SSO_SIGNING_ALG;
      delete process.env.ADVISOR_ADMIN_SSO_SECRET;

      process.env.BA_ADMIN_SSO_ENABLED = "true";
      process.env.BA_ADMIN_SSO_CLIENT_ID = "ba-admin";
      process.env.BA_ADMIN_SSO_CLIENT_SECRET = "d".repeat(32);
      process.env.BA_ADMIN_SSO_REDIRECT_URI = "https://ba.nihplod.cn/callback";
      process.env.BA_ADMIN_SSO_AUDIENCE = "ba-admin";

      expect(getAdminSsoSigningConfig().alg).toBe("RS256");
      expect(getAdminSsoClients()).toHaveLength(2);
      expect(getAdminSsoClient("ba-admin")?.audience).toBe("ba-admin");

      const baClient = getAdminSsoClient("ba-admin")!;
      expect(resolveClientRole(baClient, "admin", ["ba:access"])).toBe("auditor");
      expect(filterClientPermissions(baClient, "admin", ["ba:access", "users:read"])).toEqual([
        "ba:access",
      ]);
    } finally {
      for (const key of keys) {
        const value = saved.get(key);
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
});
