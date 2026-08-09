import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { apiConsole } from "@/lib/logger";

// 查询参数 Schema
const QuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  status: z.enum(["all", "unread", "read"]).default("all"),
  search: z.string().max(100).optional(),
});

// GET /api/admin/messages - 获取留言列表
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

    const rateLimitResponse = await checkAdminRateLimit(request, "admin-read");
    if (rateLimitResponse) return rateLimitResponse;

    const { searchParams } = new URL(request.url);
    const params = QuerySchema.parse({
      page: searchParams.get("page") || "1",
      pageSize: searchParams.get("pageSize") || "10",
      status: searchParams.get("status") || "all",
      search: searchParams.get("search") || undefined,
    });

    // 构建查询条件
    const where: Prisma.ContactMessageWhereInput = {};

    if (params.status === "unread") {
      where.read = false;
    } else if (params.status === "read") {
      where.read = true;
    }

    if (params.search) {
      where.OR = [
        { name: { contains: params.search, mode: "insensitive" } },
        { phone: { contains: params.search, mode: "insensitive" } },
        { content: { contains: params.search, mode: "insensitive" } },
      ];
    }

    // 查询总数
    const total = await prisma.contactMessage.count({ where });

    // 查询列表
    const items = await prisma.contactMessage.findMany({
      where,
      orderBy: [{ read: "asc" }, { createdAt: "desc" }],
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
    });

    // 统计未读数
    const unreadCount = await prisma.contactMessage.count({
      where: { read: false },
    });

    return NextResponse.json({
      success: true,
      data: {
        items: items.map((item) => ({
          ...item,
          createdAt: item.createdAt.toISOString(),
        })),
        pagination: {
          page: params.page,
          pageSize: params.pageSize,
          total,
          totalPages: Math.ceil(total / params.pageSize),
        },
        unreadCount,
      },
    });
  } catch (error) {
    apiConsole.error("获取留言列表失败:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "参数错误" } },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "获取留言列表失败" } },
      { status: 500 }
    );
  }
}
