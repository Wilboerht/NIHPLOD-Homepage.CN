import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { advisorRequest, mapAdvisorError } from "@/lib/advisor-internal";
import { beginAuditLog, finishAuditLog } from "@/lib/audit";
import { apiConsole } from "@/lib/logger";
import { upsertSkincareDiary } from "@/lib/skincare-diary";
import {
  requireAdminSupportAccess,
  supportError,
  supportReasonSchema,
  writeAdminSupportAudit,
} from "@/lib/admin-support";
import { invalidIdResponse, validateCUID } from "@/lib/validation";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

const upsertSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式应为 YYYY-MM-DD"),
  skinState: z.enum(["great", "good", "normal", "bad", "terrible"]),
  tags: z.array(z.string().trim().min(1).max(20)).max(5).optional(),
  note: z.string().trim().max(1000).nullable().optional(),
  reason: supportReasonSchema,
});

function upstreamError(result: { status: number; code: string; message: string }) {
  const mapped = mapAdvisorError(result);
  return supportError(mapped.code, mapped.message, mapped.status);
}

export async function GET(request: NextRequest, { params }: Context) {
  try {
    const access = await requireAdminSupportAccess(request, "advisor:users:read", {
      write: false,
      stepUp: true,
      rateLimitKey: "advisor:diary-read",
    });
    if (!access.ok) return access.response;
    const { id } = await params;
    if (!validateCUID(id)) return invalidIdResponse();
    const account = await prisma.user.findUnique({ where: { id }, select: { status: true } });
    if (!account) return supportError("NOT_FOUND", "用户不存在", 404);
    if (account.status === "DELETED")
      return supportError("USER_DELETED", "已注销用户不可操作日记", 409);
    const query = new URL(request.url).searchParams;
    const result = await advisorRequest<unknown>("/api/internal/diary", {
      query: {
        userId: id,
        limit: query.get("limit") ?? undefined,
        before: query.get("before") ?? undefined,
        month: query.get("month") ?? undefined,
        offset: query.get("offset") ?? undefined,
      },
    });
    if (!result.ok) return upstreamError(result);
    await writeAdminSupportAudit({
      action: "advisor_diary_view",
      targetType: "user",
      targetId: id,
      admin: access.admin,
      request,
    });
    return NextResponse.json(result.data, {
      headers: { "Cache-Control": "no-store, private" },
    });
  } catch (error) {
    apiConsole.error("[AdminDiary] 查询失败:", error);
    return supportError("INTERNAL_ERROR", "测肤日记查询失败", 500);
  }
}

export async function POST(request: NextRequest, { params }: Context) {
  let auditId: string | null = null;
  try {
    const access = await requireAdminSupportAccess(request, "advisor:users:write", {
      rateLimitKey: "advisor:diary-write",
    });
    if (!access.ok) return access.response;
    const { id } = await params;
    if (!validateCUID(id)) return invalidIdResponse();
    const account = await prisma.user.findUnique({ where: { id }, select: { status: true } });
    if (!account) return supportError("NOT_FOUND", "用户不存在", 404);
    if (account.status === "DELETED")
      return supportError("USER_DELETED", "已注销用户不可操作日记", 409);
    const parsed = upsertSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success)
      return supportError("INVALID_PARAMS", parsed.error.issues[0]?.message || "参数错误");
    const { reason, ...diary } = parsed.data;
    auditId = await beginAuditLog({
      action: "advisor_diary_upsert",
      targetType: "user",
      targetId: id,
      detail: { date: diary.date, reason },
      actorType: "ADMIN",
      actorEmail: access.admin.email,
      actorName: access.admin.name,
      actorRole: access.admin.role,
      authMethod: "step_up",
      adminId: access.admin.id,
      request,
    });
    if (!auditId) return supportError("AUDIT_UNAVAILABLE", "审计不可用，已拒绝操作", 503);
    const result = await upsertSkincareDiary(id, diary);
    await finishAuditLog(auditId, result.ok ? "SUCCESS" : "FAILURE", {
      date: diary.date,
      error: result.ok ? null : result.code,
    });
    if (!result.ok) return upstreamError(result);
    return NextResponse.json({
      success: true,
      data: result.entry,
      ...(result.points ? { points: result.points } : {}),
    });
  } catch (error) {
    if (auditId) await finishAuditLog(auditId, "FAILURE", { error: "EXCEPTION" });
    apiConsole.error("[AdminDiary] 写入失败:", error);
    return supportError("INTERNAL_ERROR", "测肤日记保存失败", 500);
  }
}

export async function DELETE(request: NextRequest, { params }: Context) {
  let auditId: string | null = null;
  try {
    const access = await requireAdminSupportAccess(request, "advisor:users:write", {
      rateLimitKey: "advisor:diary-write",
    });
    if (!access.ok) return access.response;
    const { id } = await params;
    if (!validateCUID(id)) return invalidIdResponse();
    const account = await prisma.user.findUnique({ where: { id }, select: { status: true } });
    if (!account) return supportError("NOT_FOUND", "用户不存在", 404);
    if (account.status === "DELETED")
      return supportError("USER_DELETED", "已注销用户不可操作日记", 409);
    const date = new URL(request.url).searchParams.get("date") ?? "";
    const body = (await request.json().catch(() => ({}))) as { reason?: unknown };
    const reason = supportReasonSchema.safeParse(body.reason);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !reason.success) {
      return supportError("INVALID_PARAMS", "请提供有效日期和操作原因");
    }
    auditId = await beginAuditLog({
      action: "advisor_diary_delete",
      targetType: "user",
      targetId: id,
      detail: { date, reason: reason.data },
      actorType: "ADMIN",
      actorEmail: access.admin.email,
      actorName: access.admin.name,
      actorRole: access.admin.role,
      authMethod: "step_up",
      adminId: access.admin.id,
      request,
    });
    if (!auditId) return supportError("AUDIT_UNAVAILABLE", "审计不可用，已拒绝操作", 503);
    const result = await advisorRequest<{ success?: boolean; deleted?: number }>(
      "/api/internal/diary",
      { method: "DELETE", query: { userId: id, date } }
    );
    await finishAuditLog(auditId, result.ok ? "SUCCESS" : "FAILURE", {
      date,
      error: result.ok ? null : result.code,
    });
    if (!result.ok) return upstreamError(result);
    return NextResponse.json({ success: true, data: { deleted: result.data?.deleted ?? 0 } });
  } catch (error) {
    if (auditId) await finishAuditLog(auditId, "FAILURE", { error: "EXCEPTION" });
    apiConsole.error("[AdminDiary] 删除失败:", error);
    return supportError("INTERNAL_ERROR", "测肤日记删除失败", 500);
  }
}
