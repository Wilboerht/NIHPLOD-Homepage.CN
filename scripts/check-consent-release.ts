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

    const { getConsentPolicySnapshot } = await import("../src/lib/consent-policy");
    const snapshot = await getConsentPolicySnapshot();

    const policy = (["privacy", "terms"] as const).map((slug) => {
      const document = snapshot[slug];
      const expected = hashLegalContent(defaultLegalDocuments[slug]);
      const actual = document.publishedContentHash;
      return {
        slug,
        publishedVersion: document.publishedVersion ?? 0,
        requiredVersion: document.requiredVersion,
        requiresReconsent: document.requiredVersion !== null,
        sourceMatchesPublished: actual !== null && actual === expected,
        expectedHash: expected,
        publishedHash: actual,
        requiredHash: document.requiredContentHash,
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
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
