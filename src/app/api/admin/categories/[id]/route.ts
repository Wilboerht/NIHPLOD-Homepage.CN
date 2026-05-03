import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import prisma from "@/lib/prisma";
import { verifyAuth } from "@/lib/auth";
import { z } from "zod";

// 分类更新 Schema
const CategoryUpdateSchema = z.object({
  name: z.string().min(1, "名称不能为空").max(50, "名称不能超过50个字符").optional(),
  nameEn: z.string().min(1, "英文名称不能为空").max(50, "英文名称不能超过50个字符").optional(),
  slug: z
    .string()
    .min(1, "URL别名不能为空")
    .max(50, "URL别名不能超过50个字符")
    .regex(/^[a-z0-9-]+$/, "URL别名只能包含小写字母、数字和连字符")
    .optional(),
  icon: z.string().max(10000, "图标代码不能超过10000个字符").optional().nullable(),
  order: z.number().int().min(0).optional(),
  visible: z.boolean().optional(), // 是否在前台展示
});

// GET /api/admin/categories/[id] - 获取分类详情
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

    const category = await prisma.category.findUnique({
      where: { id },
      include: {
        _count: {
          select: { products: true },
        },
      },
    });

    if (!category) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "分类不存在" } },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        ...category,
        productCount: category._count.products,
      },
    });
  } catch (error) {
    console.error("获取分类详情失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message: "获取分类详情失败" } },
      { status: 500 }
    );
  }
}

// PUT /api/admin/categories/[id] - 更新分类
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
    const validated = CategoryUpdateSchema.parse(body);

    // 检查分类是否存在
    const existing = await prisma.category.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "分类不存在" } },
        { status: 404 }
      );
    }

    // 检查 slug 是否重复（排除自身）
    if (validated.slug) {
      const existingSlug = await prisma.category.findFirst({
        where: { slug: validated.slug, id: { not: id } },
      });
      if (existingSlug) {
        return NextResponse.json(
          { success: false, error: { code: "DUPLICATE_SLUG", message: "URL别名已存在" } },
          { status: 400 }
        );
      }
    }

    const category = await prisma.category.update({
      where: { id },
      data: validated,
    });

    revalidateTag("admin-stats");

    return NextResponse.json({
      success: true,
      data: category,
    });
  } catch (error) {
    console.error("更新分类失败:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "参数错误", details: error.issues } },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message: "更新分类失败" } },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/categories/[id] - 删除分类
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

    // 检查分类是否存在
    const existing = await prisma.category.findUnique({
      where: { id },
      include: {
        _count: {
          select: { products: true },
        },
      },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "分类不存在" } },
        { status: 404 }
      );
    }

    // 检查是否有关联产品（删除保护）
    if (existing._count.products > 0) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "HAS_PRODUCTS",
            message: `该分类下有 ${existing._count.products} 个产品，无法删除`,
          },
        },
        { status: 400 }
      );
    }

    await prisma.category.delete({ where: { id } });

    revalidateTag("admin-stats");

    return NextResponse.json({
      success: true,
      data: { message: "分类已删除" },
    });
  } catch (error) {
    console.error("删除分类失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message: "删除分类失败" } },
      { status: 500 }
    );
  }
}

