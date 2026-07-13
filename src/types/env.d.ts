/**
 * 环境变量类型定义
 * 提供 TypeScript 类型支持
 */

declare namespace NodeJS {
  interface ProcessEnv {
    // ----- 应用配置 -----
    NEXT_PUBLIC_APP_NAME: string;
    NEXT_PUBLIC_APP_URL: string;
    NEXT_PUBLIC_APP_DESCRIPTION: string;

    // ----- 数据库配置 -----
    DATABASE_URL: string;

    // ----- 认证配置 -----
    JWT_SECRET: string;
    JWT_EXPIRES_IN: string;
    ADMIN_EMAIL: string;
    ADMIN_PASSWORD: string;

    // ----- AI 配置 -----
    DEEPSEEK_API_KEY: string;
    DEEPSEEK_API_URL: string;
    DEEPSEEK_MODEL: string;

    // ----- 邮件配置 -----
    SMTP_HOST: string;
    SMTP_PORT: string;
    SMTP_USER: string;
    SMTP_PASSWORD: string;
    SMTP_FROM: string;
    SMTP_FROM_NAME: string;
    NOTIFICATION_EMAIL: string;

    // ----- 文件上传配置 -----
    UPLOAD_MAX_SIZE: string;
    UPLOAD_ALLOWED_TYPES: string;

    // ----- 速率限制配置 -----
    RATE_LIMIT_MAX: string;
    RATE_LIMIT_WINDOW: string;

    // ----- 可选配置 -----
    CLOUDINARY_CLOUD_NAME?: string;
    CLOUDINARY_API_KEY?: string;
    CLOUDINARY_API_SECRET?: string;
    NEXT_PUBLIC_GA_ID?: string;
    NEXT_PUBLIC_BAIDU_TONGJI_ID?: string;
    BAIDU_PUSH_TOKEN?: string;
    NEXT_PUBLIC_SITE_URL?: string;

    // ----- 系统配置 -----
    NODE_ENV: "development" | "production" | "test";
  }
}
