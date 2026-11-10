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
  status: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional(),
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
    if (!hasAdminPermission(admin, "spent:read")) {
      return NextResponse.json({ success: false, error: { code: "FORBIDDEN" } }, { status: 403 });
    }
    const limited = await checkAdminRateLimit(request, "spent-adjust:export", admin.id);
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

    const where: Prisma.SpentAdjustmentApplicationWhereInput = parsed.data.status
      ? { status: parsed.data.status }
      : {};
    if (parsed.data.search) {
      where.OR = [
        { orderNo: { contains: parsed.data.search, mode: "insensitive" } },
        { user: { phone: { equals: parsed.data.search } } },
        { user: { nickname: { contains: parsed.data.search, mode: "insensitive" } } },
      ];
    }
    const rows = await prisma.spentAdjustmentApplication.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: 5000,
      select: {
        id: true,
        channel: true,
        orderNo: true,
        dealerName: true,
        amountClaimed: true,
        purchasedAt: true,
        status: true,
        source: true,
        reviewAmount: true,
        reviewNote: true,
        reviewedAt: true,
        lastReviewAmount: true,
        undoReason: true,
        undoneAt: true,
        createdAt: true,
        user: { select: { id: true, nickname: true, phone: true } },
        reviewedBy: { select: { name: true, email: true } },
      },
    });

    await createAuditLogStrict({
      action: "spent_adjustment_export",
      targetType: "spent_adjustment",
      detail: { filters: parsed.data, count: rows.length, pii: "masked" },
      adminId: admin.id,
      actorType: "ADMIN",
      actorEmail: admin.email,
      actorName: admin.name,
      actorRole: admin.role,
      request,
    });

    const header = [
      "申请编号",
      "用户ID",
      "用户昵称",
      "脱敏手机号",
      "渠道",
      "订单号/小票号",
      "经销商",
      "申报金额",
      "消费日期",
      "状态",
      "来源",
      "核实金额",
      "审核备注",
      "审核人",
      "审核时间",
      "上次撤销前金额",
      "撤销原因",
      "撤销时间",
      "提交时间",
    ];
    const lines = rows.map((row) =>
      [
        row.id,
        row.user.id,
        row.user.nickname ?? "",
        maskPhone(row.user.phone),
        row.channel,
        row.orderNo,
        row.dealerName ?? "",
        row.amountClaimed === null ? "" : String(row.amountClaimed),
        row.purchasedAt?.toISOString().slice(0, 10) ?? "",
        row.status,
        row.source,
        row.reviewAmount === null ? "" : String(row.reviewAmount),
        row.reviewNote ?? "",
        row.reviewedBy ? `${row.reviewedBy.name}（${row.reviewedBy.email}）` : "",
        row.reviewedAt?.toISOString() ?? "",
        row.lastReviewAmount === null ? "" : String(row.lastReviewAmount),
        row.undoReason ?? "",
        row.undoneAt?.toISOString() ?? "",
        row.createdAt.toISOString(),
      ]
        .map(escapeCSV)
        .join(",")
    );
    return new NextResponse(`\uFEFF${header.map(escapeCSV).join(",")}\n${lines.join("\n")}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="spent-adjustments.csv"',
        "Cache-Control": "no-store, private",
      },
    });
  } catch (error) {
    apiConsole.error("[AdminSpentAdjustmentExport] 导出失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR" } },
      { status: 500 }
    );
  }
}
