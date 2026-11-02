import { buildAuthMd } from "@/lib/agent-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEADERS = {
  "Content-Type": "text/markdown; charset=utf-8",
  "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=600",
  "Access-Control-Allow-Origin": "*",
};

export async function GET() {
  return new Response(buildAuthMd(), { status: 200, headers: HEADERS });
}

export async function HEAD() {
  return new Response(null, { status: 200, headers: HEADERS });
}
