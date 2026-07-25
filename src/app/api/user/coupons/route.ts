import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyUserAuth } from "@/lib/auth";
import { UserCouponStatus } from "@/generated/prisma/client";

// 强制动态渲染，禁止静态预渲染
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await verifyUserAuth(req);
  if (!user)
    return NextResponse.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "请先登录" } },
      { status: 401 }
    );

  const { searchParams } = new URL(req.url);
  const statusParam = searchParams.get("status"); // UNUSED, USED, EXPIRED

  // 将字符串参数转为 Enum
  const statusFilter =
    statusParam && Object.values(UserCouponStatus).includes(statusParam as UserCouponStatus)
      ? (statusParam as UserCouponStatus)
      : undefined;

  // 顺便处理一下过期状态 (Lazy Update)
  // 如果查的是 UNUSED，把即使 UNUSED 但 expiresAt < now 的更新为 EXPIRED
  // 但为了性能，这里只查，前端判定过期展示

  const userCoupons = await prisma.userCoupon.findMany({
    where: {
      userId: user.id,
      ...(statusFilter ? { status: statusFilter } : {}),
    },
    include: {
      coupon: true,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 50,
  });

  // Client-ready format
  const now = new Date();
  const formatted = userCoupons.map((uc) => ({
    ...uc,
    isExpired: now > uc.expiresAt,
    displayStatus:
      uc.status === UserCouponStatus.UNUSED && now > uc.expiresAt ? "EXPIRED" : uc.status,
  }));

  return NextResponse.json({ success: true, data: formatted });
}
