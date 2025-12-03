/**
 * JWT 工具
 * 使用 jose 库实现 JWT 签名和验证
 */
import { SignJWT, jwtVerify, type JWTPayload as JoseJWTPayload } from "jose";

// JWT 密钥（从环境变量获取）
const secret = new TextEncoder().encode(
  process.env.JWT_SECRET || "dev-secret-key-change-in-production-32chars"
);

// JWT 过期时间（默认 7 天）
const expiresIn = process.env.JWT_EXPIRES_IN || "7d";

export interface AdminJWTPayload extends JoseJWTPayload {
  id: string;
  email: string;
  name: string;
}

/**
 * 签发 JWT Token
 */
export async function signToken(payload: {
  id: string;
  email: string;
  name: string;
}): Promise<string> {
  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secret);

  return token;
}

/**
 * 验证 JWT Token
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
