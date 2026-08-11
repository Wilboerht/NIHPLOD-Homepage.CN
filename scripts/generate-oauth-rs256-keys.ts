/**
 * 生成 OAuth RS256 非对称密钥对
 *
 * 输出（均为单行 .env 格式，PEM 中的换行已转义为字面 \n）：
 * - JWT_ACCESS_PRIVATE_KEY / JWT_ACCESS_PUBLIC_KEY（用于 OAuth access_token）
 * - JWT_ID_TOKEN_PRIVATE_KEY / JWT_ID_TOKEN_PUBLIC_KEY（用于 OIDC ID Token）
 * - JWT_LOGOUT_TOKEN_PRIVATE_KEY / JWT_LOGOUT_TOKEN_PUBLIC_KEY（用于 backchannel logout token）
 *
 * 用法：
 *   npx tsx scripts/generate-oauth-rs256-keys.ts
 *
 * 生成后请将输出复制到 .env.local / 生产密钥管理系统。
 */
import { generateKeyPair, exportPKCS8, exportSPKI } from "jose";

/** 将多行 PEM 转为 .env 友好的单行格式（换行 → 字面 \n），与 .env.example 保持一致 */
function toEnvLine(name: string, pem: string): string {
  return `${name}="${pem.trimEnd().replace(/\r?\n/g, "\\n")}"`;
}

async function generatePair(name: string) {
  const { privateKey, publicKey } = await generateKeyPair("RS256", {
    modulusLength: 2048,
    extractable: true,
  });

  const privatePem = await exportPKCS8(privateKey);
  const publicPem = await exportSPKI(publicKey);

  console.log(toEnvLine(`${name}_PRIVATE_KEY`, privatePem));
  console.log(toEnvLine(`${name}_PUBLIC_KEY`, publicPem));
  console.log();
}

async function main() {
  console.log("# ===== JWT_ACCESS（OAuth access_token） =====");
  await generatePair("JWT_ACCESS");

  console.log("# ===== JWT_ID_TOKEN（OIDC ID Token，子项目通过 JWKS 验证） =====");
  await generatePair("JWT_ID_TOKEN");

  console.log("# ===== JWT_LOGOUT_TOKEN（backchannel logout token） =====");
  await generatePair("JWT_LOGOUT_TOKEN");

  console.log("# 使用说明：");
  console.log("# 1. 将以上变量原样复制到 .env.local（已是单行 \\n 转义格式，无需再处理换行），重启应用。");
  console.log("# 2. 子项目即可通过 /api/oauth/jwks 获取公钥，本地验证 RS256 access_token / id_token。");
  console.log("#");
  console.log("# ⚠️ 安全警告：");
  console.log("# - *_PRIVATE_KEY 是最高机密，泄露等于任何人都能伪造 token，严禁提交到 Git、发到聊天工具或日志中；");
  console.log("# - 本输出请通过安全渠道转移（如密钥管理系统），用完及时清除终端滚动缓冲；");
  console.log("# - 如怀疑泄露，立即重新生成并重启所有服务，旧密钥签发的 token 将全部失效。");
}

main().catch((err) => {
  console.error("生成密钥失败:", err);
  process.exit(1);
});
