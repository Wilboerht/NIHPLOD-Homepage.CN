import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function POST() {
  try {
    // 获取护手霜分类ID
    const handCreamCategory = await prisma.category.findFirst({
      where: { name: "护手霜" }
    });

    if (!handCreamCategory) {
      return NextResponse.json({ success: false, error: "护手霜分类不存在" }, { status: 400 });
    }

    // 查找名称包含"护手霜"的产品并更新分类
    const result = await prisma.product.updateMany({
      where: {
        OR: [
          { name: { contains: "护手霜" } },
          { nameEn: { contains: "Hand Cream", mode: "insensitive" } },
        ]
      },
      data: {
        categoryId: handCreamCategory.id
      }
    });

    // 返回更新结果
    const updatedProducts = await prisma.product.findMany({
      where: { categoryId: handCreamCategory.id },
      select: { id: true, name: true, nameEn: true }
    });

    return NextResponse.json({ 
      success: true, 
      updated: result.count,
      products: updatedProducts
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

export async function GET() {
  // 列出所有产品及其分类
  const products = await prisma.product.findMany({
    select: { id: true, name: true, nameEn: true, category: { select: { name: true } } },
    orderBy: { name: "asc" }
  });
  return NextResponse.json(products);
}

