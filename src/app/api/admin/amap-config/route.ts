import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { createAuditLog } from "@/lib/audit";
import { apiConsole } from "@/lib/logger";

export const dynamic = "force-dynamic";

function maskSecret(secret: string): string {
  if (!secret || secret.length <= 4) return secret ? "****" : "";
  return "****" + secret.slice(-4);
}

export async function GET(request: NextRequest) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权" } },
        { status: 401 }
      );
    }

    const rateLimitResponse = await checkAdminRateLimit(request);
    if (rateLimitResponse) return rateLimitResponse;

    const key = process.env.AMAP_KEY || "";
    const secret = process.env.AMAP_SECRET || "";

    await createAuditLog({
      action: "login",
      targetType: "system",
      detail: { description: "amap_config_accessed" },
      adminId: admin.id,
      request,
    });

    return NextResponse.json({
      success: true,
      data: {
        key,
        secret: maskSecret(secret),
      },
    });
  } catch (error) {
    apiConsole.error("[AmapConfig] GET 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}
