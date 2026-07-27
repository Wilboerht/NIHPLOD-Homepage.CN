import { NextRequest, NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import prisma from "@/lib/prisma";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { toInputJson } from "@/lib/prisma-json";
import { z } from "zod";
import { ProductSchema } from "@/schemas/product";
import { sanitizeHtml } from "@/lib/html-sanitize";
import { deleteUploadedFile } from "@/lib/upload";
import { createAuditLog } from "@/lib/audit";
import { apiConsole } from "@/lib/logger";
import { validateCUID, invalidIdResponse } from "@/lib/validation";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";

// PATCH 产品状态/排序 Schema（严格模式，只允许白名单字段）
const patchProductSchema = z
  .object({
    published: z.boolean().optional(),
    featured: z.boolean().optional(),
    order: z.number().int().min(0).optional(),
  })
  .strict();

// GET /api/admin/products/[id] - 获取产品详情
// 强制动态渲染，禁止静态预渲染
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权访问" } },
        { status: 401 }
      );
    }

    const { id } = await params;

    if (!validateCUID(id)) {
      return invalidIdResponse();
    }

    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        category: true,
        images: { orderBy: { order: "asc" } },
        purchaseLinks: { orderBy: { order: "asc" } },
      },
    });

    if (!product) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "产品不存在" } },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        ...product,
        price: Number(product.price),
      },
    });
  } catch (error) {
    apiConsole.error("获取产品详情失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "获取产品详情失败" } },
      { status: 500 }
    );
  }
}

// PATCH /api/admin/products/[id] - 更新产品部分字段
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权访问" } },
        { status: 401 }
      );
    }

    const rateLimitResponse = await checkAdminRateLimit(request);
    if (rateLimitResponse) return rateLimitResponse;

    if (!validateCSRFToken(request)) {
      return csrfForbiddenResponse();
    }

    const { id } = await params;
    if (!validateCUID(id)) {
      return invalidIdResponse();
    }

    const body = await request.json();

    const parsed = patchProductSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "VALIDATION_ERROR", message: "参数错误", details: parsed.error.issues },
        },
        { status: 400 }
      );
    }
    const validated = parsed.data;

    // 检查产品是否存在
    const existing = await prisma.product.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "产品不存在" } },
        { status: 404 }
      );
    }

    const updateData: Record<string, unknown> = {};
    if (validated.published !== undefined) updateData.published = validated.published;
    if (validated.featured !== undefined) updateData.featured = validated.featured;
    if (validated.order !== undefined) updateData.order = validated.order;

    const product = await prisma.product.update({
      where: { id },
      data: updateData,
    });

    // 记录审计日志
    await createAuditLog({
      action: "update_product",
      targetType: "product",
      targetId: id,
      detail: { fields: Object.keys(updateData), values: updateData },
      adminId: admin.id,
      request,
    });

    return NextResponse.json({
      success: true,
      data: {
        ...product,
        price: Number(product.price),
      },
    });
  } catch (error) {
    apiConsole.error("更新产品失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "更新产品失败" } },
      { status: 500 }
    );
  }
}

// PUT /api/admin/products/[id] - 完整更新产品
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权访问" } },
        { status: 401 }
      );
    }

    const rateLimitResponse2 = await checkAdminRateLimit(request);
    if (rateLimitResponse2) return rateLimitResponse2;

    if (!validateCSRFToken(request)) {
      return csrfForbiddenResponse();
    }

    const { id } = await params;
    if (!validateCUID(id)) {
      return invalidIdResponse();
    }

    const body = await request.json();
    const validated = ProductSchema.parse(body);

    // 对 HTML 字段入库前消毒
    const sanitized = {
      ...validated,
      description: sanitizeHtml(validated.description),
      ingredients: sanitizeHtml(validated.ingredients),
      usage: sanitizeHtml(validated.usage),
    };

    // 检查产品是否存在
    const existing = await prisma.product.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "产品不存在" } },
        { status: 404 }
      );
    }

    // 检查 slug 是否重复（排除自身）
    const existingSlug = await prisma.product.findFirst({
      where: { slug: validated.slug, id: { not: id } },
    });
    if (existingSlug) {
      return NextResponse.json(
        { success: false, error: { code: "DUPLICATE_SLUG", message: "URL别名已存在" } },
        { status: 400 }
      );
    }

    // 获取现有图片 ID
    const existingImages = await prisma.image.findMany({
      where: { productId: id },
      select: { id: true },
    });
    const existingImageIds = existingImages.map((i) => i.id);
    const newImageIds = validated.images.filter((i) => i.id).map((i) => i.id);

    // 删除不再使用的图片
    const imagesToDelete = existingImageIds.filter((imgId) => !newImageIds.includes(imgId));

    // 获取现有购买链接 ID
    const existingLinks = await prisma.purchaseLink.findMany({
      where: { productId: id },
      select: { id: true },
    });
    const existingLinkIds = existingLinks.map((l) => l.id);
    const newLinkIds = (validated.purchaseLinks || []).filter((l) => l.id).map((l) => l.id);

    // 删除不再使用的购买链接
    const linksToDelete = existingLinkIds.filter((linkId) => !newLinkIds.includes(linkId));

    // 更新产品
    await prisma.$transaction(async (tx) => {
      // 删除不再使用的图片
      if (imagesToDelete.length > 0) {
        await tx.image.deleteMany({
          where: { id: { in: imagesToDelete } },
        });
      }

      // 删除不再使用的购买链接
      if (linksToDelete.length > 0) {
        await tx.purchaseLink.deleteMany({
          where: { id: { in: linksToDelete } },
        });
      }

      // 更新产品
      const updated = await tx.product.update({
        where: { id },
        data: {
          name: validated.name,
          nameEn: validated.nameEn,
          slug: validated.slug,
          description: sanitized.description,
          price: sanitized.price,
          capacity: sanitized.capacity,
          origin: sanitized.origin,
          purchaseUrl: sanitized.purchaseUrl,
          ingredients: sanitized.ingredients,
          usage: sanitized.usage,
          benefits: sanitized.benefits || [],
          order: validated.order,
          featured: validated.featured,
          published: validated.published,
          category: { connect: { id: validated.categoryId } },
          allowDirectBuy: validated.allowDirectBuy,
          stock: validated.stock,
          geoFaqs: toInputJson(validated.geoFaqs),
        },
      });

      // 处理图片：更新已有 + 创建新的
      for (const img of sanitized.images) {
        if (img.id && existingImageIds.includes(img.id)) {
          // 更新已有图片
          await tx.image.update({
            where: { id: img.id },
            data: { url: img.url, alt: img.alt, order: img.order },
          });
        } else {
          // 创建新图片
          await tx.image.create({
            data: {
              url: img.url,
              alt: img.alt,
              order: img.order,
              productId: id,
            },
          });
        }
      }

      // 处理购买链接：更新已有 + 创建新的
      for (const link of sanitized.purchaseLinks || []) {
        if (link.id && existingLinkIds.includes(link.id)) {
          // 更新已有链接
          await tx.purchaseLink.update({
            where: { id: link.id },
            data: { platform: link.platform, url: link.url, order: link.order },
          });
        } else {
          // 创建新链接
          await tx.purchaseLink.create({
            data: {
              platform: link.platform,
              url: link.url,
              order: link.order,
              productId: id,
            },
          });
        }
      }

      return updated;
    });

    // 获取更新后的完整产品
    const fullProduct = await prisma.product.findUnique({
      where: { id },
      include: {
        category: true,
        images: { orderBy: { order: "asc" } },
        purchaseLinks: { orderBy: { order: "asc" } },
      },
    });

    // 重新验证前台页面缓存
    revalidatePath("/products");
    if (fullProduct?.slug) {
      revalidatePath(`/products/${fullProduct.slug}`);
    }

    // 记录审计日志
    createAuditLog({
      action: "update_product",
      targetType: "product",
      targetId: id,
      detail: { name: validated.name, slug: validated.slug, price: validated.price },
      adminId: admin.id,
      request,
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      data: {
        ...fullProduct,
        price: Number(fullProduct?.price),
      },
    });
  } catch (error) {
    apiConsole.error("更新产品失败:", error);
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
      { success: false, error: { code: "INTERNAL_ERROR", message: "更新产品失败" } },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/products/[id] - 删除产品
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

    const rateLimitResponse = await checkAdminRateLimit(request);
    if (rateLimitResponse) return rateLimitResponse;

    if (!validateCSRFToken(request)) {
      return csrfForbiddenResponse();
    }

    const { id } = await params;

    if (!validateCUID(id)) {
      return invalidIdResponse();
    }

    // 检查产品是否存在
    const existing = await prisma.product.findUnique({
      where: { id },
      include: { images: true },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "产品不存在" } },
        { status: 404 }
      );
    }

    // 先删除关联的物理图片文件
    for (const image of existing.images) {
      await deleteUploadedFile(image.url);
    }

    // 删除产品（级联删除关联的图片数据库记录）
    await prisma.product.delete({ where: { id } });

    // 重新验证前台页面缓存 & 管理后台统计缓存
    revalidatePath("/products");
    revalidatePath(`/products/${existing.slug}`);
    revalidateTag("admin-stats", "max");

    // 记录审计日志
    createAuditLog({
      action: "delete_product",
      targetType: "product",
      targetId: id,
      detail: { name: existing.name, slug: existing.slug },
      adminId: admin.id,
      request,
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      data: { message: "产品已删除" },
    });
  } catch (error) {
    apiConsole.error("删除产品失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "删除产品失败" } },
      { status: 500 }
    );
  }
}
