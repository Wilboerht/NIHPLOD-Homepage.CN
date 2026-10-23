import { describe, it, expect } from "vitest";
import { buildAdvisorAdminLink } from "@/lib/advisor-admin-link";
import { ADVISOR_URL } from "@/lib/diary-utils";

describe("buildAdvisorAdminLink", () => {
  it("生成子站 SSO 深链并编码 return_to", () => {
    expect(buildAdvisorAdminLink("/admin/users?userId=u1")).toBe(
      `${ADVISOR_URL}/api/admin/auth/sso/start?return_to=${encodeURIComponent(
        "/admin/users?userId=u1"
      )}`
    );
  });

  it("非法 returnTo 回退到子站仪表盘，避免开放重定向", () => {
    const link = buildAdvisorAdminLink("https://evil.example.com");
    expect(link).toBe(
      `${ADVISOR_URL}/api/admin/auth/sso/start?return_to=${encodeURIComponent("/admin")}`
    );
  });
});
