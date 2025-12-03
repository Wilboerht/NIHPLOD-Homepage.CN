/**
 * JWT 工具
 * TODO: 实现完整功能
 */

export interface JWTPayload {
  userId: string;
  email: string;
  role: string;
  exp: number;
}

export async function signJWT(payload: Omit<JWTPayload, "exp">): Promise<string> {
  // TODO: 实现 JWT 签名
  return JSON.stringify(payload);
}

export async function verifyJWT(token: string): Promise<JWTPayload | null> {
  // TODO: 实现 JWT 验证
  try {
    return JSON.parse(token) as JWTPayload;
  } catch {
    return null;
  }
}
