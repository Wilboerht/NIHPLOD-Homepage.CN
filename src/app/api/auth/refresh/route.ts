/**
 * Token 刷新 API
 * POST /api/auth/refresh
 * 
 * 使用 Refresh Token 获取新的 Access Token
 * 当 Access Token 过期时调用此接口
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyRefreshToken, signUserToken, getTokenExpiresAt } from "@/lib/jwt";
import { validateAndRefreshToken } from "@/lib/auth-security";
import { USER_ACCESS_COOKIE_OPTIONS, USER_COOKIE_NAME } from "@/types/auth";
import { z } from "zod";

// 请求参数验证
const refreshSchema = z.object({
  refreshToken: z.string().min(1, "refreshToken 不能为空"),
});

// 强制动态渲染，禁止静态预渲染
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // 参数验证
    const result = refreshSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_PARAMS",
            message: "缺少 refreshToken 参数",
          },
        },
        { status: 400 }
      );
    }

    const { refreshToken } = result.data;

    // 1. 验证 Refresh Token JWT
    const payload = await verifyRefreshToken(refreshToken);
    if (!payload) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_TOKEN",
            message: "刷新令牌无效或已过期",
          },
        },
        { status: 401 }
      );
    }

    // 2. 检查 Refresh Token 是否在数据库中有效（未被撤销）
    const isValid = await validateAndRefreshToken(payload.id, refreshToken);
    if (!isValid) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "TOKEN_REVOKED",
            message: "刷新令牌已失效，请重新登录",
          },
        },
        { status: 401 }
      );
    }

    // 3. 签发新的 Access Token
    const newAccessToken = await signUserToken({
      id: payload.id,
      phone: payload.phone,
    });

    console.log(`[RefreshToken] Token 已刷新: ${payload.phone.slice(0, 3)}****${payload.phone.slice(-4)}`);

    // 4. 构建响应
    const response = NextResponse.json({
      success: true,
      data: {
        accessToken: newAccessToken,
        accessTokenExpiresAt: getTokenExpiresAt(15), // 15分钟
      },
    });

    // 5. 更新 Cookie 中的 Access Token
    response.cookies.set(USER_COOKIE_NAME, newAccessToken, USER_ACCESS_COOKIE_OPTIONS);

    return response;
  } catch (error) {
    console.error("[RefreshToken] 异常:", error);
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
