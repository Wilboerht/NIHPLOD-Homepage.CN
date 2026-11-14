import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { requireAdminStepUp } from "@/lib/admin-totp";
import prisma from "@/lib/prisma";
import { maskPhone } from "@/lib/mask-phone";
import { parseAdminDateRange } from "@/lib/admin-list-date-range";
import { escapeCSV } from "@/lib/csv";
import { createAuditLogStrict } from "@/lib/audit";
import { cuidSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  status: z
    .enum([
      "all",
      "pending",
      "reviewed",
      "interview_scheduled",
      "interviewed",
      "offer",
      "hired",
      "rejected",
      "withdrawn",
    ])
    .default("all"),
  jobId: cuidSchema.optional(),
  folderId: z.union([z.literal("uncategorized"), cuidSchema]).optional(),
  search: z.string().max(100).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

const STATUS_LABELS: Record<string, string> = {
  pending: "待处理",
  reviewed: "初筛通过",
  interview_scheduled: "待面试",
  interviewed: "已面试",
  offer: "Offer",
  hired: "已录用",
  rejected: "已拒绝",
  withdrawn: "已放弃",
};

/** GET /api/admin/applications/export - 候选人清单 CSV（手机号脱敏，需 TOTP） */
export async function GET(request: NextRequest) {
  const admin = await verifyAuth(request);
  if (!admin) {
    return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }
  if (!hasAdminPermission(admin, "applications:export")) {
    return NextResponse.json({ success: false, error: { code: "FORBIDDEN" } }, { status: 403 });
  }
  const stepUp = await requireAdminStepUp(request, admin);
  if (stepUp) return stepUp;
  const rate = await checkAdminRateLimit(request, "admin-read", admin.id);
  if (rate) return rate;

  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({
    status: searchParams.get("status") || "all",
    jobId: searchParams.get("jobId") || undefined,
    folderId: searchParams.get("folderId") || undefined,
    search: searchParams.get("search")?.trim() || undefined,
    dateFrom: searchParams.get("dateFrom") || undefined,
    dateTo: searchParams.get("dateTo") || undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: { code: "INVALID_PARAMS" } },
      { status: 400 }
    );
  }
  const range = parseAdminDateRange(parsed.data.dateFrom, parsed.data.dateTo);
  if (!range.ok) {
    return NextResponse.json(
      { success: false, error: { code: "INVALID_DATE", message: range.message } },
      { status: 400 }
    );
  }

  const where: Prisma.JobApplicationWhereInput = {};
  if (parsed.data.status !== "all") where.status = parsed.data.status;
  if (parsed.data.jobId) where.jobId = parsed.data.jobId;
  if (parsed.data.folderId === "uncategorized") where.folderId = null;
  else if (parsed.data.folderId) where.folderId = parsed.data.folderId;
  if (parsed.data.search) {
    where.OR = [
      { name: { contains: parsed.data.search, mode: "insensitive" } },
      { phone: { equals: parsed.data.search } },
    ];
  }
  if (range.from || range.to) {
    where.createdAt = {
      ...(range.from ? { gte: range.from } : {}),
      ...(range.to ? { lte: range.to } : {}),
    };
  }

  const rows = await prisma.jobApplication.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    take: 5000,
    select: {
      name: true,
      phone: true,
      status: true,
      rating: true,
      tags: true,
      source: true,
      rejectionReason: true,
      createdAt: true,
      updatedAt: true,
      job: { select: { title: true } },
      folder: { select: { name: true } },
    },
  });

  await createAuditLogStrict({
    action: "application_list_view",
    targetType: "application",
    detail: { export: true, filters: parsed.data, count: rows.length, pii: "masked" },
    actorType: "ADMIN",
    actorEmail: admin.email,
    actorName: admin.name,
    actorRole: admin.role,
    adminId: admin.id,
    request,
  });

  const header = [
    "姓名",
    "脱敏手机号",
    "职位",
    "状态",
    "评级",
    "标签",
    "来源",
    "分类夹",
    "拒绝原因",
    "投递时间",
    "最近更新",
  ];
  const lines = rows.map((row) =>
    [
      row.name,
      maskPhone(row.phone),
      row.job.title,
      STATUS_LABELS[row.status] ?? row.status,
      row.rating === null ? "" : String(row.rating),
      row.tags.join("|"),
      row.source ?? "",
      row.folder?.name ?? "",
      row.rejectionReason ?? "",
      row.createdAt.toISOString(),
      row.updatedAt.toISOString(),
    ]
      .map(escapeCSV)
      .join(",")
  );
  return new NextResponse(`\uFEFF${header.map(escapeCSV).join(",")}\n${lines.join("\n")}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="candidates.csv"',
      "Cache-Control": "no-store, private",
    },
  });
}
