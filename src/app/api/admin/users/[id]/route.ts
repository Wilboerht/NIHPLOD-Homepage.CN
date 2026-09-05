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
import { blacklistUserTokens } from "@/lib/token-blacklist";
import { removeIdentities } from "@/lib/external-identity";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { sendBackchannelLogout } from "@/lib/backchannel-logout";
import { dispatchStatusChangeWebhook, getStatusChangeWebhookTargets } from "@/lib/webhook";
import { cascadeUserStatusChange } from "@/lib/user-status";
import { maskPhone } from "@/lib/mask-phone";

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

    const [balance, redemptions, redemptionTotal, addresses, adjustments, adjustmentTotal, levelChanges] =
      await Promise.all([
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
      ]);

    // 查看用户详情（含积分/地址等敏感档案）记审计——同一管理员 5 分钟内重复查看合并为一条
    const recentView = await prisma.auditLog.findFirst({
      where: {
        action: "user_detail_view",
        targetType: "user",
        targetId: id,
        adminId: admin.id,
        createdAt: { gte: new Date(Date.now() - DETAIL_VIEW_AUDIT_WINDOW_MS) },
      },
      select: { id: true },
    });
    if (!recentView) {
      await createAuditLog({
        action: "user_detail_view",
        targetType: "user",
        targetId: id,
        detail: { phone: maskPhone(user.phone) },
        adminId: admin.id,
        request,
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        user: {
          id: user.id,
          phone: maskPhone(user.phone),
          phoneVerified: user.phoneVerified,
          nickname: user.nickname,
          avatar: user.avatar,
          status: user.status,
          membershipLevel: user.membershipLevel,
          totalSpent: user.totalSpent,
          silverActivatedAt: user.silverActivatedAt?.toISOString() ?? null,
          goldActivatedAt: user.goldActivatedAt?.toISOString() ?? null,
          diamondActivatedAt: user.diamondActivatedAt?.toISOString() ?? null,
          wechatOpenId: user.wechatOpenId,
          wechatUnionId: user.wechatUnionId,
          externalIdentities: user.externalIdentities.map((i) => ({
            ...i,
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
            recipient: r.recipient,
            phone: r.phone,
            address: r.address,
            fulfilledAt: r.fulfilledAt?.toISOString() ?? null,
            createdAt: r.createdAt.toISOString(),
          })),
          redemptionTotal,
        },
        addresses: addresses.map((a) => ({
          id: a.id,
          recipient: a.recipient,
          phone: a.phone,
          region: a.region,
          detail: a.detail,
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

const updateUserSchema = z.object({
  status: z.enum(["ACTIVE", "SUSPENDED", "BANNED"] as const),
});

// PATCH /api/admin/users/:id - 修改用户状态
export async function PATCH(request: NextRequest, context: RouteContext) {
  if (!validateCSRFToken(request)) {
    return csrfForbiddenResponse();
  }

  try {
    const admin = await verifyAuth(request);
    if (!admin || admin.role !== "owner") {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "只有超级管理员可操作" } },
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

    const { status } = result.data;

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

    if (user.status === status) {
      return NextResponse.json({ success: true, data: { user } });
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data: { status: status as UserStatus },
      select: { id: true, phone: true, status: true },
    });

    // 冻结/封禁/解封的级联操作（撤销凭证 + OAuth 会话 + backchannel + webhook）
    // 与批量端点共用 cascadeUserStatusChange，保证两处口径一致
    await cascadeUserStatusChange({
      userId: user.id,
      previousStatus: user.status,
      newStatus: status,
    });

    await createAuditLog({
      action: "user_status_change",
      targetType: "user",
      targetId: user.id,
      detail: { previousStatus: user.status, newStatus: status, phone: user.phone },
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

    return NextResponse.json({ success: true, data: { user: updatedUser } });
  } catch (error) {
    apiConsole.error("[AdminUserUpdate] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/users/:id - 软删除用户（GDPR 合规）
export async function DELETE(request: NextRequest, context: RouteContext) {
  if (!validateCSRFToken(request)) {
    return csrfForbiddenResponse();
  }

  try {
    const admin = await verifyAuth(request);
    if (!admin || admin.role !== "owner") {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "只有超级管理员可操作" } },
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

    // 软删除：封禁 + 匿名化 PII（含生日等个人资料字段一并清空）
    const anonymizedPhone = `deleted_${user.id.slice(0, 8)}`;
    await prisma.user.update({
      where: { id },
      data: {
        status: "BANNED",
        phone: anonymizedPhone,
        nickname: "[已删除]",
        avatar: null,
        birthday: null,
        wechatOpenId: null,
        wechatUnionId: null,
      },
    });

    // 同步移除全部外部平台身份（PII 匿名化口径与微信列置 null 一致，不限定微信系）
    await removeIdentities(id);

    // 撤销所有 token + 加入黑名单
    await prisma.refreshToken.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await blacklistUserTokens(user.id, "用户数据已被删除");

    // 撤销所有 OAuth 会话 + 清除用户授权 + 通知子项目
    // 撤销前先查出活跃会话的 sid，供 backchannel logout_token 携带
    const activeSessions = await prisma.oAuthSession.findMany({
      where: { userId: id, revokedAt: null, expiresAt: { gt: new Date() } },
      select: { clientId: true, sessionId: true },
      orderBy: { createdAt: "desc" },
    });
    if (activeSessions.length > 0) {
      const clientIds = [...new Set(activeSessions.map((s) => s.clientId))];
      const sids: Record<string, string> = {};
      for (const s of activeSessions) {
        if (!sids[s.clientId]) sids[s.clientId] = s.sessionId;
      }
      await prisma.oAuthSession.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await prisma.userConsent.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await sendBackchannelLogout(user.id, clientIds, { includeInactive: true, sids }).catch(
        () => {}
      );
    }

    // Webhook 推送账户删除事件（best-effort，不阻断主流程）
    // oldStatus 发删除前的原始大写枚举；newStatus 固定 "deleted"，商城侧按此约定映射为禁用
    try {
      await dispatchStatusChangeWebhook(
        {
          userId: user.id,
          oldStatus: user.status,
          newStatus: "deleted",
          source: "admin",
        },
        getStatusChangeWebhookTargets()
      );
    } catch (err) {
      apiConsole.warn("[AdminUserDelete] Webhook 通知失败:", err);
    }

    await createAuditLog({
      action: "user_deleted",
      targetType: "user",
      targetId: user.id,
      detail: { anonymizedPhone, previousStatus: user.status },
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
        newStatus: "BANNED",
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
