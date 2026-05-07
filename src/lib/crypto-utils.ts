/**
 * 通用加密/密钥处理工具
 */

/**
 * 格式化密钥：处理 \n 和首尾引号
 * 适用于支付宝、微信支付等 PEM 密钥
 */
export function formatKey(key?: string): string {
  if (!key) return "";
  return key
    .replace(/^["']|["']$/g, "")
    .replace(/\\n/g, "\n")
    .trim();
}
