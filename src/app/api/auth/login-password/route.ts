/**
 * 手机号+密码登录 API
 * POST /api/auth/login-password
 *
 * 安全增强：
 * - 请求速率限制
 * - 账户防爆破保护（失败5次后锁定30分钟）
 * - 登录失败记录
 * - 双Token机制（Access Token + Refresh Token）
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { signUserToken, signRefreshToken } from "@/lib/jwt";
import { verifyPassword } from "@/lib/password";
import {
  USER_ACCESS_COOKIE_OPTIONS,
  USER_REFRESH_COOKIE_OPTIONS,
  USER_COOKIE_NAME,
  USER_REFRESH_COOKIE_NAME,
} from "@/types/auth";
import {
  checkAccountLockout,
  recordLoginAttempt,
  saveRefreshToken,
  clearLoginAttempts,
  extractDeviceInfo,
} from "@/lib/auth-security";
import { rateLimit, getClientIP as getRateLimitClientIP } from "@/lib/ratelimit";
import { apiConsole } from "@/lib/logger";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { z } from "zod";

// 请求参数验证
const loginSchema = z.object({
  phone: z.string().regex(/^1[3-9]\d{9}$/, "请输入正确的手机号"),
  password: z.string().min(8, "密码至少8位").max(32, "密码最多32位"),
});

/**
 * 预计算的 bcrypt dummy hash（cost 12，与真实密码哈希一致）。
 * 用户不存在/未设置密码/账号非 ACTIVE 时也执行一次比较，
 * 消除"有效手机号枚举"的时序侧信道。
 */
const DUMMY_PASSWORD_HASH = "$2b$12$AyjtwQqCYG.hGK52B6QhFu9sRyDY4DvhbtRSi3FneLI7JztzHaF..";

// 强制动态渲染，禁止静态预渲染
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  // 1. 项目级速率限制（防止滥用，必须在 body 解析之前）
  const clientIP = getRateLimitClientIP(request);
  const ipLimit = await rateLimit(clientIP, "login");
  if (!ipLimit.success) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "TOO_MANY_REQUESTS",
          message: "登录尝试过于频繁，请稍后再试",
        },
      },
      { status: 429 }
    );
  }

  if (!validateCSRFToken(request)) {
    return csrfForbiddenResponse();
  }

  try {
    const body = await request.json();

    // 参数验证
    const result = loginSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_PARAMS",
            message: result.error.issues[0]?.message || "参数错误",
          },
        },
        { status: 400 }
      );
    }

    const { phone, password } = result.data;

    // 2. 检查账户是否被锁定（防爆破）
    const { locked, remainingMinutes } = await checkAccountLockout(phone);
    if (locked) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "ACCOUNT_LOCKED",
            message: `账户已被锁定，请在 ${remainingMinutes} 分钟后重试`,
          },
        },
        { status: 429 }
      );
    }

    // 3. 查找用户
    const user = await prisma.user.findUnique({
      where: { phone },
    });

    if (!user || !user.password) {
      // 统一错误响应：不区分"用户不存在"、"未设置密码"和"密码错误"
      // 防止攻击者通过不同错误码枚举有效手机号
      // 时序侧信道缓解：执行一次 dummy bcrypt 比较，使"用户不存在"与"密码错误"
      // 响应时间一致（verifyPassword 占登录失败路径的主要耗时）
      await verifyPassword(password, DUMMY_PASSWORD_HASH);
      await recordLoginAttempt(
        phone,
        false,
        request,
        user ? "password_not_set" : "user_not_found",
        "password"
      );

      return NextResponse.json(
        {
          success: false,
          error: {
            code: "LOGIN_FAILED",
            message: "登录失败，请检查手机号和密码",
          },
        },
        { status: 400 }
      );
    }

    // 检查账号状态
    if (user.status !== "ACTIVE") {
      // 账号被禁用/冻结时也返回统一错误，不暴露状态
      // 同样先做 dummy 比较，避免与"密码错误"路径产生时序差异
      await verifyPassword(password, DUMMY_PASSWORD_HASH);
      await recordLoginAttempt(
        phone,
        false,
        request,
        `account_${user.status.toLowerCase()}`,
        "password"
      );
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "LOGIN_FAILED",
            message: "登录失败，请检查手机号和密码",
          },
        },
        { status: 400 }
      );
    }

    // 5. 验证密码
    const isValid = await verifyPassword(password, user.password);
    if (!isValid) {
      // 记录失败尝试，返回统一错误（已合并到上方 user+password 检查）
      await recordLoginAttempt(phone, false, request, "password_incorrect", "password");

      return NextResponse.json(
        {
          success: false,
          error: {
            code: "LOGIN_FAILED",
            message: "登录失败，请检查手机号和密码",
          },
        },
        { status: 400 }
      );
    }

    // 6. 密码过期检查先于成功记录（与 login 路由的顺序一致）：
    // 避免"密码过期未实际登录"的请求在审计中留下 success 记录
    if (user.passwordExpiresAt && new Date() > new Date(user.passwordExpiresAt)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "PASSWORD_EXPIRED",
            message: "密码已过期，请修改密码后重新登录",
          },
        },
        { status: 403 }
      );
    }

    // 7. 记录成功登录
    await recordLoginAttempt(phone, true, request, undefined, "password", user.id);

    // 8. 清除当前类型的失败登录记录（成功登录后重置）
    await clearLoginAttempts(phone, "password");

    // 9. 签发 Access Token（短期，15分钟）
    const accessToken = await signUserToken({
      id: user.id,
    });

    // 10. 签发 Refresh Token（长期，30天；不再携带明文手机号 claim）
    const refreshToken = await signRefreshToken({
      id: user.id,
    });

    // 11. 保存 Refresh Token 到数据库
    const refreshTokenExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await saveRefreshToken(
      user.id,
      refreshToken,
      refreshTokenExpiresAt,
      extractDeviceInfo(request)
    );

    // 12. 构建响应
    const response = NextResponse.json({
      success: true,
      data: {
        user: {
          id: user.id,
          phone: user.phone,
          nickname: user.nickname,
          avatar: user.avatar,
        },
      },
    });

    // 13. 设置 Cookies
    response.cookies.set(USER_COOKIE_NAME, accessToken, USER_ACCESS_COOKIE_OPTIONS);
    response.cookies.set(USER_REFRESH_COOKIE_NAME, refreshToken, USER_REFRESH_COOKIE_OPTIONS);

    return response;
  } catch (error) {
    apiConsole.error("[LoginPassword] 异常:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "服务器错误",
        },
      },
      { status: 500 }
    );
  }
}
