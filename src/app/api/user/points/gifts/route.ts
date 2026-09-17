/**
 * 用户积分兑换 API
 * GET /api/user/points/gifts - 可兑换产品列表（产品库中标记可兑的产品，含按当前等级折算的所需积分）
 * 每项含 detail（产品详情抽屉所需完整字段），前端点击礼品卡片可直接打开详情。
 * 兑换记录改由 GET /api/user/points/redemptions 提供（无限滚动分页）。
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withUserAuth } from "@/lib/auth";
import { apiConsole } from "@/lib/logger";
import { listRedeemableProducts, giftCostForUser } from "@/lib/point-gifts";
import { getPointBalanceView } from "@/lib/points-ledger";
import { POINT_REDEEM_RATES } from "@/lib/membership";
import type { ProductData } from "@/components/website/ProductDrawer";

export const dynamic = "force-dynamic";

export const GET = withUserAuth(async (_request: NextRequest, payload) => {
  try {
    const data = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: payload.id },
        select: { membershipLevel: true },
      });
      const level = user?.membershipLevel ?? "REGULAR";

      const [products, balance] = await Promise.all([
        listRedeemableProducts(),
        getPointBalanceView(tx, payload.id),
      ]);

      return {
        membershipLevel: level,
        redeemRate: POINT_REDEEM_RATES[level],
        available: balance.available,
        frozen: balance.frozen,
        gifts: products.map((p) => {
          const cost = giftCostForUser(p.price, level);
          const priceYuan = Number(p.price);
          const detail: ProductData = {
            id: p.id,
            name: p.name,
            nameEn: p.nameEn,
            slug: p.slug,
            description: p.description,
            price: priceYuan,
            capacity: p.capacity ?? undefined,
            purchaseLinks: p.purchaseLinks.map((l) => ({
              id: l.id,
              platform: l.platform,
              url: l.url,
            })),
            images: p.images.map((img) => ({ url: img.url, alt: img.alt ?? undefined })),
            category: { name: p.category.name },
            ingredients: p.ingredients ?? undefined,
            usage: p.usage ?? undefined,
            benefits: p.benefits,
          };
          return {
            id: p.id,
            name: p.name,
            description: p.description,
            image: p.images[0]?.url ?? null,
            priceYuan,
            cost, // 实际所需积分（普通档为 null）
            affordable: cost !== null && cost <= balance.available,
            detail,
          };
        }),
      };
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    apiConsole.error("[UserPointGifts] 查询失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
});
