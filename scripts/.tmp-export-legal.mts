import dotenv from "dotenv";

dotenv.config({ path: ".env.production" });

async function main() {
  const { prisma } = await import("../src/lib/prisma");

  try {
    const rows = await prisma.legalDocument.findMany({
      where: { slug: { in: ["privacy", "terms"] } },
      select: {
        slug: true,
        publishedVersion: true,
        publishedContent: true,
        requiredConsentVersionId: true,
      },
    });
    console.log(
      rows.map((row) => {
        const content = row.publishedContent as {
          title?: string;
          lastUpdated?: string;
          sections?: unknown[];
        } | null;
        return {
          slug: row.slug,
          version: row.publishedVersion,
          hasPublished: Boolean(content),
          title: content?.title,
          lastUpdated: content?.lastUpdated,
          sections: Array.isArray(content?.sections) ? content.sections.length : null,
          required: row.requiredConsentVersionId,
        };
      })
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main();
