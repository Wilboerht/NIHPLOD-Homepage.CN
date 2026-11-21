import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hashIdentifier } from "@/lib/auth-security";
import { authenticateKfInternalRequest } from "@/lib/kf-internal-auth";
import { apiConsole } from "@/lib/logger";

export const dynamic = "force-dynamic";

const PATH = "/api/internal/kf/consent-event";

const bodySchema = z.object({
  openKfid: z.string().trim().min(1).max(128),
  externalUserId: z.string().trim().min(1).max(128),
  action: z.enum(["GRANTED", "REVOKED"]),
  version: z.string().trim().min(1).max(64),
  contentHash: z.string().trim().max(128).nullable().optional(),
  occurredAt: z.string().datetime().optional(),
});

export async function POST(request: NextRequest) {
  const auth = await authenticateKfInternalRequest(request, PATH);
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = JSON.parse(auth.bodyText);
  } catch {
    body = null;
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: { code: "INVALID_PARAMS", message: "参数无效" } },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  const { openKfid, externalUserId, action, version, contentHash } = parsed.data;
  const occurredAt = parsed.data.occurredAt ? new Date(parsed.data.occurredAt) : new Date();

  try {
    const link = await prisma.kfIdentityLink.findUnique({
      where: {
        openKfid_externalUserId: { openKfid, externalUserId },
      },
      select: { userId: true },
    });

    await prisma.consentEvent.create({
      data: {
        userId: link?.userId ?? null,
        subjectType: "KF_EXTERNAL",
        subjectHash: hashIdentifier(`${openKfid}:${externalUserId}`),
        project: "KF",
        document: "PRIVACY",
        version,
        contentHash: contentHash ?? null,
        action,
        channel: "wecom-kf",
        occurredAt,
        evidence: { source: "kf" },
      },
    });

    return NextResponse.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    apiConsole.error("[KfConsentEvent] 写入失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
