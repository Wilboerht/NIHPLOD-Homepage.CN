/**
 * external-identity 辅助模块单元测试
 * 覆盖：按 provider+subjectId 查找、UnionID 跨平台聚合查找、upsert 参数语义、前缀移除
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    externalIdentity: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";
import {
  findUserByIdentity,
  findUserByUnionId,
  upsertIdentity,
  removeIdentities,
} from "@/lib/external-identity";

const mockExternalIdentity = prisma.externalIdentity as unknown as {
  findUnique: ReturnType<typeof vi.fn>;
  findFirst: ReturnType<typeof vi.fn>;
  upsert: ReturnType<typeof vi.fn>;
  deleteMany: ReturnType<typeof vi.fn>;
};
const mockUser = prisma.user as unknown as { findUnique: ReturnType<typeof vi.fn> };

describe("external-identity 辅助模块", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("findUserByIdentity", () => {
    it("身份存在时应返回关联用户", async () => {
      mockExternalIdentity.findUnique.mockResolvedValue({ userId: "user-1" });
      mockUser.findUnique.mockResolvedValue({ id: "user-1", phone: "13800138000" });

      const user = await findUserByIdentity("wechat_miniprogram", "openid-1");

      expect(mockExternalIdentity.findUnique).toHaveBeenCalledWith({
        where: { provider_subjectId: { provider: "wechat_miniprogram", subjectId: "openid-1" } },
        select: { userId: true },
      });
      expect(user).toMatchObject({ id: "user-1" });
    });

    it("身份不存在时应返回 null 且不查用户表", async () => {
      mockExternalIdentity.findUnique.mockResolvedValue(null);

      const user = await findUserByIdentity("wechat_open", "openid-x");

      expect(user).toBeNull();
      expect(mockUser.findUnique).not.toHaveBeenCalled();
    });
  });

  describe("findUserByUnionId", () => {
    it("默认应跨 provider 查找（UnionID 聚合语义）", async () => {
      mockExternalIdentity.findFirst.mockResolvedValue({ userId: "user-2" });
      mockUser.findUnique.mockResolvedValue({ id: "user-2" });

      await findUserByUnionId("union-1");

      expect(mockExternalIdentity.findFirst).toHaveBeenCalledWith({
        where: { unionId: "union-1" },
        orderBy: { createdAt: "asc" },
        select: { userId: true },
      });
    });

    it("指定 provider 时应在 where 中限定", async () => {
      mockExternalIdentity.findFirst.mockResolvedValue(null);

      const user = await findUserByUnionId("union-1", "wechat_open");

      expect(mockExternalIdentity.findFirst).toHaveBeenCalledWith({
        where: { unionId: "union-1", provider: "wechat_open" },
        orderBy: { createdAt: "asc" },
        select: { userId: true },
      });
      expect(user).toBeNull();
    });
  });

  describe("upsertIdentity", () => {
    it("应以 [provider, subjectId] 为冲突键并携带 unionId/metadata", async () => {
      mockExternalIdentity.upsert.mockResolvedValue({ id: "ei-1" });

      await upsertIdentity("user-1", "wechat_mp", "openid-1", "union-1", {
        nickname: "测试",
        avatar: null,
      });

      expect(mockExternalIdentity.upsert).toHaveBeenCalledWith({
        where: { provider_subjectId: { provider: "wechat_mp", subjectId: "openid-1" } },
        update: { userId: "user-1", unionId: "union-1", metadata: { nickname: "测试", avatar: null } },
        create: {
          userId: "user-1",
          provider: "wechat_mp",
          subjectId: "openid-1",
          unionId: "union-1",
          metadata: { nickname: "测试", avatar: null },
        },
      });
    });

    it("unionId/metadata 为空时 update 不应携带这两个字段（避免覆盖已有值）", async () => {
      mockExternalIdentity.upsert.mockResolvedValue({ id: "ei-2" });

      await upsertIdentity("user-1", "wechat_open", "openid-2");

      const call = mockExternalIdentity.upsert.mock.calls[0][0];
      expect(call.update).toEqual({ userId: "user-1" });
      expect(call.create.unionId).toBeNull();
    });
  });

  describe("removeIdentities", () => {
    it("带前缀时应按 startsWith 移除并返回行数", async () => {
      mockExternalIdentity.deleteMany.mockResolvedValue({ count: 2 });

      const count = await removeIdentities("user-1", "wechat");

      expect(mockExternalIdentity.deleteMany).toHaveBeenCalledWith({
        where: { userId: "user-1", provider: { startsWith: "wechat" } },
      });
      expect(count).toBe(2);
    });

    it("不带前缀时应移除该用户全部外部身份", async () => {
      mockExternalIdentity.deleteMany.mockResolvedValue({ count: 3 });

      await removeIdentities("user-1");

      expect(mockExternalIdentity.deleteMany).toHaveBeenCalledWith({
        where: { userId: "user-1" },
      });
    });
  });
});
