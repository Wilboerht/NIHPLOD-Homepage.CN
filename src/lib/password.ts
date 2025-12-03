/**
 * 密码加密工具
 * TODO: 实现完整功能
 */

export async function hashPassword(password: string): Promise<string> {
  // TODO: 实现密码哈希
  return password;
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  // TODO: 实现密码验证
  return password === hash;
}
