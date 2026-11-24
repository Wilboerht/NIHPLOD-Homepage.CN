import { NextResponse } from "next/server";
import { getConsentStatus } from "@/lib/consent-status";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;

export async function userLegalConsentRequiredResponse(
  userId: string
): Promise<NextResponse | null> {
  const consent = await getConsentStatus(userId);
  if (!consent.required) return null;

  return NextResponse.json(
    {
      success: false,
      error: {
        code: "CONSENT_REQUIRED",
        message: "请先完成隐私政策和服务条款同意",
        consentUri: "/consent",
      },
    },
    { status: 403, headers: NO_STORE_HEADERS }
  );
}
