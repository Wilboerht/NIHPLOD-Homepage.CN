/**
 * 微信登录回调 API
 * GET /api/auth/wechat/callback
 * 
 * 返回三种情况：
 * 1. 已有账户 + 已绑定微信 → 直接登录
 * 2. 已有账户 + 未绑定微信 → 自动绑定并登录
 * 3. 完全新用户 → 返回绑定令牌，需要手动绑定
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { signUserToken, signRefreshToken } from "@/lib/jwt";
import { getWechatOAuthToken, getWechatUserInfo } from "@/lib/wechat";
import { USER_COOKIE_OPTIONS, USER_COOKIE_NAME } from "@/types/auth";
import { SignJWT } from "jose";

const secret = new TextEncoder().encode(
  process.env.JWT_SECRET || "dev-secret-key-change-in-production-32chars"
);

// 强制动态渲染，禁止静态预渲染
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");

    // 获取重定向地址（从 state 解析或默认）
    let redirectUrl = "/";
    if (state) {
      try {
        const stateData = JSON.parse(Buffer.from(state, "base64").toString());
        if (stateData.redirect) {
          redirectUrl = stateData.redirect;
        }
      } catch {
        // state 解析失败，使用默认值
      }
    }

    // 用户拒绝授权
    if (error) {
      console.log("[WechatCallback] 用户拒绝授权:", error);
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "WECHAT_DENIED",
            message: "您取消了微信授权"
          },
          redirectUrl
        },
        { status: 400 }
      );
    }

    if (!code) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "MISSING_CODE",
            message: "缺少授权码"
          }
        },
        { status: 400 }
      );
    }

    // 获取 Access Token
    const tokenData = await getWechatOAuthToken(code, "open");

    // 获取用户信息
    const wechatUser = await getWechatUserInfo(tokenData.accessToken, tokenData.openid);

    console.log("[WechatCallback] 微信用户:", {
      openid: wechatUser.openid,
      nickname: wechatUser.nickname,
      unionid: wechatUser.unionid,
    });

    // 查找现有用户（优先通过 unionid，其次通过 openid）
    const user = await prisma.user.findFirst({
      where: wechatUser.unionid
        ? { OR: [{ wechatUnionId: wechatUser.unionid }, { wechatOpenId: wechatUser.openid }] }
        : { wechatOpenId: wechatUser.openid },
    });

    // 情况1：已有账户且已绑定微信 → 直接登录
    if (user && !user.phone.startsWith("wx_")) {
      // 更新微信信息
      await prisma.user.update({
        where: { id: user.id },
        data: {
          wechatOpenId: wechatUser.openid,
          wechatUnionId: wechatUser.unionid || user.wechatUnionId,
          nickname: user.nickname || wechatUser.nickname || null,
          avatar: user.avatar || wechatUser.headimgurl || null,
        },
      });

      // 签发 Token（使用新的双 Token 机制）
      const accessToken = await signUserToken({
        id: user.id,
        phone: user.phone,
      });
      const refreshToken = await signRefreshToken({
        id: user.id,
        phone: user.phone,
      });

      console.log(`[WechatCallback] 用户登录: ${user.nickname || wechatUser.nickname}`);

      // 保存 Refresh Token 到数据库
      await prisma.refreshToken.create({
        data: {
          userId: user.id,
          token: refreshToken,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30天后过期
        },
      });

      const response = NextResponse.json({
        success: true,
        data: {
          user: {
            id: user.id,
            phone: user.phone,
            nickname: user.nickname,
            avatar: user.avatar,
          },
          accessToken,
          accessTokenExpiresAt: new Date(Date.now() + 15 * 60 * 1000).getTime() / 1000,
          isNewUser: false,
          bindingRequired: false,
        },
      });

      // 设置 Cookie
      response.cookies.set(USER_COOKIE_NAME, accessToken, USER_COOKIE_OPTIONS);

      return response;
    }

    // 情况2：完全新用户 → 返回绑定令牌，需要手动绑定
    const bindToken = await new SignJWT({
      type: "wechat_bind",
      openid: wechatUser.openid,
      unionid: wechatUser.unionid,
      nickname: wechatUser.nickname,
      avatar: wechatUser.headimgurl
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(secret);

    console.log("[WechatCallback] 新用户，需要绑定手机号");

    const response = NextResponse.json({
      success: true,
      data: {
        wechatInfo: {
          openid: wechatUser.openid,
          nickname: wechatUser.nickname,
          avatar: wechatUser.headimgurl,
        },
        bindingRequired: true,
        isNewUser: true,
        message: "首次使用微信登录，请绑定手机号完成注册",
      },
    });

    // 设置临时绑定令牌
    response.cookies.set("wechat_bind_token", bindToken, {
      ...USER_COOKIE_OPTIONS,
      maxAge: 60 * 60, // 1小时过期
    });

    return response;
  } catch (error) {
    console.error("[WechatCallback] 异常:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: error instanceof Error ? error.message : "服务器错误",
        },
      },
      { status: 500 }
    );
  }
}

