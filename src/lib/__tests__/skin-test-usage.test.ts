import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  advisorJson: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: mocks.findUnique } },
}));
vi.mock("@/lib/advisor-internal", () => ({
  advisorJson: mocks.advisorJson,
}));

import { fetchSkinTestUsage } from "@/lib/skin-test-usage";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.advisorJson.mockResolvedValue(null);
});

describe("fetchSkinTestUsage", () => {
  it("主站会员 GOLD/6000 → query 携带 level/totalSpent", async () => {
    mocks.findUnique.mockResolvedValue({ membershipLevel: "GOLD", totalSpent: 6000 });
    mocks.advisorJson.mockResolvedValue({ level: "GOLD" });

    await fetchSkinTestUsage("user-gold");

    expect(mocks.findUnique).toHaveBeenCalledWith({
      where: { id: "user-gold" },
      select: { membershipLevel: true, totalSpent: true },
    });
    expect(mocks.advisorJson).toHaveBeenCalledWith("/api/internal/skin-test-usage", {
      query: { userId: "user-gold", level: "GOLD", totalSpent: 6000 },
      timeoutMs: 3000,
    });
  });

  it("主站用户不存在 → 只传 userId", async () => {
    mocks.findUnique.mockResolvedValue(null);

    await fetchSkinTestUsage("missing");

    expect(mocks.advisorJson).toHaveBeenCalledWith("/api/internal/skin-test-usage", {
      query: { userId: "missing" },
      timeoutMs: 3000,
    });
  });

  it("主站 Prisma 查询失败 → 仍请求子站，不带 override", async () => {
    mocks.findUnique.mockRejectedValue(new Error("db down"));

    await fetchSkinTestUsage("user-db-down");

    expect(mocks.advisorJson).toHaveBeenCalledWith("/api/internal/skin-test-usage", {
      query: { userId: "user-db-down" },
      timeoutMs: 3000,
    });
  });
});
