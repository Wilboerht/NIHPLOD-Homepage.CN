import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";

// GET /api/admin/applications - 获取简历申请列表
// 强制动态渲染，禁止静态预渲染
export const dynamic = 'force-dynamic';

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
    const page = parseInt(searchParams.get("page") || "1");
    const pageSize = parseInt(searchParams.get("pageSize") || "20");
    const status = searchParams.get("status") || "all";
    const jobId = searchParams.get("jobId") || "";
    const folderId = searchParams.get("folderId") || "";
    const search = searchParams.get("search") || "";

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
      prisma.jobApplication.count({ where: { status: "pending" } }),
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
    console.error("获取简历列表失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message: "获取失败" } },
      { status: 500 }
    );
  }
}
