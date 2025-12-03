/**
 * 环境变量配置
 * 集中管理和验证环境变量
 */

// 应用配置
export const appConfig = {
  name: process.env.NEXT_PUBLIC_APP_NAME || "NIHPLOD",
  url: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  description: process.env.NEXT_PUBLIC_APP_DESCRIPTION || "高端婚礼花艺定制",
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

// AI 配置
export const aiConfig = {
  apiKey: process.env.DEEPSEEK_API_KEY || "",
  apiUrl: process.env.DEEPSEEK_API_URL || "https://api.deepseek.com/v1",
  model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
} as const;

// 邮件配置
export const emailConfig = {
  host: process.env.SMTP_HOST || "",
  port: parseInt(process.env.SMTP_PORT || "587", 10),
  user: process.env.SMTP_USER || "",
  password: process.env.SMTP_PASSWORD || "",
  from: process.env.SMTP_FROM || "",
  fromName: process.env.SMTP_FROM_NAME || "NIHPLOD",
  notificationEmail: process.env.NOTIFICATION_EMAIL || "",
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
export function validateEnv(): { valid: boolean; missing: string[] } {
  const required = ["DATABASE_URL", "JWT_SECRET"];

  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0 && isProd) {
    console.error("Missing required environment variables:", missing);
  }

  return {
    valid: missing.length === 0,
    missing,
  };
}
