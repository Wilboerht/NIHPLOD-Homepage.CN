/**
 * 通用加密/密钥处理工具
 */

/**
 * 格式化密钥：处理 \n 和首尾引号
 * 适用于支付宝、微信支付等 PEM 密钥
 */
export function formatKey(key?: string): string {
  if (!key) return "";
  let formatted = key.trim();
  // 递归去除首尾引号（处理多层 JSON 转义）
  while (
    (formatted.startsWith('"') && formatted.endsWith('"')) ||
    (formatted.startsWith("'") && formatted.endsWith("'"))
  ) {
    formatted = formatted.slice(1, -1).trim();
  }
  return formatted.replace(/\\n/g, "\n").trim();
}
