/**
 * 认证逻辑
 * TODO: 实现完整功能
 */

export interface AuthUser {
  id: string;
  email: string;
  role: "admin" | "user";
}

export async function validateSession(): Promise<AuthUser | null> {
  // TODO: 实现 session 验证
  return null;
}

export async function logout(): Promise<void> {
  // TODO: 实现登出逻辑
}
