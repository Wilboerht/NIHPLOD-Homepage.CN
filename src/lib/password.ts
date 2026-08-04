/**
 * 密码加密工具与密码策略
 * 使用 bcryptjs 进行密码哈希和验证
 *
 * 已实现策略：
 * - 弱密码黑名单：拒绝常见弱密码与连续/重复字符
 * - 密码历史检查：防止用户重复使用最近 N 个密码（依赖 PasswordHistory 表）
 * - 密码过期策略：支持按用户 passwordExpiresAt 判断是否需要强制修改密码
 */
import bcrypt from "bcryptjs";
import { z } from "zod";
import { randomInt } from "./random";

// 密码强度规则常量（前后端共用）
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 32;

// 密码策略常量
/** 默认保留最近密码历史数量 */
export const PASSWORD_HISTORY_LIMIT = 5;
/** 默认密码过期天数（可通过环境变量覆盖） */
export const PASSWORD_EXPIRY_DAYS = Math.max(
  1,
  Number(process.env.PASSWORD_EXPIRY_DAYS || 90)
);

/** 常见弱密码黑名单（小写比较） */
export const WEAK_PASSWORD_BLACKLIST = new Set([
  "123456", "12345678", "123456789", "1234567890", "password",
  "qwerty", "abc123", "111111", "000000", "iloveyou", "admin123",
  "password123", "letmein", "welcome", "monkey", "dragon", "master",
  "sunshine", "princess", "football", "baseball", "superman", "batman",
]);

/**
 * 判断是否为弱密码
 * - 在常见弱密码黑名单中
 * - 全为相同字符
 * - 连续 6 位以上升序/降序数字
 * - 连续 6 位以上升序/降序字母
 */
export function isWeakPassword(password: string): boolean {
  if (!password) return true;

  const lower = password.toLowerCase();
  if (WEAK_PASSWORD_BLACKLIST.has(lower)) return true;

  // 全相同字符
  if (/^(.)\1+$/.test(password)) return true;

  // 连续 6 位以上数字
  if (/(012345|123456|234567|345678|456789|567890|098765|987654|876543|765432|654321|543210)/.test(password)) {
    return true;
  }

  // 连续 6 位以上字母（abcd... / zyx...）
  if (/(abcdef|bcdefg|cdefgh|defghi|efghij|fghijk|ghijkl|hijklm|ijklmn|jklmno|klmnop|lmnopq|mnopqr|nopqrs|opqrst|pqrstu|qrstuv|rstuvw|stuvwx|tuvwxy|uvwxyz|zyxwvu|yxwvut|xwvuts|wvutsr|vutsrq|utsrqp|tsrqpo|srqpon|rqponm|qponml|ponmlk|onmlkj|nmlkji|mlkjih|lkjihg|kjihgf|jihgfe|ihgfed|hgfedc|gfedcb|fedcba)/.test(lower)) {
    return true;
  }

  return false;
}

/**
 * 校验密码强度
 * - 至少 8 位，最多 32 位
 * - 包含至少一个大写字母
 * - 包含至少一个小写字母
 * - 包含至少一个数字
 * - 不在弱密码黑名单中
 * 返回 { valid, message }，valid 为 true 时表示符合要求
 */
export function validatePasswordStrength(password: string): { valid: boolean; message?: string } {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return { valid: false, message: `密码至少${PASSWORD_MIN_LENGTH}位` };
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return { valid: false, message: `密码最多${PASSWORD_MAX_LENGTH}位` };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, message: "密码需包含大写字母" };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, message: "密码需包含小写字母" };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, message: "密码需包含数字" };
  }
  if (isWeakPassword(password)) {
    return { valid: false, message: "密码过于简单，请避免使用常见弱密码或连续字符" };
  }
  return { valid: true };
}

/**
 * 用户密码强度校验 Schema
 * - 至少 8 位，最多 32 位
 * - 包含至少一个大写字母
 * - 包含至少一个小写字母
 * - 包含至少一个数字
 * - 不为弱密码
 */
export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, "密码至少8位")
  .max(PASSWORD_MAX_LENGTH, "密码最多32位")
  .regex(/[A-Z]/, "密码需包含大写字母")
  .regex(/[a-z]/, "密码需包含小写字母")
  .regex(/[0-9]/, "密码需包含数字")
  .refine((val) => !isWeakPassword(val), {
    message: "密码过于简单，请避免使用常见弱密码或连续字符",
  });

// 盐的轮数 - 12 是一个良好的安全性与性能平衡点
const SALT_ROUNDS = 12;

/**
 * 对密码进行哈希
 * @param password 原始密码
 * @returns 哈希后的密码
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * 验证密码是否匹配
 * @param password 原始密码
 * @param hashedPassword 哈希后的密码
 * @returns 是否匹配
 */
export async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  return bcrypt.compare(password, hashedPassword);
}

/**
 * 计算密码默认过期时间
 */
export function getPasswordExpiryDate(): Date {
  return new Date(Date.now() + PASSWORD_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
}

/**
 * 判断密码是否已过期
 * 当 user.passwordExpiresAt 存在且小于当前时间时返回 true。
 */
export function isPasswordExpired(user: {
  passwordExpiresAt?: Date | null;
  passwordChangedAt?: Date | null;
}): boolean {
  if (!user.passwordExpiresAt) return false;
  return new Date() > user.passwordExpiresAt;
}

/**
 * 生成安全的随机密码
 * 用于微信登录自动生成密码场景
 * 保证至少包含大写、小写、数字、特殊字符各一个
 * @param length 密码长度，默认 32
 * @returns 随机密码字符串
 */
export function generateSecurePassword(length: number = 32): string {
  if (length < 4) {
    throw new Error("密码长度至少为 4");
  }

  const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const lower = "abcdefghijklmnopqrstuvwxyz";
  const digits = "0123456789";
  const specials = "!@#$%^&*()_+-=[]{}|;:,.<>?";
  const all = upper + lower + digits + specials;

  // 前置：每种类型至少一个
  const chars: string[] = [
    upper[randomInt(0, upper.length)],
    lower[randomInt(0, lower.length)],
    digits[randomInt(0, digits.length)],
    specials[randomInt(0, specials.length)],
  ];

  // 填充剩余字符
  for (let i = 4; i < length; i++) {
    chars.push(all[randomInt(0, all.length)]);
  }

  // Fisher-Yates 洗牌
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.slice(0, length).join("");
}
