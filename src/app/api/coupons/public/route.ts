import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiConsole } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const now = new Date();

    const coupons = await prisma.coupon.findMany({
      where: {
        isActive: true,
        AND: [
          { OR: [{ startDate: { lte: now } }, { startDate: null }] },
          { OR: [{ endDate: { gte: now } }, { endDate: null }] },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        name: true,
        type: true,
        value: true,
        minAmount: true,
        startDate: true,
        endDate: true,
        daysValid: true,
        totalLimit: true,
        userLimit: true,
        scopeType: true,
        scopeIds: true,
        // 注意：不返回 code——兑换码是领取凭证，公开暴露会被枚举/滥用
      },
    });

    return NextResponse.json({ success: true, data: { coupons } });
  } catch (error) {
    apiConsole.error("[CouponsPublic] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}
