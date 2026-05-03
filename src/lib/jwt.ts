/**
 * JWT 工具
 * 使用 jose 库实现 JWT 签名和验证
 * 
 * Token 策略：
 * - Access Token：短期（15分钟），用于 API 请求
 * - Refresh Token：长期（30天），用于获取新 Access Token
 */
import { SignJWT, jwtVerify, type JWTPayload as JoseJWTPayload } from "jose";

// JWT 密钥（从环境变量获取，禁止硬编码回退）
function getSecret(): Uint8Array {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error("[JWT] JWT_SECRET 环境变量未设置，请配置后再启动应用");
  }
  return new TextEncoder().encode(jwtSecret);
}

// JWT 过期时间
const adminExpiresIn = process.env.JWT_EXPIRES_IN || "7d";
// C端用户 Token 时间
const accessTokenExpiresIn = "15m";   // Access Token 15分钟
const refreshTokenExpiresIn = "30d";  // Refresh Token 30天

// ============================================
// 管理员 Token
// ============================================

export interface AdminJWTPayload extends JoseJWTPayload {
  id: string;
  email: string;
  name: string;
  role: string;
}

/**
 * 签发管理员 JWT Token
 */
export async function signToken(payload: {
  id: string;
  email: string;
  name: string;
  role: string;
}): Promise<string> {
  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(adminExpiresIn)
    .sign(getSecret());

  return token;
}

/**
 * 验证管理员 JWT Token
 */
export async function verifyToken(token: string): Promise<AdminJWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload as AdminJWTPayload;
  } catch {
    return null;
  }
}

// 兼容旧接口
export const signJWT = signToken;
export const verifyJWT = verifyToken;

// ============================================
// C端用户 Token（双 Token 策略）
// ============================================

export interface UserJWTPayload extends JoseJWTPayload {
  id: string;
  phone: string;
  type: "user";
}

export interface RefreshTokenPayload extends JoseJWTPayload {
  id: string;
  phone: string;
  type: "refresh";
}

/**
 * 签发用户 Access Token（短期，15分钟）
 */
export async function signUserToken(payload: {
  id: string;
  phone: string;
}): Promise<string> {
  const token = await new SignJWT({ ...payload, type: "user" as const })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(accessTokenExpiresIn)
    .sign(getSecret());

  return token;
}

/**
 * 验证用户 Access Token
 */
export async function verifyUserToken(token: string): Promise<UserJWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
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
 * 签发用户 Refresh Token（长期，30天）
 * 用于在 Access Token 过期后获取新的 Access Token
 */
export async function signRefreshToken(payload: {
  id: string;
  phone: string;
}): Promise<string> {
  const token = await new SignJWT({ ...payload, type: "refresh" as const })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(refreshTokenExpiresIn)
    .sign(getSecret());

  return token;
}

/**
 * 验证用户 Refresh Token
 */
export async function verifyRefreshToken(token: string): Promise<RefreshTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    // 确保是 refresh token
    if ((payload as RefreshTokenPayload).type !== "refresh") {
      return null;
    }
    return payload as RefreshTokenPayload;
  } catch {
    return null;
  }
}

/**
 * 获取 Token 过期时间戳（秒）
 * @param minutes 分钟数
 */
export function getTokenExpiresAt(minutes: number = 15): number {
  return Math.floor(Date.now() / 1000) + minutes * 60;
}

/**
 * 获取 Refresh Token 过期时间戳（秒，30天）
 */
export function getRefreshTokenExpiresAt(): number {
  return Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
}
