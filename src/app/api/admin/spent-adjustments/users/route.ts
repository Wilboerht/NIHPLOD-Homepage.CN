/**
 * 代客补录目标用户检索 API（管理端）
 * GET /api/admin/spent-adjustments/users?search=手机号/昵称/用户ID
 *
 * 仅要求 spent:create：客服可以代填，但不一定能查看完整用户列表。
 * 返回脱敏手机号，避免额外暴露 PII。
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { apiConsole } from "@/lib/logger";
import { maskPhone } from "@/lib/mask-phone";

const querySchema = z.object({
  search: z.string().trim().min(1, "请输入手机号、昵称或用户 ID").max(100),
});

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权" } },
        { status: 401 }
      );
    }

    if (!hasAdminPermission(admin, "spent:create")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "权限不足：消费补录代客填写" } },
        { status: 403 }
      );
    }

    const rateLimitResponse = await checkAdminRateLimit(request, "spent-adjust:users", admin.id);
    if (rateLimitResponse) return rateLimitResponse;

    const parsed = querySchema.safeParse({
      search: request.nextUrl.searchParams.get("search") ?? "",
    });
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "INVALID_PARAMS", message: parsed.error.issues[0]?.message || "参数错误" },
        },
        { status: 400 }
      );
    }

    const search = parsed.data.search;
    const users = await prisma.user.findMany({
      where: {
        status: { not: "DELETED" },
        OR: [
          { id: { equals: search } },
          { phone: { equals: search } },
          { nickname: { contains: search, mode: "insensitive" } },
        ],
      },
      take: 8,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      select: {
        id: true,
        phone: true,
        nickname: true,
        status: true,
        membershipLevel: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        users: users.map((user) => ({
          id: user.id,
          phone: maskPhone(user.phone),
          nickname: user.nickname,
          status: user.status,
          membershipLevel: user.membershipLevel,
        })),
      },
    });
  } catch (error) {
    apiConsole.error("[AdminSpentAdjustment] 代客用户检索失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}
