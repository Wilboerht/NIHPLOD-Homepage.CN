import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateKfInternalRequest } from "@/lib/kf-internal-auth";
import { apiConsole } from "@/lib/logger";

export const dynamic = "force-dynamic";

const PATH = "/api/internal/kf/identity-link";

const bodySchema = z.object({
  openKfid: z.string().trim().min(1).max(128),
  externalUserId: z.string().trim().min(1).max(128),
  userId: z.string().trim().min(1).max(64),
  source: z.string().trim().min(1).max(64).optional(),
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

  const { openKfid, externalUserId, userId, source } = parsed.data;

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) {
      return NextResponse.json(
        { success: false, error: { code: "USER_NOT_FOUND", message: "用户不存在" } },
        { status: 404, headers: { "Cache-Control": "no-store" } }
      );
    }

    await prisma.kfIdentityLink.upsert({
      where: {
        openKfid_externalUserId: { openKfid, externalUserId },
      },
      create: {
        openKfid,
        externalUserId,
        userId,
        source: source ?? "advisor_report",
      },
      update: {
        userId,
        source: source ?? "advisor_report",
      },
    });

    return NextResponse.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    apiConsole.error("[KfIdentityLink] 写入失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
