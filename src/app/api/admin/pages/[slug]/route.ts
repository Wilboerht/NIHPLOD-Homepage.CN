import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyAuth } from "@/lib/auth";
import { z } from "zod";

// SEO 验证 Schema
const SeoSchema = z.object({
  title: z.string().max(100).optional(),
  description: z.string().max(300).optional(),
  keywords: z.string().max(200).optional(),
  ogImage: z.string().optional(),
});

// 页面更新 Schema
const PageUpdateSchema = z.object({
  title: z.string().min(1).max(100).optional(),
  content: z.record(z.string(), z.unknown()).optional(),
  seo: SeoSchema.optional(),
  published: z.boolean().optional(),
});

// GET /api/admin/pages/[slug] - 获取页面详情
// 强制动态渲染，禁止静态预渲染
export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权访问" } },
        { status: 401 }
      );
    }

    const { slug } = await params;

    const page = await prisma.page.findUnique({
      where: { slug },
    });

    if (!page) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "页面不存在" } },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        ...page,
        updatedAt: page.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("获取页面详情失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message: "获取页面详情失败" } },
      { status: 500 }
    );
  }
}

// PUT /api/admin/pages/[slug] - 更新页面
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权访问" } },
        { status: 401 }
      );
    }

    const { slug } = await params;
    const body = await request.json();
    const validated = PageUpdateSchema.parse(body);

    // 检查页面是否存在
    const existing = await prisma.page.findUnique({ where: { slug } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "页面不存在" } },
        { status: 404 }
      );
    }

    // 更新页面
    const page = await prisma.page.update({
      where: { slug },
      data: {
        ...(validated.title && { title: validated.title }),
        ...(validated.content && { content: validated.content as object }),
        ...(validated.seo && { seo: validated.seo as object }),
        ...(typeof validated.published === "boolean" && { published: validated.published }),
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        ...page,
        updatedAt: page.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("更新页面失败:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "参数错误", details: error.issues } },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message: "更新页面失败" } },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/pages/[slug] - 删除页面
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权访问" } },
        { status: 401 }
      );
    }

    const { slug } = await params;

    // 检查页面是否存在
    const existing = await prisma.page.findUnique({ where: { slug } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "页面不存在" } },
        { status: 404 }
      );
    }

    // 核心页面不允许删除
    const corePages = ["home", "story", "ritual", "contact", "careers", "privacy", "terms"];
    if (corePages.includes(slug)) {
      return NextResponse.json(
        { success: false, error: { code: "PROTECTED", message: "核心页面不允许删除" } },
        { status: 400 }
      );
    }

    await prisma.page.delete({ where: { slug } });

    return NextResponse.json({
      success: true,
      data: { message: "页面已删除" },
    });
  } catch (error) {
    console.error("删除页面失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message: "删除页面失败" } },
      { status: 500 }
    );
  }
}

