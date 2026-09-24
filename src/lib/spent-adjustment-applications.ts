/**
 * 消费补录申请：用户端数据操作核心
 *
 * 会话路由（/api/user/spent-adjustments）与 OAuth 资源端点
 * （/api/oauth/spent-adjustments）共用，避免两套入口在校验、待审上限、
 * 订单号唯一性处理上出现分叉。
 */
import { z } from "zod";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit";
import {
  SPENT_CHANNELS,
  SPENT_CHANNEL_LABELS,
  SPENT_STATUS_LABELS,
  MAX_PENDING_PER_USER,
  MAX_CLAIMED_AMOUNT,
  MAX_IMAGES,
  MAX_ORDER_NO_LENGTH,
  MAX_DEALER_NAME_LENGTH,
} from "@/lib/spent-adjustment-meta";

// 提交申请 schema：经销渠道必填经销商名称
export const createSpentApplicationSchema = z
  .object({
    channel: z.enum(SPENT_CHANNELS),
    orderNo: z.string().trim().min(1, "请填写订单号或小票号").max(MAX_ORDER_NO_LENGTH, "单号过长"),
    dealerName: z.string().trim().max(MAX_DEALER_NAME_LENGTH, "经销商名称过长").optional(),
    amountClaimed: z.number().int().min(1).max(MAX_CLAIMED_AMOUNT).optional(),
    purchasedAt: z
      .string()
      .refine((v) => !Number.isNaN(Date.parse(v)), "消费日期格式不正确")
      .refine((v) => new Date(v).getTime() <= Date.now() + 24 * 3600 * 1000, "消费日期不能晚于今天")
      .optional(),
    images: z
      .array(
        z
          .string()
          .max(500, "图片地址过长")
          .refine((v) => /^https?:\/\//.test(v) || v.startsWith("/"), "图片地址格式不正确")
      )
      .max(MAX_IMAGES, `最多上传 ${MAX_IMAGES} 张凭证截图`)
      .optional(),
    note: z.string().trim().max(500, "备注过长").optional(),
  })
  .superRefine((data, ctx) => {
    if (data.channel === "DEALER" && !data.dealerName) {
      ctx.addIssue({
        code: "custom",
        path: ["dealerName"],
        message: "请填写经销商名称",
      });
    }
  });

export type CreateSpentApplicationInput = z.infer<typeof createSpentApplicationSchema>;

/** 我的补录申请列表（按创建时间倒序，最多 50 条） */
export async function listSpentApplications(userId: string) {
  return prisma.spentAdjustmentApplication.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      channel: true,
      orderNo: true,
      dealerName: true,
      amountClaimed: true,
      purchasedAt: true,
      images: true,
      note: true,
      status: true,
      reviewAmount: true,
      reviewNote: true,
      createdAt: true,
      reviewedAt: true,
    },
  });
}

export type CreateSpentApplicationResult =
  | { ok: true; application: { id: string; status: string; statusLabel: string } }
  | { ok: false; kind: "pending_limit" | "duplicate" };

/**
 * 提交补录申请：事务内对用户行 SELECT FOR UPDATE 串行化同一用户的并发提交，
 * 防止并发绕过待审上限；订单号唯一约束冲突（P2002）映射为 duplicate。
 */
export async function createSpentApplication(params: {
  userId: string;
  input: CreateSpentApplicationInput;
  request?: NextRequest;
}): Promise<CreateSpentApplicationResult> {
  const { userId, input, request } = params;
  const { channel, orderNo, dealerName, amountClaimed, purchasedAt, images, note } = input;

  let application: { id: string; status: string } | null = null;
  try {
    application = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;

      const pendingCount = await tx.spentAdjustmentApplication.count({
        where: { userId, status: "PENDING" },
      });
      if (pendingCount >= MAX_PENDING_PER_USER) return null;

      return tx.spentAdjustmentApplication.create({
        data: {
          userId,
          channel,
          orderNo,
          // 经销商名称仅在经销渠道下持久化
          dealerName: channel === "DEALER" ? dealerName || null : null,
          amountClaimed: amountClaimed ?? null,
          purchasedAt: purchasedAt ? new Date(purchasedAt) : null,
          images: images ?? [],
          note: note || null,
        },
      });
    });
  } catch (error) {
    // P2002 唯一约束冲突 = 该订单号已有待审/已通过申请
    if ((error as { code?: string }).code === "P2002") {
      return { ok: false, kind: "duplicate" };
    }
    throw error;
  }

  if (!application) {
    return { ok: false, kind: "pending_limit" };
  }

  // 审计（用户侧提交，记录 userId 便于追溯）
  await createAuditLog({
    action: "submit_spent_adjustment",
    targetType: "spent_adjustment",
    targetId: application.id,
    userId,
    detail: {
      channel: SPENT_CHANNEL_LABELS[channel],
      orderNo,
      dealerName: channel === "DEALER" ? dealerName : undefined,
      amountClaimed,
    },
    request,
  });

  return {
    ok: true,
    application: {
      id: application.id,
      status: application.status,
      statusLabel: SPENT_STATUS_LABELS[application.status as keyof typeof SPENT_STATUS_LABELS],
    },
  };
}
