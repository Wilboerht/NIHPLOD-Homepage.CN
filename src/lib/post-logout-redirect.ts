/**
 * RP-Initiated Logout 返回地址校验
 *
 * OIDC 规范允许 client 单独注册 post_logout_redirect_uris。
 * 当前实现：
 * - 空值或站内相对路径：信任
 * - 绝对 URL：必须能解析出 client_id，且与该 client 注册的
 *   postLogoutRedirectUris 精确匹配（禁止跨 client 借用他人注册地址，
 *   也不做"前缀+子路径"宽松匹配）
 * - client_id 缺失或无法解析：拒绝，调用方回退到首页
 */
import { prisma } from "./prisma";

/**
 * 校验 post_logout_redirect_uri 是否可信
 *
 * @param uri - 用户提供的返回地址
 * @param clientId - 发起登出的 client（绝对 URL 场景必填）
 * @returns boolean
 */
export async function isTrustedPostLogoutRedirectUri(
  uri: string,
  clientId?: string | null
): Promise<boolean> {
  if (!uri) return true;
  if (uri.startsWith("/") && !uri.startsWith("//")) return true;

  // 绝对 URL 必须绑定到具体 client：无法解析 client_id 时拒绝回跳（调用方兜底跳首页）
  if (!clientId) return false;

  // 精确匹配该 client 注册的 postLogoutRedirectUris（OIDC 规范将其与 redirect_uri 区分，
  // 不做前缀/子路径宽松匹配，避免 https://a.com/app 匹配 https://a.com/app-evil 之类绕过）
  const client = await prisma.oAuthClient.findFirst({
    where: { clientId, isActive: true },
    select: { postLogoutRedirectUris: true },
  });
  if (!client) return false;

  return client.postLogoutRedirectUris.includes(uri);
}
