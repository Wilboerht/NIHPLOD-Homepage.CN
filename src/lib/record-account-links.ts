import type { NextRequest } from "next/server";
import { verifyUserAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createAuditLogTx } from "@/lib/audit";
import { apiConsole } from "@/lib/logger";
import type { AdminUser } from "@/types/auth";

export async function resolveAuthenticatedUserIdForPhone(
  request: NextRequest,
  phone: string
): Promise<string | null> {
  try {
    const auth = await verifyUserAuth(request);
    if (!auth) return null;
    const user = await prisma.user.findFirst({
      where: { id: auth.id, phone, status: "ACTIVE" },
      select: { id: true },
    });
    return user?.id ?? null;
  } catch (error) {
    apiConsole.warn("[RecordAccountLink] 可选账户关联失败:", error);
    return null;
  }
}

export class RecordLinkError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400
  ) {
    super(message);
  }
}

export async function linkRecordToUser(input: {
  kind: "message" | "application";
  recordId: string;
  userId: string | null;
  expectedUserId?: string | null;
  reason: string;
  admin: AdminUser;
  request: NextRequest;
}) {
  return prisma.$transaction(async (tx) => {
    const existing =
      input.kind === "message"
        ? await tx.contactMessage.findUnique({
            where: { id: input.recordId },
            select: { id: true, userId: true, phone: true },
          })
        : await tx.jobApplication.findUnique({
            where: { id: input.recordId },
            select: { id: true, userId: true, phone: true },
          });
    if (!existing) throw new RecordLinkError("NOT_FOUND", "记录不存在", 404);
    if (input.expectedUserId !== undefined && existing.userId !== input.expectedUserId) {
      throw new RecordLinkError("STALE_UPDATE", "账户关联已被其他管理员修改，请刷新", 409);
    }
    if (existing.userId === input.userId) return { userId: existing.userId, changed: false };

    if (input.userId) {
      const locked = await tx.$queryRaw<{ phone: string; status: string }[]>`
        SELECT phone, status FROM "User" WHERE id = ${input.userId} FOR UPDATE
      `;
      const target = locked[0];
      if (!target || target.status === "DELETED") {
        throw new RecordLinkError("TARGET_NOT_FOUND", "目标用户不存在或已注销", 404);
      }
      if (target.phone !== existing.phone) {
        throw new RecordLinkError("PHONE_MISMATCH", "目标账户手机号与该记录不一致，不能关联", 409);
      }
    }

    const updated =
      input.kind === "message"
        ? await tx.contactMessage.updateMany({
            where: { id: input.recordId, userId: existing.userId },
            data: { userId: input.userId },
          })
        : await tx.jobApplication.updateMany({
            where: { id: input.recordId, userId: existing.userId },
            data: { userId: input.userId },
          });
    if (updated.count !== 1) {
      throw new RecordLinkError("STALE_UPDATE", "账户关联已变化，请刷新", 409);
    }
    await createAuditLogTx(tx, {
      action: input.kind === "message" ? "message_user_link" : "application_user_link",
      targetType: input.kind,
      targetId: input.recordId,
      detail: {
        previousUserId: existing.userId,
        userId: input.userId,
        reason: input.reason,
      },
      actorType: "ADMIN",
      actorEmail: input.admin.email,
      actorName: input.admin.name,
      actorRole: input.admin.role,
      authMethod: "step_up",
      adminId: input.admin.id,
      request: input.request,
    });
    return { userId: input.userId, changed: true };
  });
}
