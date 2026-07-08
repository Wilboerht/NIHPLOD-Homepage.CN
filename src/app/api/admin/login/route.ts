import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";
import { signToken } from "@/lib/jwt";
import { AdminLoginSchema } from "@/schemas/api";
import { AUTH_COOKIE_NAME, COOKIE_OPTIONS } from "@/types/auth";
import { verifyTOTP, decryptTOTPSecret, verifyBackupCode } from "@/lib/totp";
import { rateLimit, getClientIP } from "@/lib/ratelimit";
import { createAuditLog } from "@/lib/audit";
import { apiConsole } from "@/lib/logger";

// 管理员账户级防爆破配置
const ADMIN_MAX_ATTEMPTS = 5;
const ADMIN_WINDOW_MS = 15 * 60 * 1000; // 15 分钟
const ADMIN_LOCKOUT_MS = 30 * 60 * 1000; // 30 分钟

async function checkAdminLockout(email: string): Promise<{ locked: boolean; remainingMinutes: number }> {
  const windowStart = new Date(Date.now() - ADMIN_WINDOW_MS);
  const failedAttempts = await prisma.loginAttempt.count({
    where: {
      identifier: email,
      type: "admin",
      success: false,
      createdAt: { gte: windowStart },
    },
  });

  if (failedAttempts >= ADMIN_MAX_ATTEMPTS) {
    const lastFailed = await prisma.loginAttempt.findFirst({
      where: { identifier: email, type: "admin", success: false },
      orderBy: { createdAt: "desc" },
    });
    if (lastFailed) {
      const remainingMs = lastFailed.createdAt.getTime() + ADMIN_LOCKOUT_MS - Date.now();
      if (remainingMs > 0) {
        return { locked: true, remainingMinutes: Math.ceil(remainingMs / 60 / 1000) };
      }
    }
  }

  return { locked: false, remainingMinutes: 0 };
}

async function recordAdminAttempt(
  email: string,
  success: boolean,
  request: NextRequest
): Promise<void> {
  try {
    await prisma.loginAttempt.create({
      data: {
        identifier: email,
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

// POST /api/admin/login - 管理员登录
// 强制动态渲染，禁止静态预渲染
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    // 0. CSRF 保护：校验 Origin / Referer 头
    const origin = request.headers.get("origin");
    const referer = request.headers.get("referer");
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://nihplod.cn";
    const isValidOrigin = origin && (origin === appUrl || origin.endsWith(".nihplod.cn"));
    const isValidReferer = referer && referer.startsWith(appUrl);
    if (!isValidOrigin && !isValidReferer) {
      return NextResponse.json(
        { success: false, error: { code: "CSRF_DETECTED", message: "请求来源不合法" } },
        { status: 403 }
      );
    }

    const body = await request.json();

    // 1. 先验证请求数据格式
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

    // 2. IP 级速率限制（零成本内存操作优先）
    const ip = getClientIP(request);
    const limitResult = await rateLimit(ip, "login");
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

    // 3. 账户级防爆破检查（基于 email，持久化到数据库）
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

    // 使用恒定时间比较防御时序攻击：无论用户是否存在都执行一次 bcrypt
    const targetHash = admin ? admin.password : "$2a$12$dummy.hash.to.prevent.timing.attacks.on.nonexistent.users";
    const isPasswordValid = await verifyPassword(password, targetHash);

    // 使用通用错误信息，避免泄露用户是否存在
    if (!admin || !isPasswordValid) {
      await recordAdminAttempt(email, false, request);
      return NextResponse.json(
        {
          success: false,
          error: { code: "INVALID_CREDENTIALS", message: "邮箱或密码错误" },
        },
        { status: 401 }
      );
    }

    // 3.5 TOTP 二次验证
    if (admin.totpEnabled && admin.totpSecret) {
      if (!totpCode || totpCode.length < 6) {
        await recordAdminAttempt(email, false, request);
        return NextResponse.json(
          {
            success: false,
            error: { code: "TOTP_REQUIRED", message: "请输入二次验证码" },
            data: { totpRequired: true },
          },
          { status: 401 }
        );
      }

      let totpValid = false;
      try {
        const secret = decryptTOTPSecret(admin.totpSecret);
        totpValid = verifyTOTP(totpCode, secret);
      } catch {
        totpValid = false;
      }

      // 尝试备用码
      if (!totpValid && admin.totpBackupCodes) {
        const backupResult = verifyBackupCode(totpCode, admin.totpBackupCodes);
        if (backupResult) {
          totpValid = true;
          // 更新备用码（移除已使用的）
          await prisma.admin.update({
            where: { id: admin.id },
            data: { totpBackupCodes: JSON.stringify(backupResult.remainingCodes) },
          });
        }
      }

      if (!totpValid) {
        await recordAdminAttempt(email, false, request);
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
    // 记录成功登录尝试（用于审计和安全监控）
    await recordAdminAttempt(email, true, request);

    // 生成 JWT token
    const token = await signToken({
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
    });

    // 计算过期时间（7天）
    const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;

    // 创建响应
    const response = NextResponse.json({
      success: true,
      data: {
        user: {
          id: admin.id,
          email: admin.email,
          name: admin.name,
          role: admin.role,
        },
        expiresAt,
      },
    });

    // 设置 HttpOnly Cookie
    response.cookies.set(AUTH_COOKIE_NAME, token, COOKIE_OPTIONS);

    // 记录登录审计日志
    await createAuditLog({
      action: "login",
      targetType: "system",
      targetId: admin.id,
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
