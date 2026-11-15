import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, getCurrentAdminSession } from "@/lib/auth";
import { getAdminSsoClient } from "@/lib/admin-sso-clients";
import { signAdminStepUpTicket } from "@/lib/admin-sso";
import { BA_STEP_UP_ACTION_LABELS, isBaStepUpAction, baStepUpPermission } from "@/lib/admin-step-up-actions";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { requireFreshAdminTotp } from "@/lib/admin-totp";
import { createAuditLog, createAuditLogStrict } from "@/lib/audit";
import { rateLimit } from "@/lib/ratelimit";
import { apiConsole } from "@/lib/logger";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  clientId: z.string().min(1).max(128),
  redirectUri: z.string().url().max(512),
  state: z.string().regex(/^[A-Za-z0-9_-]{43,128}$/),
  action: z.string().min(1).max(128),
  resourceId: z.union([z.string().uuid(), z.literal("new")]),
  totpCode: z.string().trim().min(6).max(20),
});

function jsonError(code: string, message: string, status: number): NextResponse {
  return NextResponse.json(
    { success: false, error: { code, message } },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

export const POST = withAuth(async (request: NextRequest, admin) => {
  const session = await getCurrentAdminSession();
  if (!session) {
    return jsonError("UNAUTHORIZED", "主站登录已失效，请重新登录", 401);
  }

  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await request.json());
  } catch {
    return jsonError("INVALID_PARAMS", "二次验证请求参数无效", 400);
  }

  const client = (() => {
    try {
      return getAdminSsoClient(parsed.clientId);
    } catch (error) {
      apiConsole.error("[AdminStepUpTicket] 客户端配置异常", error);
      return null;
    }
  })();
  if (!client?.stepUp?.enabled) {
    return jsonError("INVALID_CLIENT", "该子站未启用证书操作二次验证", 400);
  }
  if (parsed.redirectUri !== client.stepUp.redirectUri) {
    return jsonError("INVALID_REDIRECT", "二次验证回调地址不匹配", 400);
  }
  if (!isBaStepUpAction(parsed.action) || !client.stepUp.actions.includes(parsed.action)) {
    return jsonError("INVALID_ACTION", "不支持的证书操作", 400);
  }
  if (parsed.resourceId === "new" && parsed.action !== "ba.certificates.issue") {
    return jsonError("INVALID_RESOURCE", "只有证书核发可以使用 new 资源", 400);
  }
  if (!hasAdminPermission(admin, baStepUpPermission(parsed.action))) {
    return jsonError("FORBIDDEN", "缺少该证书操作权限", 403);
  }

  const limiter = await rateLimit(`ba-step-up-ticket:${admin.id}`, "admin-totp");
  if (!limiter.success) {
    return jsonError("RATE_LIMITED", "二次验证请求过于频繁，请稍后再试", 429);
  }

  const totpFailure = await requireFreshAdminTotp(admin.id, parsed.totpCode);
  if (totpFailure) {
    await createAuditLog({
      action: "ba_step_up_ticket_denied",
      targetType: "admin",
      targetId: admin.id,
      outcome: "FAILURE",
      actorType: "ADMIN",
      actorEmail: admin.email,
      actorName: admin.name,
      actorRole: admin.role,
      authMethod: "totp",
      adminId: admin.id,
      request,
      detail: { clientId: client.clientId, action: parsed.action, reason: "totp_rejected" },
    }).catch(() => {});
    return totpFailure;
  }

  let ticket: string;
  try {
    ticket = await signAdminStepUpTicket(
      {
        adminId: admin.id,
        clientId: client.clientId,
        audience: client.stepUp.audience,
        state: parsed.state,
        action: parsed.action,
        resourceId: parsed.resourceId,
        tokenVersion: admin.ver ?? 0,
        totpEnabled: true,
        mainSessionExp: session.exp,
        ttlSeconds: client.stepUp.ttlSeconds,
      },
      client.signing
    );
  } catch (error) {
    apiConsole.error("[AdminStepUpTicket] 签发失败", error);
    return jsonError("INTERNAL_ERROR", "二次验证凭证签发失败", 500);
  }

  try {
    await createAuditLogStrict({
      action: "ba_step_up_ticket_issued",
      targetType: "ba_certificate",
      targetId: parsed.resourceId,
      targetLabel: BA_STEP_UP_ACTION_LABELS[parsed.action],
      actorType: "ADMIN",
      actorEmail: admin.email,
      actorName: admin.name,
      actorRole: admin.role,
      authMethod: "totp",
      adminId: admin.id,
      request,
      detail: {
        clientId: client.clientId,
        action: parsed.action,
        expiresIn: client.stepUp.ttlSeconds,
      },
    });
  } catch (error) {
    apiConsole.error("[AdminStepUpTicket] 审计写入失败，拒绝签发", error);
    return jsonError("AUDIT_UNAVAILABLE", "审计服务不可用，已拒绝二次验证", 503);
  }

  return NextResponse.json(
    {
      success: true,
      data: {
        ticket,
        redirectUri: client.stepUp.redirectUri,
        state: parsed.state,
        action: parsed.action,
        resourceId: parsed.resourceId,
        expiresIn: client.stepUp.ttlSeconds,
      },
    },
    { headers: { "Cache-Control": "no-store" } }
  );
});



