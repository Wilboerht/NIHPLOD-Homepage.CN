import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const admin = await verifyAuth(request);
  if (!admin) {
    return NextResponse.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "未授权" } },
      { status: 401 }
    );
  }

  return NextResponse.json({
    success: true,
    data: {
      key: process.env.AMAP_KEY || "",
      secret: process.env.AMAP_SECRET || "",
    },
  });
}
