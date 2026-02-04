
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentLoginUser } from "@/lib/auth";
import { z } from "zod";
import { logError } from "@/lib/logger";

const schema = z.object({
    couponId: z.string().optional(),
    code: z.string().optional(),
}).refine(data => data.couponId || data.code, {
    message: "Either couponId or code is required",
});

// 强制动态渲染，禁止静态预渲染
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    try {
        const user = await getCurrentLoginUser();
        if (!user) {
            return NextResponse.json({ success: false, error: "请先登录" }, { status: 401 });
        }

        const body = await req.json();
        const { couponId, code } = schema.parse(body);

        // 1. 查找优惠券
        const coupon = await prisma.coupon.findFirst({
            where: code ? { code, isActive: true } : { id: couponId, isActive: true },
        });

        if (!coupon) {
            return NextResponse.json({ success: false, error: "优惠券不存在或已下架" }, { status: 404 });
        }

        // 2. 校验有效期
        const now = new Date();
        if (coupon.startDate && now < coupon.startDate) {
            return NextResponse.json({ success: false, error: "活动未开始" }, { status: 400 });
        }
        if (coupon.endDate && now > coupon.endDate) {
            return NextResponse.json({ success: false, error: "活动已结束" }, { status: 400 });
        }

        // 3. 校验总库存
        if (coupon.totalLimit !== null) {
            const issuedCount = await prisma.userCoupon.count({ where: { couponId: coupon.id } });
            if (issuedCount >= coupon.totalLimit) {
                return NextResponse.json({ success: false, error: "已领完" }, { status: 400 });
            }
        }

        // 4. 校验个人限领
        const userCount = await prisma.userCoupon.count({
            where: { couponId: coupon.id, userId: user.id },
        });
        if (userCount >= coupon.userLimit) {
            return NextResponse.json({ success: false, error: `每人限领 ${coupon.userLimit} 张` }, { status: 400 });
        }

        // 5. 计算过期时间
        let expiresAt: Date;
        if (coupon.endDate) {
            // 如果有固定截止日期，取其与相对有效期的较早者 (或者逻辑是优先相对？这里假设固定日期是大限)
            // 通常：如果有 daysValid，则是领取后 N 天；如果没有，则跟随 endDate。
            if (coupon.daysValid) {
                const relativeExp = new Date(now.getTime() + coupon.daysValid * 24 * 60 * 60 * 1000);
                expiresAt = relativeExp > coupon.endDate ? coupon.endDate : relativeExp;
            } else {
                expiresAt = coupon.endDate;
            }
        } else {
            // 如果没有固定截止日期，必须有 daysValid
            if (!coupon.daysValid) {
                // Default 30 days if not configured?
                expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
            } else {
                expiresAt = new Date(now.getTime() + coupon.daysValid * 24 * 60 * 60 * 1000);
            }
        }

        // 6. 发放
        const userCoupon = await prisma.userCoupon.create({
            data: {
                userId: user.id,
                couponId: coupon.id,
                status: "UNUSED",
                expiresAt,
            },
        });

        return NextResponse.json({ success: true, data: userCoupon });
    } catch (e: unknown) {
        logError("AcquireCoupon", e);
        const message = e instanceof Error ? e.message : String(e);
        return NextResponse.json({ success: false, error: message || "领取失败" }, { status: 500 });
    }
}
