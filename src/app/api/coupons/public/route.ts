
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest) {
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
      select: {
        id: true,
        name: true,
        code: true,
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
      },
    });

    return NextResponse.json({ success: true, data: { coupons } });
  } catch (error) {
    console.error("[CouponsPublic] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}
