/**
 * 留言列表状态页签计数
 * GET /api/admin/messages
 *
 * 覆盖：
 * - 状态页签 counts 基于当前搜索/备注/类型筛选，但不叠加阅读状态
 * - total 与当前 tab 一致
 * - 全局 unreadCount 不随筛选变化（供侧边栏 badge）
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/prisma", () => {
  const prisma = {
    contactMessage: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
  };
  return { prisma, default: prisma };
});

vi.mock("@/lib/auth", () => ({
  verifyAuth: vi.fn(),
  checkAdminRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), log: vi.fn() },
}));

import { GET } from "../route";
import { verifyAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const OWNER = { id: "admin-1", email: "owner@test.com", name: "Owner", role: "owner" };

const mockCount = prisma.contactMessage.count as ReturnType<typeof vi.fn>;

function createRequest(query = "") {
  return new NextRequest(`http://localhost/api/admin/messages${query}`, {
    method: "GET",
  } as never);
}

describe("GET /api/admin/messages 状态页签计数", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyAuth).mockResolvedValue(OWNER as never);
    (prisma.contactMessage.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    mockCount.mockImplementation(({ where }: { where?: Record<string, unknown> }) => {
      // 全局未读（无搜索/类型/备注筛选）
      if (where?.read === false && !where.OR) return Promise.resolve(4);
      // 当前筛选下的未读
      if (where?.read === false) return Promise.resolve(2);
      // 当前筛选下的全部
      return Promise.resolve(6);
    });
  });

  it("按筛选返回 counts，total 跟随当前 tab", async () => {
    const res = await GET(createRequest("?status=unread&search=foo"));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.data.counts).toEqual({ all: 6, unread: 2, read: 4 });
    expect(data.data.pagination.total).toBe(2);
    expect(data.data.unreadCount).toBe(4);
  });
});
