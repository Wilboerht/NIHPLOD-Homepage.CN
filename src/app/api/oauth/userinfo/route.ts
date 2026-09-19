/**
 * OAuth 2.0 UserInfo 端点
 * GET /api/oauth/userinfo - 返回当前 Access Token 对应的用户信息
 * PATCH /api/oauth/userinfo - 修改用户资料（需 profile:write scope）
 *
 * GET 按 token 中的 scope claim 裁剪返回字段，敏感字段（phone）脱敏。
 * PATCH 与主站自用 PUT /api/user/profile 共用校验 schema 与生日锁定规则，
 * 资料实际变更时向已授权子项目推送 profile_update webhook。
 *
 * CORS：仅允许已注册 redirect_uri 的 origin。
 */
import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOAuthCorsHeaders } from "@/lib/oauth-cors";
import { scheduleSsoEvent } from "@/lib/sso-audit";
import { maskPhone } from "@/lib/mask-phone";
import { POINT_REDEEM_RATES } from "@/lib/membership";
import { authenticateOAuthResourceRequest, isM2mPayload } from "@/lib/oauth-resource-auth";
import { updateProfileSchema } from "@/lib/profile-schema";
import { sendProfileUpdateWebhook } from "@/lib/profile-webhook";
import { apiConsole } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    // 共享鉴权：CORS → 限流 → Bearer 提取 → token 验证 → 黑名单 → DPoP 绑定验证
    const auth = await authenticateOAuthResourceRequest(request, "GET");
    if (!auth.ok) return auth.response;
    const { payload, ip, resJson } = auth;

    // M2M token（client_credentials grant）：无用户身份，仅返回 sub
    if (isM2mPayload(payload)) {
      scheduleSsoEvent({
        event: "userinfo",
        clientId: payload.client_id,
        ip,
        success: true,
        detail: { type: "client_credentials" },
      });
      return resJson({ sub: payload.id });
    }

    // 从数据库获取最新用户信息
    const user = await prisma.user.findUnique({
      where: { id: payload.id },
      select: {
        id: true,
        phone: true,
        nickname: true,
        avatar: true,
        birthday: true,
        gender: true,
        status: true,
        membershipLevel: true,
        totalSpent: true,
      },
    });

    if (!user || user.status !== "ACTIVE") {
      scheduleSsoEvent({
        event: "userinfo",
        userId: payload.id,
        clientId: payload.client_id,
        ip,
        success: false,
        detail: { reason: "account_disabled" },
      });
      return resJson({ error: "account_disabled", error_description: "账户已被封禁或冻结" }, 403);
    }

    // 按 scope 裁剪返回字段
    const scopes = (payload.scope || "").split(" ").filter(Boolean);
    const response: Record<string, unknown> = {
      sub: user.id,
    };

    if (scopes.includes("profile")) {
      response.nickname = user.nickname;
      response.avatar = user.avatar;
      // OIDC 标准 profile claim；null = 未设置/保密（子站测肤问卷据此预填性别）
      response.gender = user.gender ?? null;
    }

    if (scopes.includes("phone")) {
      // phone 为历史非标准 claim 名，为兼容已接入子项目保留；
      // phone_number 为 OIDC 标准 claim 名，两者语义一致（均为脱敏手机号）
      const maskedPhone = maskPhone(user.phone);
      response.phone = maskedPhone;
      response.phone_number = maskedPhone;
    }

    if (scopes.includes("membership")) {
      response.membership_level = user.membershipLevel;
      // 累计消费金额（单位：元），供子站（如测肤站）按消费额计算权益配额
      response.total_spent = user.totalSpent;
      // 积分兑礼率（1 积分可兑价值；普通档为 null=不参与积分）：
      // 商城兑换礼品时按 商品价值 ÷ 兑礼率 向下取整折算需扣积分
      response.points_redeem_rate = POINT_REDEEM_RATES[user.membershipLevel];
    }

    if (scopes.includes("birthday")) {
      // 与 /api/user/profile 输出格式一致：ISO 8601 字符串，未设置时为 null
      response.birthday = user.birthday ? user.birthday.toISOString() : null;
    }

    scheduleSsoEvent({
      event: "userinfo",
      userId: payload.id,
      clientId: payload.client_id,
      ip,
      success: true,
    });

    return resJson(response);
  } catch (error) {
    apiConsole.error("[OAuth UserInfo] 异常:", error);
    return NextResponse.json(
      { error: "server_error", error_description: "服务器内部错误" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    // 共享鉴权（DPoP htm 按实际方法传 "PATCH"）
    const auth = await authenticateOAuthResourceRequest(request, "PATCH");
    if (!auth.ok) return auth.response;
    const { payload, ip, resJson } = auth;
    const userAgent = request.headers.get("user-agent") ?? undefined;

    // M2M token 无用户身份，拒绝资料写操作
    if (isM2mPayload(payload)) {
      scheduleSsoEvent({
        event: "userinfo",
        clientId: payload.client_id,
        ip,
        userAgent,
        success: false,
        detail: { action: "profile_update", reason: "m2m_token" },
      });
      return resJson(
        { error: "forbidden", error_description: "M2M token 无用户身份，不支持资料修改" },
        403
      );
    }

    // 写操作要求 token 显式授予 profile:write scope
    const scopes = (payload.scope || "").split(" ").filter(Boolean);
    if (!scopes.includes("profile:write")) {
      scheduleSsoEvent({
        event: "userinfo",
        userId: payload.id,
        clientId: payload.client_id,
        ip,
        userAgent,
        success: false,
        detail: { action: "profile_update", reason: "insufficient_scope" },
      });
      return resJson(
        { error: "insufficient_scope", error_description: "需要 profile:write scope" },
        403,
        { "WWW-Authenticate": 'Bearer error="insufficient_scope", scope="profile:write"' }
      );
    }

    // 请求体校验（与主站自用 PUT /api/user/profile 共用 schema）
    const body = await request.json().catch(() => undefined);
    const result = updateProfileSchema.safeParse(body);
    if (!result.success) {
      return resJson(
        {
          error: "invalid_request",
          error_description: result.error.issues[0]?.message || "参数错误",
        },
        400
      );
    }

    const { nickname, avatar, birthday, gender } = result.data;

    // 更新前读取旧值，用于判断资料是否实际变更（无实际变更不触发 webhook）
    // 以及生日锁定判定
    const previous = await prisma.user.findUnique({
      where: { id: payload.id },
      select: { nickname: true, avatar: true, birthday: true, birthdayLocked: true, status: true },
    });

    if (!previous || previous.status !== "ACTIVE") {
      scheduleSsoEvent({
        event: "userinfo",
        userId: payload.id,
        clientId: payload.client_id,
        ip,
        userAgent,
        success: false,
        detail: { action: "profile_update", reason: "account_disabled" },
      });
      return resJson({ error: "account_disabled", error_description: "账户已被封禁或冻结" }, 403);
    }

    // 生日锁定：与主站自用一致——生日是生日积分发放依据，首次设置后锁定，修改需人工客服
    if (birthday !== undefined && (previous.birthday || previous.birthdayLocked)) {
      const targetValue = birthday === "" ? null : birthday;
      const unchanged = (previous.birthday?.getTime() ?? null) === (targetValue?.getTime() ?? null);
      if (!unchanged) {
        scheduleSsoEvent({
          event: "userinfo",
          userId: payload.id,
          clientId: payload.client_id,
          ip,
          userAgent,
          success: false,
          detail: { action: "profile_update", reason: "birthday_locked" },
        });
        return resJson(
          { error: "birthday_locked", error_description: "生日已设置过，如需修改请联系客服" },
          403
        );
      }
    }

    const user = await prisma.user.update({
      where: { id: payload.id },
      data: {
        ...(nickname !== undefined && { nickname: nickname || null }),
        ...(avatar !== undefined && { avatar: avatar || null }),
        // 首次设置生日时写入锁定标记（此后不可自助修改）
        ...(birthday !== undefined && {
          birthday: birthday === "" ? null : birthday,
          birthdayLocked: birthday === "" ? previous.birthdayLocked : true,
        }),
        // 性别不锁定：null 表示清除（保密）
        ...(gender !== undefined && { gender }),
      },
      select: { id: true, nickname: true, avatar: true, birthday: true, gender: true },
    });

    // 昵称/头像/生日有实际变更时，向已授权且配置 webhookUri 的子项目推送 profile_update
    // 事件（fire-and-forget：after 注册保证响应返回后执行，失败不影响本次响应）
    const profileChanged =
      previous.nickname !== user.nickname ||
      previous.avatar !== user.avatar ||
      (previous.birthday?.getTime() ?? null) !== (user.birthday?.getTime() ?? null);
    if (profileChanged) {
      const snapshot = {
        nickname: user.nickname,
        avatar: user.avatar,
        birthday: user.birthday?.toISOString() ?? null,
      };
      try {
        after(() => sendProfileUpdateWebhook(payload.id, snapshot));
      } catch {
        // 非请求场景（测试等无 request scope）：降级为 fire-and-forget promise
        void sendProfileUpdateWebhook(payload.id, snapshot);
      }
    }

    scheduleSsoEvent({
      event: "userinfo",
      userId: payload.id,
      clientId: payload.client_id,
      ip,
      userAgent,
      success: true,
      detail: { action: "profile_update" },
    });

    // 返回更新后的 profile claims（形状同 GET 的 profile scope 分支）
    return resJson({
      sub: user.id,
      nickname: user.nickname,
      avatar: user.avatar,
      gender: user.gender ?? null,
      birthday: user.birthday ? user.birthday.toISOString() : null,
    });
  } catch (error) {
    apiConsole.error("[OAuth UserInfo PATCH] 异常:", error);
    return NextResponse.json(
      { error: "server_error", error_description: "服务器内部错误" },
      { status: 500 }
    );
  }
}

export async function OPTIONS(request: NextRequest) {
  const corsHeaders = await getOAuthCorsHeaders(request);
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}
