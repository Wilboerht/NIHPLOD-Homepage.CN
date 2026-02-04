import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyAuth } from "@/lib/auth";
import { z } from "zod";

// 职位类型
const JOB_TYPES = ["fulltime", "parttime", "intern"] as const;

// 更新职位 Schema
const UpdateJobSchema = z.object({
  title: z.string().min(1).max(100).optional(),
  titleEn: z.string().min(1).max(100).optional(),
  location: z.string().min(1).max(100).optional(),
  type: z.enum(JOB_TYPES).optional(),
  description: z.string().min(1).optional(),
  requirements: z.string().min(1).optional(),
  salary: z.string().max(50).optional().nullable(),
  published: z.boolean().optional(),
  order: z.number().optional(),
});

// GET /api/admin/jobs/[id] - 获取职位详情
// 强制动态渲染，禁止静态预渲染
export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权访问" } },
        { status: 401 }
      );
    }

    const { id } = await params;

    const job = await prisma.job.findUnique({
      where: { id },
    });

    if (!job) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "职位不存在" } },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        ...job,
        createdAt: job.createdAt.toISOString(),
        updatedAt: job.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("获取职位详情失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message: "获取职位详情失败" } },
      { status: 500 }
    );
  }
}

// PUT /api/admin/jobs/[id] - 更新职位
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权访问" } },
        { status: 401 }
      );
    }

    const { id } = await params;
    const body = await request.json();
    const validated = UpdateJobSchema.parse(body);

    // 检查是否存在
    const existing = await prisma.job.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "职位不存在" } },
        { status: 404 }
      );
    }

    // 更新职位
    const job = await prisma.job.update({
      where: { id },
      data: {
        ...(validated.title !== undefined && { title: validated.title }),
        ...(validated.titleEn !== undefined && { titleEn: validated.titleEn }),
        ...(validated.location !== undefined && { location: validated.location }),
        ...(validated.type !== undefined && { type: validated.type }),
        ...(validated.description !== undefined && { description: validated.description }),
        ...(validated.requirements !== undefined && { requirements: validated.requirements }),
        ...(validated.salary !== undefined && { salary: validated.salary }),
        ...(validated.published !== undefined && { published: validated.published }),
        ...(validated.order !== undefined && { order: validated.order }),
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
    console.error("更新职位失败:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: error.issues[0]?.message || "参数错误" } },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message: "更新职位失败" } },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/jobs/[id] - 删除职位
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权访问" } },
        { status: 401 }
      );
    }

    const { id } = await params;

    // 检查是否存在
    const existing = await prisma.job.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "职位不存在" } },
        { status: 404 }
      );
    }

    // 删除职位
    await prisma.job.delete({ where: { id } });

    return NextResponse.json({
      success: true,
      data: { message: "职位已删除" },
    });
  } catch (error) {
    console.error("删除职位失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message: "删除职位失败" } },
      { status: 500 }
    );
  }
}

