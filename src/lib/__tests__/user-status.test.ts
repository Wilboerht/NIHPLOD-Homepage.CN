import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { checkUserStatus } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
  },
}));

describe("checkUserStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("应允许 ACTIVE 用户", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ status: "ACTIVE" } as never);
    const result = await checkUserStatus("user-id");
    expect(result.valid).toBe(true);
  });

  it("应拒绝 SUSPENDED 用户", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ status: "SUSPENDED" } as never);
    const result = await checkUserStatus("user-id");
    expect(result.valid).toBe(false);
    expect(result.status).toBe("SUSPENDED");
  });

  it("应拒绝 BANNED 用户", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ status: "BANNED" } as never);
    const result = await checkUserStatus("user-id");
    expect(result.valid).toBe(false);
    expect(result.status).toBe("BANNED");
  });

  it("不存在的用户应视为无效", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null as never);
    const result = await checkUserStatus("user-id");
    expect(result.valid).toBe(false);
  });
});
