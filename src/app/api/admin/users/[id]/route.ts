/**
 * 管理端用户详情 API
 * GET /api/admin/users/:id
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
import { blacklistUserTokens, removeFromBlacklist } from "@/lib/token-blacklist";
import { removeIdentities } from "@/lib/external-identity";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { sendBackchannelLogout } from "@/lib/backchannel-logout";
import { dispatchStatusChangeWebhook, getStatusChangeWebhookTargets } from "@/lib/webhook";
import { maskPhone } from "@/lib/mask-phone";

type RouteContext = { params: Promise<{ id: string }> };

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

    const { id } = await context.params;

    if (!validateCUID(id)) {
      return invalidIdResponse();
    }

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
        totalPoints: true,
        totalSpent: true,
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

    return NextResponse.json({
      success: true,
      data: {
        user: {
          ...user,
          phone: maskPhone(user.phone),
        },
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

    // 冻结/封禁用户时：撤销所有 Refresh Token + 加入 access token 黑名单 + 级联清理
    if (status !== "ACTIVE") {
      await prisma.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      // 加入 access token 黑名单，消除剩余 15 分钟窗口期
      const reason = status === "SUSPENDED" ? "账号已被临时冻结" : "账号已被永久封禁";
      await blacklistUserTokens(user.id, reason);
    } else {
      // 解封时从黑名单移除
      await removeFromBlacklist(user.id);
    }

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

    // === 通知子项目账户状态变更 + 撤销 OAuth 会话 ===
    if (status !== "ACTIVE") {
      try {
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
          // 撤销所有 OAuth 会话（服务端一次性清除）
          await prisma.oAuthSession.updateMany({
            where: { userId: id, revokedAt: null },
            data: { revokedAt: new Date() },
          });
          // 通过安全的 backchannel logout 通知子项目（含 URL 校验/SSRF 防护/重试）
          await sendBackchannelLogout(user.id, clientIds, { includeInactive: true, sids });
        }
      } catch (err) {
        apiConsole.warn("[AdminUserUpdate] 子项目通知失败:", err);
      }
    }

    // Webhook 推送账户状态变更（best-effort，不阻断主流程）
    // 状态发送 User.status 原始大写枚举（ACTIVE/SUSPENDED/BANNED），与商城侧 zod 校验对齐
    try {
      await dispatchStatusChangeWebhook(
        {
          userId: user.id,
          oldStatus: user.status,
          newStatus: status,
          source: "admin",
        },
        getStatusChangeWebhookTargets()
      );
    } catch (err) {
      apiConsole.warn("[AdminUserUpdate] Webhook 通知失败:", err);
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

    // 软删除：封禁 + 匿名化 PII
    const anonymizedPhone = `deleted_${user.id.slice(0, 8)}`;
    await prisma.user.update({
      where: { id },
      data: {
        status: "BANNED",
        phone: anonymizedPhone,
        nickname: "[已删除]",
        avatar: null,
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
