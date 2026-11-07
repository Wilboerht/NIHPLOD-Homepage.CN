import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["node_modules", ".next"],
    setupFiles: ["./vitest.setup.ts"],
    testTimeout: 15000,
    env: {
      JWT_ADMIN_SECRET: "test-admin-secret-key-at-least-32-characters",
      JWT_ACCESS_SECRET: "test-access-secret-key-at-least-32-characters",
      JWT_REFRESH_SECRET: "test-refresh-secret-key-at-least-32-characters",
      JWT_WECHAT_BIND_SECRET: "test-wechat-bind-secret-at-least-32-chars",
      JWT_WECHAT_EXCHANGE_SECRET: "test-wechat-exchange-secret-32chars",
      JWT_ID_TOKEN_SECRET: "test-id-token-secret-key-at-least-32-chars",
      JWT_LOGOUT_SECRET: "test-logout-secret-key-at-least-32-chars",
      TOTP_ENCRYPTION_KEY: "test-totp-encryption-key-at-least-32-chars",
      LOGIN_ATTEMPT_HMAC_KEY: "test-login-attempt-hmac-key-32chars",
      SMS_CODE_HMAC_KEY: "test-sms-code-hmac-key-at-least-32-chars",
      DATABASE_URL: "postgresql://test:test@localhost:5432/test",
      TZ: "Asia/Shanghai",
      ALLOW_HS256_FALLBACK: "true",
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      include: [
        "src/lib/**/*.ts",
        "src/app/api/admin/**/*.ts",
        "src/components/admin/**/*.tsx",
      ],
      exclude: [
        "src/lib/__tests__/**",
        "src/generated/**",
        "**/*.d.ts",
      ],
      // 已纳入管理端 API/组件；阈值按当前真实基线设置，避免 CI 永久红灯。
      // 后续优先补：审批执行器、审计导出/保留 worker、上传/OSS、管理端大页面。
      thresholds: {
        statements: 50,
        branches: 65,
        functions: 70,
        lines: 50,
      },
    },
  },
});
