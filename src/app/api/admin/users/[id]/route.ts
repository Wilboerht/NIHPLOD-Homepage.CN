/**
 * 管理端用户详情 API
 * GET /api/admin/users/:id - 聚合返回用户档案：
 *   基础信息（手机号脱敏）+ 积分与兑换 + 收货地址 + 消费补录记录 + 等级成长
 * POST /api/admin/users/:id/reveal-phone - 显示完整手机号（敏感操作，写审计）
 */
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { createAuditLog } from "@/lib/audit";
import { recordSsoEvent } from "@/lib/sso-audit";
import { getClientIP } from "@/lib/ratelimit";
import { apiConsole } from "@/lib/logger";
import { z } from "zod";
import type { UserStatus } from "@/generated/prisma/client";
import { validateCUID, invalidIdResponse } from "@/lib/validation";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { cascadeUserStatusChange } from "@/lib/user-status";
import { maskPhone, maskAddress, maskIdentifier } from "@/lib/mask-phone";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { hashIdentifier } from "@/lib/auth-security";
import { executeAccountDeletion, DELETION_STATUS } from "@/lib/account-deletion";

type RouteContext = { params: Promise<{ id: string }> };

// 详情聚合各分区的记录上限（完整历史走独立查询，此处只做档案快照展示）
const RECENT_LIMIT = 20;

// 详情查看审计合并窗口：同一管理员查看同一用户 5 分钟内只记一条
const DETAIL_VIEW_AUDIT_WINDOW_MS = 5 * 60 * 1000;

// 强制动态渲染，禁止静态预渲染
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权" } },
        { status: 401 }
      );
    }

    if (!hasAdminPermission(admin, "users:read")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "权限不足：用户查看" } },
        { status: 403 }
      );
    }

    const rateLimitResponse = await checkAdminRateLimit(request, "user:read");
    if (rateLimitResponse) return rateLimitResponse;

    const { id } = await context.params;

    if (!validateCUID(id)) {
      return invalidIdResponse();
    }

    // 先查用户本体：不存在直接 404，省去后续 6 个分区查询
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        phone: true,
        phoneVerified: true,
        nickname: true,
        avatar: true,
        status: true,
        membershipLevel: true,
        totalSpent: true,
        silverActivatedAt: true,
        goldActivatedAt: true,
        diamondActivatedAt: true,
        wechatOpenId: true,
        wechatUnionId: true,
        birthday: true,
        birthdayLocked: true,
        // 多平台外部身份（聚合框架单一数据源；旧列仅作双写过渡期前端兜底展示）
        externalIdentities: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            provider: true,
            subjectId: true,
            unionId: true,
            metadata: true,
            createdAt: true,
          },
        },
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "用户不存在" } },
        { status: 404 }
      );
    }

    const [
      balance,
      redemptions,
      redemptionTotal,
      addresses,
      adjustments,
      adjustmentTotal,
      levelChanges,
      loginAttempts,
    ] = await Promise.all([
        prisma.pointBalance.findUnique({
          where: { userId: id },
          select: { available: true, frozen: true, updatedAt: true },
        }),
        prisma.pointRedemption.findMany({
          where: { userId: id },
          orderBy: { createdAt: "desc" },
          take: RECENT_LIMIT,
          select: {
            id: true,
            productName: true,
            priceYuan: true,
            points: true,
            status: true,
            carrier: true,
            waybillNo: true,
            recipient: true,
            phone: true,
            address: true,
            fulfilledAt: true,
            createdAt: true,
          },
        }),
        prisma.pointRedemption.count({ where: { userId: id } }),
        prisma.userAddress.findMany({
          where: { userId: id },
          orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
          take: RECENT_LIMIT,
          select: {
            id: true,
            recipient: true,
            phone: true,
            region: true,
            detail: true,
            isDefault: true,
            createdAt: true,
          },
        }),
        prisma.spentAdjustmentApplication.findMany({
          where: { userId: id },
          orderBy: { createdAt: "desc" },
          take: RECENT_LIMIT,
          select: {
            id: true,
            channel: true,
            orderNo: true,
            amountClaimed: true,
            status: true,
            reviewAmount: true,
            reviewNote: true,
            createdAt: true,
          },
        }),
        prisma.spentAdjustmentApplication.count({ where: { userId: id } }),
        prisma.membershipLevelChange.findMany({
          where: { userId: id },
          orderBy: { createdAt: "desc" },
          take: RECENT_LIMIT,
          select: { id: true, fromLevel: true, toLevel: true, note: true, createdAt: true },
        }),
        prisma.loginAttempt.findMany({
          where: { userId: id },
          orderBy: { createdAt: "desc" },
          take: RECENT_LIMIT,
          select: {
            id: true,
            type: true,
            success: true,
            reason: true,
            ipAddress: true,
            userAgent: true,
            clientId: true,
            createdAt: true,
          },
        }),
      ]);

    // 查看用户详情（含积分/地址等敏感档案）记审计——同一管理员 5 分钟内重复查看合并为一条。
    // 拥有 users:sensitive:read 时返回完整联系方式，审计动作升级为 user_detail_sensitive_view。
    const canReadSensitive = hasAdminPermission(admin, "users:sensitive:read");
    const auditAction = canReadSensitive ? "user_detail_sensitive_view" : "user_detail_view";
    const recentView = await prisma.auditLog.findFirst({
      where: {
        action: auditAction,
        targetType: "user",
        targetId: id,
        adminId: admin.id,
        createdAt: { gte: new Date(Date.now() - DETAIL_VIEW_AUDIT_WINDOW_MS) },
      },
      select: { id: true },
    });
    if (!recentView) {
      await createAuditLog({
        action: auditAction,
        targetType: "user",
        targetId: id,
        detail: { phone: maskPhone(user.phone), sensitive: canReadSensitive },
        adminId: admin.id,
        request,
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        user: {
          id: user.id,
          phone: canReadSensitive ? user.phone : maskPhone(user.phone),
          phoneVerified: user.phoneVerified,
          nickname: user.nickname,
          avatar: user.avatar,
          status: user.status,
          membershipLevel: user.membershipLevel,
          totalSpent: user.totalSpent,
          silverActivatedAt: user.silverActivatedAt?.toISOString() ?? null,
          goldActivatedAt: user.goldActivatedAt?.toISOString() ?? null,
          diamondActivatedAt: user.diamondActivatedAt?.toISOString() ?? null,
          wechatOpenId: canReadSensitive ? user.wechatOpenId : maskIdentifier(user.wechatOpenId),
          wechatUnionId: canReadSensitive ? user.wechatUnionId : maskIdentifier(user.wechatUnionId),
          birthday: user.birthday?.toISOString() ?? null,
          birthdayLocked: user.birthdayLocked,
          externalIdentities: user.externalIdentities.map((i) => ({
            ...i,
            subjectId: canReadSensitive ? i.subjectId : maskIdentifier(i.subjectId),
            unionId: canReadSensitive ? i.unionId : maskIdentifier(i.unionId),
            createdAt: i.createdAt.toISOString(),
          })),
          createdAt: user.createdAt.toISOString(),
          updatedAt: user.updatedAt.toISOString(),
        },
        points: {
          available: balance?.available ?? 0,
          frozen: balance?.frozen ?? 0,
          redemptions: redemptions.map((r) => ({
            id: r.id,
            productName: r.productName,
            priceYuan: Number(r.priceYuan),
            points: r.points,
            status: r.status,
            carrier: r.carrier,
            waybillNo: r.waybillNo,
            recipient: canReadSensitive ? r.recipient : maskIdentifier(r.recipient),
            phone: canReadSensitive ? r.phone : r.phone ? maskPhone(r.phone) : r.phone,
            address: canReadSensitive ? r.address : maskAddress(r.address),
            fulfilledAt: r.fulfilledAt?.toISOString() ?? null,
            createdAt: r.createdAt.toISOString(),
          })),
          redemptionTotal,
        },
        addresses: addresses.map((a) => ({
          id: a.id,
          recipient: canReadSensitive ? a.recipient : maskIdentifier(a.recipient),
          phone: canReadSensitive ? a.phone : maskPhone(a.phone),
          region: a.region,
          detail: canReadSensitive ? a.detail : maskAddress(a.detail),
          isDefault: a.isDefault,
          createdAt: a.createdAt.toISOString(),
        })),
        spentAdjustments: {
          items: adjustments.map((a) => ({
            id: a.id,
            channel: a.channel,
            orderNo: a.orderNo,
            amountClaimed: a.amountClaimed,
            status: a.status,
            reviewAmount: a.reviewAmount,
            reviewNote: a.reviewNote,
            createdAt: a.createdAt.toISOString(),
          })),
          total: adjustmentTotal,
        },
        levelChanges: levelChanges.map((c) => ({
          id: c.id,
          fromLevel: c.fromLevel,
          toLevel: c.toLevel,
          note: c.note,
          createdAt: c.createdAt.toISOString(),
        })),
        loginAttempts: loginAttempts.map((a) => ({
          id: a.id,
          type: a.type,
          success: a.success,
          reason: a.reason,
          ipAddress: a.ipAddress,
          userAgent: a.userAgent,
          clientId: a.clientId,
          createdAt: a.createdAt.toISOString(),
        })),
      },
    });
  } catch (error) {
    apiConsole.error("[AdminUserDetail] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/users/:id/reveal-phone - 显示完整手机号（敏感操作）
 * 最小权限：默认脱敏，显式触发才明文返回，并写审计日志留痕。
 */
export async function POST(request: NextRequest, context: RouteContext) {
  if (!validateCSRFToken(request)) {
    return csrfForbiddenResponse();
  }

  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权" } },
        { status: 401 }
      );
    }

    if (!hasAdminPermission(admin, "users:sensitive:read")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "权限不足：查看完整手机号" } },
        { status: 403 }
      );
    }

    const rateLimitResponse = await checkAdminRateLimit(request, "user:read");
    if (rateLimitResponse) return rateLimitResponse;

    const { id } = await context.params;
    if (!validateCUID(id)) {
      return invalidIdResponse();
    }

    const user = await prisma.user.findUnique({
      where: { id },
      select: { phone: true },
    });
    if (!user) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "用户不存在" } },
        { status: 404 }
      );
    }

    await createAuditLog({
      action: "user_detail_sensitive_view",
      targetType: "user",
      targetId: id,
      detail: { field: "phone" },
      adminId: admin.id,
      request,
    });

    return NextResponse.json({ success: true, data: { phone: user.phone } });
  } catch (error) {
    apiConsole.error("[AdminUserRevealPhone] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}

const updateUserSchema = z
  .object({
    status: z.enum(["ACTIVE", "SUSPENDED", "BANNED"] as const).optional(),
    // 生日：YYYY-MM-DD 或 null（清除）；客服代改不受生日锁定限制
    birthday: z
      .union([
        z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, "生日格式应为 YYYY-MM-DD")
          .refine((s) => !Number.isNaN(new Date(s).getTime()), "无效的生日日期")
          .refine((s) => new Date(s).getTime() <= Date.now(), "生日不能晚于今天")
          .refine(
            (s) => new Date(s).getFullYear() >= new Date().getFullYear() - 100,
            "生日日期超出合理范围"
          ),
        z.null(),
      ])
      .optional(),
    // 仅解锁生日（保留已设置的生日值，允许用户自助修改）
    unlockBirthday: z.literal(true).optional(),
  })
  .refine(
    (d) => d.status !== undefined || d.birthday !== undefined || d.unlockBirthday !== undefined,
    { message: "未提供可更新的字段" }
  );

// PATCH /api/admin/users/:id - 修改用户状态 / 生日（客服代改）
export async function PATCH(request: NextRequest, context: RouteContext) {
  if (!validateCSRFToken(request)) {
    return csrfForbiddenResponse();
  }

  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权" } },
        { status: 401 }
      );
    }
    if (!hasAdminPermission(admin, "users:write")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "权限不足：用户状态/生日变更" } },
        { status: 403 }
      );
    }

    const rateLimitResponse = await checkAdminRateLimit(request);
    if (rateLimitResponse) return rateLimitResponse;

    const { id } = await context.params;
    if (!validateCUID(id)) {
      return invalidIdResponse();
    }

    const body = await request.json();
    const result = updateUserSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_PARAMS", message: "参数错误" } },
        { status: 400 }
      );
    }

    const { status, birthday, unlockBirthday } = result.data;

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        phone: true,
        status: true,
        birthday: true,
        birthdayLocked: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "用户不存在" } },
        { status: 404 }
      );
    }

    let updatedUser: {
      id: string;
      phone: string;
      status: UserStatus;
      birthday: Date | null;
      birthdayLocked: boolean;
    } = {
      id: user.id,
      phone: user.phone,
      status: user.status,
      birthday: user.birthday,
      birthdayLocked: user.birthdayLocked,
    };

    // 1) 生日变更 / 解锁（客服代改，不受用户端生日锁定限制）
    const birthdayData: { birthday?: Date | null; birthdayLocked?: boolean } = {};
    const birthdayAudit: Record<string, unknown> = {};
    if (birthday !== undefined) {
      const next = birthday === null ? null : new Date(`${birthday}T00:00:00.000Z`);
      if ((user.birthday?.getTime() ?? null) !== (next?.getTime() ?? null)) {
        birthdayData.birthday = next;
        // 管理员设置生日后保持锁定；清除生日则同时解锁
        birthdayData.birthdayLocked = next !== null;
        birthdayAudit.birthdayBefore = user.birthday?.toISOString() ?? null;
        birthdayAudit.birthdayAfter = next?.toISOString() ?? null;
      }
    }
    if (unlockBirthday && user.birthdayLocked) {
      birthdayData.birthdayLocked = false;
      birthdayAudit.unlocked = true;
    }

    if (Object.keys(birthdayData).length > 0) {
      const saved = await prisma.user.update({
        where: { id },
        data: birthdayData,
        select: { id: true, phone: true, status: true, birthday: true, birthdayLocked: true },
      });
      updatedUser = saved;

      await createAuditLog({
        action: "user_birthday_update",
        targetType: "user",
        targetId: user.id,
        detail: { ...birthdayAudit, phone: maskPhone(user.phone) },
        adminId: admin.id,
        request,
      });
    }

    // 2) 状态变更（含级联撤销凭证 + OAuth 会话 + backchannel + webhook）
    if (status !== undefined && status !== user.status) {
      const saved = await prisma.user.update({
        where: { id },
        data: { status: status as UserStatus },
        select: { id: true, phone: true, status: true, birthday: true, birthdayLocked: true },
      });
      updatedUser = saved;

      await cascadeUserStatusChange({
        userId: user.id,
        previousStatus: user.status,
        newStatus: status,
      });

      await createAuditLog({
        action: "user_status_change",
        targetType: "user",
        targetId: user.id,
        detail: { previousStatus: user.status, newStatus: status, phone: maskPhone(user.phone) },
        adminId: admin.id,
        request,
      });

      // SSO 审计：用户状态变更（合规敏感，同步等待写入）
      await recordSsoEvent({
        event: "status_change",
        userId: user.id,
        ip: getClientIP(request),
        success: true,
        detail: {
          action:
            status === "ACTIVE"
              ? "user_unbanned"
              : status === "SUSPENDED"
                ? "user_suspended"
                : "user_banned",
          previousStatus: user.status,
          newStatus: status,
          adminId: admin.id,
        },
      });
    }

    return NextResponse.json({ success: true, data: { user: updatedUser } });
  } catch (error) {
    apiConsole.error("[AdminUserUpdate] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/users/:id - 删除用户（匿名化注销，GDPR 合规）
// 口径说明：与自助注销共用同一执行器（executeAccountDeletion）——创建到期时间为
// 现在的 AccountDeletionRequest 后同步执行，保证管理端与自助路径的匿名化字段、
// PII 清理、子站 purge、会话撤销口径完全一致；全程只 update 不 delete
// （积分/消费等 6 张财务表为 Restrict 外键，User 行必须保留）。
// 执行失败返回 502，申请保留 FAILED 状态，由管理端「账号注销」人工队列跟进。
export async function DELETE(request: NextRequest, context: RouteContext) {
  if (!validateCSRFToken(request)) {
    return csrfForbiddenResponse();
  }

  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权" } },
        { status: 401 }
      );
    }
    if (!hasAdminPermission(admin, "users:delete")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "权限不足：用户删除" } },
        { status: 403 }
      );
    }

    const rateLimitResponse = await checkAdminRateLimit(request);
    if (rateLimitResponse) return rateLimitResponse;

    const { id } = await context.params;
    if (!validateCUID(id)) {
      return invalidIdResponse();
    }

    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, phone: true, status: true },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "用户不存在" } },
        { status: 404 }
      );
    }

    if (user.status === "DELETED") {
      return NextResponse.json(
        { success: false, error: { code: "ALREADY_DELETED", message: "该用户已注销" } },
        { status: 409 }
      );
    }

    // 执行中（RUNNING）的申请禁止重复触发，防与正在进行的匿名化竞态
    const existingRequest = await prisma.accountDeletionRequest.findUnique({
      where: { userId: id },
      select: { status: true },
    });
    if (existingRequest && existingRequest.status === DELETION_STATUS.RUNNING) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "DELETION_IN_PROGRESS", message: "该用户注销正在执行中，请稍后查询结果" },
        },
        { status: 409 }
      );
    }

    // 建立/重置注销申请（到期时间为现在），随后同步执行——
    // 管理员能立即看到成败（与人工重试同口径），无需等待下一轮 cron
    const now = new Date();
    const deletionRequest = await prisma.accountDeletionRequest.upsert({
      where: { userId: id },
      create: {
        userId: id,
        reason: "管理端删除",
        phoneHash: hashIdentifier(user.phone),
        scheduledAt: now,
      },
      update: {
        status: DELETION_STATUS.PENDING,
        reason: "管理端删除",
        phoneHash: hashIdentifier(user.phone),
        requestedAt: now,
        scheduledAt: now,
        cancelledAt: null,
        completedAt: null,
        attempts: 0,
        lastError: null,
      },
    });

    const result = await executeAccountDeletion(deletionRequest.id, { notifyUser: false });

    if (result !== "completed") {
      // 执行失败（子站不可达/DB 异常等）：申请已置 FAILED 并记录 lastError，
      // 引导管理员到人工队列跟进，不静默吞错
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "DELETION_EXECUTION_FAILED",
            message: "注销执行失败，申请已转入人工处理（管理端 → 账号注销队列可查看失败原因并重试）",
          },
        },
        { status: 502 }
      );
    }

    await createAuditLog({
      action: "user_deleted",
      targetType: "user",
      targetId: user.id,
      detail: { requestId: deletionRequest.id, previousStatus: user.status },
      adminId: admin.id,
      request,
    });

    // SSO 审计：用户删除（合规敏感，同步等待写入）
    await recordSsoEvent({
      event: "status_change",
      userId: user.id,
      ip: getClientIP(request),
      success: true,
      detail: {
        action: "user_deleted",
        previousStatus: user.status,
        newStatus: "DELETED",
        adminId: admin.id,
      },
    });

    return NextResponse.json({ success: true, data: { message: "用户数据已删除" } });
  } catch (error) {
    apiConsole.error("[AdminUserDelete] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}
