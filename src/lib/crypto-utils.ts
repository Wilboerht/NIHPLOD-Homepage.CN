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

/**
 * 验证密钥格式
 * 在应用启动时调用，提前发现配置错误
 */
export function validateKeyFormat(
  key: string | undefined,
  type: "private" | "public",
  name: string
): { valid: boolean; error?: string } {
  if (!key || key.trim() === "") {
    return { valid: false, error: `${name} 未配置` };
  }

  const formatted = formatKey(key);

  // 检查 PEM 标记
  if (type === "private") {
    if (!formatted.includes("PRIVATE KEY")) {
      return { valid: false, error: `${name} 格式不正确：缺少 PRIVATE KEY 标记` };
    }
  } else {
    if (!formatted.includes("PUBLIC KEY")) {
      return { valid: false, error: `${name} 格式不正确：缺少 PUBLIC KEY 标记` };
    }
  }

  // 检查密钥主体内容长度（去除标记和换行后）
  const body = formatted
    .replace(/-----BEGIN.*?-----/g, "")
    .replace(/-----END.*?-----/g, "")
    .replace(/\n/g, "")
    .trim();

  if (body.length < 50) {
    return { valid: false, error: `${name} 内容过短（${body.length} 字符），可能不完整或被截断` };
  }

  // 检查是否包含未转义的换行符（环境变量中应为 \n，如果直接是换行符在某些平台可能有问题，但 formatKey 已处理）
  // 这里主要检查多层转义后的残留
  if (key.includes("\\\\n")) {
    return { valid: false, error: `${name} 包含多余的转义（\\\\n），请检查环境变量格式` };
  }

  return { valid: true };
}
