import { randomBytes, randomUUID } from "crypto";
import { createRemoteJWKSet, customFetch, decodeJwt, decodeProtectedHeader, jwtVerify } from "jose";
import { prisma } from "@/lib/prisma";
import { getIssuer, SUPPORTED_SCOPES } from "@/lib/oauth-constants";
import { buildOAuthProtectedResourceMetadata } from "@/lib/oauth-protected-resource";
import { buildOpenIdConfiguration } from "@/lib/oidc-discovery";
import { signOAuthAccessToken, getExpiresInFromToken } from "@/lib/jwt";
import { consumeAccessTokenOnce } from "@/lib/token-blacklist";
import { hashPassword } from "@/lib/password";
import { apiConsole } from "@/lib/logger";
import { scheduleSsoEvent } from "@/lib/sso-audit";

export const ID_JAG_ASSERTION_TYPE = "urn:ietf:params:oauth:token-type:id-jag";
export const AGENT_AUTH_CLIENT_ID = "agent-auth";
export const AGENT_AUTH_CREDENTIAL_TYPE = "bearer_token";

const DEFAULT_AGENT_SCOPES = ["openid", "profile"] as const;
const DEFAULT_ACCESS_TOKEN_TTL_SECONDS = 3600;
const DEFAULT_MAX_AUTH_AGE_SECONDS = 3600;
const CLOCK_TOLERANCE_SECONDS = 30;
const MAX_IAT_SKEW_SECONDS = 120;
const MAX_ASSERTION_LIFETIME_SECONDS = 900;
const MAX_JTI_LENGTH = 256;

interface TrustedAgentIssuer {
  issuer: string;
  jwksUri: string;
  clientIds: string[];
  displayName?: string;
}

interface IdJagVerification {
  payload: Record<string, unknown>;
  trustedIssuer: TrustedAgentIssuer;
}

export interface AgentAuthRegistrationResult {
  registration_id: string;
  registration_type: "identity_assertion";
  user_id: string;
  credential_type: typeof AGENT_AUTH_CREDENTIAL_TYPE;
  credential: string;
  credential_expires: string;
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  scope: string;
  scopes: string[];
}

export class AgentAuthError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly description: string,
    public readonly headers?: Record<string, string>
  ) {
    super(description);
    this.name = "AgentAuthError";
  }
}

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
let cachedTrustedIssuersRaw: string | null = null;
let cachedTrustedIssuers: TrustedAgentIssuer[] = [];

function normalizeIssuer(value: string): string {
  return value.replace(/\/+$/, "");
}

function parsePositiveInt(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return fallback;
  return Math.floor(parsed);
}

export function getAgentAuthAccessTokenTtlSeconds(): number {
  return parsePositiveInt(
    process.env.AGENT_AUTH_ACCESS_TOKEN_TTL_SECONDS,
    DEFAULT_ACCESS_TOKEN_TTL_SECONDS,
    300,
    86400
  );
}

export function getAgentAuthMaxAuthAgeSeconds(): number {
  return parsePositiveInt(
    process.env.AGENT_AUTH_MAX_AUTH_AGE_SECONDS,
    DEFAULT_MAX_AUTH_AGE_SECONDS,
    60,
    86400
  );
}

export function getTrustedAgentIssuers(): TrustedAgentIssuer[] {
  const raw = process.env.AGENT_AUTH_TRUSTED_ISSUERS?.trim() ?? "";
  if (raw === cachedTrustedIssuersRaw) return cachedTrustedIssuers;
  cachedTrustedIssuersRaw = raw;
  cachedTrustedIssuers = [];

  if (!raw) return cachedTrustedIssuers;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    apiConsole.warn(
      "[AgentAuth] AGENT_AUTH_TRUSTED_ISSUERS is not valid JSON; ID-JAG disabled",
      error
    );
    return cachedTrustedIssuers;
  }

  if (!Array.isArray(parsed)) {
    apiConsole.warn("[AgentAuth] AGENT_AUTH_TRUSTED_ISSUERS must be a JSON array; ID-JAG disabled");
    return cachedTrustedIssuers;
  }

  const seen = new Set<string>();
  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    if (typeof record.issuer !== "string") continue;

    try {
      const issuer = normalizeIssuer(record.issuer);
      const issuerUrl = new URL(issuer);
      if (process.env.NODE_ENV === "production" && issuerUrl.protocol !== "https:") continue;
      if (seen.has(issuer)) continue;

      const jwksUri =
        typeof record.jwksUri === "string" && record.jwksUri
          ? record.jwksUri
          : `${issuer}/.well-known/jwks.json`;
      const jwksUrl = new URL(jwksUri);
      // JWKS 是信任锚：生产环境必须 HTTPS 且与 issuer 同源，避免被重定向/替换公钥。
      if (process.env.NODE_ENV === "production" && jwksUrl.protocol !== "https:") {
        apiConsole.warn(`[AgentAuth] Ignoring ${issuer}: jwksUri must be HTTPS`);
        continue;
      }
      if (jwksUrl.origin !== issuerUrl.origin) {
        apiConsole.warn(`[AgentAuth] Ignoring ${issuer}: jwksUri must be same-origin`);
        continue;
      }

      const clientIds = Array.isArray(record.clientIds)
        ? record.clientIds.filter(
            (value): value is string => typeof value === "string" && value.length > 0
          )
        : [];
      if (process.env.NODE_ENV === "production" && clientIds.length === 0) {
        apiConsole.warn(
          `[AgentAuth] Ignoring ${issuer}: clientIds must be non-empty in production`
        );
        continue;
      }

      cachedTrustedIssuers.push({
        issuer,
        jwksUri,
        clientIds,
        displayName: typeof record.displayName === "string" ? record.displayName : undefined,
      });
      seen.add(issuer);
    } catch {
      apiConsole.warn("[AgentAuth] Ignoring invalid AGENT_AUTH_TRUSTED_ISSUERS entry");
    }
  }

  return cachedTrustedIssuers;
}

export function buildAuthorizationServerMetadata() {
  const origin = getIssuer();
  const protectedResource = buildOAuthProtectedResourceMetadata();

  return {
    ...buildOpenIdConfiguration(),
    resource: protectedResource.resource,
    authorization_servers: protectedResource.authorization_servers,
    scopes_supported: protectedResource.scopes_supported,
    bearer_methods_supported: protectedResource.bearer_methods_supported,
    agent_auth: {
      skill: `${origin}/auth.md`,
      register_uri: `${origin}/agent/auth`,
      revocation_uri: `${origin}/api/oauth/revoke`,
      identity_types_supported: ["identity_assertion"],
      identity_assertion: {
        assertion_types_supported: [ID_JAG_ASSERTION_TYPE],
        credential_types_supported: [AGENT_AUTH_CREDENTIAL_TYPE],
      },
    },
  };
}

export function buildAuthMd(): string {
  const origin = getIssuer();
  const protectedResource = buildOAuthProtectedResourceMetadata();
  const resource = protectedResource.resource;
  const maxAuthAge = getAgentAuthMaxAuthAgeSeconds();
  const ttl = getAgentAuthAccessTokenTtlSeconds();

  return `# auth.md

You are an agent. NIHPLOD supports agentic registration for pre-approved agent providers. Follow these steps in order: discover, register, use the credential, and handle revocation.

Two hosts are relevant:

- Resource server and authorization server: \`${origin}\`
- API resource identifier: \`${resource}\`

NIHPLOD currently supports one registration method: \`identity_assertion\` with an ID-JAG assertion. Anonymous, verified-email, and claim ceremonies are not supported. Registration matches the asserted verified phone number to an existing active NIHPLOD account; it does not create accounts.

## Step 1 - Discover

A \`401\` from a Bearer-protected OAuth resource endpoint carries a discovery hint:

\`\`\`http
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource", error="invalid_token"
\`\`\`

Fetch the Protected Resource Metadata:

\`\`\`http
GET ${origin}/.well-known/oauth-protected-resource
\`\`\`

The response contains the fields below. The Protected Resource Metadata is authoritative if it conflicts with this document.

\`\`\`json
${JSON.stringify(protectedResource, null, 2)}
\`\`\`

Fetch the Authorization Server metadata from the authorization server's \`.well-known\` location:

\`\`\`http
GET ${origin}/.well-known/oauth-authorization-server
\`\`\`

Read \`issuer\`, \`token_endpoint\`, \`revocation_endpoint\`, \`grant_types_supported\`, and the full \`agent_auth\` block:

\`\`\`json
${JSON.stringify(
  {
    issuer: origin,
    token_endpoint: `${origin}/api/oauth/token`,
    revocation_endpoint: `${origin}/api/oauth/revoke`,
    agent_auth: buildAuthorizationServerMetadata().agent_auth,
  },
  null,
  2
)}
\`\`\`

## Step 2 - Pick a method

Use \`identity_assertion\` with \`${ID_JAG_ASSERTION_TYPE}\` only when you have a session tied to a user identity and can mint an ID-JAG audience-bound to NIHPLOD. Your provider must be on NIHPLOD's trust list. Unknown issuers receive \`issuer_not_enabled\`.

Do not use \`anonymous\`, verified email, or a claim ceremony with NIHPLOD. They are not advertised in \`agent_auth\`.

## Step 3 - Register with an ID-JAG

Confirm the user consents to asserting their identity to NIHPLOD using the \`resource\`, \`resource_name\`, and scopes from Step 1.

Mint the ID-JAG with:

- \`iss\` - your provider's issuer URL, which must be on NIHPLOD's trust list.
- \`sub\` - your stable identifier for the user.
- \`aud\` - \`${resource}\` (or \`${resource}/\`).
- \`client_id\` - a client identifier trusted by NIHPLOD. Required.
- \`jti\` - a unique identifier. Replays are rejected.
- \`iat\` / \`exp\` - issued-at and near-term expiry (about five minutes, maximum fifteen minutes).
- \`auth_time\` - epoch seconds when the user last authenticated at your provider. It must be no older than ${maxAuthAge} seconds.
- \`phone_number\` and \`phone_number_verified\` - the user's verified phone number. Only verified phone numbers are accepted.
- Header \`typ\` must be \`oauth-id-jag+jwt\` and the signature algorithm must be \`RS256\`.

Register the assertion:

\`\`\`http
POST ${origin}/agent/auth
Content-Type: application/json

{
  "type": "identity_assertion",
  "assertion_type": "${ID_JAG_ASSERTION_TYPE}",
  "assertion": "<your ID-JAG JWT>"
}
\`\`\`

A successful response returns a credential directly:

\`\`\`json
{
  "registration_id": "reg_...",
  "registration_type": "identity_assertion",
  "user_id": "<NIHPLOD user id>",
  "credential_type": "bearer_token",
  "credential": "<access token>",
  "credential_expires": "2026-01-01T00:00:00.000Z",
  "access_token": "<access token>",
  "token_type": "Bearer",
  "expires_in": ${ttl},
  "scope": "openid profile",
  "scopes": ["openid", "profile"]
}
\`\`\`

The credential expires after \`expires_in\` seconds. NIHPLOD never returns a refresh token for this flow.

## Step 4 - Use the credential

Present the access token as a bearer token:

\`\`\`http
GET ${origin}/api/oauth/userinfo
Authorization: Bearer <access_token>
\`\`\`

When the access token expires, mint a fresh ID-JAG and register again. When a previously working token returns \`401\`, discard it and restart at Step 1.

## Step 5 - Revocation

NIHPLOD supports credential-layer revocation per RFC 7009. Revoke the access token with the public \`${AGENT_AUTH_CLIENT_ID}\` client:

\`\`\`http
POST ${origin}/api/oauth/revoke
Content-Type: application/x-www-form-urlencoded

token=<access_token>&token_type_hint=access_token&client_id=${AGENT_AUTH_CLIENT_ID}
\`\`\`

The response is \`200\` even when the token was already invalid. The user can also revoke the authorization from the NIHPLOD account security center.

## Errors

Errors use OAuth-style JSON:

\`\`\`json
{
  "error": "invalid_request",
  "error_description": "..."
}
\`\`\`

| Code | HTTP | What to do |
| --- | --- | --- |
| \`invalid_request\` | 400 | Fix the JSON body, assertion type, or JWT structure. |
| \`issuer_not_enabled\` | 401 | Your provider is not on the NIHPLOD trust list. Use another provider or stop. |
| \`invalid_client_id\` | 401 | Use a \`client_id\` trusted by NIHPLOD. |
| \`invalid_signature\` | 401 | Mint a fresh ID-JAG signed with a valid RS256 key. |
| \`invalid_audience\` | 401 | Set \`aud\` to \`${resource}\` or \`${resource}/\`. |
| \`expired\` | 401 | Mint a fresh ID-JAG with a near-term \`exp\`. |
| \`login_required\` | 401 | \`auth_time\` is missing or older than ${maxAuthAge} seconds. Re-authenticate the user at your provider. |
| \`missing_verified_phone\` | 401 | Include a verified \`phone_number\` (\`phone_number_verified: true\`). |
| \`invalid_phone_number\` | 401 | Use a valid mainland China mobile number. |
| \`replay_detected\` | 401 | Mint a fresh ID-JAG with a new \`jti\`. Do not retry the same assertion. |
| \`user_not_found\` | 404 | No active NIHPLOD account matches the verified phone number. |
| \`user_inactive\` | 403 | The matched account is not active. |
| \`rate_limited\` | 429 | Back off and retry. |

Contact \`${origin}/contact\` for integration or trust-list issues.
`;
}

async function getJwks(trustedIssuer: TrustedAgentIssuer) {
  const cacheKey = `${trustedIssuer.issuer}|${trustedIssuer.jwksUri}`;
  const cached = jwksCache.get(cacheKey);
  if (cached) return cached;
  const jwks = createRemoteJWKSet(new URL(trustedIssuer.jwksUri), {
    [customFetch]: (url, options) => fetch(url, { ...options, redirect: "error" }),
  });
  jwksCache.set(cacheKey, jwks);
  return jwks;
}

async function verifyIdJag(assertion: string): Promise<IdJagVerification> {
  let header: ReturnType<typeof decodeProtectedHeader>;
  let unverified: ReturnType<typeof decodeJwt>;

  try {
    header = decodeProtectedHeader(assertion);
    unverified = decodeJwt(assertion);
  } catch {
    throw new AgentAuthError(400, "invalid_request", "assertion is not a valid JWT");
  }

  if (header.typ !== "oauth-id-jag+jwt") {
    throw new AgentAuthError(400, "invalid_request", "assertion typ must be oauth-id-jag+jwt");
  }
  if (header.alg !== "RS256") {
    throw new AgentAuthError(400, "invalid_request", "assertion must use RS256");
  }

  const issuer = typeof unverified.iss === "string" ? normalizeIssuer(unverified.iss) : "";
  const trustedIssuer = getTrustedAgentIssuers().find((item) => item.issuer === issuer);
  if (!trustedIssuer) {
    throw new AgentAuthError(
      401,
      "issuer_not_enabled",
      "The assertion issuer is not enabled for agent registration"
    );
  }

  const resource = buildOAuthProtectedResourceMetadata().resource;
  const acceptedAudiences = [resource, `${resource}/`];

  let verified: Awaited<ReturnType<typeof jwtVerify>>;
  try {
    verified = await jwtVerify(assertion, await getJwks(trustedIssuer), {
      issuer: unverified.iss,
      audience: acceptedAudiences,
      algorithms: ["RS256"],
      clockTolerance: CLOCK_TOLERANCE_SECONDS,
    });
  } catch {
    throw new AgentAuthError(401, "invalid_signature", "The ID-JAG signature is invalid");
  }

  const payload = verified.payload as Record<string, unknown>;
  const now = Math.floor(Date.now() / 1000);
  const exp = typeof payload.exp === "number" ? payload.exp : 0;
  const iat = typeof payload.iat === "number" ? payload.iat : 0;
  const authTime = typeof payload.auth_time === "number" ? payload.auth_time : 0;
  const clientId = typeof payload.client_id === "string" ? payload.client_id : "";
  const jti = typeof payload.jti === "string" ? payload.jti : "";
  const sub = typeof payload.sub === "string" ? payload.sub : "";

  if (!exp || exp <= now - CLOCK_TOLERANCE_SECONDS) {
    throw new AgentAuthError(401, "expired", "The ID-JAG has expired");
  }
  if (!iat || iat > now + MAX_IAT_SKEW_SECONDS) {
    throw new AgentAuthError(401, "invalid_request", "The ID-JAG iat is invalid");
  }
  if (exp - iat > MAX_ASSERTION_LIFETIME_SECONDS) {
    throw new AgentAuthError(401, "invalid_request", "The ID-JAG lifetime is too long");
  }
  if (!jti || jti.length > MAX_JTI_LENGTH) {
    throw new AgentAuthError(400, "invalid_request", "The ID-JAG requires a valid jti");
  }
  if (!sub) {
    throw new AgentAuthError(400, "invalid_request", "The ID-JAG requires a sub");
  }
  if (!clientId) {
    throw new AgentAuthError(401, "invalid_client_id", "The ID-JAG requires a client_id");
  }
  if (
    !authTime ||
    authTime > now + CLOCK_TOLERANCE_SECONDS ||
    now - authTime > getAgentAuthMaxAuthAgeSeconds()
  ) {
    throw new AgentAuthError(
      401,
      "login_required",
      "The user must re-authenticate at the agent provider",
      {
        "WWW-Authenticate": `AgentAuth error="login_required", max_age="${getAgentAuthMaxAuthAgeSeconds()}"`,
      }
    );
  }
  if (trustedIssuer.clientIds.length > 0 && !trustedIssuer.clientIds.includes(clientId)) {
    throw new AgentAuthError(401, "invalid_client_id", "The client_id is not trusted");
  }
  if (typeof payload.phone_number !== "string" || payload.phone_number_verified !== true) {
    throw new AgentAuthError(401, "missing_verified_phone", "A verified phone_number is required");
  }

  const consumed = await consumeAccessTokenOnce(`agent-jag:${jti}`, exp * 1000);
  if (!consumed) {
    throw new AgentAuthError(401, "replay_detected", "This ID-JAG has already been used");
  }

  return { payload, trustedIssuer };
}

function normalizePhoneNumber(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 13 && digits.startsWith("86")) return digits.slice(2);
  return digits;
}

async function ensureAgentAuthClient() {
  const existing = await prisma.oAuthClient.findUnique({
    where: { clientId: AGENT_AUTH_CLIENT_ID },
  });
  if (existing) {
    if (!existing.isActive) {
      throw new AgentAuthError(
        503,
        "registration_unavailable",
        "Agent registration is currently disabled"
      );
    }
    return existing;
  }

  try {
    return await prisma.oAuthClient.create({
      data: {
        clientId: AGENT_AUTH_CLIENT_ID,
        clientSecret: await hashPassword(randomBytes(32).toString("base64url")),
        name: "NIHPLOD Agent Auth",
        redirectUris: [],
        postLogoutRedirectUris: [],
        scopes: [...DEFAULT_AGENT_SCOPES],
        isActive: true,
        isPublic: true,
        isSystem: true,
        accessTokenTtlSeconds: getAgentAuthAccessTokenTtlSeconds(),
      },
    });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      const client = await prisma.oAuthClient.findUnique({
        where: { clientId: AGENT_AUTH_CLIENT_ID },
      });
      if (client) return client;
    }
    throw error;
  }
}

export async function registerAgentWithIdJag(
  assertion: string,
  options?: { ip?: string }
): Promise<AgentAuthRegistrationResult> {
  const { payload, trustedIssuer } = await verifyIdJag(assertion);
  const phoneNumber = normalizePhoneNumber(String(payload.phone_number ?? ""));
  if (!/^1[3-9]\d{9}$/.test(phoneNumber)) {
    throw new AgentAuthError(
      401,
      "invalid_phone_number",
      "A valid mobile phone number is required"
    );
  }

  const user = await prisma.user.findUnique({
    where: { phone: phoneNumber },
    select: { id: true, phone: true, status: true },
  });
  if (!user) {
    throw new AgentAuthError(
      404,
      "user_not_found",
      "No NIHPLOD account matches the verified phone number"
    );
  }
  if (user.status !== "ACTIVE") {
    throw new AgentAuthError(403, "user_inactive", "The matched account is not active");
  }

  const client = await ensureAgentAuthClient();
  const supportedScopes = new Set<string>(SUPPORTED_SCOPES);
  const scopes = client.scopes.filter((scope) => supportedScopes.has(scope));
  if (scopes.length === 0) {
    throw new AgentAuthError(
      503,
      "registration_unavailable",
      "No scopes are available for agent registration"
    );
  }

  const ttlSeconds = getAgentAuthAccessTokenTtlSeconds();
  const sessionId = randomUUID();
  await prisma.oAuthSession.create({
    data: {
      userId: user.id,
      clientId: client.clientId,
      sessionId,
      scopes,
      expiresAt: new Date(Date.now() + ttlSeconds * 1000),
    },
  });

  const credential = await signOAuthAccessToken({
    id: user.id,
    phone: user.phone,
    clientId: client.clientId,
    scope: scopes.join(" "),
    expiresIn: `${ttlSeconds}s`,
    sid: sessionId,
    authTime: typeof payload.auth_time === "number" ? payload.auth_time : undefined,
  });
  const expiresIn = getExpiresInFromToken(credential) ?? ttlSeconds;
  const registrationId = `reg_${randomUUID().replace(/-/g, "").slice(0, 24)}`;

  scheduleSsoEvent({
    event: "token",
    userId: user.id,
    clientId: client.clientId,
    clientName: client.name,
    ip: options?.ip,
    success: true,
    detail: {
      grant_type: "id-jag",
      registration_id: registrationId,
      issuer: trustedIssuer.issuer,
    },
  });

  return {
    registration_id: registrationId,
    registration_type: "identity_assertion",
    user_id: user.id,
    credential_type: AGENT_AUTH_CREDENTIAL_TYPE,
    credential,
    credential_expires: new Date(Date.now() + expiresIn * 1000).toISOString(),
    access_token: credential,
    token_type: "Bearer",
    expires_in: expiresIn,
    scope: scopes.join(" "),
    scopes,
  };
}
