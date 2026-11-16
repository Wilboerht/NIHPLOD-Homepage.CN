/**
 * 昵称合规审计与告警。
 *
 * - 拦截事件写 AuditLog（action=user_nickname_blocked, outcome=FAILURE），
 *   只记录来源/原因/分类，不落库被拦截的原始昵称，避免违规内容二次留存。
 * - 命名/改名成功写 AuditLog（action=user_nickname_update），detail 保留
 *   变更前后值，作为「改名历史」依据（审计日志已具备留存与防篡改链）。
 * - 拦截事件另发企业微信运营告警，带冷却去重，避免刷屏。
 */
import type { NicknameBanCategory, NicknameCheckFailureReason } from "@/lib/nickname-policy";
import { createAuditLog } from "@/lib/audit";
import { notifyWithCooldown } from "@/lib/alert-notify";
import { apiConsole } from "@/lib/logger";

export type NicknameAuditSource =
  | "register"
  | "profile_update"
  | "oauth_userinfo"
  | "admin_correction"
  | "wechat_callback"
  | "douyin_callback"
  | "wechat_bind"
  | "wechat_exchange"
  | "scan";

const SOURCE_LABELS: Record<NicknameAuditSource, string> = {
  register: "注册",
  profile_update: "主站资料修改",
  oauth_userinfo: "SSO 资料修改",
  admin_correction: "管理员修正",
  wechat_callback: "微信登录",
  douyin_callback: "抖音登录",
  wechat_bind: "微信绑定",
  wechat_exchange: "子站微信兑换",
  scan: "存量扫描",
};

const CATEGORY_LABELS: Record<NicknameBanCategory, string> = {
  porn: "色情低俗",
  gambling: "赌博博彩",
  drugs: "毒品",
  weapons: "武器爆炸物",
  violence: "暴力暴恐",
  extremism: "邪教极端主义",
  illegal: "诈骗非法交易",
  abuse: "侮辱谩骂",
};

const HOUR_MS = 60 * 60 * 1000;

export interface AdminActorInfo {
  id: string;
  email: string;
  name: string;
  role: string;
}

export async function auditNicknameBlocked(params: {
  request?: Request;
  userId?: string | null;
  admin?: AdminActorInfo | null;
  source: NicknameAuditSource;
  reason: NicknameCheckFailureReason;
  category?: NicknameBanCategory;
}): Promise<void> {
  const { request, userId, admin, source, reason, category } = params;

  try {
    await createAuditLog({
      action: "user_nickname_blocked",
      targetType: userId ? "user" : "system",
      targetId: userId ?? undefined,
      actorType: admin ? "ADMIN" : userId ? "USER" : "SYSTEM",
      adminId: admin?.id,
      actorEmail: admin?.email,
      actorName: admin?.name,
      actorRole: admin?.role,
      userId: admin ? undefined : (userId ?? undefined),
      outcome: "FAILURE",
      request,
      detail: {
        source,
        reason,
        category: category ?? null,
      },
    });
  } catch (error) {
    apiConsole.warn("[NicknameAudit] 拦截审计写入失败:", error);
  }

  if (reason !== "banned") return;

  notifyWithCooldown({
    ruleKey: "nickname-blocked",
    count: 1,
    cooldownMs: HOUR_MS,
    type: "ops",
    title: "昵称内容风控拦截",
    lines: [
      `- 来源：${SOURCE_LABELS[source]}`,
      `- 分类：${category ? CATEGORY_LABELS[category] : "未知"}`,
      userId ? `- 用户：${userId}` : "- 用户：未知/未创建",
      admin ? `- 操作人：${admin.email}` : "",
    ].filter(Boolean),
  });
}

export async function auditNicknameChange(params: {
  request?: Request;
  userId: string;
  oldNickname: string | null;
  newNickname: string | null;
  source: "profile_update" | "oauth_userinfo" | "scan";
}): Promise<void> {
  const { request, userId, oldNickname, newNickname, source } = params;

  try {
    await createAuditLog({
      action: "user_nickname_update",
      targetType: "user",
      targetId: userId,
      actorType: source === "scan" ? "SYSTEM" : "USER",
      userId: source === "scan" ? undefined : userId,
      outcome: "SUCCESS",
      request,
      detail: {
        source,
        oldNickname,
        newNickname,
      },
    });
  } catch (error) {
    apiConsole.warn("[NicknameAudit] 改名审计写入失败:", error);
  }
}
