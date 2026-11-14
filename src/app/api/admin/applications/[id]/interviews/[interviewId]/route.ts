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

const patchSchema = z.object({
  scheduledAt: z.string().datetime().optional(),
  durationMinutes: z.number().int().min(15).max(480).optional(),
  mode: z.enum(["ONSITE", "VIDEO", "PHONE"]).optional(),
  locationOrLink: z.string().trim().max(500).nullable().optional(),
  interviewer: z.string().trim().max(100).nullable().optional(),
  note: z.string().trim().max(2000).nullable().optional(),
  result: z.enum(["PENDING", "PASSED", "FAILED", "CANCELLED"]).optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; interviewId: string }> }
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
  const { id, interviewId } = await params;
  if (!validateCUID(id) || !validateCUID(interviewId)) return invalidIdResponse();
  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: { code: "INVALID_PARAMS", message: "面试参数错误" } },
      { status: 400 }
    );
  }
  const existing = await prisma.jobInterview.findFirst({
    where: { id: interviewId, applicationId: id },
  });
  if (!existing) {
    return NextResponse.json(
      { success: false, error: { code: "NOT_FOUND", message: "面试不存在" } },
      { status: 404 }
    );
  }
  const data = parsed.data;
  const interview = await prisma.jobInterview.update({
    where: { id: interviewId },
    data: {
      ...(data.scheduledAt ? { scheduledAt: new Date(data.scheduledAt) } : {}),
      ...(data.durationMinutes !== undefined ? { durationMinutes: data.durationMinutes } : {}),
      ...(data.mode ? { mode: data.mode } : {}),
      ...(data.locationOrLink !== undefined ? { locationOrLink: data.locationOrLink } : {}),
      ...(data.interviewer !== undefined ? { interviewer: data.interviewer } : {}),
      ...(data.note !== undefined ? { note: data.note } : {}),
      ...(data.result ? { result: data.result } : {}),
    },
  });
  await prisma.jobApplicationEvent
    .create({
      data: {
        applicationId: id,
        type: data.result ? "INTERVIEW_RESULT" : "INTERVIEW_UPDATED",
        note: data.note ?? null,
        metadata: { interviewId, result: interview.result },
        changedByAdminId: admin.id,
      },
    })
    .catch((error) => apiConsole.warn("[Applications] 写入面试时间线失败:", error));
  await createAuditLogStrict({
    action: "update_application",
    targetType: "application",
    targetId: id,
    detail: { interviewId, result: interview.result },
    actorType: "ADMIN",
    actorEmail: admin.email,
    actorName: admin.name,
    actorRole: admin.role,
    adminId: admin.id,
    request,
  }).catch((error) => apiConsole.warn("[Applications] 面试审计写入失败:", error));
  return NextResponse.json({ success: true, data: interview });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; interviewId: string }> }
) {
  if (!validateCSRFToken(request)) return csrfForbiddenResponse();
  const admin = await verifyAuth(request);
  if (!admin) {
    return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }
  if (!hasAdminPermission(admin, "applications:write")) {
    return NextResponse.json({ success: false, error: { code: "FORBIDDEN" } }, { status: 403 });
  }
  const { id, interviewId } = await params;
  if (!validateCUID(id) || !validateCUID(interviewId)) return invalidIdResponse();
  const deleted = await prisma.jobInterview.deleteMany({
    where: { id: interviewId, applicationId: id },
  });
  if (deleted.count === 0) {
    return NextResponse.json(
      { success: false, error: { code: "NOT_FOUND", message: "面试不存在" } },
      { status: 404 }
    );
  }
  await prisma.jobApplicationEvent
    .create({
      data: {
        applicationId: id,
        type: "INTERVIEW_DELETED",
        metadata: { interviewId },
        changedByAdminId: admin.id,
      },
    })
    .catch((error) => apiConsole.warn("[Applications] 写入面试时间线失败:", error));
  return NextResponse.json({ success: true });
}
