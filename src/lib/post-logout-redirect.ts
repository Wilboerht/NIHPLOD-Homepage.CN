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

  // 查询该 client 注册的返回地址（或所有活跃 client 若 clientId 未提供）
  const where = clientId ? { clientId, isActive: true } : { isActive: true };
  const clients = await prisma.oAuthClient.findMany({
    where,
    select: { redirectUris: true, postLogoutRedirectUris: true },
  });

  for (const client of clients) {
    for (const registered of [...client.redirectUris, ...client.postLogoutRedirectUris]) {
      if (getOrigin(registered) === uriOrigin) {
        return true;
      }
    }
  }

  return false;
}
