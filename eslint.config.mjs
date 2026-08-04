import nextConfig from "eslint-config-next";
import nextCoreWebVitalsConfig from "eslint-config-next/core-web-vitals";
import nextTypescriptConfig from "eslint-config-next/typescript";
import eslintConfigPrettier from "eslint-config-prettier";

/** @type {import("eslint").Linter.Config[]} */
const eslintConfig = [
  {
    ignores: [
      ".next/**",
      "coverage/**",
      "node_modules/**",
      "packages/*/dist/**",
      "packages/*/node_modules/**",
      "examples/*/node_modules/**",
      "examples/*/.next/**",
      "prisma/migrations/**",
      "public/**",
    ],
  },
  ...nextConfig,
  ...nextCoreWebVitalsConfig,
  ...nextTypescriptConfig,
  eslintConfigPrettier,
  {
    rules: {
      "react/no-unescaped-entities": "off",
      "@next/next/no-page-custom-font": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_$",
          varsIgnorePattern: "^_$",
          caughtErrorsIgnorePattern: "^_$",
        },
      ],
    },
  },
];

export default eslintConfig;
