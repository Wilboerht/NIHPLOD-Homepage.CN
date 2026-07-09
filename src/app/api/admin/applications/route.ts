import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { z } from "zod";
import { apiConsole } from "@/lib/logger";

const folderIdSchema = z.union([z.literal("uncategorized"), z.string().cuid()]);

const querySchema = z.object({
  page: z.preprocess((val) => (val ? Number(val) : 1), z.number().min(1)),
  pageSize: z.preprocess((val) => (val ? Number(val) : 20), z.number().min(1).max(100)),
  status: z.preprocess(
    (val) => (val === null || val === "" ? undefined : val),
    z.enum(["all", "pending", "reviewed", "interviewed", "rejected", "hired"]).default("all")
  ),
  jobId: z.preprocess(
    (val) => (val === null || val === "" ? undefined : val),
    z.string().cuid().optional()
  ),
  folderId: z.preprocess(
    (val) => (val === null || val === "" ? undefined : val),
    folderIdSchema.optional()
  ),
  search: z.preprocess(
    (val) => (val === null || val === "" ? undefined : val),
    z.string().max(100).optional()
  ),
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

    const { searchParams } = new URL(request.url);
    const params = querySchema.parse({
      page: searchParams.get("page"),
      pageSize: searchParams.get("pageSize"),
      status: searchParams.get("status"),
      jobId: searchParams.get("jobId"),
      folderId: searchParams.get("folderId"),
      search: searchParams.get("search"),
    });

    const { page, pageSize, status, jobId, folderId, search } = params;

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
        { phone: { contains: search } },
      ];
    }

    // 查询数据
    // pendingCount 需要基于当前过滤条件（搜索、职位、分类夹）统计待处理数量，
    // 避免与当前列表的过滤条件不一致导致数字矛盾。
    const [applications, total, pendingCount] = await Promise.all([
      prisma.jobApplication.findMany({
        where,
        include: {
          job: {
            select: {
              id: true,
              title: true,
              titleEn: true,
            },
          },
          folder: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.jobApplication.count({ where }),
      prisma.jobApplication.count({ where: { ...where, status: "pending" } }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        items: applications,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
        pendingCount,
      },
    });
  } catch (error) {
    apiConsole.error("获取简历列表失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message: "获取失败" } },
      { status: 500 }
    );
  }
}
