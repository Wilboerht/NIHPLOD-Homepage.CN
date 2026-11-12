import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({
  withAuth:
    (handler: (...args: unknown[]) => unknown) => (request: unknown, admin: unknown) =>
      handler(request, admin),
  checkAdminRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/admin-totp", () => ({
  requireAdminStepUp: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/audit", () => ({
  createAuditLogStrict: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock("qrcode", () => ({
  default: { toDataURL: vi.fn().mockResolvedValue("data:image/png;base64,x") },
}));

import { GET } from "../break-glass/route";

const OWNER = {
  id: "admin-1",
  email: "owner@test.com",
  name: "Owner",
  role: "owner",
};

function createRequest() {
  return new NextRequest("https://nihplod.cn/api/admin/break-glass");
}

describe("GET /api/admin/break-glass", () => {
  beforeEach(() => {
    vi.stubEnv("ADVISOR_BREAK_GLASS_USERNAME", "emergency-admin");
    vi.stubEnv("ADVISOR_BREAK_GLASS_PASSWORD", "strong-password");
    vi.stubEnv("ADVISOR_BREAK_GLASS_TOTP_SECRET", "JBSWY3DPEHPK3PXP");
    vi.stubEnv("ADVISOR_BREAK_GLASS_ENABLED", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("默认关闭：即使配置了凭据也不返回明文", async () => {
    const res = await GET(createRequest(), OWNER as never);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.configured).toBe(false);
    expect(body.data.password).toBeUndefined();
    expect(body.data.totpSecret).toBeUndefined();
  });

  it("显式设置为 true 时才返回凭据", async () => {
    vi.stubEnv("ADVISOR_BREAK_GLASS_ENABLED", "true");

    const res = await GET(createRequest(), OWNER as never);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.configured).toBe(true);
    expect(body.data.password).toBe("strong-password");
    expect(body.data.totpSecret).toBe("JBSWY3DPEHPK3PXP");
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(res.headers.get("pragma")).toBe("no-cache");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("示例值 CHANGE_ME 不会被当作已配置", async () => {
    vi.stubEnv("ADVISOR_BREAK_GLASS_ENABLED", "true");
    vi.stubEnv("ADVISOR_BREAK_GLASS_PASSWORD", "CHANGE_ME");

    const res = await GET(createRequest(), OWNER as never);
    const body = await res.json();

    expect(body.data.configured).toBe(false);
  });

  it("非 owner 返回 403", async () => {
    const res = await GET(createRequest(), { ...OWNER, role: "admin" } as never);

    expect(res.status).toBe(403);
  });
});
