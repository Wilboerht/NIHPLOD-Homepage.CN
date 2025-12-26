/**
 * JWT 工具
 * 使用 jose 库实现 JWT 签名和验证
 */
import { SignJWT, jwtVerify, type JWTPayload as JoseJWTPayload } from "jose";

// JWT 密钥（从环境变量获取）
const secret = new TextEncoder().encode(
  process.env.JWT_SECRET || "dev-secret-key-change-in-production-32chars"
);

// JWT 过期时间
const adminExpiresIn = process.env.JWT_EXPIRES_IN || "7d";
const userExpiresIn = process.env.USER_JWT_EXPIRES_IN || "30d";

// ============================================
// 管理员 Token
// ============================================

export interface AdminJWTPayload extends JoseJWTPayload {
  id: string;
  email: string;
  name: string;
}

/**
 * 签发管理员 JWT Token
 */
export async function signToken(payload: {
  id: string;
  email: string;
  name: string;
}): Promise<string> {
  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(adminExpiresIn)
    .sign(secret);

  return token;
}

/**
 * 验证管理员 JWT Token
 */
export async function verifyToken(token: string): Promise<AdminJWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload as AdminJWTPayload;
  } catch {
    return null;
  }
}

// 兼容旧接口
export const signJWT = signToken;
export const verifyJWT = verifyToken;

// ============================================
// C端用户 Token
// ============================================

export interface UserJWTPayload extends JoseJWTPayload {
  id: string;
  phone: string;
  type: "user";
}

/**
 * 签发用户 JWT Token
 */
export async function signUserToken(payload: {
  id: string;
  phone: string;
}): Promise<string> {
  const token = await new SignJWT({ ...payload, type: "user" as const })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(userExpiresIn)
    .sign(secret);

  return token;
}

/**
 * 验证用户 JWT Token
 */
export async function verifyUserToken(token: string): Promise<UserJWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    // 确保是用户 token
    if ((payload as UserJWTPayload).type !== "user") {
      return null;
    }
    return payload as UserJWTPayload;
  } catch {
    return null;
  }
}

/**
 * 获取 Token 过期时间戳（秒）
 */
export function getTokenExpiresAt(days: number = 30): number {
  return Math.floor(Date.now() / 1000) + days * 24 * 60 * 60;
}
