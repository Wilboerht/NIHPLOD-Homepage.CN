/**
 * 生成测肤子站管理员 SSO 的 RS256 密钥对
 *
 * 输出（单行 .env 格式，PEM 换行已转义为字面 \n）：
 * - ADVISOR_ADMIN_SSO_PRIVATE_KEY / ADVISOR_ADMIN_SSO_PUBLIC_KEY
 * - ADVISOR_ADMIN_SSO_KID（默认 kid）
 *
 * 用法：
 *   npm run generate:admin-sso-keys
 */
import { generateKeyPair, exportPKCS8, exportSPKI } from "jose";

function toEnvLine(name: string, pem: string): string {
  return `${name}="${pem.trimEnd().replace(/\r?\n/g, "\\n")}"`;
}

async function main() {
  const { privateKey, publicKey } = await generateKeyPair("RS256", {
    modulusLength: 2048,
    extractable: true,
  });

  const privatePem = await exportPKCS8(privateKey);
  const publicPem = await exportSPKI(publicKey);

  console.log("# ===== 测肤子站管理员 SSO（RS256）=====");
  console.log(toEnvLine("ADVISOR_ADMIN_SSO_PRIVATE_KEY", privatePem));
  console.log(toEnvLine("ADVISOR_ADMIN_SSO_PUBLIC_KEY", publicPem));
  console.log('ADVISOR_ADMIN_SSO_KID="advisor-admin-rs256-v1"');
  console.log();
  console.log("# 使用说明：");
  console.log("# 1. 主站配置私钥、公钥与 kid；公钥会通过 /api/oauth/jwks 自动发布。");
  console.log("# 2. 子站无需配置该公钥：默认从主站 JWKS 拉取并按 kid 验签。");
  console.log("# 3. 如需离线固定公钥，可在子站配置 ADMIN_SSO_PUBLIC_KEY。");
  console.log("#");
  console.log("# ⚠️ 安全警告：");
  console.log("# - 私钥仅保存在主站，严禁提交 Git、发到聊天工具或写入日志；");
  console.log("# - 如怀疑泄露，重新生成密钥对并重启主站，旧断言将在 60 秒内自然过期。");
}

main().catch((error) => {
  console.error("生成密钥失败:", error);
  process.exit(1);
});
