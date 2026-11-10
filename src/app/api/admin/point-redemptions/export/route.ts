import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { createAuditLogStrict } from "@/lib/audit";
import { maskPhone } from "@/lib/mask-phone";
import { escapeCSV } from "@/lib/csv";
import { apiConsole } from "@/lib/logger";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  status: z
    .enum([
      "PENDING",
      "FULFILLED",
      "COMPLETED",
      "AFTER_SALES_REQUESTED",
      "AFTER_SALES_APPROVED",
      "AFTER_SALES_REJECTED",
      "RETURNING",
      "RETURNED",
      "REFUNDED",
      "AFTER_SALES_CLOSED",
      "CANCELLED",
    ])
    .optional(),
  search: z.string().max(100).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED" } },
        { status: 401 }
      );
    }
    if (!hasAdminPermission(admin, "redemptions:read")) {
      return NextResponse.json({ success: false, error: { code: "FORBIDDEN" } }, { status: 403 });
    }
    const limited = await checkAdminRateLimit(request, "point-redemptions:export", admin.id);
    if (limited) return limited;
    const parsed = querySchema.safeParse({
      status: request.nextUrl.searchParams.get("status") || undefined,
      search: request.nextUrl.searchParams.get("search")?.trim() || undefined,
    });
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_PARAMS" } },
        { status: 400 }
      );
    }

    const where: Prisma.PointRedemptionWhereInput = parsed.data.status
      ? { status: parsed.data.status }
      : {};
    if (parsed.data.search) {
      where.OR = [
        { productName: { contains: parsed.data.search, mode: "insensitive" } },
        { user: { phone: { equals: parsed.data.search } } },
        { user: { nickname: { contains: parsed.data.search, mode: "insensitive" } } },
      ];
    }
    const rows = await prisma.pointRedemption.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: 5000,
      select: {
        id: true,
        productName: true,
        priceYuan: true,
        points: true,
        status: true,
        level: true,
        redeemRate: true,
        clientId: true,
        waybillNo: true,
        refundedPoints: true,
        createdAt: true,
        fulfilledAt: true,
        completedAt: true,
        cancelledAt: true,
        refundedAt: true,
        user: { select: { id: true, nickname: true, phone: true } },
      },
    });

    await createAuditLogStrict({
      action: "point_redemption_export",
      targetType: "point_redemption",
      detail: { filters: parsed.data, count: rows.length, pii: "masked" },
      adminId: admin.id,
      actorType: "ADMIN",
      actorEmail: admin.email,
      actorName: admin.name,
      actorRole: admin.role,
      request,
    });

    const header = [
      "兑换单号",
      "用户ID",
      "用户昵称",
      "脱敏手机号",
      "礼品",
      "参考金额",
      "兑换积分",
      "等级",
      "兑礼率",
      "来源客户端",
      "状态",
      "运单号",
      "已退积分",
      "创建时间",
      "履约时间",
      "完成时间",
      "取消时间",
      "退款时间",
    ];
    const lines = rows.map((row) =>
      [
        row.id,
        row.user.id,
        row.user.nickname ?? "",
        maskPhone(row.user.phone),
        row.productName,
        String(row.priceYuan),
        String(row.points),
        row.level ?? "",
        row.redeemRate === null ? "" : String(row.redeemRate),
        row.clientId ?? "",
        row.status,
        row.waybillNo ?? "",
        String(row.refundedPoints),
        row.createdAt.toISOString(),
        row.fulfilledAt?.toISOString() ?? "",
        row.completedAt?.toISOString() ?? "",
        row.cancelledAt?.toISOString() ?? "",
        row.refundedAt?.toISOString() ?? "",
      ]
        .map(escapeCSV)
        .join(",")
    );
    return new NextResponse(`\uFEFF${header.map(escapeCSV).join(",")}\n${lines.join("\n")}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="point-redemptions.csv"',
        "Cache-Control": "no-store, private",
      },
    });
  } catch (error) {
    apiConsole.error("[AdminPointRedemptionExport] 导出失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR" } },
      { status: 500 }
    );
  }
}
