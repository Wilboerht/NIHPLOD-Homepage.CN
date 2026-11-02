import { NextResponse } from "next/server";
import { buildAuthorizationServerMetadata } from "@/lib/agent-auth";

export const dynamic = "force-dynamic";

const HEADERS = {
  "Cache-Control": "public, max-age=3600",
  "Access-Control-Allow-Origin": "*",
};

export function GET() {
  return NextResponse.json(buildAuthorizationServerMetadata(), { headers: HEADERS });
}

export function HEAD() {
  return new NextResponse(null, { status: 200, headers: HEADERS });
}
