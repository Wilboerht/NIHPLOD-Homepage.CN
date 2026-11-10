/**
 * 密码策略服务端函数
 * 依赖 Prisma / 数据库，禁止在客户端组件中引用。
 */
import bcrypt from "bcryptjs";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "./prisma";
import {
  PASSWORD_HISTORY_LIMIT,
  TEMP_PASSWORD_EXPIRY_HOURS,
  hashPassword,
  getPasswordExpiryDate,
} from "./password";

type PasswordDb = Pick<Prisma.TransactionClient, "user" | "passwordHistory">;

/**
 * 记录密码历史
 * 写入当前哈希，并仅保留最近 limit 条记录。
 */
export async function recordPasswordHistory(
  userId: string,
  hashedPassword: string,
  limit = PASSWORD_HISTORY_LIMIT
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.passwordHistory.create({
      data: { userId, password: hashedPassword },
    });

    const histories = await tx.passwordHistory.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });

    if (histories.length > limit) {
      const idsToDelete = histories.slice(limit).map((h) => h.id);
      await tx.passwordHistory.deleteMany({
        where: { id: { in: idsToDelete } },
      });
    }
  });
}

/**
 * 检查密码是否在最近历史密码中
 * @returns true 表示命中历史（即新密码与历史密码重复，不能使用）
 */
export async function checkPasswordHistory(
  userId: string,
  password: string,
  limit = PASSWORD_HISTORY_LIMIT
): Promise<boolean> {
  const histories = await prisma.passwordHistory.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { password: true },
  });

  for (const record of histories) {
    if (await bcrypt.compare(password, record.password)) {
      return true;
    }
  }

  return false;
}
/**
 * 更新用户密码（含密码策略）。
 *
 * 自动完成：
 * 1. 检查密码是否在最近历史密码中（可选跳过）
 * 2. 哈希新密码
 * 3. 更新 user.password / passwordChangedAt / passwordExpiresAt
 * 4. 记录密码历史并清理旧记录
 *
 * 返回 { success: true } 或 { success: false, errorCode, errorMessage }。
 */
export async function updateUserPassword(
  userId: string,
  newPassword: string,
  options: { skipHistoryCheck?: boolean; temporary?: boolean; tx?: PasswordDb } = {}
): Promise<{ success: boolean; errorCode?: string; errorMessage?: string }> {
  if (!options.skipHistoryCheck) {
    const reused = await checkPasswordHistory(userId, newPassword);
    if (reused) {
      return {
        success: false,
        errorCode: "PASSWORD_HISTORY_REUSED",
        errorMessage: "新密码不能是最近使用过的密码",
      };
    }
  }

  const hashedPassword = await hashPassword(newPassword);
  const changedAt = new Date();
  const expiresAt = options.temporary
    ? new Date(changedAt.getTime() + TEMP_PASSWORD_EXPIRY_HOURS * 60 * 60 * 1000)
    : getPasswordExpiryDate();

  const persist = async (db: PasswordDb) => {
    await db.user.update({
      where: { id: userId },
      data: {
        password: hashedPassword,
        passwordChangedAt: changedAt,
        passwordExpiresAt: expiresAt,
        passwordChangeRequired: options.temporary === true,
      },
    });

    await db.passwordHistory.create({
      data: { userId, password: hashedPassword },
    });

    const histories = await db.passwordHistory.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });

    if (histories.length > PASSWORD_HISTORY_LIMIT) {
      const idsToDelete = histories.slice(PASSWORD_HISTORY_LIMIT).map((h) => h.id);
      await db.passwordHistory.deleteMany({
        where: { id: { in: idsToDelete } },
      });
    }
  };

  if (options.tx) {
    await persist(options.tx);
  } else {
    await prisma.$transaction(persist);
  }

  return { success: true };
}
