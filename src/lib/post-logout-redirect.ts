/**
 * RP-Initiated Logout 返回地址校验
 *
 * OIDC 规范允许 client 单独注册 post_logout_redirect_uris。
 * 当前实现：
 * - 空值或站内相对路径：信任
 * - 绝对 URL：必须与任意已注册 redirect_uri 或 postLogoutRedirectUri 同 origin
 *
 * 注：精确匹配更安全；这里先用 origin 匹配兼容常见子项目部署。
 */
import { prisma } from "./prisma";

function getOrigin(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/**
 * 校验 post_logout_redirect_uri 是否可信
 *
 * @param uri - 用户提供的返回地址
 * @param clientId - 可选，发起登出的 client
 * @returns boolean
 */
export async function isTrustedPostLogoutRedirectUri(
  uri: string,
  clientId?: string | null
): Promise<boolean> {
  if (!uri) return true;
  if (uri.startsWith("/") && !uri.startsWith("//")) return true;

  const uriOrigin = getOrigin(uri);
  if (!uriOrigin) return false;

  // 查询该 client 注册的返回地址
  // 未指定 clientId 时：仅允许所有活跃 client 注册的 URI（用于通用登出场景）
  const where = clientId ? { clientId, isActive: true } : { isActive: true };
  const clients = await prisma.oAuthClient.findMany({
    where,
    select: { redirectUris: true, postLogoutRedirectUris: true },
  });

  for (const client of clients) {
    // post_logout_redirect_uri 仅应匹配 postLogoutRedirectUris（OIDC 规范将其与 redirect_uri 区分）
    const registered = client.postLogoutRedirectUris;
    for (const url of registered) {
      try {
        const reg = new URL(url);
        if (reg.origin !== uriOrigin) continue;
        // 严格匹配：注册 URL 完全相同，或注册 URL 为前缀且后接 "/" 再加子路径
        // 防止 https://a.com/app 匹配 https://a.com/app-evil
        if (uri === url || (uri.startsWith(url + "/") && uri.length > url.length + 1)) {
          return true;
        }
      } catch { /* skip */ }
    }
  }

  return false;
}
