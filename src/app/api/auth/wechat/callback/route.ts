/**
 * 微信登录回调 API
 * GET /api/auth/wechat/callback
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { signUserToken } from "@/lib/jwt";
import { getWechatOAuthToken, getWechatUserInfo } from "@/lib/wechat";
import { USER_COOKIE_OPTIONS, USER_COOKIE_NAME } from "@/types/auth";
import { SignJWT } from "jose";

const secret = new TextEncoder().encode(
  process.env.JWT_SECRET || "dev-secret-key-change-in-production-32chars"
);



// 强制动态渲染，禁止静态预渲染
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  let redirectUrl = "/";
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");

    // 获取重定向地址（从 state 解析或默认）
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
      const fallbackUrl = new URL(redirectUrl, request.url);
      fallbackUrl.searchParams.set("error", "wechat_denied");
      return NextResponse.redirect(fallbackUrl);
    }

    if (!code) {
      const fallbackUrl = new URL(redirectUrl, request.url);
      fallbackUrl.searchParams.set("error", "missing_code");
      return NextResponse.redirect(fallbackUrl);
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

    let isNewUser = false;
    let needsBind = false;

    if (!user || user.phone.startsWith("wx_")) {
      // Need to bind phone and set password
      needsBind = true;
      isNewUser = !user;
    } else {
      // Update existing real user
      await prisma.user.update({
        where: { id: user.id },
        data: {
          wechatOpenId: wechatUser.openid,
          wechatUnionId: wechatUser.unionid || user.wechatUnionId,
          nickname: user.nickname || wechatUser.nickname || null,
          avatar: user.avatar || wechatUser.headimgurl || null,
        },
      });

      console.log(`[WechatCallback] 用户登录: ${user.nickname || wechatUser.nickname}`);
    }

    if (needsBind) {
      // Create a temporary bind token
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

      const response = NextResponse.redirect(
        new URL(`${redirectUrl}?login=wechat_bind&new=${isNewUser}`, request.url)
      );

      // Set temporary cookie for binding
      response.cookies.set("wechat_bind_token", bindToken, { ...USER_COOKIE_OPTIONS, maxAge: 60 * 60 });
      return response;
    }

    // Regular login
    const token = await signUserToken({
      id: user!.id,
      phone: user!.phone,
    });

    const response = NextResponse.redirect(
      new URL(`${redirectUrl}?login=success&new=false`, request.url)
    );

    // 设置 Cookie
    response.cookies.set(USER_COOKIE_NAME, token, USER_COOKIE_OPTIONS);

    return response;
  } catch (error) {
    console.error("[WechatCallback] 异常:", error);
    try {
      const fallbackUrl = new URL(redirectUrl, request.url);
      fallbackUrl.searchParams.set("error", "wechat_failed");
      return NextResponse.redirect(fallbackUrl);
    } catch {
      return NextResponse.redirect(new URL(`/login?error=wechat_failed`, request.url));
    }
  }
}

