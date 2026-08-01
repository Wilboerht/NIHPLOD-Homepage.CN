import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { verifyUserAuth } from "@/lib/auth";
import { rateLimit, getClientIP } from "@/lib/ratelimit";
import { z } from "zod";
import { logError } from "@/lib/logger";

const schema = z
  .object({
    couponId: z.string().optional(),
    code: z.string().optional(),
  })
  .refine((data) => data.couponId || data.code, {
    message: "Either couponId or code is required",
  });

// 强制动态渲染，禁止静态预渲染
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    // 防滥用：IP 级限流（领取券是高频滥用目标）
    const ip = getClientIP(req);
    const limitResult = await rateLimit(ip, "form", { maxRequests: 20 });
    if (!limitResult.success) {
      return NextResponse.json(
        { success: false, error: "操作过于频繁，请稍后再试" },
        { status: 429 }
      );
    }

    const user = await verifyUserAuth(req);
    if (!user) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "请先登录" } },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { couponId, code } = schema.parse(body);

    // 1. 查找优惠券（事务外的只读预检，减少事务持有时间）
    const coupon = await prisma.coupon.findFirst({
      where: code ? { code, isActive: true } : { id: couponId, isActive: true },
    });

    if (!coupon) {
      return NextResponse.json({ success: false, error: "优惠券不存在或已下架" }, { status: 404 });
    }

    // 2. 校验固定有效期（不涉及并发，可在事务外校验）
    const now = new Date();
    if (coupon.startDate && now < coupon.startDate) {
      return NextResponse.json({ success: false, error: "活动未开始" }, { status: 400 });
    }
    if (coupon.endDate && now > coupon.endDate) {
      return NextResponse.json({ success: false, error: "活动已结束" }, { status: 400 });
    }

    // 3. 计算过期时间
    let expiresAt: Date;
    if (coupon.endDate) {
      if (coupon.daysValid) {
        const relativeExp = new Date(now.getTime() + coupon.daysValid * 24 * 60 * 60 * 1000);
        expiresAt = relativeExp > coupon.endDate ? coupon.endDate : relativeExp;
      } else {
        expiresAt = coupon.endDate;
      }
    } else {
      if (!coupon.daysValid) {
        expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      } else {
        expiresAt = new Date(now.getTime() + coupon.daysValid * 24 * 60 * 60 * 1000);
      }
    }

    // ✅ 核心修复：将库存校验和发放写入同一个数据库事务
    // 先通过 UPDATE 锁定 Coupon 记录（获取行级排他锁），确保并发请求串行执行 count
    const userCoupon = await prisma.$transaction(async (tx) => {
      // 4. 锁定 Coupon 记录（PostgreSQL 行锁，阻塞其他并发领取同一优惠券的事务）
      await tx.$executeRaw(Prisma.sql`SELECT 1 FROM "Coupon" WHERE id = ${coupon.id} FOR UPDATE`);

      // 5. 事务内重新校验总库存（在锁保护下 count，防止幻读超发）
      if (coupon.totalLimit !== null) {
        const issuedCount = await tx.userCoupon.count({
          where: { couponId: coupon.id },
        });
        if (issuedCount >= coupon.totalLimit) {
          throw new Error("已领完");
        }
      }

      // 6. 事务内重新校验个人限领（在锁保护下 count，防止幻读超领）
      const userCount = await tx.userCoupon.count({
        where: { couponId: coupon.id, userId: user.id },
      });
      if (userCount >= coupon.userLimit) {
        throw new Error(`每人限领 ${coupon.userLimit} 张`);
      }

      // 7. 原子写入，不存在时间窗口
      return tx.userCoupon.create({
        data: {
          userId: user.id,
          couponId: coupon.id,
          status: "UNUSED",
          expiresAt,
        },
      });
    });

    return NextResponse.json({ success: true, data: userCoupon });
  } catch (e: unknown) {
    // 从事务内 throw 的业务错误（如"已领完"）直接作为 400 返回
    const message = e instanceof Error ? e.message : String(e);
    if (message === "已领完" || message.startsWith("每人限领")) {
      return NextResponse.json({ success: false, error: message }, { status: 400 });
    }
    logError("AcquireCoupon", e);
    return NextResponse.json({ success: false, error: message || "领取失败" }, { status: 500 });
  }
}
