import { apiConsole } from "@/lib/logger";
import { getLlmsDocs } from "@/lib/llms-docs-server";
import { buildLlmsFullDoc } from "@/lib/llms-docs";
import { SITE_URL } from "@/lib/site-url";
import { LLMS_BRAND_SECTION, LLMS_FAQ_SECTION, LLMS_RITUALS_SECTION } from "@/config/llms-content";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TEXT_HEADERS = {
  "Content-Type": "text/plain; charset=utf-8",
  "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
};

export async function GET() {
  try {
    const { full } = await getLlmsDocs();
    return new Response(`${full}\n`, { headers: TEXT_HEADERS });
  } catch (error) {
    apiConsole.error("生成 llms-full.txt 失败:", error);
    const fallback = buildLlmsFullDoc({
      siteUrl: SITE_URL,
      products: [],
      brandSection: LLMS_BRAND_SECTION,
      ritualsSection: LLMS_RITUALS_SECTION,
      faqSection: LLMS_FAQ_SECTION,
    });
    return new Response(`${fallback}\n`, { headers: TEXT_HEADERS });
  }
}
