/**
 * Explicit consent route policy for authenticated user endpoints.
 *
 * Policy is intentionally fail-closed: unknown /api/user or /api/oauth routes
 * require legal consent unless listed in the small exemption set below.
 */
const USER_EXEMPT_PATTERNS = [
  "/api/user/consent",
  // Bootstrap only: the handler returns session-safe fields and blocks writes until consent.
  "/api/user/profile",
  "/api/user/account/deletion",
  "/api/user/password",
  "/api/user/password/set",
  "/api/user/phone",
  "/api/user/phone/send-code",
  "/api/user/identities",
  "/api/user/identities/:id",
  "/api/user/devices",
  "/api/user/devices/:id",
  "/api/user/login-history",
  "/api/user/oauth/revoke",
  "/api/user/oauth/sessions",
] as const;

const OAUTH_EXEMPT_PATTERNS = [
  "/api/oauth/consent",
  "/api/oauth/account/deletion",
  "/api/oauth/account/deletion/send-code",
  "/api/oauth/security/authorizations",
  "/api/oauth/security/authorizations/:id",
  "/api/oauth/security/devices",
  "/api/oauth/security/devices/:id",
  "/api/oauth/security/identities",
  "/api/oauth/security/identities/:id",
  "/api/oauth/security/login-history",
  "/api/oauth/user/password",
  "/api/oauth/user/password/send-code",
  "/api/oauth/user/password/set",
] as const;

function matchesPattern(pathname: string, pattern: string): boolean {
  const actual = pathname.split("/").filter(Boolean);
  const expected = pattern.split("/").filter(Boolean);
  if (actual.length !== expected.length) return false;
  return expected.every(
    (segment, index) =>
      segment.startsWith(":") ? actual[index].length > 0 : segment === actual[index]
  );
}

function requiresConsent(
  pathname: string,
  exemptPatterns: readonly string[]
): boolean {
  return !exemptPatterns.some((pattern) => matchesPattern(pathname, pattern));
}

export function userRouteRequiresConsent(pathname: string): boolean {
  if (!pathname.startsWith("/api/user/")) return false;
  return requiresConsent(pathname, USER_EXEMPT_PATTERNS);
}

export function oauthRouteRequiresConsent(pathname: string): boolean {
  if (!pathname.startsWith("/api/oauth/")) return false;
  return requiresConsent(pathname, OAUTH_EXEMPT_PATTERNS);
}
