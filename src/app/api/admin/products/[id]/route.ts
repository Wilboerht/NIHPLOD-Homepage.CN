import { NextRequest, NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import prisma from "@/lib/prisma";
import { verifyAuth } from "@/lib/auth";
import { toInputJson } from "@/lib/prisma-json";
import { z } from "zod";
import { ProductSchema } from "@/schemas/product";
import { deleteUploadedFile } from "@/lib/upload";
import { createAuditLog } from "@/lib/audit";

// GET /api/admin/products/[id] - 获取产品详情
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
    console.error("获取产品详情失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message: "获取产品详情失败" } },
      { status: 500 }
    );
  }
}

// PATCH /api/admin/products/[id] - 更新产品部分字段
export async function PATCH(
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

    // 检查产品是否存在
    const existing = await prisma.product.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "产品不存在" } },
        { status: 404 }
      );
    }

    // 只允许更新特定字段
    const allowedFields = ["published", "featured", "order"];
    const updateData: Record<string, unknown> = {};

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }

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
    console.error("更新产品失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message: "更新产品失败" } },
      { status: 500 }
    );
  }
}

// PUT /api/admin/products/[id] - 完整更新产品
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
    const validated = ProductSchema.parse(body);

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
          category: { connect: { id: validated.categoryId } },
          allowDirectBuy: validated.allowDirectBuy,
          stock: validated.stock,
          geoFaqs: toInputJson(validated.geoFaqs),
        },
      });

      // 处理图片：更新已有 + 创建新的
      for (const img of validated.images) {
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
      for (const link of validated.purchaseLinks || []) {
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

    return NextResponse.json({
      success: true,
      data: {
        ...fullProduct,
        price: Number(fullProduct?.price),
      },
    });
  } catch (error) {
    console.error("更新产品失败:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "参数错误", details: error.issues } },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message: "更新产品失败" } },
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

    const { id } = await params;

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
    revalidateTag("admin-stats");

    return NextResponse.json({
      success: true,
      data: { message: "产品已删除" },
    });
  } catch (error) {
    console.error("删除产品失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message: "删除产品失败" } },
      { status: 500 }
    );
  }
}

