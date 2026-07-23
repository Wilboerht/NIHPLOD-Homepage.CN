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
 * 判断一段密钥文本是否已经包含 PEM 标记
 */
function hasPemMarkers(key: string): boolean {
  return /-----BEGIN [A-Z\s]+-----/.test(key) && /-----END [A-Z\s]+-----/.test(key);
}

/**
 * 将密钥主体（base64）按每行 64 字符折叠成 PEM body
 */
function wrapPemBody(body: string): string {
  const cleaned = body.replace(/\s/g, "");
  return cleaned.match(/.{1,64}/g)?.join("\n") || cleaned;
}

/**
 * 将私钥统一转换为标准 PEM 格式
 * - 若已包含 PEM 标记，直接返回
 * - 否则包装为 PKCS#1 RSA PRIVATE KEY
 */
export function toPrivateKeyPem(key?: string): string {
  const formatted = formatKey(key);
  if (!formatted) return "";
  if (hasPemMarkers(formatted)) return formatted;
  return `-----BEGIN RSA PRIVATE KEY-----\n${wrapPemBody(formatted)}\n-----END RSA PRIVATE KEY-----`;
}

/**
 * 将公钥统一转换为标准 PEM 格式
 * - 若已包含 PEM 标记，直接返回
 * - 否则包装为 PUBLIC KEY
 */
export function toPublicKeyPem(key?: string): string {
  const formatted = formatKey(key);
  if (!formatted) return "";
  if (hasPemMarkers(formatted)) return formatted;
  return `-----BEGIN PUBLIC KEY-----\n${wrapPemBody(formatted)}\n-----END PUBLIC KEY-----`;
}

/**
 * 验证密钥格式
 * 在应用启动时调用，提前发现配置错误
 * 支持完整 PEM 和纯 base64 body 两种写法
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

  // 检查 PEM 标记或长度（支持完整 PEM 或纯 body）
  const hasMarkers = hasPemMarkers(formatted);
  if (!hasMarkers) {
    const body = formatted.replace(/\s/g, "");
    if (body.length < 50) {
      return { valid: false, error: `${name} 内容过短（${body.length} 字符），可能不完整或被截断` };
    }
  } else {
    const expectedMarker = type === "private" ? "PRIVATE KEY" : "PUBLIC KEY";
    if (!formatted.includes(expectedMarker)) {
      return { valid: false, error: `${name} 格式不正确：缺少 ${expectedMarker} 标记` };
    }
  }

  // 检查是否包含未转义的换行符（环境变量中应为 \n，如果直接是换行符在某些平台可能有问题，但 formatKey 已处理）
  // 这里主要检查多层转义后的残留
  if (key.includes("\\\\n")) {
    return { valid: false, error: `${name} 包含多余的转义（\\\\n），请检查环境变量格式` };
  }

  return { valid: true };
}
