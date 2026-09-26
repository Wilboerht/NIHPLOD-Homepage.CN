/**
 * 主站 → 测肤子站（advisor.nihplod.cn）内部接口客户端
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
 */
import { createSignedInternalRequestHeaders, canonicalizeQuery } from "@/lib/internal-api";
import { getClientIP } from "@/lib/client-ip";
import { apiConsole } from "@/lib/logger";

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_BASE = "https://advisor.nihplod.cn";

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
  /** 查询参数（默认签名不含 query；开启 INTERNAL_API_SIGN_QUERY=true 后参与签名） */
  query?: Record<string, string | number | boolean | null | undefined>;
  /** 请求体（JSON 序列化后参与签名） */
  body?: unknown;
  timeoutMs?: number;
}

export type AdvisorResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; code: string; message: string };

function buildHeaders(
  method: AdvisorMethod,
  path: string,
  bodyText: string,
  canonicalQuery: string
): Record<string, string> | null {
  const signed = createSignedInternalRequestHeaders("advisor", method, path, bodyText, {
    query: canonicalQuery,
  });
  if (signed) {
    return bodyText ? { ...signed, "Content-Type": "application/json" } : signed;
  }

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
  const headers = buildHeaders(method, path, bodyText, canonical);
  if (!headers) {
    return { ok: false, status: 0, code: "NOT_CONFIGURED", message: "未配置子站内部 API 密钥" };
  }

  const url = `${advisorBaseUrl()}${path}${search}`;
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
