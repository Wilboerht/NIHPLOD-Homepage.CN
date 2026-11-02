/**
 * OAuth Protected Resource Metadata 文档构建（RFC 9728）
 *
 * 供 AI Agent / MCP 客户端发现资源所需的授权服务器与 scope。
 * 资源标识与授权服务器均使用全站统一的 issuer（getIssuer），
 * 与 OIDC Discovery、JWT 签发侧保持一致。
 */
import { SUPPORTED_SCOPES, getIssuer } from "@/lib/oauth-constants";

export function buildOAuthProtectedResourceMetadata() {
  const resource = getIssuer();

  return {
    resource,
    resource_name: "NIHPLOD",
    resource_logo_uri: `${resource}/images/logo.webp`,
    authorization_servers: [resource],
    scopes_supported: [...SUPPORTED_SCOPES],
    bearer_methods_supported: ["header"],
  };
}
