/**
 * 生成 OAuth Access Token RS256 密钥对
 *
 * 输出：
 * - JWT_ACCESS_PRIVATE_KEY（PKCS8 PEM，用于主站签名 OAuth access_token）
 * - JWT_ACCESS_PUBLIC_KEY（SPKI PEM，用于 JWKS 端点公开及子项目本地验证）
 *
 * 用法：
 *   npx tsx scripts/generate-oauth-rs256-keys.ts
 *
 * 生成后请将两行 PEM 分别写入 .env.local / 生产密钥管理系统。
 */
import { generateKeyPair, exportPKCS8, exportSPKI } from "jose";

async function main() {
  const { privateKey, publicKey } = await generateKeyPair("RS256", {
    modulusLength: 2048,
    extractable: true,
  });

  const privatePem = await exportPKCS8(privateKey);
  const publicPem = await exportSPKI(publicKey);

  console.log("# ===== JWT_ACCESS_PRIVATE_KEY =====");
  console.log(privatePem.trimEnd());
  console.log();
  console.log("# ===== JWT_ACCESS_PUBLIC_KEY =====");
  console.log(publicPem.trimEnd());
  console.log();
  console.log("# 请将以上两个变量写入 .env.local（保留换行），然后重启应用。");
  console.log("# 子项目即可通过 /api/oauth/jwks 获取公钥，本地验证 RS256 access_token。");
}

main().catch((err) => {
  console.error("生成密钥失败:", err);
  process.exit(1);
});
