/**
 * 为 OAuth Client 追加允许的 scopes（幂等，仅新增不清除）
 *
 * authorize 时请求的 scope 必须 ⊆ 该 client 在库中的 scopes，否则授权被拒。
 * 子站新增能力对应的 scope：
 * - 会员中心 / 消费补录：membership
 * - 资料修改（昵称/头像 PATCH）：profile:write
 * - 生日回显：birthday
 *
 * 运行方式：
 *   npm run oauth:add-client-scopes -- <clientId> <scope> [scope...]
 * 示例（advisor 子站）：
 *   npm run oauth:add-client-scopes -- q6n4aitms0wgn2sz1nj96au5 \
 *     membership birthday profile:write
 *
 * 环境变量加载顺序（dotenv 默认不覆盖已存在值，先加载者优先）：
 * 进程环境变量 > .env.local > .env.production > .env
 * —— 本地开发用 .env.local 的库；服务器上真实环境变量/生产文件生效。
 */
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env.production" });
dotenv.config({ path: ".env" });

// scope 格式：小写字母/数字，可带一个 ":" 分段（如 profile:write）
const SCOPE_RE = /^[a-z][a-z0-9]*(?::[a-z][a-z0-9]*)?$/;

async function main() {
  const [, , clientId, ...scopes] = process.argv;
  if (!clientId || scopes.length === 0) {
    console.error("用法: npm run oauth:add-client-scopes -- <clientId> <scope> [scope...]");
    process.exit(1);
  }

  for (const scope of scopes) {
    if (!SCOPE_RE.test(scope)) {
      console.error(
        `无效 scope: ${scope}（仅允许小写字母/数字，可带一个 ":" 分段，如 profile:write）`
      );
      process.exit(1);
    }
  }

  // 延迟到 dotenv 加载后再引入 prisma（其初始化依赖 DATABASE_URL）
  const { prisma } = await import("../src/lib/prisma");

  const client = await prisma.oAuthClient.findFirst({
    where: { clientId, isActive: true },
    select: { id: true, name: true, scopes: true },
  });
  if (!client) {
    console.error(`未找到 client_id=${clientId} 的启用中 OAuth Client`);
    process.exit(1);
  }

  const existing = new Set(client.scopes);
  const toAdd = [...new Set(scopes)].filter((s) => !existing.has(s));
  if (toAdd.length === 0) {
    console.log(`[${client.name}] 所有 scope 均已允许，无需变更：`);
    for (const s of client.scopes) console.log(`  - ${s}`);
    process.exit(0);
  }

  await prisma.oAuthClient.update({
    where: { id: client.id },
    data: { scopes: [...client.scopes, ...toAdd] },
  });

  console.log(`[${client.name}] 已新增 ${toAdd.length} 个 scope：`);
  for (const s of toAdd) console.log(`  + ${s}`);
  console.log("当前完整 scope 列表：");
  for (const s of [...client.scopes, ...toAdd]) console.log(`  - ${s}`);
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
