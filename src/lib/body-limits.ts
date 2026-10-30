/**
 * 请求体大小上限（按路径）。
 *
 * Next.js Route Handler 默认不会限制请求体大小；这里提供一份共享的路径上限，
 * 由 middleware 做 Content-Length 快速拒绝，route 层再用 request-body.ts
 * 对 chunked/缺失 Content-Length 的请求做流式硬限制。
 */
export const BODY_LIMITS = {
  authJson: 64 * 1024,
  oauthJson: 64 * 1024,
  defaultJson: 1024 * 1024,
  adminJson: 2 * 1024 * 1024,
  internalApi: 1024 * 1024,
  cron: 256 * 1024,
  resumeUpload: 12 * 1024 * 1024,
  imageUpload: 12 * 1024 * 1024,
  spentImportUpload: 6 * 1024 * 1024,
  spentImportExecute: 3 * 1024 * 1024,
} as const;

const EXACT_LIMITS: ReadonlyArray<[string, number]> = [
  ["/api/careers/apply", BODY_LIMITS.resumeUpload],
  ["/api/admin/spent-import/upload", BODY_LIMITS.spentImportUpload],
  ["/api/admin/spent-import/execute", BODY_LIMITS.spentImportExecute],
  ["/api/admin/spent-adjustments/upload", BODY_LIMITS.imageUpload],
  ["/api/admin/upload", BODY_LIMITS.imageUpload],
  ["/api/upload", BODY_LIMITS.imageUpload],
  ["/api/user/profile", BODY_LIMITS.imageUpload],
  ["/api/oauth/userinfo/avatar", BODY_LIMITS.imageUpload],
  ["/api/user/spent-adjustments/upload", BODY_LIMITS.imageUpload],
  ["/api/oauth/spent-adjustments/upload", BODY_LIMITS.imageUpload],
  ["/api/oauth/token", BODY_LIMITS.oauthJson],
  ["/api/oauth/introspect", BODY_LIMITS.oauthJson],
  ["/api/oauth/revoke", BODY_LIMITS.oauthJson],
  ["/api/admin/login", BODY_LIMITS.authJson],
];

const PREFIX_LIMITS: ReadonlyArray<[string, number]> = [
  ["/api/auth/", BODY_LIMITS.authJson],
  ["/api/contact", BODY_LIMITS.authJson],
  ["/api/cron/", BODY_LIMITS.cron],
  ["/api/baidu/", BODY_LIMITS.cron],
  ["/api/v1/internal/", BODY_LIMITS.internalApi],
  ["/api/internal/", BODY_LIMITS.internalApi],
  ["/api/oauth/", BODY_LIMITS.oauthJson],
  ["/api/admin/", BODY_LIMITS.adminJson],
];

export function getBodyLimitForPath(pathname: string): number {
  for (const [path, limit] of EXACT_LIMITS) {
    if (pathname === path) return limit;
  }
  for (const [prefix, limit] of PREFIX_LIMITS) {
    if (pathname.startsWith(prefix)) return limit;
  }
  return BODY_LIMITS.defaultJson;
}

export function hasRequestBody(method: string): boolean {
  const normalized = method.toUpperCase();
  return normalized !== "GET" && normalized !== "HEAD" && normalized !== "OPTIONS";
}
