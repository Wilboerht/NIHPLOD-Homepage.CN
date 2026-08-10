/**
 * TOTP (Time-based One-Time Password) 工具
 *
 * 为管理后台提供双因素认证支持。
 * 使用 otplib 进行 TOTP 生成与验证。
 */

import { generateSecret, generateURI, verifySync, generateSync } from "otplib";
import { createCipheriv, createDecipheriv, randomBytes, createHash, timingSafeEqual } from "crypto";
import { LRUCache } from "lru-cache";

// TOTP 重放保护：同一 code 在窗口期内仅允许使用一次
// TTL = 2 × period (60 秒)，覆盖 30 秒时间步长的前后各一步
const usedTotpCodes = new LRUCache<string, number>({
  max: 5000,
  ttl: 60 * 1000,
});

function hashTotpPayload(secret: string, token: string): string {
  return createHash("sha256").update(`${secret}:${token}`).digest("hex");
}

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

/**
 * 从专用密钥派生加密密钥。
 * 使用独立于 JWT 的专用密钥，避免 JWT_ACCESS_SECRET 轮换导致已存储的 TOTP 密钥永久失效。
 * 必须配置 TOTP_ENCRYPTION_KEY 环境变量，不再回退到其他密钥。
 */
function getEncryptionKey(): Buffer {
  const secret = process.env.TOTP_ENCRYPTION_KEY;
  if (!secret) {
    throw new Error(
      "[TOTP] TOTP_ENCRYPTION_KEY 环境变量未设置。请使用 openssl rand -hex 32 生成专用密钥。"
    );
  }
  return createHash("sha256").update(secret).digest();
}

/**
 * 加密 TOTP Secret
 */
export function encryptTOTPSecret(plainSecret: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plainSecret, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString("base64");
}

/**
 * 解密 TOTP Secret
 */
export function decryptTOTPSecret(encryptedSecret: string): string {
  const key = getEncryptionKey();
  const data = Buffer.from(encryptedSecret, "base64");
  const iv = data.subarray(0, IV_LENGTH);
  const authTag = data.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = data.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

/**
 * 生成新的 TOTP Secret
 */
export function generateTOTPSecret(): string {
  return generateSecret();
}

/**
 * 生成 TOTP 绑定二维码的 otpauth URL
 */
export function generateTOTPQRCodeUrl(email: string, secret: string, issuer: string): string {
  return generateURI({
    strategy: "totp",
    secret,
    label: email,
    issuer,
    algorithm: "sha1",
    digits: 6,
    period: 30,
  });
}

/**
 * 验证 TOTP Code
 */
export function verifyTOTP(token: string, secret: string): boolean {
  const result = verifySync({ token, secret });
  if (!result.valid) return false;
  // 重放保护：同一 TOTP code 在窗口期内仅允许使用一次
  const key = hashTotpPayload(secret, token);
  if (usedTotpCodes.has(key)) return false;
  usedTotpCodes.set(key, Date.now());
  return true;
}

/**
 * 生成测试用 TOTP Code（用于单元测试）
 */
export function generateTOTPCode(secret: string): string {
  return generateSync({ secret });
}

/**
 * 生成备用码（10 个 8 位随机码）
 */
export function generateBackupCodes(count: number = 10): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    codes.push(randomBytes(8).toString("hex").toUpperCase());
  }
  return codes;
}

/**
 * 哈希备用码
 */
export function hashBackupCode(code: string): string {
  return createHash("sha256").update(code.toUpperCase()).digest("hex");
}

/**
 * 验证备用码
 * @param code - 用户输入的备用码
 * @param hashedCodes - 数据库中存储的哈希备用码数组（JSON 字符串）
 * @returns 验证成功时返回新的备用码数组（已移除使用过的码），失败返回 null
 */
export function verifyBackupCode(
  code: string,
  hashedCodes: string
): { valid: boolean; remainingCodes: string[] } | null {
  try {
    const codes: string[] = JSON.parse(hashedCodes);
    const inputHash = hashBackupCode(code);
    const index = codes.findIndex((c) => {
      try {
        const a = Buffer.from(c);
        const b = Buffer.from(inputHash);
        return a.length === b.length && timingSafeEqual(a, b);
      } catch {
        return false;
      }
    });

    if (index === -1) {
      return null;
    }

    const remainingCodes = [...codes];
    remainingCodes.splice(index, 1);
    return { valid: true, remainingCodes };
  } catch {
    return null;
  }
}
