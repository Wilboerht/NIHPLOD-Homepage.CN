/**
 * 生成 OAuth RS256 非对称密钥对
 *
 * 输出：
 * - JWT_ACCESS_PRIVATE_KEY / JWT_ACCESS_PUBLIC_KEY（用于 OAuth access_token）
 * - JWT_ID_TOKEN_PRIVATE_KEY / JWT_ID_TOKEN_PUBLIC_KEY（用于 OIDC ID Token）
 *
 * 用法：
 *   npx tsx scripts/generate-oauth-rs256-keys.ts
 *
 * 生成后请将 PEM 写入 .env.local / 生产密钥管理系统。
 */
import { generateKeyPair, exportPKCS8, exportSPKI } from "jose";

async function generatePair(name: string) {
  const { privateKey, publicKey } = await generateKeyPair("RS256", {
    modulusLength: 2048,
    extractable: true,
  });

  const privatePem = await exportPKCS8(privateKey);
  const publicPem = await exportSPKI(publicKey);

  console.log(`# ===== ${name}_PRIVATE_KEY =====`);
  console.log(privatePem.trimEnd());
  console.log();
  console.log(`# ===== ${name}_PUBLIC_KEY =====`);
  console.log(publicPem.trimEnd());
  console.log();
}

async function main() {
  await generatePair("JWT_ACCESS");
  await generatePair("JWT_ID_TOKEN");

  console.log("# 请将以上变量写入 .env.local（保留换行），然后重启应用。");
  console.log("# 子项目即可通过 /api/oauth/jwks 获取公钥，本地验证 RS256 access_token / id_token。");
}

main().catch((err) => {
  console.error("生成密钥失败:", err);
  process.exit(1);
});
