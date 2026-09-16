/**
 * 会员权益配置路由测试
 * GET/PUT /api/admin/membership-benefits
 *
 * 覆盖：
 * - 非 owner 403（读与写）
 * - GET：DB 覆盖 + 代码默认值兜底合并
 * - PUT：参数校验、upsert 与审计 update_vip_benefit
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("@/lib/prisma", () => {
  const prisma = {
    membershipBenefit: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  };
  return { prisma, default: prisma };
});

vi.mock("@/lib/auth", () => ({
  verifyAuth: vi.fn(),
  checkAdminRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/csrf", () => ({
  validateCSRFToken: vi.fn().mockReturnValue(true),
  csrfForbiddenResponse: () =>
    NextResponse.json({ success: false, error: { code: "CSRF_INVALID" } }, { status: 403 }),
}));

vi.mock("@/lib/audit", () => ({
  createAuditLog: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), log: vi.fn() },
}));

import { GET, PUT } from "../route";
import { verifyAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit";

const OWNER = { id: "admin-1", email: "owner@test.com", name: "Owner", role: "owner" };
const ADMIN = { ...OWNER, role: "admin" };

function createRequest(method: "GET" | "PUT", body?: unknown) {
  return new NextRequest("http://localhost/api/admin/membership-benefits", {
    method,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    headers: { "Content-Type": "application/json" },
  } as never);
}

const VALID_BODY = {
  level: "SILVER",
  name: "银卡会员",
  nameEn: "Silver",
  icon: "",
  minSpent: 1000,
  maxSpent: 4999,
  benefits: [{ icon: "", title: "积分兑礼", desc: "兑礼 1:1" }],
  colorClass: "text-stone-500",
};

describe("GET /api/admin/membership-benefits", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyAuth).mockResolvedValue(OWNER as never);
    (prisma.membershipBenefit.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  });

  it("非 owner 返回 403", async () => {
    vi.mocked(verifyAuth).mockResolvedValue(ADMIN as never);
    const res = await GET(createRequest("GET"));
    expect(res.status).toBe(403);
  });

  it("无 DB 配置时返回四档默认值（source=default）", async () => {
    const res = await GET(createRequest("GET"));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.data.levels).toHaveLength(4);
    expect(data.data.levels.every((l: { source: string }) => l.source === "default")).toBe(true);
  });

  it("DB 已配置档位优先返回（source=db）", async () => {
    (prisma.membershipBenefit.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        level: "SILVER",
        name: "银卡会员 Pro",
        nameEn: "Silver Pro",
        icon: "★",
        minSpent: 888,
        maxSpent: 4888,
        benefits: [{ icon: "", title: "自定义权益", desc: "描述" }],
        colorClass: "text-blue-500",
      },
    ]);

    const res = await GET(createRequest("GET"));
    const data = await res.json();
    const silver = data.data.levels.find((l: { level: string }) => l.level === "SILVER");

    expect(silver.source).toBe("db");
    expect(silver.name).toBe("银卡会员 Pro");
    expect(silver.minSpent).toBe(888);
  });
});

describe("PUT /api/admin/membership-benefits", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyAuth).mockResolvedValue(OWNER as never);
    (prisma.membershipBenefit.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.membershipBenefit.upsert as ReturnType<typeof vi.fn>).mockImplementation(
      async ({ create }: { create: unknown }) => create
    );
  });

  it("非 owner 返回 403", async () => {
    vi.mocked(verifyAuth).mockResolvedValue(ADMIN as never);
    const res = await PUT(createRequest("PUT", VALID_BODY));
    expect(res.status).toBe(403);
    expect(prisma.membershipBenefit.upsert).not.toHaveBeenCalled();
  });

  it("参数错误返回 400", async () => {
    const res = await PUT(createRequest("PUT", { ...VALID_BODY, benefits: [] }));
    expect(res.status).toBe(400);
  });

  it("owner 保存成功并写审计", async () => {
    const res = await PUT(createRequest("PUT", VALID_BODY));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.data.level).toBe("SILVER");
    expect(prisma.membershipBenefit.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { level: "SILVER" } })
    );
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "update_vip_benefit",
        targetType: "vip",
        targetId: "SILVER",
      })
    );
  });
});
