import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";
import { signToken } from "@/lib/jwt";
import { AdminLoginSchema } from "@/schemas/api";
import { AUTH_COOKIE_NAME, COOKIE_OPTIONS } from "@/types/auth";
import { rateLimit, getClientIP } from "@/lib/ratelimit";

// 管理员账户级防爆破（内存实现，与 rateLimit 一致）
interface AdminLoginAttempt {
  count: number;
  windowStart: number;
  lockedUntil?: number;
}
const adminLoginAttempts = new Map<string, AdminLoginAttempt>();
const ADMIN_MAX_ATTEMPTS = 5;
const ADMIN_WINDOW_MS = 15 * 60 * 1000; // 15 分钟
const ADMIN_LOCKOUT_MS = 30 * 60 * 1000; // 30 分钟

function checkAdminLockout(email: string): { locked: boolean; remainingMinutes: number } {
  const now = Date.now();
  const record = adminLoginAttempts.get(email);
  if (!record) return { locked: false, remainingMinutes: 0 };

  // 清理过期窗口
  if (now - record.windowStart > ADMIN_WINDOW_MS) {
    adminLoginAttempts.delete(email);
    return { locked: false, remainingMinutes: 0 };
  }

  // 检查锁定状态
  if (record.lockedUntil && now < record.lockedUntil) {
    const remainingMs = record.lockedUntil - now;
    return { locked: true, remainingMinutes: Math.ceil(remainingMs / 60 / 1000) };
  }

  return { locked: false, remainingMinutes: 0 };
}

function recordAdminAttempt(email: string, success: boolean): void {
  const now = Date.now();
  const record = adminLoginAttempts.get(email);

  if (success) {
    adminLoginAttempts.delete(email);
    return;
  }

  if (!record || now - record.windowStart > ADMIN_WINDOW_MS) {
    adminLoginAttempts.set(email, { count: 1, windowStart: now });
  } else {
    record.count += 1;
    if (record.count >= ADMIN_MAX_ATTEMPTS) {
      record.lockedUntil = now + ADMIN_LOCKOUT_MS;
    }
  }
}

// POST /api/admin/login - 管理员登录
// 强制动态渲染，禁止静态预渲染
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = body;

    // 1. 账户级防爆破检查（基于 email）
    const lockout = checkAdminLockout(email);
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

    // 2. IP 级速率限制
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

    // 验证请求数据
    const result = AdminLoginSchema.safeParse(body);
    if (!result.success) {
      recordAdminAttempt(email, false);
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

    // 查找管理员
    const admin = await prisma.admin.findUnique({
      where: { email },
    });

    // 使用通用错误信息，避免泄露用户是否存在
    if (!admin) {
      recordAdminAttempt(email, false);
      return NextResponse.json(
        {
          success: false,
          error: { code: "INVALID_CREDENTIALS", message: "邮箱或密码错误" },
        },
        { status: 401 }
      );
    }

    // 验证密码
    const isPasswordValid = await verifyPassword(password, admin.password);
    if (!isPasswordValid) {
      recordAdminAttempt(email, false);
      return NextResponse.json(
        {
          success: false,
          error: { code: "INVALID_CREDENTIALS", message: "邮箱或密码错误" },
        },
        { status: 401 }
      );
    }

    // 登录成功，清除失败记录
    recordAdminAttempt(email, true);

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

    return response;
  } catch (error) {
    console.error("登录失败:", error);
    return NextResponse.json(
      {
        success: false,
        error: { code: "LOGIN_ERROR", message: "登录失败，请稍后重试" },
      },
      { status: 500 }
    );
  }
}
