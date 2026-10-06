/**
 * 主站 → 测肤子站（smart.nihplod.cn）内部接口客户端
 *
 * 用途：用户中心「护肤档案」读取/操作用户在子站的测肤与打卡数据
 * （子站是护肤档案的唯一数据源）；会员中心测肤用量也复用本模块。
 *
 * 鉴权：
 * - 优先 HMAC 签名（INTERNAL_API_KEYS 的 advisor 条目）。默认签旧格式（仅 pathname），
 *   子站支持 query 绑定后设置 INTERNAL_API_SIGN_QUERY=true 切换到
 *   `METHOD|path|query|...` 新格式（防 query 篡改）；
 * - 未配置时回退旧版 Bearer（ADVISOR_INTERNAL_SECRET）；
 * - 两者都未配置时返回 NOT_CONFIGURED（只读场景由 advisorJson 降级为 null）。
 *
 * 所有接口统一用 `userId`（= 主站 SSO sub，与子站 User.id 相同）定位用户。
 *
 * 账号注销数据清除见文末「子站用户数据清除目标注册表」（SUBSITE_PURGE_TARGETS 驱动）。
 */
import { createSignedInternalRequestHeaders, canonicalizeQuery } from "@/lib/internal-api";
import { getClientIP } from "@/lib/client-ip";
import { apiConsole } from "@/lib/logger";

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_BASE = "https://smart.nihplod.cn";

export function advisorBaseUrl(): string {
  return (process.env.ADVISOR_API_BASE || DEFAULT_BASE).replace(/\/+$/, "");
}

/**
 * 兜底取客户端 IP：`getClientIP` 在生产未配置 TRUST_PROXY 时会抛错，
 * 而 clientIp 只是子站懒认领的可选增强——异常时降级为 "unknown"（调用方会跳过传参），
 * 不能让它把护肤档案等主流程一起打断。
 */
export function resolveClientIp(request: Request | { headers: Headers }): string {
  try {
    return getClientIP(request);
  } catch {
    return "unknown";
  }
}

export type AdvisorMethod = "GET" | "POST" | "DELETE";

export interface AdvisorRequestOptions {
  method?: AdvisorMethod;
  /** 查询参数（默认签名不含 query；开启 INTERNAL_API_SIGN_QUERY=true 或 signQuery 后参与签名） */
  query?: Record<string, string | number | boolean | null | undefined>;
  /** 请求体（JSON 序列化后参与签名） */
  body?: unknown;
  timeoutMs?: number;
  /** 覆盖目标 baseUrl（默认 advisorBaseUrl()，即 ADVISOR_API_BASE） */
  baseUrl?: string;
  /** HMAC 密钥 project（默认 "advisor"，对应 INTERNAL_API_KEYS 条目） */
  project?: string;
  /** 强制 query 绑定签名（注销数据清除等敏感操作使用，独立于 INTERNAL_API_SIGN_QUERY 全局开关） */
  signQuery?: boolean;
}

export type AdvisorResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; code: string; message: string };

function buildHeaders(
  method: AdvisorMethod,
  path: string,
  bodyText: string,
  canonicalQuery: string,
  project: string,
  signQuery: boolean
): Record<string, string> | null {
  const signed = createSignedInternalRequestHeaders(project, method, path, bodyText, {
    query: canonicalQuery,
    forceQueryBinding: signQuery,
  });
  if (signed) {
    return bodyText ? { ...signed, "Content-Type": "application/json" } : signed;
  }

  // 旧版 Bearer 回退仅适用于 advisor 子站（其他子站无对应 secret 环境变量）
  if (project !== "advisor") return null;
  const secret = process.env.ADVISOR_INTERNAL_SECRET;
  if (!secret) return null;
  return bodyText
    ? { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" }
    : { Authorization: `Bearer ${secret}` };
}

function buildQuery(query: AdvisorRequestOptions["query"]): { search: string; canonical: string } {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== "") {
      search.set(key, String(value));
    }
  }
  const qs = search.toString();
  return { search: qs ? `?${qs}` : "", canonical: canonicalizeQuery(qs) };
}

/** 调用子站内部接口；网络/超时/非 2xx 归一化为失败结果（不抛异常） */
export async function advisorRequest<T>(
  path: string,
  options: AdvisorRequestOptions = {}
): Promise<AdvisorResult<T>> {
  const method = options.method ?? "GET";
  const bodyText = options.body !== undefined ? JSON.stringify(options.body) : "";
  const { search, canonical } = buildQuery(options.query);
  const project = options.project ?? "advisor";
  const headers = buildHeaders(method, path, bodyText, canonical, project, options.signQuery ?? false);
  if (!headers) {
    return { ok: false, status: 0, code: "NOT_CONFIGURED", message: "未配置子站内部 API 密钥" };
  }

  const baseUrl = (options.baseUrl ?? advisorBaseUrl()).replace(/\/+$/, "");
  const url = `${baseUrl}${path}${search}`;
  try {
    const res = await fetch(url, {
      method,
      headers,
      body: bodyText || undefined,
      signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      cache: "no-store",
    });
    const payload = (await res.json().catch(() => null)) as { error?: string } | null;

    if (!res.ok) {
      apiConsole.warn("[advisor-internal] 子站响应异常", { path, status: res.status });
      return {
        ok: false,
        status: res.status,
        code: res.status === 401 ? "UNAUTHORIZED" : "UPSTREAM_ERROR",
        message: typeof payload?.error === "string" ? payload.error : "子站服务暂时不可用",
      };
    }

    return { ok: true, status: res.status, data: payload as T };
  } catch (error) {
    apiConsole.warn("[advisor-internal] 子站不可达", { path, error: String(error) });
    return { ok: false, status: 0, code: "UPSTREAM_ERROR", message: "子站服务连接失败" };
  }
}

/** 只读场景降级封装：任何失败返回 null（与测肤用量查询同口径，不影响主流程） */
export async function advisorJson<T>(
  path: string,
  options: AdvisorRequestOptions = {}
): Promise<T | null> {
  const result = await advisorRequest<T>(path, options);
  return result.ok ? result.data : null;
}

/**
 * 子站失败 → 官网 BFF 错误映射：
 * - 400（参数/业务校验）：保留 400，错误码归一为 INVALID_PARAMS（前端可读文案来自子站）
 * - 429（限流）：保留 429，错误码 RATE_LIMITED（前端可提示"操作过于频繁"）
 * - 其余（401 密钥/5xx/网络）：统一 502 UPSTREAM_ERROR 语义（code 沿用子站分类）
 */
export function mapAdvisorError(result: {
  status: number;
  code: string;
  message: string;
}): { status: number; code: string; message: string } {
  if (result.status === 400) {
    return { status: 400, code: "INVALID_PARAMS", message: result.message };
  }
  if (result.status === 429) {
    return { status: 429, code: "RATE_LIMITED", message: result.message };
  }
  return { status: 502, code: result.code, message: result.message };
}

// ============================================
// 账号注销：子站用户数据清除目标注册表
// ============================================

const DEFAULT_PURGE_PATH = "/api/internal/user-data/purge";

/** 子站数据清除目标：账号注销执行时逐一调用 */
export interface SubsitePurgeTarget {
  /** 目标名：失败告警/审计标识；未单独指定 project 时同时作为 INTERNAL_API_KEYS 的 project */
  name: string;
  baseUrl: string;
  purgePath: string;
  /** HMAC 密钥 project（缺省 = name） */
  project?: string;
}

function defaultPurgeTargets(): SubsitePurgeTarget[] {
  // 向后兼容：未配置 SUBSITE_PURGE_TARGETS 时仅 advisor 一个目标（ADVISOR_API_BASE 派生）
  return [{ name: "advisor", baseUrl: advisorBaseUrl(), purgePath: DEFAULT_PURGE_PATH }];
}

/**
 * 解析 SUBSITE_PURGE_TARGETS 环境变量（JSON 数组）：
 * [{"name":"advisor","baseUrl":"https://smart.nihplod.cn","purgePath":"/api/internal/user-data/purge"}]
 * purgePath 可省略（默认 /api/internal/user-data/purge）。
 * 未配置或解析失败时回退 advisor 默认目标，保证存量部署行为不变。
 */
export function getSubsitePurgeTargets(): SubsitePurgeTarget[] {
  const raw = process.env.SUBSITE_PURGE_TARGETS;
  if (!raw) return defaultPurgeTargets();

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error("必须是 JSON 数组");
    const targets: SubsitePurgeTarget[] = [];
    for (const item of parsed as Record<string, unknown>[]) {
      if (!item || typeof item.name !== "string" || typeof item.baseUrl !== "string" || !item.name || !item.baseUrl) {
        apiConsole.warn("[advisor-internal] SUBSITE_PURGE_TARGETS 条目缺少 name/baseUrl，已跳过:", item);
        continue;
      }
      targets.push({
        name: item.name,
        baseUrl: item.baseUrl,
        purgePath: typeof item.purgePath === "string" && item.purgePath ? item.purgePath : DEFAULT_PURGE_PATH,
        project: typeof item.project === "string" && item.project ? item.project : undefined,
      });
    }
    return targets;
  } catch (error) {
    apiConsole.error("[advisor-internal] 解析 SUBSITE_PURGE_TARGETS 失败，回退 advisor 默认目标:", error);
    return defaultPurgeTargets();
  }
}

export type SubsitePurgeResult =
  | { ok: true }
  | { ok: false; target: string; code: string; message: string };

/**
 * 账号注销：通知全部已配置子站清除该用户数据
 *
 * - purge 请求始终绑定 query 签名（userId 防篡改），独立于 INTERNAL_API_SIGN_QUERY；
 * - 目标未配置内部 API 密钥（NOT_CONFIGURED）：warn 级跳过，不阻断注销（配置缺失
 *   不等于数据存在，注销权履行不得被配置项卡死）；
 * - 已配置目标不可达/报错：立即返回失败（含目标名，供人工队列定位），
 *   由调用方置 FAILED 等下次 cron 重试——数据合规口径不放松。
 */
export async function purgeUserFromSubsites(userId: string): Promise<SubsitePurgeResult> {
  for (const target of getSubsitePurgeTargets()) {
    const result = await advisorRequest(target.purgePath, {
      method: "POST",
      query: { userId },
      baseUrl: target.baseUrl,
      project: target.project ?? target.name,
      signQuery: true,
    });
    if (result.ok) continue;
    if (result.code === "NOT_CONFIGURED") {
      apiConsole.warn(`[advisor-internal] 子站 ${target.name} 未配置内部 API 密钥，跳过数据清除`, { userId });
      continue;
    }
    apiConsole.warn(`[advisor-internal] 子站 ${target.name} 数据清除失败`, {
      userId,
      code: result.code,
      status: result.status,
    });
    return { ok: false, target: target.name, code: result.code, message: result.message };
  }
  return { ok: true };
}
