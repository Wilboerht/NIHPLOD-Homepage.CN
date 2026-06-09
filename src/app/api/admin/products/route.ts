import { NextRequest, NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import prisma from "@/lib/prisma";
import { verifyAuth } from "@/lib/auth";
import { toInputJson } from "@/lib/prisma-json";
import { z } from "zod";
import { ProductSchema } from "@/schemas/product";
import { apiConsole } from "@/lib/logger";

// 查询参数 Schema
const QuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  categoryId: z.string().optional(),
  status: z.enum(["all", "published", "draft"]).default("all"),
  search: z.string().max(100).optional(),
  sortBy: z.enum(["createdAt", "updatedAt", "name", "order", "price"]).default("order"),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
});

// GET /api/admin/products - 获取产品列表
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

    // 解析查询参数
    const searchParams = request.nextUrl.searchParams;
    const query = QuerySchema.parse({
      page: searchParams.get("page") || 1,
      pageSize: searchParams.get("pageSize") || 10,
      categoryId: searchParams.get("categoryId") || undefined,
      status: searchParams.get("status") || "all",
      search: searchParams.get("search") || undefined,
      sortBy: searchParams.get("sortBy") || "order",
      sortOrder: searchParams.get("sortOrder") || "asc",
    });

    // 构建查询条件
    const where: {
      categoryId?: string;
      published?: boolean;
      OR?: { name: { contains: string; mode: "insensitive" } }[];
    } = {};

    if (query.categoryId) {
      where.categoryId = query.categoryId;
    }

    if (query.status === "published") {
      where.published = true;
    } else if (query.status === "draft") {
      where.published = false;
    }

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: "insensitive" } },
      ];
    }

    // 并行查询数据和总数
    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: {
          category: {
            select: { id: true, name: true, slug: true },
          },
          images: {
            take: 1,
            orderBy: { order: "asc" },
            select: { id: true, url: true, alt: true },
          },
        },
        orderBy: { [query.sortBy]: query.sortOrder },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.product.count({ where }),
    ]);

    // 格式化响应数据
    const formattedProducts = products.map((product) => ({
      id: product.id,
      name: product.name,
      nameEn: product.nameEn,
      slug: product.slug,
      price: Number(product.price),
      capacity: product.capacity,
      category: product.category,
      image: product.images[0] || null,
      featured: product.featured,
      published: product.published,
      salesCount: product.salesCount,
      stock: product.stock,
      allowDirectBuy: product.allowDirectBuy,
      order: product.order,
      createdAt: product.createdAt.toISOString(),
      updatedAt: product.updatedAt.toISOString(),
    }));

    return NextResponse.json({
      success: true,
      data: {
        products: formattedProducts,
        pagination: {
          page: query.page,
          pageSize: query.pageSize,
          total,
          totalPages: Math.ceil(total / query.pageSize),
        },
      },
    });
  } catch (error) {
    apiConsole.error("获取产品列表失败:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "参数错误", details: error.issues } },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message: "获取产品列表失败" } },
      { status: 500 }
    );
  }
}

// POST /api/admin/products - 创建产品
export async function POST(request: NextRequest) {
  try {
    // 验证认证
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权访问" } },
        { status: 401 }
      );
    }

    // 解析请求体
    const body = await request.json();
    const validated = ProductSchema.parse(body);

    // 检查 slug 是否重复
    const existingSlug = await prisma.product.findUnique({
      where: { slug: validated.slug },
    });
    if (existingSlug) {
      return NextResponse.json(
        { success: false, error: { code: "DUPLICATE_SLUG", message: "URL别名已存在" } },
        { status: 400 }
      );
    }

    // 检查分类是否存在
    const category = await prisma.category.findUnique({
      where: { id: validated.categoryId },
    });
    if (!category) {
      return NextResponse.json(
        { success: false, error: { code: "CATEGORY_NOT_FOUND", message: "分类不存在" } },
        { status: 400 }
      );
    }

    // 创建产品、图片和购买链接
    const product = await prisma.product.create({
      data: {
        name: validated.name,
        nameEn: validated.nameEn,
        slug: validated.slug,
        description: validated.description,
        price: validated.price,
        capacity: validated.capacity,
        purchaseUrl: validated.purchaseUrl,
        ingredients: validated.ingredients,
        usage: validated.usage,
        benefits: validated.benefits || [],
        order: validated.order,
        featured: validated.featured,
        published: validated.published,
        categoryId: validated.categoryId,
        allowDirectBuy: validated.allowDirectBuy,
        stock: validated.stock,
        geoFaqs: toInputJson(validated.geoFaqs),
        images: {
          create: validated.images.map((img, index) => ({
            url: img.url,
            alt: img.alt,
            order: img.order ?? index,
          })),
        },
        purchaseLinks: validated.purchaseLinks?.length
          ? {
            create: validated.purchaseLinks.map((link, index) => ({
              platform: link.platform,
              url: link.url,
              order: link.order ?? index,
            })),
          }
          : undefined,
      },
      include: {
        category: true,
        images: { orderBy: { order: "asc" } },
        purchaseLinks: { orderBy: { order: "asc" } },
      },
    });

    // 重新验证前台页面缓存 & 管理后台统计缓存
    revalidatePath("/products");
    revalidateTag("admin-stats");

    return NextResponse.json({
      success: true,
      data: {
        ...product,
        price: Number(product.price),
      },
    });
  } catch (error) {
    apiConsole.error("创建产品失败:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "参数错误", details: error.issues } },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message: "创建产品失败" } },
      { status: 500 }
    );
  }
}
