import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyAuth } from "@/lib/auth";
import { z } from "zod";

// 职位类型
const JOB_TYPES = ["fulltime", "parttime", "intern"] as const;

// 创建职位 Schema
const CreateJobSchema = z.object({
  title: z.string().min(1, "请输入职位名称").max(100),
  titleEn: z.string().min(1, "请输入英文职位名称").max(100),
  location: z.string().min(1, "请输入工作地点").max(100),
  type: z.enum(JOB_TYPES, { message: "请选择职位类型" }),
  description: z.string().min(1, "请输入职责描述"),
  requirements: z.string().min(1, "请输入任职要求"),
  salary: z.string().max(50).optional(),
  published: z.boolean().optional(),
});

// GET /api/admin/jobs - 获取职位列表
export async function GET(request: NextRequest) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权访问" } },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const pageSize = parseInt(searchParams.get("pageSize") || "10");
    const status = searchParams.get("status"); // published, draft, all
    const search = searchParams.get("search");

    // 构建查询条件
    const where: Record<string, unknown> = {};

    if (status === "published") {
      where.published = true;
    } else if (status === "draft") {
      where.published = false;
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { titleEn: { contains: search, mode: "insensitive" } },
        { location: { contains: search, mode: "insensitive" } },
      ];
    }

    // 查询总数
    const total = await prisma.job.count({ where });

    // 查询列表
    const items = await prisma.job.findMany({
      where,
      orderBy: [{ order: "asc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    return NextResponse.json({
      success: true,
      data: {
        items: items.map((item) => ({
          ...item,
          createdAt: item.createdAt.toISOString(),
          updatedAt: item.updatedAt.toISOString(),
        })),
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      },
    });
  } catch (error) {
    console.error("获取职位列表失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message: "获取职位列表失败" } },
      { status: 500 }
    );
  }
}

// POST /api/admin/jobs - 创建职位
export async function POST(request: NextRequest) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权访问" } },
        { status: 401 }
      );
    }

    const body = await request.json();
    const validated = CreateJobSchema.parse(body);

    // 获取最大排序值
    const maxOrder = await prisma.job.aggregate({
      _max: { order: true },
    });

    // 创建职位
    const job = await prisma.job.create({
      data: {
        ...validated,
        salary: validated.salary || null,
        published: validated.published ?? false,
        order: (maxOrder._max.order || 0) + 1,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        ...job,
        createdAt: job.createdAt.toISOString(),
        updatedAt: job.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("创建职位失败:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: error.issues[0]?.message || "参数错误" } },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message: "创建职位失败" } },
      { status: 500 }
    );
  }
}

