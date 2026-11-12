/**
 * 管理员 SSO 客户端注册表
 *
 * 目前包含：
 * - advisor-admin：测肤子站（保持原有 aud=advisor-admin）
 * - ba-admin：BA 证书平台（aud=ba-admin）
 *
 * 两个客户端共用同一把管理员断言签名密钥（RS256），
 * 子站只通过 JWKS 公钥验签，不共享签名私钥。
 */
import {
  resolveAdminPermissions,
  resolveAdvisorRole,
  resolveBaRole,
} from "./admin-permissions";
import {
  getAdminSsoSigningConfig,
  type AdminSsoSigningConfig,
} from "./admin-sso";

export type AdminSsoRoleResolver = "advisor" | "ba";

export interface AdminSsoClient {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  audience: string;
  name: string;
  permissionPrefix: string;
  roleResolver: AdminSsoRoleResolver;
  signing: AdminSsoSigningConfig;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`[AdminSSO] ${name} 未配置`);
  }
  return value;
}

function buildAdvisorClient(): AdminSsoClient | null {
  if (process.env.ADVISOR_ADMIN_SSO_ENABLED !== "true") return null;

  const clientSecret = required("ADVISOR_ADMIN_SSO_CLIENT_SECRET");
  if (clientSecret.length < 32) {
    throw new Error("[AdminSSO] ADVISOR_ADMIN_SSO_CLIENT_SECRET 至少需要 32 位");
  }

  return {
    clientId: required("ADVISOR_ADMIN_SSO_CLIENT_ID"),
    clientSecret,
    redirectUri: required("ADVISOR_ADMIN_SSO_REDIRECT_URI"),
    audience: "advisor-admin",
    name: "测肤子站",
    permissionPrefix: "advisor:",
    roleResolver: "advisor",
    signing: getAdminSsoSigningConfig(),
  };
}

function buildBaClient(): AdminSsoClient | null {
  if (process.env.BA_ADMIN_SSO_ENABLED !== "true") return null;

  const clientSecret = required("BA_ADMIN_SSO_CLIENT_SECRET");
  if (clientSecret.length < 32) {
    throw new Error("[AdminSSO] BA_ADMIN_SSO_CLIENT_SECRET 至少需要 32 位");
  }

  return {
    clientId: process.env.BA_ADMIN_SSO_CLIENT_ID?.trim() || "ba-admin",
    clientSecret,
    redirectUri: required("BA_ADMIN_SSO_REDIRECT_URI"),
    audience: process.env.BA_ADMIN_SSO_AUDIENCE?.trim() || "ba-admin",
    name: process.env.BA_ADMIN_SSO_NAME?.trim() || "BA 证书平台",
    permissionPrefix: "ba:",
    roleResolver: "ba",
    signing: getAdminSsoSigningConfig(),
  };
}

/** 返回当前已启用的管理员 SSO 客户端 */
export function getAdminSsoClients(): AdminSsoClient[] {
  return [buildAdvisorClient(), buildBaClient()].filter(
    (client): client is AdminSsoClient => client !== null
  );
}

/** 按 client_id 查找已启用的客户端；未启用/未知返回 null */
export function getAdminSsoClient(clientId: string | null | undefined): AdminSsoClient | null {
  if (!clientId) return null;

  const advisorId = process.env.ADVISOR_ADMIN_SSO_CLIENT_ID;
  if (
    advisorId &&
    clientId === advisorId &&
    process.env.ADVISOR_ADMIN_SSO_ENABLED === "true"
  ) {
    return buildAdvisorClient();
  }

  const baId = process.env.BA_ADMIN_SSO_CLIENT_ID?.trim() || "ba-admin";
  if (clientId === baId && process.env.BA_ADMIN_SSO_ENABLED === "true") {
    return buildBaClient();
  }

  return null;
}

export function resolveClientRole(
  client: AdminSsoClient,
  role: string,
  overrides?: string[] | null
): string | null {
  return client.roleResolver === "advisor"
    ? resolveAdvisorRole(role, overrides)
    : resolveBaRole(role, overrides);
}

export function filterClientPermissions(
  client: AdminSsoClient,
  role: string,
  overrides?: string[] | null
): string[] {
  return resolveAdminPermissions(role, overrides).filter((permission) =>
    permission.startsWith(client.permissionPrefix)
  );
}
