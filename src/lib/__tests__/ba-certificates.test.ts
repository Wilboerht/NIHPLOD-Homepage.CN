import { describe, expect, it } from "vitest";
import {
  baActorCapabilities,
  baActorHeader,
  baCertificateCapabilities,
  hasBaCertificateCapability,
} from "@/lib/ba-certificates";

const base = {
  id: "admin-1",
  email: "owner@example.com",
  name: "Owner",
  role: "owner",
};

describe("BA certificate permissions", () => {
  it("owner receives every certificate capability", () => {
    const capabilities = baCertificateCapabilities(base);
    expect(capabilities).toContain("ba.certificates.issue");
    expect(capabilities).toContain("ba.certificates.revoke");
    expect(capabilities).toContain("ba.certificates.delete");
  });

  it("explicit issue permission is not inherited from ba:admin", () => {
    const admin = {
      ...base,
      role: "admin",
      permissions: ["ba:admin", "ba:certificates:read"],
    };
    expect(hasBaCertificateCapability(admin, "ba.certificates.issue")).toBe(false);
    expect(hasBaCertificateCapability(admin, "ba.certificates.read")).toBe(true);
  });

  it("uses permissionOverrides from verifyAuth, not only resolved permissions", () => {
    const admin = {
      ...base,
      role: "admin",
      permissionOverrides: ["ba:access", "ba:certificates:read"],
    };
    expect(hasBaCertificateCapability(admin, "ba.certificates.read")).toBe(true);
    expect(hasBaCertificateCapability(admin, "ba.certificates.issue")).toBe(false);
  });

  it("BA super admin capability includes complaint operations without leaking cert issue", () => {
    const admin = { ...base, role: "admin", permissions: ["ba:admin"] };
    const capabilities = baActorCapabilities(admin);
    expect(capabilities).toContain("ba.admin");
    expect(capabilities).toContain("ba.complaints.delete");
    expect(capabilities).not.toContain("ba.certificates.issue");
  });

  it("download permission implies read for detail lookup", () => {
    const admin = {
      ...base,
      role: "support",
      permissions: ["ba:certificates:download"],
    };
    expect(baCertificateCapabilities(admin)).toEqual(
      expect.arrayContaining(["ba.certificates.download", "ba.certificates.read"])
    );
  });

  it("explicit issue-only admin can issue without ba:admin or read", () => {
    const admin = {
      ...base,
      role: "admin",
      permissions: ["ba:certificates:issue"],
    };
    expect(hasBaCertificateCapability(admin, "ba.certificates.issue")).toBe(true);
    expect(hasBaCertificateCapability(admin, "ba.certificates.read")).toBe(false);
    const payload = JSON.parse(Buffer.from(baActorHeader(admin), "base64url").toString("utf8")) as {
      baRole: string | null;
    };
    expect(payload.baRole).toBeNull();
  });

  it("actor header contains canonical BA role and capabilities", () => {
    const admin = {
      ...base,
      role: "admin",
      permissions: ["ba:admin", "ba:certificates:issue"],
    };
    const header = baActorHeader(admin);
    const payload = JSON.parse(Buffer.from(header, "base64url").toString("utf8")) as {
      externalAdminId: string;
      baRole: string;
      capabilities: string[];
    };
    expect(payload.externalAdminId).toBe("admin-1");
    expect(payload.baRole).toBe("super_admin");
    expect(payload.capabilities).toContain("ba.certificates.issue");
  });
});
