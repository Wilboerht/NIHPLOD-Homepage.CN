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
import { verifyCode, recordSmsCodeFailure, SMS_CODE_MAX_ATTEMPTS } from "@/lib/sms";
import { logAuthEvent } from "@/lib/auth-logger";
import { getClientIP } from "@/lib/client-ip";
import type { NextRequest } from "next/server";

export interface WechatBindingInput {
  phone: string;
  /** 短信验证码（短信通道必填；微信手机号快速验证通道免验证码） */
  code?: string;
  /**
   * 微信手机号快速验证组件（getPhoneNumber）换得的真实手机号。
   * 提供时视为微信已证明手机号归属，跳过短信验证码校验；
   * 必须与 phone 字段一致（调用方负责把两者设为同一值）。
   */
  wxVerifiedPhone?: string;
  password?: string;
  allowAutoPassword: boolean;
  wechatInfo: WechatBindPayload | WechatExchangePayload;
  request: NextRequest;
  /** 外部身份 provider 标识（默认 wechat_open；小程序登录传 wechat_miniprogram） */
  provider?: string;
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
  // 同时接受两种验证码类型：register（官网扫码绑定页复用注册通道发码，历史行为不变）与
  // bind（小程序「关联官网账户」通道，POST /api/auth/send-code type=bind）。
  // 取最新一条未使用记录；验证码哈希含 type（HMAC(phone:code:type)），
  // 校验时必须使用记录自身的 type，不能用固定值。
  // attempts 上限兜底：达到 SMS_CODE_MAX_ATTEMPTS 的码视同无效（正常已被作废标记 used）。
  // 绑定路径刻意不做手机号级锁定（避免零门槛锁号 DoS），单码作废是唯一的验证码防爆破防线。
  const smsCode = await prisma.smsCode.findFirst({
    where: {
      phone,
      type: { in: ["register", "bind"] },
      used: false,
      attempts: { lt: SMS_CODE_MAX_ATTEMPTS },
      expiresAt: { gte: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!smsCode) {
    return { valid: false as const, error: "验证码错误或已过期" };
  }
  if (!verifyCode(phone, code, smsCode.type, smsCode.codeHash)) {
    // 单码失败计数：达到上限自动作废该验证码（防爆破）
    await recordSmsCodeFailure(smsCode.id);
    return { valid: false as const, error: "验证码错误或已过期" };
  }

  // 原子核销验证码（updateMany + used:false 防止并发重用）
  const consumeResult = await prisma.smsCode.updateMany({
    where: { id: smsCode.id, used: false, expiresAt: { gte: new Date() } },
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
  const { phone, code, allowAutoPassword, wechatInfo, request, wxVerifiedPhone } = input;
  let { password } = input;
  const provider = input.provider || "wechat_open";
  // 仅微信开放平台/服务号写 User.wechatOpenId 旧列（该列语义即开放平台/服务号 openid）；
  // 小程序/抖音等其他平台 openid 仅写入 ExternalIdentity，不得污染旧列。
  // wechatUnionId 同理仅接受微信系 UnionID：抖音 unionid 是抖音主体内标识，不得混入。
  const isWechatProvider = provider.startsWith("wechat_");
  const writesLegacyWechatColumn = provider === "wechat_open" || provider === "wechat_mp";

  // 1. 验证码校验：微信手机号快速验证组件（getPhoneNumber）已由微信证明手机号归属，
  //    携带 wxVerifiedPhone 的通道跳过短信验证码；其余通道强制短信校验
  if (wxVerifiedPhone) {
    if (wxVerifiedPhone !== phone || !/^1[3-9]\d{9}$/.test(phone)) {
      return { success: false, code: "INVALID_PARAMS", message: "手机号校验失败" };
    }
  } else {
    if (!code) {
      return { success: false, code: "INVALID_CODE", message: "请输入验证码" };
    }
    const smsResult = await verifyAndConsumeSmsCode(phone, code);
    if (!smsResult.valid) {
      return { success: false, code: "INVALID_CODE", message: smsResult.error };
    }
  }

  // 2. 密码处理
  let passwordGenerated = false;
  if (!password && (allowAutoPassword || !!wxVerifiedPhone)) {
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
        // unionid 分支仅限微信系 provider：非微信 unionid 不得与 wechatUnionId 列比对
        where:
          wechatInfo.unionid && isWechatProvider
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
                ...(writesLegacyWechatColumn ? { wechatOpenId: wechatInfo.openid } : {}),
                // 非微信系 provider 完全不触碰 wechatUnionId 列（保持原值）
                ...(isWechatProvider
                  ? { wechatUnionId: wechatInfo.unionid || oldWechatUser.wechatUnionId }
                  : {}),
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
            ...(writesLegacyWechatColumn ? { wechatOpenId: wechatInfo.openid } : {}),
            // 非微信系 provider 完全不触碰 wechatUnionId 列（保持原值）
            ...(isWechatProvider
              ? { wechatUnionId: wechatInfo.unionid || foundUser.wechatUnionId }
              : {}),
            // 仅当用户尚无密码时才设置（新用户/临时账户升级）；已有密码的用户不受影响
            password: foundUser.password || hashedPassword,
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
            wechatOpenId: writesLegacyWechatColumn ? wechatInfo.openid : null,
            wechatUnionId: isWechatProvider ? wechatInfo.unionid || null : null,
          },
        });
      }

      // 身份冲突检测（全 provider 覆盖）：旧列 oldWechatUser 检测仅覆盖微信系，
      // 小程序/抖音等 openid 从不进旧列，ExternalIdentity 是其唯一冲突检测源。
      // 语义与旧列对齐：原归属为占位账户→允许抢占（身份行随 upsert 自动改挂）；
      // 原归属为真实账户→拒绝改绑（WECHAT_ALREADY_BOUND）。
      const existingIdentity = await tx.externalIdentity.findUnique({
        where: { provider_subjectId: { provider, subjectId: wechatInfo.openid } },
        select: { userId: true },
      });
      if (existingIdentity && existingIdentity.userId !== foundUser.id) {
        const previousOwner = await tx.user.findUnique({
          where: { id: existingIdentity.userId },
          select: { phone: true },
        });
        if (
          previousOwner &&
          !previousOwner.phone.startsWith(WECHAT_PLACEHOLDER_PHONE_PREFIX)
        ) {
          throw new Error("WECHAT_ALREADY_BOUND");
        }
      }

      // 双写 ExternalIdentity（多平台聚合框架）：upsert by [provider, subjectId]，
      // 冲突解决分支中归属随 wechatOpenId 列自动转移；占位账户改名 unbound_ 后
      // 身份行也随 upsert 重新指向最终归属用户
      await tx.externalIdentity.upsert({
        where: { provider_subjectId: { provider, subjectId: wechatInfo.openid } },
        update: {
          userId: foundUser.id,
          ...(wechatInfo.unionid ? { unionId: wechatInfo.unionid } : {}),
          metadata: { nickname: wechatInfo.nickname ?? null, avatar: wechatInfo.avatar ?? null },
        },
        create: {
          userId: foundUser.id,
          provider,
          subjectId: wechatInfo.openid,
          unionId: wechatInfo.unionid ?? null,
          metadata: { nickname: wechatInfo.nickname ?? null, avatar: wechatInfo.avatar ?? null },
        },
      });

      return foundUser;
    });
  } catch (error) {
    if (error instanceof Error && error.message === "WECHAT_ALREADY_BOUND") {
      return {
        success: false,
        code: "WECHAT_ALREADY_BOUND",
        message: "登录信息验证失败，请重试",
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
  const accessToken = await signUserToken({ id: user.id });
  const refreshToken = await signRefreshToken({ id: user.id });
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
