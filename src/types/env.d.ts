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

    // ----- 可选配置 -----
    NEXT_PUBLIC_GA_ID?: string;
    NEXT_PUBLIC_BAIDU_TONGJI_ID?: string;
    BAIDU_PUSH_TOKEN?: string;
    NEXT_PUBLIC_SITE_URL?: string;

    // ----- 系统配置 -----
    NODE_ENV: "development" | "production" | "test";
  }
}
