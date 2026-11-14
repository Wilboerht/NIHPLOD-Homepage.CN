import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { hasAdminPermission } from "@/lib/admin-permissions";
import prisma from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { z } from "zod";
import { apiConsole } from "@/lib/logger";
import { createAuditLogStrict } from "@/lib/audit";
import { cuidSchema } from "@/lib/validation";
import { maskPhone } from "@/lib/mask-phone";
import { parseAdminDateRange } from "@/lib/admin-list-date-range";

const folderIdSchema = z.union([z.literal("uncategorized"), cuidSchema]);

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, private",
} as const;

const querySchema = z.object({
  page: z.preprocess((val) => (val ? Number(val) : 1), z.number().min(1).max(1000)),
  pageSize: z.preprocess((val) => (val ? Number(val) : 20), z.number().min(1).max(100)),
  status: z.preprocess(
    (val) => (val === null || val === "" ? undefined : val),
    z.enum(["all", "pending", "reviewed", "interview_scheduled", "interviewed", "offer", "rejected", "hired", "withdrawn"]).default("all")
  ),
  jobId: z.preprocess(
    (val) => (val === null || val === "" ? undefined : val),
    cuidSchema.optional()
  ),
  folderId: z.preprocess(
    (val) => (val === null || val === "" ? undefined : val),
    folderIdSchema.optional()
  ),
search: z.preprocess(
  (val) => (val === null || val === "" ? undefined : val),
  z.string().max(100).optional()
),
dateFrom: z.string().optional(),
dateTo: z.string().optional(),
});

// GET /api/admin/applications - 获取简历申请列表
// 强制动态渲染，禁止静态预渲染
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    // 验证认证
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权访问" } },
        { status: 401 }
      );
    }

    if (!hasAdminPermission(admin, "applications:read")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "权限不足：简历查看" } },
        { status: 403 }
      );
    }

    const rateLimitResponse = await checkAdminRateLimit(request, "admin-read", admin.id);
    if (rateLimitResponse) return rateLimitResponse;

    const { searchParams } = new URL(request.url);
const params = querySchema.parse({
  page: searchParams.get("page"),
  pageSize: searchParams.get("pageSize"),
  status: searchParams.get("status"),
  jobId: searchParams.get("jobId"),
  folderId: searchParams.get("folderId"),
  search: searchParams.get("search"),
  dateFrom: searchParams.get("dateFrom") || undefined,
  dateTo: searchParams.get("dateTo") || undefined,
});

const { page, pageSize, status, jobId, folderId, search } = params;
const range = parseAdminDateRange(params.dateFrom, params.dateTo);
if (!range.ok) {
  return NextResponse.json(
    { success: false, error: { code: "INVALID_DATE", message: range.message } },
    { status: 400, headers: NO_STORE_HEADERS }
  );
}

    // 构建查询条件
    const where: Prisma.JobApplicationWhereInput = {};

    if (status !== "all") {
      where.status = status;
    }

    if (jobId) {
      where.jobId = jobId;
    }

    // 分类夹筛选：支持 "uncategorized" 表示未分类
    if (folderId === "uncategorized") {
      where.folderId = null;
    } else if (folderId) {
      where.folderId = folderId;
    }

if (search) {
  where.OR = [
    { name: { contains: search, mode: "insensitive" } },
    { phone: { equals: search } },
  ];
}
if (range.from || range.to) {
  where.createdAt = {
    ...(range.from ? { gte: range.from } : {}),
    ...(range.to ? { lte: range.to } : {}),
  };
}

    const canViewSensitive = hasAdminPermission(admin, "applications:sensitive:read");

    // 查询数据
    // pendingCount 需要基于当前过滤条件（搜索、职位、分类夹）统计待处理数量，
    // 避免与当前列表的过滤条件不一致导致数字矛盾。
    const [applications, total, pendingCount] = await Promise.all([
      prisma.jobApplication.findMany({
        where,
        select: {
          id: true,
          jobId: true,
          userId: true,
          name: true,
          phone: true,
          resumePath: true,
          status: true,
          folderId: true,
          rating: true,
          tags: true,
          source: true,
          rejectionReason: true,
          lastContactedAt: true,
          createdAt: true,
          updatedAt: true,
          interviews: {
            where: { result: "PENDING", scheduledAt: { gte: new Date() } },
            orderBy: { scheduledAt: "asc" },
            take: 1,
            select: { id: true, scheduledAt: true, mode: true, interviewer: true },
          },
          job: {
            select: {
              id: true,
              title: true,
              titleEn: true,
              location: true,
              type: true,
            },
          },
          folder: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.jobApplication.count({ where }),
      prisma.jobApplication.count({ where: { ...where, status: "pending" } }),
    ]);

    await createAuditLogStrict({
      action: "application_list_view",
      targetType: "application",
      detail: {
        filters: {
          status,
          jobId: jobId ?? null,
          folderId: folderId ?? null,
          hasSearch: Boolean(search),
          hasPhoneSearch: Boolean(search && /^\d{6,}$/.test(search)),
        },
        page,
        pageSize,
        total,
      },
      actorType: "ADMIN",
      actorEmail: admin.email,
      actorName: admin.name,
      actorRole: admin.role,
      authMethod: "session",
      adminId: admin.id,
      request,
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          items: applications.map(({ resumePath, ...application }) => ({
            ...application,
            phone: maskPhone(application.phone),
            hasResume: Boolean(resumePath),
          })),
          canViewSensitive,
          pagination: {
            page,
            pageSize,
            total,
            totalPages: Math.ceil(total / pageSize),
          },
          pendingCount,
        },
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "VALIDATION_ERROR", message: "参数错误", details: error.issues },
        },
        { status: 400 }
      );
    }
    apiConsole.error("获取简历列表失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "获取失败" } },
      { status: 500 }
    );
  }
}
