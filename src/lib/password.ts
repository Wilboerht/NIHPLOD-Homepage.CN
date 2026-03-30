/**
 * 密码加密工具
 * 使用 bcryptjs 进行密码哈希和验证
 */
import bcrypt from "bcryptjs";

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
export async function verifyPassword(
  password: string,
  hashedPassword: string
): Promise<boolean> {
  return bcrypt.compare(password, hashedPassword);
}

/**
 * 生成安全的随机密码
 * 用于微信登录自动生成密码场景
 * @param length 密码长度，默认 32
 * @returns 随机密码字符串
 */
export function generateSecurePassword(length: number = 32): string {
  const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}|;:,.<>?";
  let password = "";
  const charsetLength = charset.length;
  
  // 确保包含大写、小写、数字、特殊字符
  const has = {
    upper: false,
    lower: false,
    digit: false,
    special: false,
  };

  while (password.length < length || !has.upper || !has.lower || !has.digit || !has.special) {
    const randomIndex = Math.floor(Math.random() * charsetLength);
    const char = charset[randomIndex];
    password += char;

    if (/[A-Z]/.test(char)) has.upper = true;
    if (/[a-z]/.test(char)) has.lower = true;
    if (/[0-9]/.test(char)) has.digit = true;
    if (/[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(char)) has.special = true;
  }

  return password.slice(0, length);
}
