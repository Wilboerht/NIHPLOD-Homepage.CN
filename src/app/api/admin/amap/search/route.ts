import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { postPublicHttps } from "@/lib/outbound-http";
import { apiConsole } from "@/lib/logger";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, private",
  Pragma: "no-cache",
} as const;

interface AmapTip {
  name?: string;
  district?: string;
  address?: string;
  location?: string;
}

export async function GET(request: NextRequest) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权" } },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }
    if (!hasAdminPermission(admin, "jobs:write")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "权限不足：地点搜索" } },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }

    const rateLimitResponse = await checkAdminRateLimit(request, "amap:search");
    if (rateLimitResponse) return rateLimitResponse;

    const key = process.env.AMAP_WEB_SERVICE_KEY;
    if (!key) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "AMAP_NOT_CONFIGURED", message: "地点搜索服务未配置" },
        },
        { status: 503, headers: NO_STORE_HEADERS }
      );
    }

    const { searchParams } = new URL(request.url);
    const keyword = (searchParams.get("keyword") || "").trim();
    const city = (searchParams.get("city") || "上海").trim().slice(0, 20);
    if (!keyword || keyword.length > 60) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_PARAMS", message: "搜索关键词无效" } },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const url = new URL("https://restapi.amap.com/v3/assistant/inputtips");
    url.searchParams.set("key", key);
    url.searchParams.set("keywords", keyword);
    url.searchParams.set("city", city);
    url.searchParams.set("citylimit", "false");

    const response = await postPublicHttps(url.toString(), { method: "GET" });
    if (!response.ok) {
      return NextResponse.json(
        { success: false, error: { code: "AMAP_UPSTREAM_ERROR", message: "地点搜索失败" } },
        { status: 502, headers: NO_STORE_HEADERS }
      );
    }

    const payload = (await response.json()) as {
      status?: string;
      info?: string;
      tips?: AmapTip[];
    };
    if (payload.status !== "1") {
      apiConsole.warn("[AmapSearch] 高德接口返回失败:", payload.info);
      return NextResponse.json(
        { success: false, error: { code: "AMAP_UPSTREAM_ERROR", message: "地点搜索失败" } },
        { status: 502, headers: NO_STORE_HEADERS }
      );
    }

    const tips = (payload.tips ?? [])
      .filter((tip) => tip.name && tip.location)
      .slice(0, 10)
      .map((tip) => {
        const [lngRaw, latRaw] = (tip.location || "").split(",");
        const lng = Number(lngRaw);
        const lat = Number(latRaw);
        return {
          name: tip.name || "",
          district: tip.district || "",
          address: tip.address || "",
          lng: Number.isFinite(lng) ? lng : null,
          lat: Number.isFinite(lat) ? lat : null,
        };
      })
      .filter((tip) => tip.lng !== null && tip.lat !== null);

    return NextResponse.json({ success: true, data: { tips } }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    apiConsole.error("[AmapSearch] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "AMAP_UPSTREAM_ERROR", message: "地点搜索失败" } },
      { status: 502, headers: NO_STORE_HEADERS }
    );
  }
}
