import { apiConsole } from "@/lib/logger";
import { getLlmsDocs } from "@/lib/llms-docs-server";

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
    return new Response("", {
      status: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
}
