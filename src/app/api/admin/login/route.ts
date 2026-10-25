import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";
import bcrypt from "bcryptjs";
import { signToken } from "@/lib/jwt";
import { AdminLoginSchema } from "@/schemas/api";
import { AUTH_COOKIE_NAME, COOKIE_OPTIONS } from "@/types/auth";
import { verifyTOTP, decryptTOTPSecret } from "@/lib/totp";
import { consumeAdminBackupCode } from "@/lib/admin-backup-code";
import { rateLimit, getClientIP } from "@/lib/ratelimit";
import { BODY_LIMITS } from "@/lib/body-limits";
import {
  isBodyTooLargeError,
  payloadTooLargeResponse,
  readJsonBody,
} from "@/lib/request-body";
import { beginAuditLog, createAuditLog, finishAuditLog } from "@/lib/audit";
import { apiConsole } from "@/lib/logger";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { hashIdentifier, clearLoginAttempts } from "@/lib/auth-security";
import { consumeAccessTokenOnce, removeFromBlacklist } from "@/lib/token-blacklist";
import { checkAdminLockout } from "@/lib/admin-lockout";
import { revokeAllAdminStepUpGrants } from "@/lib/admin-step-up";
import {
  ADMIN_TOTP_SETUP_COOKIE_NAME,
  ADMIN_TOTP_SETUP_COOKIE_OPTIONS,
  consumeAdminTotpRecoveryAndReset,
  isAdminTotpRecoveryCodeFormat,
  signAdminTotpSetupToken,
} from "@/lib/admin-totp-recovery";

// 防时序攻击 dummy 哈希（与 password.ts 中 SALT_ROUNDS = 13 保持一致）
// 懒加载生成，避免冷启动延迟，同时保证与真实密码哈希相同的盐轮数
let _dummyHash: string | null = null;
function getDummyHash(): string {
  if (!_dummyHash) {
    _dummyHash = bcrypt.hashSync("__nihplod_dummy_timing_defense__", 13);
  }
  return _dummyHash;
}

function hashEmail(email: string): string {
  // HMAC（LOGIN_ATTEMPT_HMAC_KEY）：与用户侧一致，避免拖库后邮箱被枚举还原
  return hashIdentifier(email);
}

async function recordAdminAttempt(
  email: string,
  success: boolean,
  request: NextRequest
): Promise<void> {
  try {
    const identifier = hashEmail(email);
    await prisma.loginAttempt.create({
      data: {
        identifier,
        type: "admin",
        success,
        ipAddress: getClientIP(request),
        userAgent: request.headers.get("user-agent"),
      },
    });
  } catch (error) {
    // 记录到日志但不阻断登录流程，确保防爆破机制故障时可被察觉
    apiConsole.error("[Login] 记录登录尝试失败:", error);
  }
}

async function auditAdminAuthFailure(
  request: NextRequest,
  email: string,
  reason: string,
  action: "admin_login_failed" | "admin_totp_failed",
  admin?: { id: string; email: string; name: string; role: string } | null
): Promise<void> {
  await createAuditLog({
    action,
    targetType: "admin",
    targetId: admin?.id,
    outcome: "FAILURE",
    actorType: admin ? "ADMIN" : "SYSTEM",
    actorEmail: admin?.email,
    actorName: admin?.name,
    actorRole: admin?.role,
    authMethod: action === "admin_totp_failed" ? "totp" : "password",
    adminId: admin?.id,
    request,
    detail: { email, reason },
  });
}

/**
 * 消费 owner 签发的一次性恢复码。成功时只下发短时 setup cookie，
 * 不建立正常后台会话；恢复码无效时返回 null，由调用方继续走普通错误分支。
 */
async function tryAdminTotpRecovery(
  request: NextRequest,
  admin: { id: string; email: string; name: string; role: string },
  totpCode: string | undefined,
  email: string
): Promise<NextResponse | null> {
  if (!totpCode || !isAdminTotpRecoveryCodeFormat(totpCode)) return null;

  const recoveryAuditDetail = { email: admin.email, method: "recovery_code" };
  const recoveryAuditId = await beginAuditLog({
    action: "admin_totp_recovery_used",
    targetType: "admin",
    targetId: admin.id,
    detail: recoveryAuditDetail,
    actorType: "ADMIN",
    actorEmail: admin.email,
    actorName: admin.name,
    actorRole: admin.role,
    authMethod: "recovery_code",
    adminId: admin.id,
    request,
  });
  if (!recoveryAuditId) {
    return NextResponse.json(
      {
        success: false,
        error: { code: "AUDIT_UNAVAILABLE", message: "审计服务不可用，已拒绝恢复" },
      },
      { status: 503 }
    );
  }

  try {
    const reset = await consumeAdminTotpRecoveryAndReset(admin.id, totpCode);
    if (!reset) {
      await finishAuditLog(recoveryAuditId, "FAILURE", {
        ...recoveryAuditDetail,
        reason: "recovery_code_rejected",
      });
      return null;
    }

    await revokeAllAdminStepUpGrants(admin.id).catch((err) =>
      apiConsole.warn("[AdminLogin] 恢复后清理 step-up 失败:", err)
    );
    const setupToken = await signAdminTotpSetupToken({
      adminId: admin.id,
      tokenVersion: reset.tokenVersion,
    });

    await clearLoginAttempts(email, "admin");
    await recordAdminAttempt(email, true, request);
    await finishAuditLog(recoveryAuditId, "SUCCESS", recoveryAuditDetail);

    const recoveryResponse = NextResponse.json({
      success: true,
      data: {
        totpSetupRequired: true,
        user: {
          id: admin.id,
          email: admin.email,
          name: admin.name,
          role: admin.role,
        },
      },
    });
    recoveryResponse.cookies.set(
      ADMIN_TOTP_SETUP_COOKIE_NAME,
      setupToken,
      ADMIN_TOTP_SETUP_COOKIE_OPTIONS
    );
    recoveryResponse.headers.set("Cache-Control", "no-store, private");
    recoveryResponse.headers.set("Pragma", "no-cache");
    return recoveryResponse;
  } catch (err) {
    await finishAuditLog(recoveryAuditId, "FAILURE", {
      ...recoveryAuditDetail,
      reason: "recovery_failed",
    });
    throw err;
  }
}

// POST /api/admin/login - 管理员登录
// 强制动态渲染，禁止静态预渲染
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    // 0. CSRF 保护：校验 Origin / Referer 头（支持多域名、多协议）
    const origin = request.headers.get("origin");
    const referer = request.headers.get("referer");
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://nihplod.cn";
    const allowedHostnames = new Set([new URL(appUrl).hostname]);
    // 额外允许的 hostname（通过环境变量逗号分隔）
    const extraHosts = process.env.APP_ALLOWED_HOSTS;
    if (extraHosts) {
      extraHosts
        .split(",")
        .map((h) => h.trim())
        .filter(Boolean)
        .forEach((h) => allowedHostnames.add(h));
    }

    const checkUrl = (urlStr: string | null): boolean => {
      if (!urlStr) return false;
      try {
        const parsed = new URL(urlStr);
        return allowedHostnames.has(parsed.hostname);
      } catch {
        return false;
      }
    };

    const isValidOrigin = checkUrl(origin);
    const isValidReferer = checkUrl(referer);
    if (!isValidOrigin && !isValidReferer) {
      return NextResponse.json(
        { success: false, error: { code: "CSRF_DETECTED", message: "请求来源不合法" } },
        { status: 403 }
      );
    }

    // 0.1 CSRF Token 校验（纵深防御，与 Origin/Referer 互补）
    if (!validateCSRFToken(request)) {
      return csrfForbiddenResponse();
    }

    // 1. IP 级速率限制（管理后台专用桶，避免与 C 端 login 共享被用户爆破影响）
    // 必须在读取 body 之前执行，避免超大请求体先被完整缓冲。
    const ip = getClientIP(request);
    const limitResult = await rateLimit(ip, "admin-login");
    if (!limitResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "RATE_LIMITED",
            message: "登录尝试过于频繁，请稍后再试",
          },
        },
        { status: 429 }
      );
    }

    // 2. 读取 body（有硬上限）
    let body: unknown;
    try {
      body = await readJsonBody(request, BODY_LIMITS.authJson);
    } catch (error) {
      if (isBodyTooLargeError(error)) return payloadTooLargeResponse(error.limit);
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "请求数据格式错误" } },
        { status: 400 }
      );
    }

    // 3. 验证请求数据格式
    const result = AdminLoginSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "请求数据格式错误",
            details: result.error.issues,
          },
        },
        { status: 400 }
      );
    }

    const { email, password, totpCode } = result.data;

    // 4. 账户级防爆破检查（基于 email，持久化到数据库）
    const lockout = await checkAdminLockout(email);
    if (lockout.locked) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "ACCOUNT_LOCKED",
            message: `账户已锁定，请 ${lockout.remainingMinutes} 分钟后再试`,
          },
        },
        { status: 429 }
      );
    }

    // 查找管理员
    const admin = await prisma.admin.findUnique({
      where: { email },
    });

    // 账号已被禁用或软删除：对外与"管理员不存在/密码错误"统一返回 INVALID_CREDENTIALS
    //（防账号枚举），禁用事实仅写入服务端审计日志
    const adminDisabled = Boolean(admin && (admin.status !== "ACTIVE" || admin.deletedAt !== null));

    // 使用恒定时间比较防御时序攻击：无论用户是否存在、是否被禁用都执行一次 bcrypt
    //（禁用账号用 dummy 哈希，避免跳过比较产生时序差异泄露账号存在性）
    const targetHash = admin && !adminDisabled ? admin.password : getDummyHash();
    const isPasswordValid = await verifyPassword(password, targetHash);

    // 使用通用错误信息，避免泄露用户是否存在或是否被禁用
    if (!admin || adminDisabled || !isPasswordValid) {
      await recordAdminAttempt(email, false, request);
      await auditAdminAuthFailure(
        request,
        email,
        adminDisabled ? "account_disabled" : "invalid_credentials",
        "admin_login_failed",
        admin
      );
      if (admin && adminDisabled) {
        apiConsole.warn(`[AdminLogin] 已禁用/已删除账号尝试登录: adminId=${admin.id}`);
      }
      return NextResponse.json(
        {
          success: false,
          error: { code: "INVALID_CREDENTIALS", message: "邮箱或密码错误" },
        },
        { status: 401 }
      );
    }

    // 3.5 TOTP 二次验证
    // 恢复码已消费但尚未重新绑定时，只允许继续用恢复码进入绑定流程，
    // 绝不能仅凭密码建立正常后台会话。
    if (admin.totpResetRequired) {
      const recoveryResponse = await tryAdminTotpRecovery(request, admin, totpCode, email);
      if (recoveryResponse) return recoveryResponse;

      await auditAdminAuthFailure(request, email, "recovery_required", "admin_totp_failed", admin);
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "TOTP_RECOVERY_REQUIRED",
            message: "请使用管理员签发的恢复码完成二次验证重新绑定",
          },
          data: { totpRequired: true, recoveryRequired: true },
        },
        { status: 401 }
      );
    }

    if (admin.totpEnabled) {
      // fail-closed：已启用 TOTP 但密钥缺失（迁移/人工清理异常）时禁止登录，
      // 绝不能静默跳过二次验证（与资金操作 requireMoneyOperationTotp 口径一致）
      if (!admin.totpSecret) {
        apiConsole.error(`[AdminLogin] 管理员 ${admin.id} 已启用 TOTP 但密钥缺失，拒绝登录`);
        await auditAdminAuthFailure(
          request,
          email,
          "totp_misconfigured",
          "admin_totp_failed",
          admin
        );
        await recordAdminAttempt(email, false, request);
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "TOTP_MISCONFIGURED",
              message: "二次验证配置异常，请联系超级管理员重置二次验证",
            },
          },
          { status: 500 }
        );
      }
      if (!totpCode || totpCode.length < 6) {
        // 不计入密码锁定计数器：验证器时钟漂移/备用码丢失不应导致账号被锁，
        // TOTP 暴力破解由上方 admin-totp 专用桶限流承担。
        return NextResponse.json(
          {
            success: false,
            error: { code: "TOTP_REQUIRED", message: "请输入二次验证码" },
            data: { totpRequired: true },
          },
          { status: 401 }
        );
      }

      // TOTP 专用速率限制：防止暴力猜测 6 位验证码
      const totpLimit = await rateLimit(`totp:${email}`, "admin-totp");
      if (!totpLimit.success) {
        await auditAdminAuthFailure(
          request,
          email,
          "totp_rate_limited",
          "admin_totp_failed",
          admin
        );
        return NextResponse.json(
          {
            success: false,
            error: { code: "TOTP_RATE_LIMITED", message: "二次验证尝试过于频繁，请 5 分钟后再试" },
            data: { totpRequired: true },
          },
          { status: 429 }
        );
      }

      let totpValid = false;
      try {
        const secret = decryptTOTPSecret(admin.totpSecret);
        totpValid = verifyTOTP(totpCode, secret);
        if (totpValid) {
          // 一次性：原子消费（唯一约束插入，冲突即重放），消除 check-then-set 的 TOCTOU
          // 窗口——两个并发请求不再能用同一验证码双双通过；存储故障时 fail-closed 拒绝
          const replayKey = `totp:${admin.id}:${totpCode}`;
          if (!(await consumeAccessTokenOnce(replayKey))) {
            apiConsole.warn("[AdminLogin] 检测到 TOTP 重放或存储不可用:", admin.id);
            totpValid = false;
          }
        }
      } catch (err) {
        apiConsole.error("[AdminLogin] TOTP解密失败:", err);
        totpValid = false;
      }

      // 尝试备用码：CAS 原子消费，并发请求不能复用同一码
      if (!totpValid && admin.totpBackupCodes) {
        try {
          const consumed = await consumeAdminBackupCode(admin.id, totpCode, admin.totpBackupCodes);
          if (consumed.ok) {
            totpValid = true;
          } else if (consumed.reason === "conflict") {
            apiConsole.warn("[AdminLogin] 备用码已被并发消费:", admin.id);
          }
        } catch (err) {
          apiConsole.warn("[AdminLogin] 备用码消费失败（fail-closed）:", err);
        }
      }

      // 尝试 owner 签发的一次性恢复码：成功时进入重新绑定流程
      if (!totpValid) {
        const recoveryResponse = await tryAdminTotpRecovery(request, admin, totpCode, email);
        if (recoveryResponse) return recoveryResponse;
      }

      if (!totpValid) {
        // 同上：TOTP/备用码错误不占用密码锁定配额，仅由 admin-totp 桶限流
        await auditAdminAuthFailure(request, email, "totp_invalid", "admin_totp_failed", admin);
        return NextResponse.json(
          {
            success: false,
            error: { code: "TOTP_INVALID", message: "二次验证码错误" },
            data: { totpRequired: true },
          },
          { status: 401 }
        );
      }
    }

    // 登录成功
    // 清除该账号的历史失败计数：锁定期内成功登录后不应再被旧失败记录拖入锁定。
    // 同时清除历史用户级黑名单（旧版改密/改角色逻辑可能留下 24h 记录），
    // 新会话是否有效由 Admin.tokenVersion 校验，不依赖用户级黑名单。
    await clearLoginAttempts(email, "admin");
    await removeFromBlacklist(admin.id).catch((err) =>
      apiConsole.warn("[AdminLogin] 清除历史黑名单失败（不影响登录）:", err)
    );

    // 记录成功登录尝试（用于审计和安全监控）
    await recordAdminAttempt(email, true, request);

    // 生成 JWT token（过期时间与 Cookie maxAge 保持一致）
    const token = await signToken({
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
      ver: admin.tokenVersion ?? 0,
    });

    const response = NextResponse.json({
      success: true,
      data: {
        user: {
          id: admin.id,
          email: admin.email,
          name: admin.name,
          role: admin.role,
        },
      },
    });

    // 设置 HttpOnly Cookie
    // 注意：绝不记录 token 内容（含前缀），防止认证凭据泄露到日志
    response.cookies.set(AUTH_COOKIE_NAME, token, COOKIE_OPTIONS);

    // 记录登录审计日志
    await createAuditLog({
      action: "admin_login",
      targetType: "admin",
      targetId: admin.id,
      actorType: "ADMIN",
      actorEmail: admin.email,
      actorName: admin.name,
      actorRole: admin.role,
      authMethod: admin.totpEnabled ? "totp" : "password",
      detail: { email: admin.email, role: admin.role },
      adminId: admin.id,
      request,
    });

    return response;
  } catch (error) {
    apiConsole.error("登录失败:", error);
    return NextResponse.json(
      {
        success: false,
        error: { code: "LOGIN_ERROR", message: "登录失败，请稍后重试" },
      },
      { status: 500 }
    );
  }
}
