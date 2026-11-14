import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { maskPhone } from "@/lib/mask-phone";
import { parseAdminDateRange } from "@/lib/admin-list-date-range";
import { escapeCSV } from "@/lib/csv";
import { createAuditLogStrict } from "@/lib/audit";
import { apiConsole } from "@/lib/logger";
import { POINT_LEDGER_SOURCE_LABELS, POINT_LEDGER_TYPE_LABELS } from "@/lib/point-meta";

export const dynamic = "force-dynamic";

const querySchema = z.object({
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

/** GET /api/admin/points-ledger/export - 全局积分流水 CSV（脱敏） */
export async function GET(request: NextRequest) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });
    }
    if (!hasAdminPermission(admin, "points:read")) {
      return NextResponse.json({ success: false, error: { code: "FORBIDDEN" } }, { status: 403 });
    }
    const limited = await checkAdminRateLimit(request, "admin-read", admin.id);
    if (limited) return limited;

    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({
      search: searchParams.get("search")?.trim() || undefined,
      type: searchParams.get("type") || undefined,
      reference: searchParams.get("reference")?.trim() || undefined,
      dateFrom: searchParams.get("dateFrom") || undefined,
      dateTo: searchParams.get("dateTo") || undefined,
    });
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_PARAMS" } },
        { status: 400 }
      );
    }
    const range = parseAdminDateRange(parsed.data.dateFrom, parsed.data.dateTo);
    if (!range.ok) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_DATE", message: range.message } },
        { status: 400 }
      );
    }

    const where: Prisma.PointLedgerWhereInput = {};
    if (parsed.data.search) {
      where.user = {
        OR: [
          { id: { equals: parsed.data.search } },
          { phone: { equals: parsed.data.search } },
          { nickname: { contains: parsed.data.search, mode: "insensitive" } },
        ],
      };
    }
    if (parsed.data.type) where.type = parsed.data.type;
    if (parsed.data.reference) {
      where.reference = { contains: parsed.data.reference, mode: "insensitive" };
    }
    if (range.from || range.to) {
      where.createdAt = {
        ...(range.from ? { gte: range.from } : {}),
        ...(range.to ? { lte: range.to } : {}),
      };
    }

    const rows = await prisma.pointLedger.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: 5000,
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
    });

    await createAuditLogStrict({
      action: "points_ledger_export",
      targetType: "point_ledger",
      detail: { filters: parsed.data, count: rows.length, pii: "masked" },
      adminId: admin.id,
      actorType: "ADMIN",
      actorEmail: admin.email,
      actorName: admin.name,
      actorRole: admin.role,
      request,
    });

    const header = [
      "流水ID",
      "用户ID",
      "用户昵称",
      "脱敏手机号",
      "类型",
      "来源",
      "分值",
      "剩余",
      "reference",
      "备注",
      "过期时间",
      "创建时间",
    ];
    const lines = rows.map((row) =>
      [
        row.id,
        row.user.id,
        row.user.nickname ?? "",
        maskPhone(row.user.phone),
        POINT_LEDGER_TYPE_LABELS[row.type] ?? row.type,
        POINT_LEDGER_SOURCE_LABELS[row.source] ?? row.source,
        String(row.amount),
        row.remaining === null ? "" : String(row.remaining),
        row.reference,
        row.note ?? "",
        row.expiresAt?.toISOString() ?? "",
        row.createdAt.toISOString(),
      ]
        .map(escapeCSV)
        .join(",")
    );
    return new NextResponse(`\uFEFF${header.map(escapeCSV).join(",")}\n${lines.join("\n")}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="points-ledger.csv"',
        "Cache-Control": "no-store, private",
      },
    });
  } catch (error) {
    apiConsole.error("[AdminPointsLedgerExport] 导出失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR" } },
      { status: 500 }
    );
  }
}
