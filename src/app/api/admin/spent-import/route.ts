/**
 * 消费记录 Excel 批量导入 API（管理端）
 * GET /api/admin/spent-import - 导入批次历史列表（分页）
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { apiConsole } from "@/lib/logger";

const querySchema = z.object({
  page: z.preprocess((val) => (val ? Number(val) : 1), z.number().min(1)),
  pageSize: z.preprocess((val) => (val ? Number(val) : 20), z.number().min(1).max(100)),
});

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权" } },
        { status: 401 }
      );
    }

    const rateLimitResponse = await checkAdminRateLimit(request, "spent-import:read");
    if (rateLimitResponse) return rateLimitResponse;

    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({
      page: searchParams.get("page"),
      pageSize: searchParams.get("pageSize"),
    });
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_PARAMS", message: "参数错误" } },
        { status: 400 }
      );
    }

    const { page, pageSize } = parsed.data;

    const [batches, total] = await Promise.all([
      prisma.spentImportBatch.findMany({
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          fileName: true,
          totalRows: true,
          successRows: true,
          duplicateRows: true,
          errorRows: true,
          totalAmount: true,
          undoneAt: true,
          createdAt: true,
          admin: { select: { name: true } },
        },
      }),
      prisma.spentImportBatch.count(),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        batches: batches.map((b) => ({
          ...b,
          adminName: b.admin.name,
          createdAt: b.createdAt.toISOString(),
          undoneAt: b.undoneAt?.toISOString() ?? null,
        })),
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      },
    });
  } catch (error) {
    apiConsole.error("[AdminSpentImport] 查询导入历史失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}
