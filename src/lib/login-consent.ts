import type { NextRequest } from "next/server";
import { recordConsent } from "@/lib/privacy-consent";

interface RecordLoginConsentInput {
  userId: string;
  request: NextRequest;
  ip: string | null;
  privacyConsent?: boolean;
  termsConsent?: boolean;
  marketingConsent?: boolean;
}

/**
 * 登录页的“同意隐私政策/服务条款”勾选必须落库。
 * 只有两项都勾选才写入；营销保持可选，不在登录时主动撤回历史选择。
 */
export async function recordLoginConsent(input: RecordLoginConsentInput): Promise<void> {
  if (input.privacyConsent !== true || input.termsConsent !== true) return;

  const evidence = {
    source: "login_api",
    at: new Date().toISOString(),
  };
  const userAgent = input.request.headers.get("user-agent");

  await recordConsent({
    userId: input.userId,
    document: "PRIVACY",
    channel: "web",
    ip: input.ip,
    userAgent,
    evidence,
  });
  await recordConsent({
    userId: input.userId,
    document: "TERMS",
    channel: "web",
    ip: input.ip,
    userAgent,
    evidence,
  });

  if (input.marketingConsent === true) {
    await recordConsent({
      userId: input.userId,
      document: "MARKETING",
      channel: "web",
      ip: input.ip,
      userAgent,
      evidence,
    });
  }
}
