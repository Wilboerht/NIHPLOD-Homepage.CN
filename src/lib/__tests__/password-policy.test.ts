/**
 * 密码策略服务端函数测试
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  updateUserPassword,
  recordPasswordHistory,
  checkPasswordHistory,
} from "@/lib/password-policy";
import { hashPassword } from "@/lib/password";

const mocks = vi.hoisted(() => ({
  userUpdate: vi.fn(),
  passwordHistoryCreate: vi.fn(),
  passwordHistoryFindMany: vi.fn(),
  passwordHistoryDeleteMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      update: mocks.userUpdate,
    },
    passwordHistory: {
      create: mocks.passwordHistoryCreate,
      findMany: mocks.passwordHistoryFindMany,
      deleteMany: mocks.passwordHistoryDeleteMany,
    },
    $transaction: vi.fn((cb: (tx: unknown) => Promise<unknown>) =>
      cb({
        user: { update: mocks.userUpdate },
        passwordHistory: {
          create: mocks.passwordHistoryCreate,
          findMany: mocks.passwordHistoryFindMany,
          deleteMany: mocks.passwordHistoryDeleteMany,
        },
      })
    ),
  },
}));

describe("password-policy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("updateUserPassword", () => {
    it("应拒绝与历史密码重复的新密码", async () => {
      const password = "MyP@ssw0rd";
      const hashed = await hashPassword(password);
      mocks.passwordHistoryFindMany.mockResolvedValue([{ password: hashed }]);

      const result = await updateUserPassword("user-1", password);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe("PASSWORD_HISTORY_REUSED");
      expect(mocks.userUpdate).not.toHaveBeenCalled();
    });

    it("应成功更新密码并记录历史", async () => {
      const oldHashed = await hashPassword("OldP@ssw0rd");
      mocks.passwordHistoryFindMany.mockResolvedValue([
        { id: "h1", password: oldHashed },
        { id: "h2", password: oldHashed },
        { id: "h3", password: oldHashed },
        { id: "h4", password: oldHashed },
        { id: "h5", password: oldHashed },
        { id: "h6", password: oldHashed },
      ]);

      const result = await updateUserPassword("user-1", "MyP@ssw0rd");

      expect(result.success).toBe(true);
      expect(mocks.userUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "user-1" },
          data: expect.objectContaining({
            password: expect.any(String),
            passwordChangedAt: expect.any(Date),
            passwordExpiresAt: expect.any(Date),
          }),
        })
      );
      expect(mocks.passwordHistoryCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { userId: "user-1", password: expect.any(String) },
        })
      );
      expect(mocks.passwordHistoryDeleteMany).toHaveBeenCalledWith({
        where: { id: { in: ["h6"] } },
      });
    });
  });

  describe("recordPasswordHistory", () => {
    it("应创建记录并清理超出限制的旧记录", async () => {
      mocks.passwordHistoryFindMany.mockResolvedValue([
        { id: "h1" },
        { id: "h2" },
        { id: "h3" },
        { id: "h4" },
        { id: "h5" },
        { id: "h6" },
      ]);

      await recordPasswordHistory("user-1", "hashed-password", 5);

      expect(mocks.passwordHistoryCreate).toHaveBeenCalledWith({
        data: { userId: "user-1", password: "hashed-password" },
      });
      expect(mocks.passwordHistoryDeleteMany).toHaveBeenCalledWith({
        where: { id: { in: ["h6"] } },
      });
    });
  });

  describe("checkPasswordHistory", () => {
    it("历史为空时应返回 false", async () => {
      mocks.passwordHistoryFindMany.mockResolvedValue([]);
      const result = await checkPasswordHistory("user-1", "AnyPass1");
      expect(result).toBe(false);
    });
  });
});
