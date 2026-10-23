import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { apiConsole } from "@/lib/logger";
import { maskPhone } from "@/lib/mask-phone";
import { hasAdminPermission } from "@/lib/admin-permissions";

// 查询参数 Schema
const QuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  status: z.enum(["all", "unread", "read"]).default("all"),
  replied: z.enum(["all", "unreplied", "replied"]).default("all"),
  type: z.string().max(50).optional(),
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

    if (!hasAdminPermission(admin, "messages:read")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "权限不足：留言查看" } },
        { status: 403 }
      );
    }

    const rateLimitResponse = await checkAdminRateLimit(request, "admin-read");
    if (rateLimitResponse) return rateLimitResponse;

    const { searchParams } = new URL(request.url);
    const params = QuerySchema.parse({
      page: searchParams.get("page") || "1",
      pageSize: searchParams.get("pageSize") || "10",
      status: searchParams.get("status") || "all",
      replied: searchParams.get("replied") || "all",
      type: searchParams.get("type") || undefined,
      search: searchParams.get("search") || undefined,
    });

    // 构建基础筛选（不含阅读状态），用于状态页签计数
    const baseWhere: Prisma.ContactMessageWhereInput = {};

    if (params.replied === "unreplied") {
      baseWhere.reply = null;
    } else if (params.replied === "replied") {
      baseWhere.reply = { not: null };
    }

    if (params.type) {
      baseWhere.type = params.type;
    }

    if (params.search) {
      baseWhere.OR = [
        { name: { contains: params.search, mode: "insensitive" } },
        // 手机号仅精确匹配：contains 可被无敏感权限角色用于逐位枚举完整号码
        { phone: { equals: params.search } },
        { content: { contains: params.search, mode: "insensitive" } },
      ];
    }

    const where: Prisma.ContactMessageWhereInput = { ...baseWhere };
    if (params.status === "unread") {
      where.read = false;
    } else if (params.status === "read") {
      where.read = true;
    }

    const [items, allCount, unreadFilteredCount, unreadCount] = await Promise.all([
      prisma.contactMessage.findMany({
        where,
        orderBy: [{ read: "asc" }, { createdAt: "desc" }, { id: "asc" }],
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
      }),
      prisma.contactMessage.count({ where: baseWhere }),
      prisma.contactMessage.count({ where: { ...baseWhere, read: false } }),
      // 全局未读数：供侧边栏 badge 使用，不随列表筛选变化
      prisma.contactMessage.count({ where: { read: false } }),
    ]);

    const readFilteredCount = Math.max(0, allCount - unreadFilteredCount);
    const total =
      params.status === "unread"
        ? unreadFilteredCount
        : params.status === "read"
          ? readFilteredCount
          : allCount;

    // 持有 messages:sensitive:read 的管理员返回完整手机号（用于回访跟进），否则保持脱敏
    const canReadSensitive = hasAdminPermission(admin, "messages:sensitive:read");

    return NextResponse.json({
      success: true,
      data: {
        items: items.map((item) => ({
          ...item,
          phone: canReadSensitive ? item.phone : maskPhone(item.phone),
          repliedAt: item.repliedAt?.toISOString() ?? null,
          createdAt: item.createdAt.toISOString(),
        })),
        pagination: {
          page: params.page,
          pageSize: params.pageSize,
          total,
          totalPages: Math.ceil(total / params.pageSize),
        },
        unreadCount,
        counts: {
          all: allCount,
          unread: unreadFilteredCount,
          read: readFilteredCount,
        },
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
