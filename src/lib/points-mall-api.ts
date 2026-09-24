/**
 * 积分商城数据操作核心（用户端）
 *
 * 会话路由（/api/user/points*、/api/user/addresses*）与 OAuth 资源端点
 * （/api/oauth/points*、/api/oauth/addresses*）共用，避免两套入口在
 * 分值折算、幂等、地址默认规则与响应契约上出现分叉。
 * 鉴权与限流由各入口自行处理，这里只接收已鉴权的 userId。
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiConsole } from "@/lib/logger";
import { validateCUID } from "@/lib/validation";
import { listRedeemableProducts, giftCostForUser, redeemGiftForUser } from "@/lib/point-gifts";
import { getPointBalanceView } from "@/lib/points-ledger";
import { POINT_REDEEM_RATES } from "@/lib/membership";
import { MAX_ADDRESSES, addressFieldsSchema, type UserAddressView } from "@/lib/user-address";
import { querySfRoutes } from "@/lib/sf-express";
import type { MembershipLevel } from "@/generated/prisma/client";
import type { ProductData } from "@/components/website/ProductDrawer";

const REDEMPTION_PAGE_SIZE = 10;

const redemptionQuerySchema = z.object({
  offset: z.preprocess(
    (val) => (val === undefined || val === null || val === "" ? 0 : Number(val)),
    z.number().int().min(0).max(10000)
  ),
});

const redeemSchema = z.object({
  productId: z.string().min(1).max(64),
  addressId: z.string().min(1, "请选择收货地址").max(64),
  requestId: z.string().min(1, "缺少请求标识").max(64),
});

function invalidParams(message: string): NextResponse {
  return NextResponse.json(
    { success: false, error: { code: "INVALID_PARAMS", message } },
    { status: 400 }
  );
}

function internalError(message = "服务器错误"): NextResponse {
  return NextResponse.json(
    { success: false, error: { code: "INTERNAL_ERROR", message } },
    { status: 500 }
  );
}

function toAddressView(a: {
  id: string;
  recipient: string;
  phone: string;
  region: string;
  detail: string;
  isDefault: boolean;
}): UserAddressView {
  return {
    id: a.id,
    recipient: a.recipient,
    phone: a.phone,
    region: a.region,
    detail: a.detail,
    isDefault: a.isDefault,
  };
}

// ============================================
// 积分
// ============================================

/** 积分余额（含物化：过期/释放）与最近 20 条流水 */
export async function getPointsOverviewResponse(userId: string): Promise<NextResponse> {
  try {
    const data = await prisma.$transaction(async (tx) => {
      const balance = await getPointBalanceView(tx, userId);
      const recent = await tx.pointLedger.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          type: true,
          amount: true,
          remaining: true,
          note: true,
          expiresAt: true,
          createdAt: true,
        },
      });
      return {
        ...balance,
        nextReleaseAt: balance.nextReleaseAt?.toISOString() ?? null,
        recent: recent.map((r) => ({
          id: r.id,
          type: r.type,
          amount: r.amount,
          // 剩余未消耗量：用于前端准确计算"即将过期"积分（FIFO 后仍有效的部分）
          remaining: r.remaining,
          note: r.note,
          expiresAt: r.expiresAt?.toISOString() ?? null,
          createdAt: r.createdAt.toISOString(),
        })),
      };
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    apiConsole.error("[UserPoints] 查询失败:", error);
    return internalError();
  }
}

/** 可兑换礼品列表（含按当前等级折算所需积分与产品详情） */
export async function getPointGiftsResponse(userId: string): Promise<NextResponse> {
  try {
    const data = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { membershipLevel: true },
      });
      const level: MembershipLevel = user?.membershipLevel ?? "REGULAR";

      const [products, balance] = await Promise.all([
        listRedeemableProducts(),
        getPointBalanceView(tx, userId),
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
    return internalError();
  }
}

/** 兑换礼品（requestId 幂等；地址快照入库） */
export async function redeemPointsResponse(userId: string, request: Request): Promise<NextResponse> {
  try {
    const body = await request.json().catch(() => null);
    const parsed = redeemSchema.safeParse(body);
    if (!parsed.success) {
      return invalidParams(parsed.error.issues[0]?.message || "参数错误");
    }

    const { productId, addressId, requestId } = parsed.data;
    if (!validateCUID(productId) || !validateCUID(addressId)) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_ID", message: "非法 ID 格式" } },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { membershipLevel: true },
    });
    if (!user) {
      return NextResponse.json(
        { success: false, error: { code: "USER_NOT_FOUND", message: "用户不存在" } },
        { status: 404 }
      );
    }

    const result = await redeemGiftForUser({
      userId,
      productId,
      addressId,
      requestId,
      level: user.membershipLevel,
    });

    if (!result.ok) {
      const statusMap: Record<string, number> = {
        PRODUCT_NOT_FOUND: 404,
        PRODUCT_NOT_REDEEMABLE: 400,
        NOT_ELIGIBLE: 403,
        ADDRESS_NOT_FOUND: 400,
        INSUFFICIENT: 400,
        INVALID_REQUEST: 400,
      };
      return NextResponse.json(
        { success: false, error: { code: result.code, message: result.message } },
        { status: statusMap[result.code] ?? 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        redemptionId: result.redemptionId,
        points: result.points,
        available: result.available,
        duplicated: result.duplicated,
      },
    });
  } catch (error) {
    apiConsole.error("[UserPointRedeem] 兑换失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "兑换失败，请稍后重试" } },
      { status: 500 }
    );
  }
}

/** 我的兑换记录（offset 分页，多取 1 条判断 hasMore） */
export async function getRedemptionsResponse(userId: string, request: Request): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = redemptionQuerySchema.safeParse({ offset: searchParams.get("offset") });
    if (!parsed.success) {
      return invalidParams("参数错误");
    }

    const offset = parsed.data.offset;

    const [rows, total] = await Promise.all([
      prisma.pointRedemption.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        skip: offset,
        take: REDEMPTION_PAGE_SIZE + 1,
        select: {
          id: true,
          productName: true,
          priceYuan: true,
          points: true,
          status: true,
          recipient: true,
          phone: true,
          address: true,
          carrier: true,
          waybillNo: true,
          fulfilledAt: true,
          createdAt: true,
        },
      }),
      prisma.pointRedemption.count({ where: { userId } }),
    ]);

    const hasMore = rows.length > REDEMPTION_PAGE_SIZE;
    const redemptions = rows.slice(0, REDEMPTION_PAGE_SIZE).map((r) => ({
      id: r.id,
      productName: r.productName,
      priceYuan: Number(r.priceYuan),
      points: r.points,
      status: r.status,
      recipient: r.recipient,
      phone: r.phone,
      address: r.address,
      carrier: r.carrier,
      waybillNo: r.waybillNo,
      fulfilledAt: r.fulfilledAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    }));

    return NextResponse.json({
      success: true,
      data: { redemptions, hasMore, total },
    });
  } catch (error) {
    apiConsole.error("[UserPointRedemptions] 查询失败:", error);
    return internalError();
  }
}

/** 兑换物流轨迹（仅本人；未录入运单号 400 NO_WAYBILL；丰桥未配置 supported=false） */
export async function getRedemptionTrackingResponse(
  userId: string,
  redemptionId: string
): Promise<NextResponse> {
  try {
    if (!validateCUID(redemptionId)) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_ID", message: "非法 ID 格式" } },
        { status: 400 }
      );
    }

    const redemption = await prisma.pointRedemption.findUnique({
      where: { id: redemptionId },
      select: { userId: true, carrier: true, waybillNo: true },
    });
    if (!redemption || redemption.userId !== userId) {
      // 越权查询统一 404，不泄露记录存在性
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "兑换记录不存在" } },
        { status: 404 }
      );
    }

    if (!redemption.waybillNo) {
      return NextResponse.json(
        { success: false, error: { code: "NO_WAYBILL", message: "暂无运单号" } },
        { status: 400 }
      );
    }

    const result = await querySfRoutes(redemption.waybillNo);

    if (!result.ok) {
      if (result.reason === "NOT_CONFIGURED") {
        return NextResponse.json({
          success: true,
          data: {
            waybillNo: redemption.waybillNo,
            carrier: redemption.carrier,
            supported: false,
            routes: null,
            error: null,
          },
        });
      }
      return NextResponse.json({
        success: true,
        data: {
          waybillNo: redemption.waybillNo,
          carrier: redemption.carrier,
          supported: true,
          routes: null,
          error: result.message ?? "轨迹查询失败",
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        waybillNo: redemption.waybillNo,
        carrier: redemption.carrier,
        supported: true,
        routes: result.routes,
        error: null,
      },
    });
  } catch (error) {
    apiConsole.error("[UserPointTracking] 轨迹查询失败:", error);
    return internalError();
  }
}

// ============================================
// 收货地址簿
// ============================================

export async function getAddressesResponse(userId: string): Promise<NextResponse> {
  try {
    const addresses = await prisma.userAddress.findMany({
      where: { userId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    });
    return NextResponse.json({
      success: true,
      data: { addresses: addresses.map(toAddressView) },
    });
  } catch (error) {
    apiConsole.error("[UserAddress] 查询失败:", error);
    return internalError();
  }
}

/** 新增地址（第一条自动默认；isDefault=true 取消其他默认；上限 MAX_ADDRESSES） */
export async function createAddressResponse(userId: string, request: Request): Promise<NextResponse> {
  try {
    const parsed = addressFieldsSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return invalidParams(parsed.error.issues[0]?.message || "参数错误");
    }

    const { recipient, phone, region, detail, isDefault } = parsed.data;

    const count = await prisma.userAddress.count({ where: { userId } });
    if (count >= MAX_ADDRESSES) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "ADDRESS_LIMIT", message: `最多保存 ${MAX_ADDRESSES} 个收货地址` },
        },
        { status: 400 }
      );
    }

    const makeDefault = isDefault === true || count === 0;

    const address = await prisma.$transaction(async (tx) => {
      if (makeDefault) {
        await tx.userAddress.updateMany({
          where: { userId, isDefault: true },
          data: { isDefault: false },
        });
      }
      return tx.userAddress.create({
        data: { userId, recipient, phone, region, detail, isDefault: makeDefault },
      });
    });

    return NextResponse.json({ success: true, data: { address: toAddressView(address) } });
  } catch (error) {
    apiConsole.error("[UserAddress] 新增失败:", error);
    return internalError();
  }
}

/** 编辑地址（越权 404；原默认被显式取消时自动顺延一条默认） */
export async function updateAddressResponse(
  userId: string,
  id: string,
  request: Request
): Promise<NextResponse> {
  try {
    if (!validateCUID(id)) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_ID", message: "非法 ID 格式" } },
        { status: 400 }
      );
    }

    const parsed = addressFieldsSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return invalidParams(parsed.error.issues[0]?.message || "参数错误");
    }

    const { recipient, phone, region, detail, isDefault } = parsed.data;

    const existing = await prisma.userAddress.findUnique({
      where: { id },
      select: { userId: true, isDefault: true },
    });
    if (!existing || existing.userId !== userId) {
      // 越权查询统一 404，不泄露地址存在性
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "收货地址不存在" } },
        { status: 404 }
      );
    }

    const address = await prisma.$transaction(async (tx) => {
      if (isDefault === true) {
        await tx.userAddress.updateMany({
          where: { userId, isDefault: true, id: { not: id } },
          data: { isDefault: false },
        });
      }
      const updated = await tx.userAddress.update({
        where: { id },
        data: {
          recipient,
          phone,
          region,
          detail,
          // 未显式传 isDefault 时保留原值；显式 false 表示取消默认
          isDefault: isDefault === undefined ? undefined : isDefault,
        },
      });
      if (existing.isDefault && isDefault === false) {
        const earliest = await tx.userAddress.findFirst({
          where: { userId, id: { not: id } },
          orderBy: { createdAt: "asc" },
          select: { id: true },
        });
        if (earliest) {
          await tx.userAddress.update({ where: { id: earliest.id }, data: { isDefault: true } });
        }
      }
      return updated;
    });

    return NextResponse.json({ success: true, data: { address: toAddressView(address) } });
  } catch (error) {
    apiConsole.error("[UserAddress] 编辑失败:", error);
    return internalError();
  }
}

/** 删除地址（越权 404；删除默认地址后自动顺延一条默认） */
export async function deleteAddressResponse(userId: string, id: string): Promise<NextResponse> {
  try {
    if (!validateCUID(id)) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_ID", message: "非法 ID 格式" } },
        { status: 400 }
      );
    }

    const existing = await prisma.userAddress.findUnique({
      where: { id },
      select: { userId: true, isDefault: true },
    });
    if (!existing || existing.userId !== userId) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "收货地址不存在" } },
        { status: 404 }
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.userAddress.delete({ where: { id } });
      if (existing.isDefault) {
        const earliest = await tx.userAddress.findFirst({
          where: { userId },
          orderBy: { createdAt: "asc" },
          select: { id: true },
        });
        if (earliest) {
          await tx.userAddress.update({ where: { id: earliest.id }, data: { isDefault: true } });
        }
      }
    });

    return NextResponse.json({ success: true, data: {} });
  } catch (error) {
    apiConsole.error("[UserAddress] 删除失败:", error);
    return internalError();
  }
}
