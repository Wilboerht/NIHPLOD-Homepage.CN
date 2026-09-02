/**
 * 消费补录申请 API（用户端）
 * GET  /api/user/spent-adjustments - 查询我的补录申请列表
 * POST /api/user/spent-adjustments - 提交消费补录申请（全渠道凭证）
 *
 * 审核规则：管理员人工审核，通过后以核实金额累加历史消费并重算会员等级；
 * 同一订单号在待审/已通过状态下全局唯一，驳回后可重新提交。
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withUserAuth } from "@/lib/auth";
import { rateLimit } from "@/lib/ratelimit";
import { apiConsole } from "@/lib/logger";
import { createAuditLog } from "@/lib/audit";
import {
  SPENT_CHANNELS,
  SPENT_CHANNEL_LABELS,
  SPENT_STATUS_LABELS,
  MAX_PENDING_PER_USER,
  MAX_CLAIMED_AMOUNT,
  MAX_IMAGES,
  MAX_ORDER_NO_LENGTH,
} from "@/lib/spent-adjustments";

export const dynamic = "force-dynamic";

// 提交申请 schema
const createSchema = z.object({
  channel: z.enum(SPENT_CHANNELS),
  orderNo: z.string().trim().min(1, "请填写订单号或小票号").max(MAX_ORDER_NO_LENGTH, "单号过长"),
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
});

// GET - 查询我的补录申请列表
export const GET = withUserAuth(async (_request: NextRequest, payload) => {
  try {
    const applications = await prisma.spentAdjustmentApplication.findMany({
      where: { userId: payload.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        channel: true,
        orderNo: true,
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

    return NextResponse.json({ success: true, data: { applications } });
  } catch (error) {
    apiConsole.error("[SpentAdjustment] 查询申请失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
});

// POST - 提交消费补录申请
export const POST = withUserAuth(async (request: NextRequest, payload) => {
  try {
    // 用户级提交限流（防批量刷单）
    const submitLimit = await rateLimit(`user-adjust-submit:${payload.id}`, "default", {
      maxRequests: 10,
      windowMs: 60 * 60 * 1000,
    });
    if (!submitLimit.success) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "RATE_LIMITED", message: "提交过于频繁，请稍后再试" },
        },
        { status: 429 }
      );
    }

    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "INVALID_PARAMS", message: parsed.error.issues[0]?.message || "参数错误" },
        },
        { status: 400 }
      );
    }

    const { channel, orderNo, amountClaimed, purchasedAt, images, note } = parsed.data;

    // 待审核数量硬限制：事务内对用户行 SELECT FOR UPDATE，
    // 串行化同一用户的并发提交，防止并发绕过上限。
    const application = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${payload.id} FOR UPDATE`;

      const pendingCount = await tx.spentAdjustmentApplication.count({
        where: { userId: payload.id, status: "PENDING" },
      });
      if (pendingCount >= MAX_PENDING_PER_USER) {
        return null;
      }

      return tx.spentAdjustmentApplication.create({
        data: {
          userId: payload.id,
          channel,
          orderNo,
          amountClaimed: amountClaimed ?? null,
          purchasedAt: purchasedAt ? new Date(purchasedAt) : null,
          images: images ?? [],
          note: note || null,
        },
      });
    });

    if (!application) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "PENDING_LIMIT",
            message: `最多同时有 ${MAX_PENDING_PER_USER} 条待审核申请，请等待审核完成后再提交`,
          },
        },
        { status: 400 }
      );
    }

    // 审计（用户侧提交，记录 userId 便于追溯）
    await createAuditLog({
      action: "submit_spent_adjustment",
      targetType: "spent_adjustment",
      targetId: application.id,
      userId: payload.id,
      detail: { channel: SPENT_CHANNEL_LABELS[channel], orderNo, amountClaimed },
      request,
    });

    return NextResponse.json({
      success: true,
      data: {
        application: {
          id: application.id,
          status: application.status,
          statusLabel: SPENT_STATUS_LABELS[application.status],
        },
      },
    });
  } catch (error) {
    // P2002 唯一约束冲突 = 该订单号已有待审/已通过申请
    if ((error as { code?: string }).code === "P2002") {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "ORDER_NO_DUPLICATE",
            message: "该订单号已有待审核或已通过的申请，请勿重复提交",
          },
        },
        { status: 409 }
      );
    }
    apiConsole.error("[SpentAdjustment] 提交申请失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
});
