import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { hasAdminPermission } from "@/lib/admin-permissions";
import prisma from "@/lib/prisma";
import { maskPhone } from "@/lib/mask-phone";
import { parseAdminDateRange } from "@/lib/admin-list-date-range";
import { cuidSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

const STAGES = [
  "pending",
  "reviewed",
  "interview_scheduled",
  "interviewed",
  "offer",
  "hired",
  "rejected",
  "withdrawn",
] as const;

const querySchema = z.object({
  jobId: cuidSchema.optional(),
  folderId: z.union([z.literal("uncategorized"), cuidSchema]).optional(),
  search: z.string().max(100).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

const CARD_LIMIT = 20;

/** GET /api/admin/applications/board - 招聘看板 */
export async function GET(request: NextRequest) {
  const admin = await verifyAuth(request);
  if (!admin) {
    return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }
  if (!hasAdminPermission(admin, "applications:read")) {
    return NextResponse.json({ success: false, error: { code: "FORBIDDEN" } }, { status: 403 });
  }
  const rate = await checkAdminRateLimit(request, "admin-read", admin.id);
  if (rate) return rate;

  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({
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

  const [counts, ...stageCards] = await Promise.all([
    prisma.jobApplication.groupBy({ by: ["status"], _count: true, where }),
    ...STAGES.map((stage) =>
      prisma.jobApplication.findMany({
        where: { ...where, status: stage },
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        take: CARD_LIMIT,
        select: {
          id: true,
          name: true,
          phone: true,
          status: true,
          rating: true,
          tags: true,
          updatedAt: true,
          job: { select: { id: true, title: true } },
          folder: { select: { id: true, name: true } },
          interviews: {
            where: { result: "PENDING", scheduledAt: { gte: new Date() } },
            orderBy: { scheduledAt: "asc" },
            take: 1,
            select: { scheduledAt: true, mode: true },
          },
        },
      })
    ),
  ]);

  const countByStatus = new Map(
    (counts as { status: string; _count: number }[]).map((row) => [row.status, row._count])
  );

  return NextResponse.json(
    {
      success: true,
      data: {
        columns: STAGES.map((stage, index) => ({
          status: stage,
          count: countByStatus.get(stage) ?? 0,
          items: (stageCards[index] as {
            id: string;
            name: string;
            phone: string;
            status: string;
            rating: number | null;
            tags: string[];
            updatedAt: Date;
            job: { id: string; title: string };
            folder: { id: string; name: string } | null;
            interviews: { scheduledAt: Date; mode: string }[];
          }[]).map((item) => ({
            id: item.id,
            name: item.name,
            phone: maskPhone(item.phone),
            status: item.status,
            rating: item.rating,
            tags: item.tags,
            updatedAt: item.updatedAt.toISOString(),
            job: item.job,
            folder: item.folder,
            nextInterviewAt: item.interviews[0]?.scheduledAt.toISOString() ?? null,
            nextInterviewMode: item.interviews[0]?.mode ?? null,
          })),
        })),
      },
    },
    { headers: { "Cache-Control": "no-store, private" } }
  );
}
