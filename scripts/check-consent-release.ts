import dotenv from "dotenv";
import { defaultLegalDocuments } from "../src/lib/legal-default-content";
import { hashLegalContent } from "../src/lib/legal-content-hash";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env.production" });
dotenv.config({ path: ".env" });

async function main() {
  // 动态导入：确保 dotenv 先执行，prisma.ts 才能读到 DATABASE_URL。
  const { prisma } = await import("../src/lib/prisma");
  try {
    const [mainConsents, mainEvents] = await Promise.all([
      prisma.privacyConsent.count(),
      prisma.consentEvent.count(),
    ]);

    const documents = await prisma.legalDocument.findMany({
      select: { id: true, slug: true, publishedVersion: true },
    });
    const published = new Map(documents.map((document) => [document.slug, document]));

    const policy = await Promise.all(
      (["privacy", "terms"] as const).map(async (slug) => {
        const document = published.get(slug);
        const expected = hashLegalContent(defaultLegalDocuments[slug]);
        const version =
          document && document.publishedVersion > 0
            ? await prisma.legalDocumentVersion.findUnique({
                where: {
                  documentId_version: {
                    documentId: document.id,
                    version: document.publishedVersion,
                  },
                },
                select: { contentHash: true },
              })
            : null;
        const actual = version?.contentHash ?? null;
        return {
          slug,
          publishedVersion: document?.publishedVersion ?? 0,
          sourceMatchesPublished: actual !== null && actual === expected,
          expectedHash: expected,
          publishedHash: actual,
        };
      })
    );

    console.log(
      JSON.stringify(
        {
          main: { consents: mainConsents, events: mainEvents },
          policy,
          next:
            mainConsents > 0
              ? "已有真实同意记录：不要直接覆盖当前政策版本，先升级版本并重新同意。"
              : "当前主站无同意记录：确认测肤 ConsentRecord 也为 0 后，可发布当前政策。",
        },
        null,
        2
      )
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
