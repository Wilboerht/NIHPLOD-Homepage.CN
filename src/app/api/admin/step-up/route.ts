import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth";
import { requireMoneyOperationTotp } from "@/lib/admin-totp";
import {
  ADMIN_STEP_UP_COOKIE_NAME,
  ADMIN_STEP_UP_COOKIE_OPTIONS,
  ADMIN_STEP_UP_TTL_SECONDS,
  issueAdminStepUpGrant,
} from "@/lib/admin-step-up";
import { createAuditLog } from "@/lib/audit";
import { rateLimit } from "@/lib/ratelimit";
import { apiConsole } from "@/lib/logger";

export const dynamic = "force-dynamic";

const stepUpSchema = z.object({
  totpCode: z.string().trim().min(6).max(20),
});

/**
 * POST /api/admin/step-up
 * 用一次 TOTP/备用码换取短时敏感操作凭证（HttpOnly Cookie）。
 */
export const POST = withAuth(async (request, admin) => {
  try {
    const limiter = await rateLimit(`step-up:${admin.id}`, "admin-totp");
    if (!limiter.success) {
      return NextResponse.json(
        { success: false, error: { code: "TOTP_RATE_LIMITED", message: "验证尝试过于频繁，请稍后再试" } },
        { status: 429, headers: { "Retry-After": String(Math.max(1, Math.ceil((limiter.reset - Date.now()) / 1000))) } }
      );
    }

    const parsed = stepUpSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_PARAMS", message: "验证码格式错误" } },
        { status: 400 }
      );
    }

    const totpFailure = await requireMoneyOperationTotp(admin.id, parsed.data.totpCode);
    if (totpFailure) return totpFailure;

    const grant = await issueAdminStepUpGrant(admin);
    const response = NextResponse.json(
      {
        success: true,
        data: {
          expiresAt: grant.expiresAt.toISOString(),
          ttlSeconds: ADMIN_STEP_UP_TTL_SECONDS,
        },
      },
      { headers: { "Cache-Control": "no-store, private" } }
    );
    response.cookies.set(ADMIN_STEP_UP_COOKIE_NAME, grant.token, ADMIN_STEP_UP_COOKIE_OPTIONS);

    createAuditLog({
      action: "step_up_granted",
      targetType: "admin",
      targetId: admin.id,
      detail: { expiresAt: grant.expiresAt.toISOString() },
      adminId: admin.id,
      request,
    }).catch(() => {});

    return response;
  } catch (error) {
    apiConsole.error("[AdminStepUp] 签发失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
});
