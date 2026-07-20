import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import prisma from "@/lib/prisma";
import { verifyAuth } from "@/lib/auth";
import { z } from "zod";
import { apiConsole } from "@/lib/logger";

// 分类验证 Schema
const CategorySchema = z.object({
  name: z.string().min(1, "名称不能为空").max(50, "名称不能超过50个字符"),
  nameEn: z.string().min(1, "英文名称不能为空").max(50, "英文名称不能超过50个字符"),
  slug: z
    .string()
    .min(1, "URL别名不能为空")
    .max(50, "URL别名不能超过50个字符")
    .regex(/^[a-z0-9-]+$/, "URL别名只能包含小写字母、数字和连字符"),
  icon: z.string().max(10000, "图标代码不能超过10000个字符").optional().nullable(),
  order: z.number().int().min(0).default(0),
  visible: z.boolean().default(true), // 是否在前台展示
});

// GET /api/admin/categories - 获取分类列表
// 强制动态渲染，禁止静态预渲染
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权访问" } },
        { status: 401 }
      );
    }

    const categories = await prisma.category.findMany({
      orderBy: { order: "asc" },
      include: {
        _count: {
          select: { products: true },
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: categories.map((cat) => ({
        id: cat.id,
        name: cat.name,
        nameEn: cat.nameEn,
        slug: cat.slug,
        icon: cat.icon,
        order: cat.order,
        visible: cat.visible,
        productCount: cat._count.products,
        createdAt: cat.createdAt.toISOString(),
        updatedAt: cat.updatedAt.toISOString(),
      })),
    });
  } catch (error) {
    apiConsole.error("获取分类列表失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message: "获取分类列表失败" } },
      { status: 500 }
    );
  }
}

// POST /api/admin/categories - 创建分类
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
    const validated = CategorySchema.parse(body);

    // 检查 slug 是否重复
    const existingSlug = await prisma.category.findUnique({
      where: { slug: validated.slug },
    });
    if (existingSlug) {
      return NextResponse.json(
        { success: false, error: { code: "DUPLICATE_SLUG", message: "URL别名已存在" } },
        { status: 400 }
      );
    }

    // 如果没有指定 order，获取当前最大值 + 1
    let order = validated.order;
    if (order === 0) {
      const maxOrder = await prisma.category.aggregate({
        _max: { order: true },
      });
      order = (maxOrder._max.order ?? -1) + 1;
    }

    const category = await prisma.category.create({
      data: {
        name: validated.name,
        nameEn: validated.nameEn,
        slug: validated.slug,
        icon: validated.icon,
        order,
        visible: validated.visible,
      },
    });

    revalidateTag("admin-stats", "max");

    return NextResponse.json({
      success: true,
      data: category,
    });
  } catch (error) {
    apiConsole.error("创建分类失败:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "VALIDATION_ERROR", message: "参数错误", details: error.issues },
        },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message: "创建分类失败" } },
      { status: 500 }
    );
  }
}
