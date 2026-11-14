import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { hasAdminPermission } from "@/lib/admin-permissions";
import prisma from "@/lib/prisma";
import { createAuditLogStrict } from "@/lib/audit";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { validateCUID, invalidIdResponse } from "@/lib/validation";
import { apiConsole } from "@/lib/logger";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  scheduledAt: z.string().datetime(),
  durationMinutes: z.number().int().min(15).max(480).optional(),
  mode: z.enum(["ONSITE", "VIDEO", "PHONE"]).optional(),
  locationOrLink: z.string().trim().max(500).optional(),
  interviewer: z.string().trim().max(100).optional(),
  note: z.string().trim().max(2000).optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await verifyAuth(request);
  if (!admin) {
    return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }
  if (!hasAdminPermission(admin, "applications:read")) {
    return NextResponse.json({ success: false, error: { code: "FORBIDDEN" } }, { status: 403 });
  }
  const { id } = await params;
  if (!validateCUID(id)) return invalidIdResponse();
  const interviews = await prisma.jobInterview.findMany({
    where: { applicationId: id },
    orderBy: { scheduledAt: "asc" },
  });
  return NextResponse.json(
    { success: true, data: interviews },
    { headers: { "Cache-Control": "no-store, private" } }
  );
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!validateCSRFToken(request)) return csrfForbiddenResponse();
  const admin = await verifyAuth(request);
  if (!admin) {
    return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }
  if (!hasAdminPermission(admin, "applications:write")) {
    return NextResponse.json({ success: false, error: { code: "FORBIDDEN" } }, { status: 403 });
  }
  const rate = await checkAdminRateLimit(request, "admin-write", admin.id);
  if (rate) return rate;
  const { id } = await params;
  if (!validateCUID(id)) return invalidIdResponse();
  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: { code: "INVALID_PARAMS", message: "面试参数错误" } },
      { status: 400 }
    );
  }
  const application = await prisma.jobApplication.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!application) {
    return NextResponse.json(
      { success: false, error: { code: "NOT_FOUND", message: "申请不存在" } },
      { status: 404 }
    );
  }
  const interview = await prisma.jobInterview.create({
    data: {
      applicationId: id,
      scheduledAt: new Date(parsed.data.scheduledAt),
      durationMinutes: parsed.data.durationMinutes ?? 30,
      mode: parsed.data.mode ?? "VIDEO",
      locationOrLink: parsed.data.locationOrLink || null,
      interviewer: parsed.data.interviewer || null,
      note: parsed.data.note || null,
    },
  });
  await prisma.jobApplicationEvent
    .create({
      data: {
        applicationId: id,
        type: "INTERVIEW_CREATED",
        note: parsed.data.note || null,
        metadata: { interviewId: interview.id, scheduledAt: interview.scheduledAt.toISOString() },
        changedByAdminId: admin.id,
      },
    })
    .catch((error) => apiConsole.warn("[Applications] 写入面试时间线失败:", error));
  await createAuditLogStrict({
    action: "update_application",
    targetType: "application",
    targetId: id,
    detail: { interviewId: interview.id, mode: interview.mode },
    actorType: "ADMIN",
    actorEmail: admin.email,
    actorName: admin.name,
    actorRole: admin.role,
    adminId: admin.id,
    request,
  }).catch((error) => apiConsole.warn("[Applications] 面试审计写入失败:", error));
  return NextResponse.json({ success: true, data: interview }, { status: 201 });
}
