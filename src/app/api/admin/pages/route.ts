import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyAuth } from "@/lib/auth";
import { PAGE_META, getEmptyContent, type PageSlug } from "@/types/page-content";

// GET /api/admin/pages - 获取页面列表
export async function GET(request: NextRequest) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权访问" } },
        { status: 401 }
      );
    }

    const pages = await prisma.page.findMany({
      orderBy: { slug: "asc" },
      select: {
        id: true,
        title: true,
        slug: true,
        published: true,
        updatedAt: true,
      },
    });

    // 添加页面元数据
    const pagesWithMeta = pages.map((page) => ({
      ...page,
      updatedAt: page.updatedAt.toISOString(),
      meta: PAGE_META[page.slug] || { name: page.title, description: "" },
    }));

    return NextResponse.json({
      success: true,
      data: pagesWithMeta,
    });
  } catch (error) {
    console.error("获取页面列表失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message: "获取页面列表失败" } },
      { status: 500 }
    );
  }
}

// POST /api/admin/pages - 创建页面（初始化）
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
    const { slug, title } = body;

    if (!slug || !title) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "缺少必要参数" } },
        { status: 400 }
      );
    }

    // 检查页面是否已存在
    const existing = await prisma.page.findUnique({ where: { slug } });
    if (existing) {
      return NextResponse.json(
        { success: false, error: { code: "DUPLICATE", message: "页面已存在" } },
        { status: 400 }
      );
    }

    // 创建页面
    const content = getEmptyContent(slug as PageSlug);
    const page = await prisma.page.create({
      data: {
        title,
        slug,
        content: content as object,
        seo: {},
        published: false,
      },
    });

    return NextResponse.json({
      success: true,
      data: page,
    });
  } catch (error) {
    console.error("创建页面失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message: "创建页面失败" } },
      { status: 500 }
    );
  }
}

