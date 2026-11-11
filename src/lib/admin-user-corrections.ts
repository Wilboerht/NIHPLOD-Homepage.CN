import type { NextRequest } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { createAuditLogTx, type AuditAction, type AuditTargetType } from "@/lib/audit";
import { prepareAvatarReplacement } from "@/lib/avatar-assets";
import { addressFieldsSchema, MAX_ADDRESSES } from "@/lib/user-address";
import type { UpdateProfileInput } from "@/lib/profile-schema";
import type { AdminUser } from "@/types/auth";
import { z } from "zod";

export class AdminCorrectionError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400
  ) {
    super(message);
  }
}

type Tx = Prisma.TransactionClient;
type AddressInput = z.infer<typeof addressFieldsSchema>;

interface CorrectionContext {
  admin: AdminUser;
  request: NextRequest;
  reason: string;
}

async function auditTx(
  tx: Tx,
  ctx: CorrectionContext,
  action: AuditAction,
  targetType: AuditTargetType,
  targetId: string,
  detail: Record<string, unknown>
): Promise<void> {
  await createAuditLogTx(tx, {
    action,
    targetType,
    targetId,
    detail: { ...detail, reason: ctx.reason },
    actorType: "ADMIN",
    actorEmail: ctx.admin.email,
    actorName: ctx.admin.name,
    actorRole: ctx.admin.role,
    authMethod: "step_up",
    adminId: ctx.admin.id,
    request: ctx.request,
  });
}

async function lockActiveRecordUser(tx: Tx, userId: string) {
  const users = await tx.$queryRaw<{ status: string }[]>`
    SELECT status FROM "User" WHERE id = ${userId} FOR UPDATE
  `;
  if (!users[0]) throw new AdminCorrectionError("NOT_FOUND", "用户不存在", 404);
  if (users[0].status === "DELETED") {
    throw new AdminCorrectionError("USER_DELETED", "已注销用户不可修改", 409);
  }
  return users[0];
}

export async function correctUserProfile(
  userId: string,
  input: UpdateProfileInput,
  ctx: CorrectionContext
) {
  return prisma.$transaction(async (tx) => {
    await lockActiveRecordUser(tx, userId);
    const previous = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        nickname: true,
        avatar: true,
        birthday: true,
        gender: true,
      },
    });
    const nextBirthday =
      input.birthday === undefined ? undefined : input.birthday === "" ? null : input.birthday;
    const changedFields = [
      input.nickname !== undefined && (input.nickname || null) !== previous.nickname
        ? "nickname"
        : null,
      input.avatar !== undefined && (input.avatar || null) !== previous.avatar ? "avatar" : null,
      nextBirthday !== undefined &&
      (nextBirthday?.getTime() ?? null) !== (previous.birthday?.getTime() ?? null)
        ? "birthday"
        : null,
      input.gender !== undefined && input.gender !== previous.gender ? "gender" : null,
    ].filter((field): field is string => Boolean(field));

    if (changedFields.length === 0) return { changedFields, user: previous };
    if (input.avatar !== undefined && changedFields.includes("avatar")) {
      await prepareAvatarReplacement(tx, {
        userId,
        nextAvatar: input.avatar || null,
        allowInactive: true,
      });
    }
    const user = await tx.user.update({
      where: { id: userId },
      data: {
        ...(input.nickname !== undefined ? { nickname: input.nickname || null } : {}),
        ...(input.avatar !== undefined ? { avatar: input.avatar || null } : {}),
        ...(nextBirthday !== undefined
          ? { birthday: nextBirthday, birthdayLocked: nextBirthday !== null }
          : {}),
        ...(input.gender !== undefined ? { gender: input.gender } : {}),
      },
      select: {
        nickname: true,
        avatar: true,
        birthday: true,
        birthdayLocked: true,
        gender: true,
      },
    });
    await auditTx(tx, ctx, "user_profile_admin_update", "user", userId, { changedFields });
    return { changedFields, user };
  });
}

export async function createUserAddressByAdmin(
  userId: string,
  input: AddressInput,
  ctx: CorrectionContext
) {
  return prisma.$transaction(async (tx) => {
    await lockActiveRecordUser(tx, userId);
    const count = await tx.userAddress.count({ where: { userId } });
    if (count >= MAX_ADDRESSES) {
      throw new AdminCorrectionError("ADDRESS_LIMIT", `最多保存 ${MAX_ADDRESSES} 个收货地址`);
    }
    const makeDefault = input.isDefault === true || count === 0;
    if (makeDefault) {
      await tx.userAddress.updateMany({
        where: { userId, isDefault: true },
        data: { isDefault: false },
      });
    }
    const address = await tx.userAddress.create({
      data: {
        userId,
        recipient: input.recipient,
        phone: input.phone,
        region: input.region,
        detail: input.detail,
        isDefault: makeDefault,
      },
    });
    await auditTx(tx, ctx, "user_address_admin_create", "user", userId, {
      addressId: address.id,
      isDefault: makeDefault,
    });
    return address;
  });
}

export async function updateUserAddressByAdmin(
  userId: string,
  addressId: string,
  input: AddressInput,
  ctx: CorrectionContext
) {
  return prisma.$transaction(async (tx) => {
    await lockActiveRecordUser(tx, userId);
    const current = await tx.userAddress.findFirst({ where: { id: addressId, userId } });
    if (!current) throw new AdminCorrectionError("NOT_FOUND", "收货地址不存在", 404);
    if (input.isDefault === true) {
      await tx.userAddress.updateMany({
        where: { userId, isDefault: true, id: { not: addressId } },
        data: { isDefault: false },
      });
    }
    const address = await tx.userAddress.update({
      where: { id: addressId },
      data: {
        recipient: input.recipient,
        phone: input.phone,
        region: input.region,
        detail: input.detail,
        ...(input.isDefault !== undefined ? { isDefault: input.isDefault } : {}),
      },
    });
    if (current.isDefault && input.isDefault === false) {
      const earliest = await tx.userAddress.findFirst({
        where: { userId, id: { not: addressId } },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });
      if (earliest) {
        await tx.userAddress.update({ where: { id: earliest.id }, data: { isDefault: true } });
      }
    }
    await auditTx(tx, ctx, "user_address_admin_update", "user", userId, { addressId });
    return address;
  });
}

export async function deleteUserAddressByAdmin(
  userId: string,
  addressId: string,
  ctx: CorrectionContext
) {
  return prisma.$transaction(async (tx) => {
    await lockActiveRecordUser(tx, userId);
    const current = await tx.userAddress.findFirst({ where: { id: addressId, userId } });
    if (!current) throw new AdminCorrectionError("NOT_FOUND", "收货地址不存在", 404);
    await tx.userAddress.delete({ where: { id: addressId } });
    if (current.isDefault) {
      const earliest = await tx.userAddress.findFirst({
        where: { userId },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });
      if (earliest) {
        await tx.userAddress.update({ where: { id: earliest.id }, data: { isDefault: true } });
      }
    }
    await auditTx(tx, ctx, "user_address_admin_delete", "user", userId, { addressId });
  });
}

export async function correctRedemptionRecipient(
  redemptionId: string,
  input: AddressInput,
  requestId: string,
  ctx: CorrectionContext
) {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ userId: string; status: string }[]>`
      SELECT "userId", status FROM "PointRedemption" WHERE id = ${redemptionId} FOR UPDATE
    `;
    const current = rows[0];
    if (!current) throw new AdminCorrectionError("NOT_FOUND", "兑换记录不存在", 404);
    if (current.status !== "PENDING") {
      throw new AdminCorrectionError("INVALID_STATUS", "仅待履约兑换可修改收货信息", 409);
    }
    const redemption = await tx.pointRedemption.findUniqueOrThrow({
      where: { id: redemptionId },
      select: { recipient: true, phone: true, address: true },
    });
    const fullAddress = `${input.region} ${input.detail}`;
    const changedFields = [
      redemption.recipient !== input.recipient ? "recipient" : null,
      redemption.phone !== input.phone ? "phone" : null,
      redemption.address !== fullAddress ? "address" : null,
    ].filter((field): field is string => Boolean(field));
    if (changedFields.length === 0) return { changedFields };
    const updated = await tx.pointRedemption.update({
      where: { id: redemptionId },
      data: {
        recipient: input.recipient,
        phone: input.phone,
        address: fullAddress,
      },
      select: { id: true, status: true },
    });
    await tx.pointRedemptionEvent.create({
      data: {
        redemptionId,
        fromStatus: "PENDING",
        toStatus: "PENDING",
        actorType: "ADMIN",
        actorId: ctx.admin.id,
        reasonCode: "admin_recipient_correction",
        reasonText: ctx.reason,
        metadata: { changedFields },
        idempotencyKey: `redemption-recipient-correction:${redemptionId}:${requestId}`,
      },
    });
    await auditTx(tx, ctx, "point_redemption_recipient_update", "point_redemption", redemptionId, {
      userId: current.userId,
      changedFields,
    });
    return { changedFields, redemption: updated };
  });
}
