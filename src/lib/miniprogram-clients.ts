/**
 * 小程序客户端凭证解析（多小程序支持）
 *
 * 环境变量 MINIPROGRAM_CLIENTS（JSON 数组）按 clientId 分发微信 AppID/AppSecret：
 *   [{"clientId":"wechat-mp-skin","appId":"wx1234567890abcdef","appSecret":"..."}]
 *
 * - clientId 需与 SSO 后台 OAuth Client（public）的 clientId 一致；
 * - 凭证不进数据库、不进日志（错误日志仅带 clientId）；
 * - 未配置时回退旧版单小程序变量（WECHAT_MINIPROGRAM_* → WECHAT_* 回退），
 *   仅对缺省客户端 wechat-mp-skin 生效（存量部署零改动）；
 * - 非法条目丢弃并打 error 日志（同一配置内容仅记录一次）；JSON 整体解析失败按
 *   "未配置"处理（缺省客户端仍回退旧变量，避免存量登录中断）。
 */
import { apiConsole } from "@/lib/logger";
import { legacyMiniprogramCredentials, type MiniprogramCredentials } from "@/lib/wechat";

/** 缺省小程序客户端（测肤小程序）：请求未携带 clientId 时的兼容默认值 */
export const DEFAULT_MINIPROGRAM_CLIENT_ID = "wechat-mp-skin";

/** AppID 官方格式：wx + 16 位十六进制 */
const APP_ID_PATTERN = /^wx[0-9a-f]{16}$/i;

/** 明显的占位/示例值（防止把文档示例原样配进生产） */
const PLACEHOLDER_SECRET_PATTERN = /example|placeholder|replace|your-|xxxx/i;

export interface MiniprogramClientEntry extends MiniprogramCredentials {
  clientId: string;
}

/** 解析结果：configured 表示 env 是否有内容；errors 为被丢弃条目的问题描述 */
export interface MiniprogramClientsParseResult {
  configured: boolean;
  entries: MiniprogramClientEntry[];
  errors: string[];
}

/**
 * 解析 MINIPROGRAM_CLIENTS（纯函数，运行时与生产配置守卫脚本共用）
 */
export function parseMiniprogramClientsEnv(raw: string | undefined): MiniprogramClientsParseResult {
  const trimmed = raw?.trim();
  if (!trimmed) {
    return { configured: false, entries: [], errors: [] };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { configured: true, entries: [], errors: ["不是合法 JSON"] };
  }
  if (!Array.isArray(parsed)) {
    return { configured: true, entries: [], errors: ["需为 JSON 数组"] };
  }

  const entries: MiniprogramClientEntry[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();

  for (const item of parsed) {
    if (!item || typeof item !== "object") {
      errors.push("存在非对象条目（已丢弃）");
      continue;
    }
    const { clientId, appId, appSecret } = item as Record<string, unknown>;
    if (typeof clientId !== "string" || clientId.trim() === "") {
      errors.push("存在缺少 clientId 的条目（已丢弃）");
      continue;
    }
    if (seen.has(clientId)) {
      errors.push(`clientId 重复：${clientId}（已丢弃）`);
      continue;
    }
    if (typeof appId !== "string" || !APP_ID_PATTERN.test(appId)) {
      errors.push(`clientId ${clientId} 的 appId 格式非法（应为 wx + 16 位十六进制，已丢弃）`);
      continue;
    }
    if (
      typeof appSecret !== "string" ||
      appSecret.length < 16 ||
      PLACEHOLDER_SECRET_PATTERN.test(appSecret)
    ) {
      errors.push(`clientId ${clientId} 的 appSecret 缺失、过短或为示例值（已丢弃）`);
      continue;
    }
    seen.add(clientId);
    entries.push({ clientId, appId, appSecret });
  }

  return { configured: true, entries, errors };
}

/** 同一份非法配置内容只记录一次错误日志（避免每次请求重复刷屏） */
let lastLoggedRaw: string | null = null;

/**
 * 按 clientId 解析微信凭证（运行时入口）。
 * 未命中或缺省客户端未显式配置时，回退旧版单小程序变量（仅缺省客户端）。
 */
export function resolveMiniprogramCredentials(clientId: string): MiniprogramCredentials | null {
  const raw = process.env.MINIPROGRAM_CLIENTS;
  const { configured, entries, errors } = parseMiniprogramClientsEnv(raw);

  if (configured) {
    if (errors.length > 0 && lastLoggedRaw !== (raw ?? "")) {
      for (const err of errors) {
        apiConsole.error(`[MiniprogramClients] MINIPROGRAM_CLIENTS ${err}`);
      }
      lastLoggedRaw = raw ?? "";
    }
    const found = entries.find((e) => e.clientId === clientId);
    if (found) {
      return { appId: found.appId, appSecret: found.appSecret };
    }
  }

  if (clientId === DEFAULT_MINIPROGRAM_CLIENT_ID) {
    return legacyMiniprogramCredentials();
  }
  return null;
}
