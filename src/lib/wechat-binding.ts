/**
 * 微信绑定公共逻辑
 *
 * 供以下两个入口复用：
 * - /api/auth/wechat/bind（官网自身绑定，基于 __Host-wechat_bind_token Cookie）
 * - /api/v1/internal/wechat/exchange（子站跨域兑换，基于 wechat_exchange_token）
 *
 * 统一处理：短信验证码校验、账户冲突解决、用户创建/更新、双 Token 签发。
 */
import { prisma } from "@/lib/prisma";
import { WECHAT_PLACEHOLDER_PHONE_PREFIX } from "@/types/auth";
import {
  signUserToken,
  signRefreshToken,
  type WechatBindPayload,
  type WechatExchangePayload,
} from "@/lib/jwt";
import { saveRefreshToken, extractDeviceInfo } from "@/lib/auth-security";
import { checkUserStatus } from "@/lib/auth";
import { hashPassword, generateSecurePassword } from "@/lib/password";
import { verifyCode } from "@/lib/sms";
import { logAuthEvent } from "@/lib/auth-logger";
import { getClientIP } from "@/lib/client-ip";
import type { NextRequest } from "next/server";

export interface WechatBindingInput {
  phone: string;
  code: string;
  password?: string;
  allowAutoPassword: boolean;
  wechatInfo: WechatBindPayload | WechatExchangePayload;
  request: NextRequest;
}

export interface WechatBindingResult {
  user: {
    id: string;
    phone: string;
    nickname: string | null;
    avatar: string | null;
  };
  accessToken: string;
  refreshToken: string;
  passwordGenerated: boolean;
  message: string;
}

/**
 * 校验短信验证码并标记为已使用。
 */
async function verifyAndConsumeSmsCode(phone: string, code: string) {
  const smsCode = await prisma.smsCode.findFirst({
    where: {
      phone,
      type: "register",
      used: false,
      expiresAt: { gte: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!smsCode || !verifyCode(phone, code, "register", smsCode.codeHash)) {
    return { valid: false as const, error: "验证码错误或已过期" };
  }

  // 原子核销验证码（updateMany + used:false 防止并发重用）
  const consumeResult = await prisma.smsCode.updateMany({
    where: { id: smsCode.id, used: false },
    data: { used: true },
  });
  if (consumeResult.count === 0) {
    return { valid: false as const, error: "验证码已过期或已被使用" };
  }

  return { valid: true as const };
}

/**
 * 处理微信绑定/注册的核心逻辑。
 * 返回用户对象与登录凭证，调用方负责设置 Cookie 和响应格式。
 */
export async function resolveWechatBinding(
  input: WechatBindingInput
): Promise<
  { success: true; data: WechatBindingResult } | { success: false; code: string; message: string }
> {
  const { phone, code, allowAutoPassword, wechatInfo, request } = input;
  let { password } = input;

  // 1. 验证码校验
  const smsResult = await verifyAndConsumeSmsCode(phone, code);
  if (!smsResult.valid) {
    return { success: false, code: "INVALID_CODE", message: smsResult.error };
  }

  // 2. 密码处理
  let passwordGenerated = false;
  if (!password && allowAutoPassword) {
    password = generateSecurePassword(24);
    passwordGenerated = true;
  } else if (!password) {
    return { success: false, code: "PASSWORD_REQUIRED", message: "请提供密码或允许自动生成密码" };
  }

  const hashedPassword = await hashPassword(password);

  // 3-5. 在事务中原子化执行用户查找、冲突解决、创建/更新，消除竞态窗口
  let user;
  try {
    user = await prisma.$transaction(async (tx) => {
      const oldWechatUser = await tx.user.findFirst({
        where: wechatInfo.unionid
          ? { OR: [{ wechatUnionId: wechatInfo.unionid }, { wechatOpenId: wechatInfo.openid }] }
          : { wechatOpenId: wechatInfo.openid },
      });

      let foundUser = await tx.user.findUnique({ where: { phone } });

      // 4. 处理账户冲突
      if (oldWechatUser) {
        if (oldWechatUser.phone.startsWith(WECHAT_PLACEHOLDER_PHONE_PREFIX)) {
          if (foundUser && foundUser.id !== oldWechatUser.id) {
            // 旧临时账户与新手机号账户冲突，清理旧账户
            await tx.user.update({
              where: { id: oldWechatUser.id },
              data: {
                wechatOpenId: `unbound_${oldWechatUser.id}_${wechatInfo.openid}`,
                wechatUnionId: oldWechatUser.wechatUnionId
                  ? `unbound_${oldWechatUser.id}_${oldWechatUser.wechatUnionId}`
                  : null,
              },
            });
          } else if (!foundUser) {
            // 旧临时账户升级为真实账户
            foundUser = await tx.user.update({
              where: { id: oldWechatUser.id },
              data: {
                phone,
                phoneVerified: true,
                password: hashedPassword,
                nickname: oldWechatUser.nickname?.startsWith(WECHAT_PLACEHOLDER_PHONE_PREFIX)
                  ? wechatInfo.nickname || `用户_${phone.slice(-4)}`
                  : oldWechatUser.nickname || wechatInfo.nickname || `用户_${phone.slice(-4)}`,
                avatar: oldWechatUser.avatar || wechatInfo.avatar || null,
                wechatOpenId: wechatInfo.openid,
                wechatUnionId: wechatInfo.unionid || oldWechatUser.wechatUnionId,
              },
            });
          }
        } else {
          // 微信已绑定到真实账户
          if (!foundUser || foundUser.id !== oldWechatUser.id) {
            throw new Error("WECHAT_ALREADY_BOUND");
          }
          // 同手机号重新绑定：后续步骤更新资料
        }
      }

      // 5. 更新或创建用户
      // 需要更新的场景：无旧微信账户 或 旧账户为临时账户 或 同账户重新绑定
      const shouldUpdate =
        !oldWechatUser ||
        oldWechatUser.phone.startsWith(WECHAT_PLACEHOLDER_PHONE_PREFIX) ||
        foundUser?.id === oldWechatUser.id;

      if (foundUser && shouldUpdate) {
        foundUser = await tx.user.update({
          where: { id: foundUser.id },
          data: {
            wechatOpenId: wechatInfo.openid,
            wechatUnionId: wechatInfo.unionid || foundUser.wechatUnionId,
            password: hashedPassword,
            nickname: foundUser.nickname || wechatInfo.nickname || `用户_${phone.slice(-4)}`,
            avatar: foundUser.avatar || wechatInfo.avatar || null,
          },
        });
      } else if (!foundUser) {
        foundUser = await tx.user.create({
          data: {
            phone,
            password: hashedPassword,
            phoneVerified: true,
            nickname: wechatInfo.nickname || `用户_${phone.slice(-4)}`,
            avatar: wechatInfo.avatar || null,
            wechatOpenId: wechatInfo.openid,
            wechatUnionId: wechatInfo.unionid || null,
          },
        });
      }

      return foundUser;
    });
  } catch (error) {
    if (error instanceof Error && error.message === "WECHAT_ALREADY_BOUND") {
      return {
        success: false,
        code: "WECHAT_ALREADY_BOUND",
        message: "此微信已绑定其他账号，请使用绑定的手机号登录",
      };
    }
    throw error;
  }

  // 6. 校验账号状态
  const statusCheck = await checkUserStatus(user.id);
  if (!statusCheck.valid) {
    return {
      success: false,
      code: "ACCOUNT_DISABLED",
      message: statusCheck.reason || "账号状态异常",
    };
  }

  // 8. 签发双 Token
  const accessToken = await signUserToken({ id: user.id, phone: user.phone });
  const refreshToken = await signRefreshToken({ id: user.id, phone: user.phone });
  const refreshTokenExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await saveRefreshToken(user.id, refreshToken, refreshTokenExpiresAt, extractDeviceInfo(request));

  logAuthEvent("wechat_bind", {
    userId: user.id,
    identifier: user.phone,
    success: true,
    ip: getClientIP(request),
  });

  return {
    success: true,
    data: {
      user: {
        id: user.id,
        phone: user.phone,
        nickname: user.nickname,
        avatar: user.avatar,
      },
      accessToken,
      refreshToken,
      passwordGenerated,
      message: passwordGenerated
        ? "绑定成功，已自动登录。系统已为您生成安全密码，可在个人信息中修改"
        : "绑定成功，已自动登录",
    },
  };
}
