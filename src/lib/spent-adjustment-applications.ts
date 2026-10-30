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
import { notifyNewSpentApplication } from "@/lib/admin-notify";
import { notifySpentApplicationSubmittedByAdmin } from "@/lib/spent-adjustment-notify";
import { normalizeOrderNo } from "@/lib/spent-order";
import {
  SPENT_CHANNELS,
  SPENT_CHANNEL_LABELS,
  SPENT_STATUS_LABELS,
  MAX_PENDING_PER_USER,
  MAX_CLAIMED_AMOUNT,
  MAX_IMAGES,
  MAX_ORDER_NO_LENGTH,
  MAX_DEALER_NAME_LENGTH,
  isValidSpentProofImageRef,
  isOwnedSpentProofImageRef,
} from "@/lib/spent-adjustment-meta";

// 提交申请 schema：经销渠道必填经销商名称
export const createSpentApplicationSchema = z
  .object({
    requestId: z
      .string()
      .trim()
      .min(8, "幂等键过短")
      .max(128, "幂等键过长")
      .regex(/^[A-Za-z0-9_-]+$/, "幂等键格式不正确")
      .optional(),
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
        // 允许三种引用：公开 URL / 站内路径 / 私有 bucket objectName（spent-adjustments/ 前缀）
        z.string().max(500, "图片地址过长").refine(isValidSpentProofImageRef, "图片地址格式不正确")
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
      source: true,
      reviewAmount: true,
      reviewNote: true,
      createdAt: true,
      reviewedAt: true,
    },
  });
}

export type CreateSpentApplicationResult =
  | {
      ok: true;
      application: { id: string; status: string; statusLabel: string };
      idempotent?: boolean;
    }
  | {
      ok: false;
      kind: "pending_limit" | "duplicate" | "invalid_image" | "order_imported" | "order_claimed";
    };

/** 管理员代客提交时的操作者信息（用于审计与通知区分来源） */
export interface SpentApplicationActor {
  adminId: string;
  adminName?: string;
  adminEmail?: string;
  adminRole?: string;
}

/**
 * 提交补录申请：事务内对用户行 SELECT FOR UPDATE 串行化同一用户的并发提交，
 * 防止并发绕过待审上限；订单号唯一约束冲突（P2002）映射为 duplicate。
 */
export async function createSpentApplication(params: {
  userId: string;
  input: CreateSpentApplicationInput;
  request?: NextRequest;
  /** 传入时表示管理员代客填写，审计记录管理员身份与目标用户 */
  actor?: SpentApplicationActor;
  /** 调用方已在路由层完成严格审计时置 true，避免重复写入 */
  skipAudit?: boolean;
}): Promise<CreateSpentApplicationResult> {
  const { userId, input, request, actor, skipAudit } = params;
  const { requestId, channel, orderNo, dealerName, amountClaimed, purchasedAt, images, note } =
    input;

  // 新提交的凭证只允许当前用户自己的本地私有 key，防止引用他人文件
  if (images?.some((image) => !isOwnedSpentProofImageRef(image, userId))) {
    return { ok: false, kind: "invalid_image" };
  }

  type ClaimResult =
    | { kind: "ok"; application: { id: string; status: string } }
    | { kind: "replay"; application: { id: string; status: string } }
    | { kind: "limit" }
    | { kind: "duplicate" }
    | { kind: "order_imported" }
    | { kind: "order_claimed" };

  let claim: ClaimResult;
  try {
    claim = await prisma.$transaction(async (tx): Promise<ClaimResult> => {
      // 同一用户串行化：待审上限检查 + 订单号大小写不敏感查重都依赖此锁
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;

      if (requestId) {
        const existing = await tx.spentAdjustmentApplication.findUnique({
          where: { userId_requestId: { userId, requestId } },
          select: { id: true, status: true },
        });
        if (existing) return { kind: "replay", application: existing };
      }

      // DB 部分唯一索引是大小写敏感的；这里补一次同一用户内
      // “忽略大小写”的活动申请查重，防止 ABC123 / abc123 被重复提交。
      const duplicate = await tx.spentAdjustmentApplication.findFirst({
        where: {
          userId,
          status: { in: ["PENDING", "APPROVED"] },
          orderNo: { equals: orderNo, mode: "insensitive" },
        },
        select: { id: true },
      });
      if (duplicate) return { kind: "duplicate" };

      // 跨来源预检：订单号已在 Excel 导入成功或被商城/其它来源占用时，
      // 即使创建成功也会在审核入账阶段失败，提前拒绝避免客服白填。
      const orderNoKey = normalizeOrderNo(orderNo);
      const [importedRow, orderClaim] = await Promise.all([
        tx.spentImportRow.findFirst({
          where: {
            userId,
            orderNo: { equals: orderNo, mode: "insensitive" },
            status: "SUCCESS",
            revertedAt: null,
          },
          select: { id: true },
        }),
        tx.spentOrderClaim.findUnique({
          where: { orderNoKey },
          select: { userId: true },
        }),
      ]);
      if (importedRow) return { kind: "order_imported" };
      if (orderClaim) return { kind: "order_claimed" };

      const pendingCount = await tx.spentAdjustmentApplication.count({
        where: { userId, status: "PENDING" },
      });
      if (pendingCount >= MAX_PENDING_PER_USER) return { kind: "limit" };

      const application = await tx.spentAdjustmentApplication.create({
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
          requestId: requestId ?? null,
          source: actor ? "ADMIN" : "USER",
          createdByAdminId: actor?.adminId ?? null,
        },
      });
      return { kind: "ok", application };
    });
  } catch (error) {
    // P2002 唯一约束冲突 = 并发提交撞上活动订单号索引或同一 requestId
    if ((error as { code?: string }).code === "P2002") {
      if (requestId) {
        const existing = await prisma.spentAdjustmentApplication.findUnique({
          where: { userId_requestId: { userId, requestId } },
          select: { id: true, status: true },
        });
        if (existing) {
          return {
            ok: true,
            idempotent: true,
            application: {
              id: existing.id,
              status: existing.status,
              statusLabel: SPENT_STATUS_LABELS[existing.status as keyof typeof SPENT_STATUS_LABELS],
            },
          };
        }
      }
      return { ok: false, kind: "duplicate" };
    }
    throw error;
  }

  if (claim.kind === "duplicate") {
    return { ok: false, kind: "duplicate" };
  }
  if (claim.kind === "order_imported") {
    return { ok: false, kind: "order_imported" };
  }
  if (claim.kind === "order_claimed") {
    return { ok: false, kind: "order_claimed" };
  }
  if (claim.kind === "limit") {
    return { ok: false, kind: "pending_limit" };
  }
  if (claim.kind === "replay") {
    return {
      ok: true,
      idempotent: true,
      application: {
        id: claim.application.id,
        status: claim.application.status,
        statusLabel:
          SPENT_STATUS_LABELS[claim.application.status as keyof typeof SPENT_STATUS_LABELS],
      },
    };
  }
  const application = claim.application;

  // 审计：管理员代填与用户自主提交使用不同 action，便于区分来源与追责
  const auditDetail = {
    channel: SPENT_CHANNEL_LABELS[channel],
    orderNo,
    dealerName: channel === "DEALER" ? dealerName : undefined,
    amountClaimed,
  };
  if (!skipAudit) {
    if (actor) {
      await createAuditLog({
        action: "admin_create_spent_adjustment",
        targetType: "spent_adjustment",
        targetId: application.id,
        detail: { ...auditDetail, targetUserId: userId },
        actorType: "ADMIN",
        actorEmail: actor.adminEmail,
        actorName: actor.adminName,
        actorRole: actor.adminRole,
        authMethod: "session",
        adminId: actor.adminId,
        request,
      });
    } else {
      await createAuditLog({
        action: "submit_spent_adjustment",
        targetType: "spent_adjustment",
        targetId: application.id,
        userId,
        detail: auditDetail,
        request,
      });
    }
  }

  // 管理端企业微信群通知（响应返回后异步发送）
  if (actor) {
    notifyNewSpentApplication(application.id, {
      onBehalfByName: actor.adminName || actor.adminEmail,
    });
    // 通知用户本人：客服已代其提交，等待审核
    notifySpentApplicationSubmittedByAdmin(application.id);
  } else {
    notifyNewSpentApplication(application.id);
  }

  return {
    ok: true,
    application: {
      id: application.id,
      status: application.status,
      statusLabel: SPENT_STATUS_LABELS[application.status as keyof typeof SPENT_STATUS_LABELS],
    },
  };
}
