import { prisma } from "../src/lib/prisma";
import { defaultLegalDocuments } from "../src/lib/legal-default-content";
import { hashLegalContentForComparison } from "../src/lib/legal-content-hash";
import type { LegalDocumentContent } from "../src/types/legal";

async function main() {
  const [mainConsents, mainEvents] = await Promise.all([
    prisma.privacyConsent.count(),
    prisma.consentEvent.count(),
  ]);

  const documents = await prisma.legalDocument.findMany({
    select: { slug: true, publishedVersion: true, publishedContent: true },
  });
  const published = new Map(documents.map((document) => [document.slug, document]));

  const policy = (["privacy", "terms"] as const).map((slug) => {
    const expected = hashLegalContentForComparison(defaultLegalDocuments[slug]);
    const actual = published.get(slug)?.publishedContent
      ? hashLegalContentForComparison(
          published.get(slug)!.publishedContent as unknown as LegalDocumentContent
        )
      : null;
    return {
      slug,
      publishedVersion: published.get(slug)?.publishedVersion ?? 0,
      sourceMatchesPublished: actual !== null && actual === expected,
      expectedHash: expected,
      publishedHash: actual,
    };
  });

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
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
