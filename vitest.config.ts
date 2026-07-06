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
    include: ["src/**/*.test.ts"],
    exclude: ["node_modules", ".next"],
    env: {
      JWT_SECRET: "test-secret-key-at-least-32-characters-long",
      DATABASE_URL: "postgresql://test:test@localhost:5432/test",
    },
  },
});
