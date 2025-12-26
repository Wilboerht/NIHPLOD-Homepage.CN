/**
 * 微信登录回调 API
 * GET /api/auth/wechat/callback
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { signUserToken, getTokenExpiresAt } from "@/lib/jwt";
import { getWechatOAuthToken, getWechatUserInfo } from "@/lib/wechat";
import { USER_COOKIE_OPTIONS, USER_COOKIE_NAME } from "@/types/auth";

// 注册奖励点数
const REGISTER_BONUS_POINTS = 10;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");

    // 获取重定向地址（从 state 解析或默认）
    let redirectUrl = "/user";
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
      return NextResponse.redirect(new URL(`/login?error=wechat_denied`, request.url));
    }

    if (!code) {
      return NextResponse.redirect(new URL(`/login?error=missing_code`, request.url));
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
    let user = await prisma.user.findFirst({
      where: wechatUser.unionid
        ? { OR: [{ wechatUnionId: wechatUser.unionid }, { wechatOpenId: wechatUser.openid }] }
        : { wechatOpenId: wechatUser.openid },
    });

    let isNewUser = false;

    if (!user) {
      // 新用户注册
      isNewUser = true;
      
      // 生成临时手机号占位符（微信登录可能没有手机号）
      const tempPhone = `wx_${wechatUser.openid.slice(0, 11)}`;
      
      user = await prisma.user.create({
        data: {
          phone: tempPhone,
          phoneVerified: false, // 微信登录默认手机未验证
          nickname: wechatUser.nickname || null,
          avatar: wechatUser.headimgurl || null,
          wechatOpenId: wechatUser.openid,
          wechatUnionId: wechatUser.unionid || null,
          points: REGISTER_BONUS_POINTS,
          totalPoints: REGISTER_BONUS_POINTS,
        },
      });

      // 记录注册奖励点数
      await prisma.pointRecord.create({
        data: {
          userId: user.id,
          type: "REGISTER_BONUS",
          amount: REGISTER_BONUS_POINTS,
          balance: REGISTER_BONUS_POINTS,
          description: "微信注册奖励",
        },
      });

      console.log(`[WechatCallback] 新用户注册: ${wechatUser.nickname}`);
    } else {
      // 更新用户信息
      await prisma.user.update({
        where: { id: user.id },
        data: {
          wechatOpenId: wechatUser.openid,
          wechatUnionId: wechatUser.unionid || user.wechatUnionId,
          // 如果用户没有设置昵称和头像，使用微信的
          nickname: user.nickname || wechatUser.nickname || null,
          avatar: user.avatar || wechatUser.headimgurl || null,
        },
      });

      console.log(`[WechatCallback] 用户登录: ${user.nickname || wechatUser.nickname}`);
    }

    // 签发 Token
    const token = await signUserToken({
      id: user.id,
      phone: user.phone,
    });

    const _expiresAt = getTokenExpiresAt(30);

    // 构建重定向响应
    const response = NextResponse.redirect(
      new URL(`${redirectUrl}?login=success&new=${isNewUser}`, request.url)
    );

    // 设置 Cookie
    response.cookies.set(USER_COOKIE_NAME, token, USER_COOKIE_OPTIONS);

    return response;
  } catch (error) {
    console.error("[WechatCallback] 异常:", error);
    return NextResponse.redirect(new URL(`/login?error=wechat_failed`, request.url));
  }
}

