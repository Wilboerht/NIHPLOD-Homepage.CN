/**
 * 用户兑换记录 API（积分商城「我的兑换记录」无限滚动加载）
 * GET /api/user/points/redemptions?offset=10
 *
 * - offset：已加载条数（默认 0），每次返回最多 10 条（按兑换时间倒序）
 * - hasMore：是否还有更多记录（客户端据此继续滚动加载）
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withUserAuth } from "@/lib/auth";
import { apiConsole } from "@/lib/logger";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 10;

const querySchema = z.object({
  offset: z.preprocess(
    (val) => (val === undefined || val === null || val === "" ? 0 : Number(val)),
    z.number().int().min(0).max(10000)
  ),
});

export const GET = withUserAuth(async (request: NextRequest, payload) => {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({ offset: searchParams.get("offset") });
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_PARAMS", message: "参数错误" } },
        { status: 400 }
      );
    }

    const offset = parsed.data.offset;

    // 多取 1 条用于判断是否还有更多
    const rows = await prisma.pointRedemption.findMany({
      where: { userId: payload.id },
      orderBy: { createdAt: "desc" },
      skip: offset,
      take: PAGE_SIZE + 1,
      select: {
        id: true,
        productName: true,
        priceYuan: true,
        points: true,
        status: true,
        recipient: true,
        phone: true,
        address: true,
        createdAt: true,
      },
    });

    const hasMore = rows.length > PAGE_SIZE;
    const redemptions = rows.slice(0, PAGE_SIZE).map((r) => ({
      id: r.id,
      productName: r.productName,
      priceYuan: Number(r.priceYuan),
      points: r.points,
      status: r.status,
      recipient: r.recipient,
      phone: r.phone,
      address: r.address,
      createdAt: r.createdAt.toISOString(),
    }));

    return NextResponse.json({
      success: true,
      data: { redemptions, hasMore },
    });
  } catch (error) {
    apiConsole.error("[UserPointRedemptions] 查询失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
});
