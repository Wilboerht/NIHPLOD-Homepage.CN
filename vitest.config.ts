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
      // 全局阈值（当前 ~30% 因大量 lib 文件尚无测试，随测试补全逐步上调至 60%）
      thresholds: {
        statements: 28,
        branches: 25,
        functions: 28,
        lines: 28,
      },
    },
  },
});
