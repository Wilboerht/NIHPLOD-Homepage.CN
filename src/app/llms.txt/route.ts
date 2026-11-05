import { apiConsole } from "@/lib/logger";
import { getLlmsDocs } from "@/lib/llms-docs-server";
import { buildLlmsSummary } from "@/lib/llms-docs";
import { SITE_URL } from "@/lib/site-url";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TEXT_HEADERS = {
  "Content-Type": "text/plain; charset=utf-8",
  "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
};

export async function GET() {
  try {
    const { summary } = await getLlmsDocs();
    return new Response(`${summary}\n`, { headers: TEXT_HEADERS });
  } catch (error) {
    apiConsole.error("生成 llms.txt 失败:", error);
    const fallback = buildLlmsSummary({ siteUrl: SITE_URL, products: [] });
    return new Response(`${fallback}\n`, { headers: TEXT_HEADERS });
  }
}
