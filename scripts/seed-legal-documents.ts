/**
 * 初始化填充法务文档（服务条款 / 隐私政策）
 *
 * 把代码内置的现有法律文案无损写入 LegalDocument + LegalDocumentVersion v1，
 * 让后台第一次打开就看到「已发布 v1」与完整版本历史。
 *
 * 用法：
 *   npm run legal:seed
 *   npm run legal:seed -- --dry-run
 *   npm run legal:seed -- --slug terms
 *   npm run legal:seed -- --force
 *
 * 说明：
 * - 默认幂等：仅填充从未发布过的文档；已有线上内容跳过。
 * - 保留原文 lastUpdated（这是迁移存量文案，不是重新发布）。
 * - --force 会生成 publishedVersion + 1 的新版本，历史版本不删除。
 * - 脚本不调用 Next.js revalidate API；公开页使用动态渲染，
 *   读取层有 300 秒数据缓存，执行后最多 5 分钟生效。
 */
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env.production" });
dotenv.config({ path: ".env" });

const args = new Set(process.argv.slice(2));

function readSlugArg(): string | undefined {
  const inline = process.argv.find((arg) => arg.startsWith("--slug="));
  if (inline) return inline.slice("--slug=".length);
  const index = process.argv.indexOf("--slug");
  if (index >= 0) return process.argv[index + 1];
  return undefined;
}

const dryRun = args.has("--dry-run");
const force = args.has("--force");
const slugArg = readSlugArg();

function printHelp(): void {
  console.log(`
用法：
  npm run legal:seed                 幂等填充尚未发布的文档
  npm run legal:seed -- --dry-run    只打印计划，不写数据库
  npm run legal:seed -- --slug terms 只处理 terms 或 privacy
  npm run legal:seed -- --force      已发布也重新导入，生成新版本（保留历史）

注意：
  - 请先执行数据库迁移：npm run db:deploy（或 db:migrate）
  - 生产环境需配置审计密钥 AUDIT_INTEGRITY_HMAC_KEY（与站点审计一致）
  - 公开页为动态渲染，执行后最多 5 分钟（数据缓存 300 秒）生效
`);
}

type SeedSlug = "terms" | "privacy";

function resolveSlugs(): SeedSlug[] {
  if (!slugArg) return ["terms", "privacy"];
  if (slugArg === "terms" || slugArg === "privacy") return [slugArg];
  throw new Error(`--slug 仅支持 terms 或 privacy，收到：${slugArg}`);
}

async function main(): Promise<void> {
  if (args.has("--help") || args.has("-h")) {
    printHelp();
    return;
  }

  const slugs = resolveSlugs();

  const [
    { prisma },
    { defaultLegalDocuments },
    { legalDocumentContentSchema },
    { hashLegalContent },
    { countLegalContentChars },
    { planLegalSeed },
    { createAuditLogTx },
    { toInputJson },
  ] = await Promise.all([
    import("../src/lib/prisma"),
    import("../src/lib/legal-default-content"),
    import("../src/schemas/legal"),
    import("../src/lib/legal-content-hash"),
    import("../src/lib/legal-content"),
    import("../src/lib/legal-seed-plan"),
    import("../src/lib/audit"),
    import("../src/lib/prisma-json"),
  ]);

  try {
    const contents = new Map<SeedSlug, (typeof defaultLegalDocuments)[SeedSlug]>();
    for (const slug of slugs) {
      const parsed = legalDocumentContentSchema.safeParse(defaultLegalDocuments[slug]);
      if (!parsed.success) {
        throw new Error(
          `${slug} 默认内容校验失败：${parsed.error.issues[0]?.message ?? "未知错误"}`
        );
      }
      contents.set(slug, parsed.data);
    }

    const rows = await prisma.legalDocument.findMany({
      where: { slug: { in: slugs } },
      select: {
        id: true,
        slug: true,
        publishedVersion: true,
        publishedContent: true,
        draftContent: true,
      },
    });
    const rowsBySlug = new Map(rows.map((row) => [row.slug, row]));

    const plans = slugs.map((slug) => {
      const row = rowsBySlug.get(slug);
      return planLegalSeed({
        slug,
        existing: row
          ? {
              publishedVersion: row.publishedVersion,
              hasPublishedContent: row.publishedContent !== null,
              hasDraftContent: row.draftContent !== null,
            }
          : null,
        force,
      });
    });

    const executablePlans = plans.filter((plan) => plan.action !== "skip");

    if (dryRun) {
      console.log("初始化计划（--dry-run，未写入数据库）：");
      for (const plan of plans) {
        console.log(
          `  [${plan.slug}] ${plan.action}${plan.nextVersion > 0 ? ` -> v${plan.nextVersion}` : ""}：${plan.reason}`
        );
      }
      return;
    }

    if (executablePlans.length === 0) {
      console.log("没有需要填充的文档：");
      for (const plan of plans) {
        console.log(`  [${plan.slug}] 跳过：${plan.reason}`);
      }
      return;
    }

    for (const plan of executablePlans) {
      const row = rowsBySlug.get(plan.slug);
      if (row?.draftContent) {
        console.warn(`警告：${plan.slug} 存在未发布草稿，本次只更新已发布内容，草稿保持不变。`);
      }
    }

    const results: Array<{
      slug: SeedSlug;
      action: string;
      version: number;
      sections: number;
      chars: number;
      hash: string;
    }> = [];

    await prisma.$transaction(
      async (tx) => {
        for (const plan of executablePlans) {
          const content = contents.get(plan.slug);
          if (!content) throw new Error(`缺少 ${plan.slug} 的默认内容`);

          const hash = hashLegalContent(content);
          const now = new Date();
          const existing = rowsBySlug.get(plan.slug);
          let documentId: string;

          if (plan.action === "create") {
            const created = await tx.legalDocument.create({
              data: {
                slug: plan.slug,
                publishedContent: toInputJson(content),
                publishedVersion: plan.nextVersion,
                publishedAt: now,
                draftRevision: 0,
              },
            });
            documentId = created.id;
          } else {
            if (!existing) {
              throw new Error(`${plan.slug} 状态在脚本执行期间发生变化，请重试`);
            }
            const updated = await tx.legalDocument.updateMany({
              where: {
                id: existing.id,
                ...(plan.action === "fill-unpublished"
                  ? { publishedVersion: 0 }
                  : { publishedVersion: existing.publishedVersion }),
              },
              data: {
                publishedContent: toInputJson(content),
                publishedVersion: plan.nextVersion,
                publishedAt: now,
              },
            });
            if (updated.count === 0) {
              throw new Error(`${plan.slug} 在脚本执行期间被其他管理员修改，请重试`);
            }
            documentId = existing.id;
          }

          await tx.legalDocumentVersion.create({
            data: {
              documentId,
              version: plan.nextVersion,
              content: toInputJson(content)!,
              contentHash: hash,
              sectionCount: content.sections.length,
              note:
                plan.action === "force-new-version"
                  ? "强制重新导入现有线上文案"
                  : "初始化导入：迁移自代码内置文案",
              schemaVersion: 1,
            },
          });

          await createAuditLogTx(tx, {
            action: "legal_document_seeded",
            targetType: "legal_document",
            targetId: documentId,
            targetLabel: `${content.title} v${plan.nextVersion}`,
            detail: {
              slug: plan.slug,
              version: plan.nextVersion,
              source: "code-defaults",
              contentHash: hash,
              sectionCount: content.sections.length,
            },
            actorType: "SYSTEM",
            source: "SYSTEM",
            authMethod: "system",
          });

          results.push({
            slug: plan.slug,
            action: plan.action,
            version: plan.nextVersion,
            sections: content.sections.length,
            chars: countLegalContentChars(content),
            hash,
          });
        }
      },
      { timeout: 60_000, maxWait: 10_000 }
    );

    console.log("法务文档初始化完成：");
    for (const result of results) {
      console.log(
        `  [${result.slug}] ${result.action} -> v${result.version} | ${result.sections} 章 | ${result.chars.toLocaleString("zh-CN")} 字 | hash ${result.hash.slice(0, 12)}…`
      );
    }
    for (const plan of plans.filter((item) => item.action === "skip")) {
      console.log(`  [${plan.slug}] 跳过：${plan.reason}`);
    }
    console.log(
      "\n提示：lastUpdated 已保留原文日期；公开页为动态渲染，若应用已在运行，最多 5 分钟（数据缓存 300 秒）后生效。"
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  if (typeof error === "object" && error !== null && "code" in error && error.code === "P2021") {
    console.error(
      "数据库表不存在：请先执行数据库迁移（npm run db:deploy 或 npm run db:migrate）后重试。"
    );
  } else {
    console.error("法务文档初始化失败：", error);
  }
  process.exitCode = 1;
});
