import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockUpsert = vi.fn();
const mockFindUnique = vi.fn();
const mockDeleteMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    tokenBlacklist: {
      upsert: (...args: unknown[]) => mockUpsert(...args),
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      deleteMany: (...args: unknown[]) => mockDeleteMany(...args),
    },
  },
}));

describe("token-blacklist-store", () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    vi.resetModules();
    originalEnv = process.env.TOKEN_BLACKLIST_STORAGE;
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env.TOKEN_BLACKLIST_STORAGE = originalEnv;
  });

  describe("MemoryTokenBlacklistStore", () => {
    it("应支持撤销 access_token 并检查", async () => {
      process.env.TOKEN_BLACKLIST_STORAGE = "memory";
      const { tokenBlacklistStore: store } = await import("@/lib/token-blacklist-store");
      await store.revokeAccessToken("jti-1");
      expect(await store.isAccessTokenRevoked("jti-1")).toBe(true);
      expect(await store.isAccessTokenRevoked("jti-2")).toBe(false);
    });

    it("应支持拉黑/解黑用户", async () => {
      process.env.TOKEN_BLACKLIST_STORAGE = "memory";
      const { tokenBlacklistStore: store } = await import("@/lib/token-blacklist-store");
      await store.blacklistUser("user-1", "fraud");
      expect(await store.isUserBlacklisted("user-1")).toEqual({ reason: "fraud" });
      await store.removeUserBlacklist("user-1");
      expect(await store.isUserBlacklisted("user-1")).toBeNull();
    });
  });

  describe("DatabaseTokenBlacklistStore", () => {
    it("应通过 upsert 撤销 access_token", async () => {
      process.env.TOKEN_BLACKLIST_STORAGE = "database";
      mockUpsert.mockResolvedValue({});
      const { tokenBlacklistStore: store } = await import("@/lib/token-blacklist-store");
      await store.revokeAccessToken("jti-1", Date.now() + 1000);
      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { key: "at:jti-1" },
          create: expect.objectContaining({ type: "access_token", key: "at:jti-1" }),
        })
      );
    });

    it("应查询 access_token 是否已撤销", async () => {
      process.env.TOKEN_BLACKLIST_STORAGE = "database";
      mockFindUnique.mockResolvedValue({ type: "access_token" });
      const { tokenBlacklistStore: store } = await import("@/lib/token-blacklist-store");
      expect(await store.isAccessTokenRevoked("jti-1")).toBe(true);
    });

    it("过期 access_token 记录应视为未撤销", async () => {
      process.env.TOKEN_BLACKLIST_STORAGE = "database";
      mockFindUnique.mockResolvedValue({ type: "access_token", expiresAt: new Date(Date.now() - 1000) });
      const { tokenBlacklistStore: store } = await import("@/lib/token-blacklist-store");
      expect(await store.isAccessTokenRevoked("jti-1")).toBe(false);
    });

    it("应支持拉黑用户", async () => {
      process.env.TOKEN_BLACKLIST_STORAGE = "database";
      mockUpsert.mockResolvedValue({});
      const { tokenBlacklistStore: store } = await import("@/lib/token-blacklist-store");
      await store.blacklistUser("user-1", "fraud");
      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { key: "user:user-1" },
          create: expect.objectContaining({ type: "user", key: "user:user-1", reason: "fraud" }),
        })
      );
    });

    it("应查询用户是否在黑名单中", async () => {
      process.env.TOKEN_BLACKLIST_STORAGE = "database";
      mockFindUnique.mockResolvedValue({ type: "user", reason: "fraud", expiresAt: new Date(Date.now() + 1000) });
      const { tokenBlacklistStore: store } = await import("@/lib/token-blacklist-store");
      expect(await store.isUserBlacklisted("user-1")).toEqual({ reason: "fraud" });
    });

    it("应删除用户黑名单记录", async () => {
      process.env.TOKEN_BLACKLIST_STORAGE = "database";
      mockDeleteMany.mockResolvedValue({ count: 1 });
      const { tokenBlacklistStore: store } = await import("@/lib/token-blacklist-store");
      await store.removeUserBlacklist("user-1");
      expect(mockDeleteMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { type: "user", key: "user:user-1" } })
      );
    });
  });
});
