import { describe, it, expect } from "vitest";
import { jwtVerify } from "jose";
import {
  ADMIN_SSO_AUDIENCE,
  hashAdminSsoCode,
  isTotpSatisfied,
  safeSecretEqual,
  signAdminSsoAssertion,
} from "@/lib/admin-sso";
import { resolveAdvisorRole } from "@/lib/admin-permissions";
import { getIssuer } from "@/lib/oauth-constants";

const config = {
  clientId: "advisor-admin",
  clientSecret: "c".repeat(32),
  redirectUri: "https://smart.nihplod.cn/api/admin/auth/sso/callback",
  secret: "s".repeat(32),
  totpGraceUntil: new Date("2027-11-01T00:00:00+08:00"),
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

  it("allows TOTP during grace, rejects after expiry", () => {
    expect(isTotpSatisfied(true, config)).toBe(true);
    expect(
      isTotpSatisfied(false, config, new Date("2027-10-31T00:00:00+08:00"))
    ).toBe(true);
    expect(
      isTotpSatisfied(false, config, new Date("2027-11-02T00:00:00+08:00"))
    ).toBe(false);
  });

  it("signs an assertion with the expected claims", async () => {
    const assertion = await signAdminSsoAssertion(
      {
        id: "admin-1",
        email: "admin@example.com",
        name: "Admin",
        role: "admin",
        permissionOverrides: ["advisor:access"],
        tokenVersion: 3,
        totpEnabled: true,
        mainSessionExp: Math.floor(Date.now() / 1000) + 600,
      },
      config
    );

    const { payload } = await jwtVerify(
      assertion,
      new TextEncoder().encode(config.secret),
      {
        issuer: getIssuer(),
        audience: ADMIN_SSO_AUDIENCE,
        algorithms: ["HS256"],
      }
    );

    expect(payload.sub).toBe("admin-1");
    expect(payload.email).toBe("admin@example.com");
    expect(payload.advisorRole).toBe("admin");
    expect(payload.ver).toBe(3);
    expect(payload.totp).toBe(true);
  });
});
