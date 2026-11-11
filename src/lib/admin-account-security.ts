import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAuditLogTx } from "@/lib/audit";
import { hashIdentifier } from "@/lib/auth-security";
import { enqueueSecurityActionNotification } from "@/lib/security-notify";
import { maskPhone } from "@/lib/mask-phone";
import { apiConsole } from "@/lib/logger";
import type { AdminUser } from "@/types/auth";

export class AccountSecurityError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 409
  ) {
    super(message);
  }
}

export async function getPhoneChangePreflight(userId: string, newPhone: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, phone: true, status: true, nickname: true },
  });
  if (!user) throw new AccountSecurityError("NOT_FOUND", "用户不存在", 404);
  if (user.status === "DELETED") {
    throw new AccountSecurityError("USER_DELETED", "已注销用户不可换绑手机号");
  }
  if (user.phone === newPhone) {
    throw new AccountSecurityError("NO_CHANGE", "新手机号与当前手机号相同", 400);
  }
  const occupant = await prisma.user.findUnique({
    where: { phone: newPhone },
    select: { id: true, status: true, nickname: true },
  });
  return {
    userId,
    currentPhone: maskPhone(user.phone),
    currentPhoneHash: hashIdentifier(user.phone),
    status: user.status,
    newPhone,
    available: !occupant,
    occupant: occupant
      ? { id: occupant.id, status: occupant.status, nickname: occupant.nickname }
      : null,
  };
}

export async function changeUserPhoneByAdmin(input: {
  userId: string;
  newPhone: string;
  expectedPhoneHash: string;
  reason: string;
  actor: Pick<AdminUser, "id"> & { email: string; name: string; role: string };
  request?: NextRequest;
  approvalId?: string;
}) {
  const now = new Date();
  const result = await prisma.$transaction(async (tx) => {
    const users = await tx.$queryRaw<{ phone: string; status: string }[]>`
      SELECT phone, status FROM "User" WHERE id = ${input.userId} FOR UPDATE
    `;
    const user = users[0];
    if (!user) throw new AccountSecurityError("NOT_FOUND", "用户不存在", 404);
    if (user.status === "DELETED") {
      throw new AccountSecurityError("USER_DELETED", "已注销用户不可换绑手机号");
    }
    if (hashIdentifier(user.phone) !== input.expectedPhoneHash) {
      throw new AccountSecurityError("STALE", "当前手机号已变化，请重新预检");
    }
    if (user.phone === input.newPhone) {
      throw new AccountSecurityError("NO_CHANGE", "新手机号与当前手机号相同", 400);
    }
    const occupied = await tx.user.findUnique({
      where: { phone: input.newPhone },
      select: { id: true },
    });
    if (occupied) {
      throw new AccountSecurityError(
        "PHONE_OCCUPIED",
        "新手机号已绑定其他账户，请先完成账户合并或由对方换绑"
      );
    }
    await tx.user.update({
      where: { id: input.userId },
      data: {
        phone: input.newPhone,
        phoneVerified: true,
        sessionsInvalidatedAt: now,
      },
    });
    await tx.refreshToken.updateMany({
      where: { userId: input.userId, revokedAt: null },
      data: { revokedAt: now, revokedReason: "admin_phone_change" },
    });
    await tx.oAuthSession.updateMany({
      where: { userId: input.userId, revokedAt: null },
      data: { revokedAt: now },
    });
    await createAuditLogTx(tx, {
      action: "user_phone_changed",
      targetType: "user",
      targetId: input.userId,
      targetLabel: maskPhone(input.newPhone),
      detail: {
        previousPhone: maskPhone(user.phone),
        newPhone: maskPhone(input.newPhone),
        reason: input.reason,
        approvalId: input.approvalId ?? null,
      },
      actorType: "ADMIN",
      actorEmail: input.actor.email,
      actorName: input.actor.name,
      actorRole: input.actor.role,
      authMethod: input.approvalId ? "approval" : "step_up",
      adminId: input.actor.id,
      request: input.request,
    });
    return { previousPhone: user.phone };
  });

  const reference = input.approvalId ?? `direct:${now.getTime()}`;
  await Promise.all([
    enqueueSecurityActionNotification({
      userId: input.userId,
      phone: result.previousPhone,
      action: "账户手机号已由客服换绑，原手机号不再用于登录",
      reference: `phone-change-old:${reference}`,
    }),
    enqueueSecurityActionNotification({
      userId: input.userId,
      phone: input.newPhone,
      action: "账户手机号已由客服换绑，请使用新手机号登录",
      reference: `phone-change-new:${reference}`,
    }),
  ]).catch((error) => apiConsole.warn("[AdminPhoneChange] 通知入队失败:", error));
  return { userId: input.userId, phone: input.newPhone, sessionsRevoked: true };
}
