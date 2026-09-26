/**
 * 注册 RP-Initiated Logout 回跳地址（post_logout_redirect_uri）
 *
 * 子站登出完成后主站要 302 回子站，end-session 要求该地址与 OAuthClient
 * 记录的 postLogoutRedirectUris 精确匹配（src/lib/post-logout-redirect.ts），
 * 未注册的地址会被静默忽略，导致用户登出后停留在主站。
 *
 * 运行方式：
 *   npx tsx scripts/register-post-logout-uri.ts <clientId> <uri> [uri...]
 * 示例（advisor 子站）：
 *   npx tsx scripts/register-post-logout-uri.ts q6n4aitms0wgn2sz1nj96au5 \
 *     https://advisor.nihplod.cn https://advisor.nihplod.cn/
 *
 * 加载 .env.production.local / .env.local / .env.production / .env
 * （与 Next.js 运行时优先级一致：靠前的文件优先，dotenv 默认不覆盖已设置变量）。
 * ⚠️ 脚本会写入 DATABASE_URL 指向的数据库：运行前请核对下方打印的目标库主机，
 *    本地执行时确保 .env.local 指向开发库，避免误改生产数据。
 * 幂等：已存在的地址不会重复写入。
 */
import dotenv from "dotenv";
import { isSafeRelativePath } from "../src/lib/url-safety";

dotenv.config({ path: ".env.production.local" });
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env.production" });
dotenv.config({ path: ".env" });

/** 打印目标数据库主机（隐藏账号密码），降低误操作生产库的风险 */
function logDatabaseTarget(): void {
  const url = process.env.DATABASE_URL;
  if (!url) return;
  try {
    const parsed = new URL(url);
    console.log(`目标数据库: ${parsed.hostname}${parsed.port ? `:${parsed.port}` : ""}${parsed.pathname}`);
  } catch {
    console.log("目标数据库: (DATABASE_URL 无法解析)");
  }
}

async function main() {
  const [, , clientId, ...uris] = process.argv;
  if (!clientId || uris.length === 0) {
    console.error(
      "用法: npx tsx scripts/register-post-logout-uri.ts <clientId> <uri> [uri...]"
    );
    process.exit(1);
  }

  logDatabaseTarget();

  // 基础格式校验：必须是 http(s) 绝对 URL 或站内相对路径
  // （相对路径拒绝反斜杠/控制字符："/\evil.com" 会被浏览器解析为跨站地址）
  for (const uri of uris) {
    const isRelative = isSafeRelativePath(uri);
    if (!isRelative) {
      try {
        const parsed = new URL(uri);
        if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
          throw new Error("仅支持 http/https");
        }
      } catch (err) {
        console.error(`无效 URI: ${uri} (${err instanceof Error ? err.message : err})`);
        process.exit(1);
      }
    }
  }

  // 延迟到 dotenv 加载后再引入 prisma（其初始化依赖 DATABASE_URL）
  const { prisma } = await import("../src/lib/prisma");

  const client = await prisma.oAuthClient.findFirst({
    where: { clientId, isActive: true },
    select: { id: true, name: true, postLogoutRedirectUris: true },
  });
  if (!client) {
    console.error(`未找到 client_id=${clientId} 的启用中 OAuth Client`);
    process.exit(1);
  }

  const existing = new Set(client.postLogoutRedirectUris);
  const toAdd = uris.filter((u) => !existing.has(u));
  if (toAdd.length === 0) {
    console.log(`[${client.name}] 所有地址均已注册，无需变更：`);
    for (const u of client.postLogoutRedirectUris) console.log(`  - ${u}`);
    process.exit(0);
  }

  await prisma.oAuthClient.update({
    where: { id: client.id },
    data: { postLogoutRedirectUris: [...client.postLogoutRedirectUris, ...toAdd] },
  });

  console.log(`[${client.name}] 已新增 ${toAdd.length} 个 post_logout_redirect_uri：`);
  for (const u of toAdd) console.log(`  + ${u}`);
  console.log("当前完整列表：");
  for (const u of [...client.postLogoutRedirectUris, ...toAdd]) console.log(`  - ${u}`);
}

main()
  .catch((err) => {
    console.error("执行失败:", err);
    process.exit(1);
  })
  .finally(async () => {
    const { prisma } = await import("../src/lib/prisma");
    await prisma.$disconnect();
  });
