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
