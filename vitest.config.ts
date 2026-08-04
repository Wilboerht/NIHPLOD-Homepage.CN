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
      DATABASE_URL: "postgresql://test:test@localhost:5432/test",
      TZ: "Asia/Shanghai",
      ALLOW_HS256_FALLBACK: "true",
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      include: ["src/lib/**/*.ts"],
      exclude: [
        "src/lib/__tests__/**",
        "src/generated/**",
        "**/*.d.ts",
      ],
      // 全局阈值目标：60%（中长期目标）。当前覆盖率约 35% statements/lines，
      // 因大量非 SSO 业务模块（支付、上传、OSS、微信等）尚无测试，短期无法直接达标。
      // 新增 SSO 核心模块测试后，functions/branches 已接近/超过 60%。
      // 后续应优先为 ali-oss.ts、api-client.ts、payment-config.ts、upload.ts、wechat*.ts、wecom.ts 等补充测试。
      thresholds: {
        statements: 35,
        branches: 60,
        functions: 60,
        lines: 35,
        // 60% 是下一里程碑；statements/lines 因大量非 SSO 业务模块暂无测试暂保持 35%。
      },
    },
  },
});
