import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// GET /api/categories - 获取分类列表
// 强制动态渲染，禁止静态预渲染
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
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
      data: categories,
    });
  } catch (error) {
    console.error("获取分类失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "FETCH_ERROR", message: "获取分类失败" } },
      { status: 500 }
    );
  }
}

// POST /api/categories - 创建分类（需要管理员权限）
export async function POST() {
  return NextResponse.json(
    { success: false, error: { code: "NOT_IMPLEMENTED", message: "待实现" } },
    { status: 501 }
  );
}
