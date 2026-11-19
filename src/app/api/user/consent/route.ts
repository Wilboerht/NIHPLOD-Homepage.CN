import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withUserAuth } from "@/lib/auth";
import { getClientIP } from "@/lib/client-ip";
import {
  getConsentStatus,
  recordConsent,
  revokeConsent,
} from "@/lib/privacy-consent";
import { apiConsole } from "@/lib/logger";

export const dynamic = "force-dynamic";

export const GET = withUserAuth(async (_request: NextRequest, payload) => {
  try {
    const status = await getConsentStatus(payload.id);
    return NextResponse.json({ success: true, data: status });
  } catch (error) {
    apiConsole.error("[UserConsent] 查询异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
});

const submitSchema = z.object({
  privacy: z.literal(true),
  terms: z.literal(true),
  marketing: z.boolean().optional(),
});

export const POST = withUserAuth(async (request: NextRequest, payload) => {
  try {
    const body = await request.json().catch(() => ({}));
    const parsed = submitSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "CONSENT_REQUIRED", message: "请先阅读并同意隐私政策与服务条款" },
        },
        { status: 400 }
      );
    }

    const ip = getClientIP(request);
    const userAgent = request.headers.get("user-agent");
    const evidence = { source: "consent_api", at: new Date().toISOString() };

    await recordConsent({
      userId: payload.id,
      document: "PRIVACY",
      channel: "web",
      ip,
      userAgent,
      evidence,
    });
    await recordConsent({
      userId: payload.id,
      document: "TERMS",
      channel: "web",
      ip,
      userAgent,
      evidence,
    });

    if (parsed.data.marketing === true) {
      await recordConsent({
        userId: payload.id,
        document: "MARKETING",
        channel: "web",
        ip,
        userAgent,
        evidence,
      });
    } else if (parsed.data.marketing === false) {
      await revokeConsent(payload.id, "MARKETING", "web");
    }

    const status = await getConsentStatus(payload.id);
    return NextResponse.json({ success: true, data: status });
  } catch (error) {
    apiConsole.error("[UserConsent] 保存异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
});

export const DELETE = withUserAuth(async (request: NextRequest, payload) => {
  try {
    const document = new URL(request.url).searchParams.get("document");
    if (document !== "PRIVACY" && document !== "TERMS" && document !== "MARKETING") {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_PARAMS", message: "未知的同意类型" } },
        { status: 400 }
      );
    }

    await revokeConsent(payload.id, document, "web");
    const status = await getConsentStatus(payload.id);
    return NextResponse.json({ success: true, data: status });
  } catch (error) {
    apiConsole.error("[UserConsent] 撤回异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
});
