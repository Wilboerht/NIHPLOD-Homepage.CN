/**
 * 优惠券服务
 * 过期清理、状态管理
 */
import { prisma } from "./prisma";
import { UserCouponStatus } from "@/generated/prisma/client";

/**
 * 自动将已过期的 UNUSED 优惠券标记为 EXPIRED
 */
export async function autoExpireUserCoupons(): Promise<{ success: boolean; expiredCount: number; error?: string }> {
  try {
    const now = new Date();

    const result = await prisma.userCoupon.updateMany({
      where: {
        status: UserCouponStatus.UNUSED,
        expiresAt: { lt: now },
      },
      data: {
        status: UserCouponStatus.EXPIRED,
      },
    });

    console.log(`[Coupon] 自动标记了 ${result.count} 张过期优惠券为 EXPIRED`);
    return { success: true, expiredCount: result.count };
  } catch (error) {
    console.error("[Coupon] 自动过期清理失败:", error);
    return { success: false, expiredCount: 0, error: String(error) };
  }
}
