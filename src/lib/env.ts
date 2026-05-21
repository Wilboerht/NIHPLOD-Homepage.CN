import { apiConsole } from "@/lib/logger";
/**
 * 环境变量配置
 * 集中管理和验证环境变量
 */

// 应用配置
export const appConfig = {
  name: process.env.NEXT_PUBLIC_APP_NAME || "NIHPLOD",
  url: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  description: process.env.NEXT_PUBLIC_APP_DESCRIPTION || "逆转时光",
} as const;

// 数据库配置
export const dbConfig = {
  url: process.env.DATABASE_URL || "",
} as const;

// 认证配置
export const authConfig = {
  jwtSecret: process.env.JWT_SECRET || "",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  adminEmail: process.env.ADMIN_EMAIL || "",
  adminPassword: process.env.ADMIN_PASSWORD || "",
} as const;


// 上传配置
export const uploadConfig = {
  maxSize: parseInt(process.env.UPLOAD_MAX_SIZE || "10485760", 10), // 10MB
  allowedTypes: (
    process.env.UPLOAD_ALLOWED_TYPES || "image/jpeg,image/png,image/webp,image/gif"
  ).split(","),
} as const;

// 速率限制配置
export const rateLimitConfig = {
  max: parseInt(process.env.RATE_LIMIT_MAX || "100", 10),
  window: parseInt(process.env.RATE_LIMIT_WINDOW || "60000", 10),
} as const;

// 环境判断
export const isDev = process.env.NODE_ENV === "development";
export const isProd = process.env.NODE_ENV === "production";
export const isTest = process.env.NODE_ENV === "test";

/**
 * 验证必需的环境变量
 * 在应用启动时调用
 */
export function validateEnv(): { valid: boolean; missing: string[]; errors: string[] } {
  const required = ["DATABASE_URL", "JWT_SECRET"];
  const missing = required.filter((key) => !process.env[key]);
  const errors: string[] = [];

  if (missing.length > 0) {
    errors.push(`Missing required environment variables: ${missing.join(", ")}`);
  }

  const jwtSecret = process.env.JWT_SECRET;
  if (jwtSecret && jwtSecret.length < 32) {
    errors.push("JWT_SECRET must be at least 32 characters long");
  }

  if (errors.length > 0 && isProd) {
    apiConsole.error("[EnvValidation] 环境变量校验失败:", errors);
  }

  return {
    valid: errors.length === 0,
    missing,
    errors,
  };
}
