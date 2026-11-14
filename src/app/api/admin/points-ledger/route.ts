import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { maskPhone } from "@/lib/mask-phone";
import { parseAdminDateRange } from "@/lib/admin-list-date-range";
import { adminPageSchema, adminPageSizeSchema } from "@/lib/validation";
import { apiConsole } from "@/lib/logger";
import { POINT_LEDGER_SOURCE_LABELS, POINT_LEDGER_TYPE_LABELS } from "@/lib/point-meta";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  page: adminPageSchema,
  pageSize: adminPageSizeSchema,
  search: z.string().max(100).optional(),
  type: z
    .enum([
      "CONSUME",
      "REFUND",
      "BIRTHDAY",
      "CHECKIN",
      "REDEEM",
      "REDEEM_REFUND",
      "EXPIRE",
      "ADJUST",
    ])
    .optional(),
  reference: z.string().max(120).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

const NO_STORE = { "Cache-Control": "no-store, private" } as const;

/** GET /api/admin/points-ledger - 全局积分流水（财务只读） */
export async function GET(request: NextRequest) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权" } },
        { status: 401, headers: NO_STORE }
      );
    }
    if (!hasAdminPermission(admin, "points:read")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "权限不足：积分流水查看" } },
        { status: 403, headers: NO_STORE }
      );
    }
    const limited = await checkAdminRateLimit(request, "admin-read", admin.id);
    if (limited) return limited;

    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({
      page: searchParams.get("page"),
      pageSize: searchParams.get("pageSize"),
      search: searchParams.get("search")?.trim() || undefined,
      type: searchParams.get("type") || undefined,
      reference: searchParams.get("reference")?.trim() || undefined,
      dateFrom: searchParams.get("dateFrom") || undefined,
      dateTo: searchParams.get("dateTo") || undefined,
    });
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_PARAMS", message: "参数错误" } },
        { status: 400, headers: NO_STORE }
      );
    }
    const range = parseAdminDateRange(parsed.data.dateFrom, parsed.data.dateTo);
    if (!range.ok) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_DATE", message: range.message } },
        { status: 400, headers: NO_STORE }
      );
    }

    const { page, pageSize, search, type, reference } = parsed.data;
    const where: Prisma.PointLedgerWhereInput = {};
    if (search) {
      where.user = {
        OR: [
          { id: { equals: search } },
          { phone: { equals: search } },
          { nickname: { contains: search, mode: "insensitive" } },
        ],
      };
    }
    if (type) where.type = type;
    if (reference) where.reference = { contains: reference, mode: "insensitive" };
    if (range.from || range.to) {
      where.createdAt = {
        ...(range.from ? { gte: range.from } : {}),
        ...(range.to ? { lte: range.to } : {}),
      };
    }

    const now = new Date();
    const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const in30d = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const [items, total, availableAgg, issuedAgg, consumedAgg, expiringAgg] = await Promise.all([
      prisma.pointLedger.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        select: {
          id: true,
          type: true,
          source: true,
          amount: true,
          remaining: true,
          reference: true,
          note: true,
          expiresAt: true,
          createdAt: true,
          user: { select: { id: true, nickname: true, phone: true } },
        },
      }),
      prisma.pointLedger.count({ where }),
      prisma.pointBalance.aggregate({ _sum: { available: true } }),
      prisma.pointLedger.aggregate({
        _sum: { amount: true },
        where: { amount: { gt: 0 }, createdAt: { gte: last7d } },
      }),
      prisma.pointLedger.aggregate({
        _sum: { amount: true },
        where: { amount: { lt: 0 }, createdAt: { gte: last7d } },
      }),
      prisma.pointLedger.aggregate({
        _sum: { remaining: true },
        where: {
          remaining: { gt: 0 },
          expiresAt: { gt: now, lte: in30d },
        },
      }),
    ]);

    return NextResponse.json(
      {
        success: true,
        data: {
          items: items.map((item) => ({
            ...item,
            typeLabel: POINT_LEDGER_TYPE_LABELS[item.type] ?? item.type,
            sourceLabel: POINT_LEDGER_SOURCE_LABELS[item.source] ?? item.source,
            expiresAt: item.expiresAt?.toISOString() ?? null,
            createdAt: item.createdAt.toISOString(),
            user: { ...item.user, phone: maskPhone(item.user.phone) },
          })),
          summary: {
            available: availableAgg._sum.available ?? 0,
            issuedLast7Days: issuedAgg._sum.amount ?? 0,
            consumedLast7Days: Math.abs(consumedAgg._sum.amount ?? 0),
            expiringIn30Days: expiringAgg._sum.remaining ?? 0,
          },
          pagination: {
            page,
            pageSize,
            total,
            totalPages: Math.ceil(total / pageSize),
          },
        },
      },
      { headers: NO_STORE }
    );
  } catch (error) {
    apiConsole.error("[AdminPointsLedger] 查询失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500, headers: NO_STORE }
    );
  }
}
