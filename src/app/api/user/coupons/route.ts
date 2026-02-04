
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentLoginUser } from "@/lib/auth";

// 强制动态渲染，禁止静态预渲染
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const user = await getCurrentLoginUser();
    if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status"); // UNUSED, USED, EXPIRED

    // 顺便处理一下过期状态 (Lazy Update)
    // 如果查的是 UNUSED，把即使 UNUSED 但 expiresAt < now 的更新为 EXPIRED
    // 但为了性能，这里只查，前端判定过期展示

    const userCoupons = await prisma.userCoupon.findMany({
        where: {
            userId: user.id,
            ...(status ? { status } : {})
        },
        include: {
            coupon: true
        },
        orderBy: {
            createdAt: 'desc'
        }
    });

    // Client-ready format
    const now = new Date();
    const formatted = userCoupons.map(uc => ({
        ...uc,
        isExpired: now > uc.expiresAt,
        displayStatus: (uc.status === 'UNUSED' && now > uc.expiresAt) ? 'EXPIRED' : uc.status
    }));

    return NextResponse.json({ success: true, data: formatted });
}
