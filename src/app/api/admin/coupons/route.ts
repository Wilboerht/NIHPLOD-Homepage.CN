import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { z } from "zod";
import { logError } from "@/lib/logger";
import { createAuditLog } from "@/lib/audit";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";

const createSchema = z
  .object({
    name: z.string().min(1, "优惠券名称不能为空").max(50, "名称不能超过50个字符"),
    type: z.enum(["DISCOUNT_AMOUNT", "DISCOUNT_PERCENT"]),
    value: z.number().positive("优惠值必须为正数"),
    minAmount: z.number().min(0).default(0),
    daysValid: z.number().int().positive().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    totalLimit: z.number().int().positive().nullable().optional(),
    userLimit: z.number().int().positive().default(1),
    code: z.string().optional().nullable(),
    scopeType: z.enum(["ALL", "CATEGORY", "PRODUCT"]).default("ALL"),
    scopeIds: z.array(z.string()).default([]),
  })
  .superRefine((data, ctx) => {
    // ✅ 规则1：折扣比例强制在 (0, 1) 区间——例如 0.8 = 八折，0.9 = 九折
    if (data.type === "DISCOUNT_PERCENT" && (data.value <= 0 || data.value >= 1)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["value"],
        message: "折扣比例必须在 0 到 1 之间（例如 0.8 = 八折，0.9 = 九折）",
      });
    }
    // ✅ 规则2：有效期必须配置至少一种，防止创建永久有效的无限制券
    if (!data.endDate && !data.daysValid) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["daysValid"],
        message: "必须设置 endDate（截止日期）或 daysValid（领取后有效天数）中的至少一项",
      });
    }
  });

// 强制动态渲染，禁止静态预渲染
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const admin = await verifyAuth(req);
    if (!admin)
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权访问" } },
        { status: 401 }
      );

    if (!validateCSRFToken(req)) {
      return csrfForbiddenResponse();
    }

    // 资金/权益操作：仅超级管理员可创建优惠券
    if (admin.role !== "owner")
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "仅超级管理员可创建优惠券" } },
        { status: 403 }
      );

    const rateLimitResponse = await checkAdminRateLimit(req);
    if (rateLimitResponse) return rateLimitResponse;

    const body = await req.json();

    // 批量上下架：{ batch: { ids, isActive } }
    if (body && body.batch && Array.isArray(body.batch.ids)) {
      // 批量操作同样需要超级管理员权限
      if (admin.role !== "owner")
        return NextResponse.json(
          { success: false, error: { code: "FORBIDDEN", message: "仅超级管理员可操作优惠券" } },
          { status: 403 }
        );
      const { ids, isActive } = body.batch;
      if (ids.length === 0 || typeof isActive !== "boolean") {
        return NextResponse.json(
          { success: false, error: { code: "INVALID_PARAMS", message: "参数错误" } },
          { status: 400 }
        );
      }
      const result = await prisma.coupon.updateMany({
        where: { id: { in: ids } },
        data: { isActive },
      });
      await createAuditLog({
        action: "batch_coupon",
        targetType: "coupon",
        targetId: ids[0],
        detail: { ids, isActive, count: result.count },
        adminId: admin.id,
        request: req,
      });
      return NextResponse.json({ success: true, data: { updated: result.count } });
    }

    const data = createSchema.parse(body);

    const coupon = await prisma.coupon.create({
      data: {
        name: data.name,
        type: data.type,
        value: data.value,
        minAmount: data.minAmount,
        daysValid: data.daysValid,
        startDate: data.startDate ? new Date(data.startDate) : null,
        endDate: data.endDate ? new Date(data.endDate) : null,
        totalLimit: data.totalLimit,
        userLimit: data.userLimit,
        code: data.code,
        scopeType: data.scopeType,
        scopeIds: data.scopeIds,
      },
    });

    // 记录审计日志
    await createAuditLog({
      action: "create_coupon",
      targetType: "coupon",
      targetId: coupon.id,
      detail: { name: data.name, type: data.type, value: data.value },
      adminId: admin.id,
      request: req,
    });

    return NextResponse.json({ success: true, data: coupon });
  } catch (e: unknown) {
    logError("AdminCoupons", e, { action: "create" });
    if (e instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "VALIDATION_ERROR", message: "参数错误", details: e.issues },
        },
        { status: 400 }
      );
    }
    // Prisma P2002: Unique constraint failed on code
    const isDuplicateCode =
      e && typeof e === "object" && "code" in e && (e as { code?: string }).code === "P2002";
    if (isDuplicateCode) {
      return NextResponse.json(
        { success: false, error: { code: "DUPLICATE_CODE", message: "兑换码已存在，请更换" } },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { success: false, error: { code: "CREATE_FAILED", message: "创建失败" } },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const admin = await verifyAuth(req);
    if (!admin)
      return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED", message: "未授权" } }, { status: 401 });

    const rateLimitResponse = await checkAdminRateLimit(req, "admin-read");
    if (rateLimitResponse) return rateLimitResponse;

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") || "20", 10)));
    const isExport = searchParams.get("export") === "csv";

    const [coupons, total] = await Promise.all([
      prisma.coupon.findMany({
        include: {
          _count: {
            select: {
              userCoupons: true,
            },
          },
          userCoupons: {
            where: { status: "USED" },
            select: { id: true },
          },
        },
        // scopeIds 是数组，直接包含在查询结果中
        orderBy: { createdAt: "desc" },
        skip: isExport ? undefined : (page - 1) * pageSize,
        take: isExport ? 10000 : pageSize,
      }),
      prisma.coupon.count(),
    ]);

    // CSV 导出
    if (isExport) {
      const escapeCSV = (val: string): string => {
        const sanitized = /^[=+\-@]/.test(val) ? `'${val}` : val;
        if (/[",\n\r]/.test(sanitized)) {
          return `"${sanitized.replace(/"/g, '""')}"`;
        }
        return sanitized;
      };

      const csvHeaders = "名称,兑换码,类型,面值,门槛,总发行,已发放,已使用,有效期至,状态\n";
      const csvRows = coupons
        .map((c) => {
          const typeLabel = c.type === "DISCOUNT_AMOUNT" ? "满减" : "折扣";
          const valueText =
            c.type === "DISCOUNT_AMOUNT"
              ? `¥${c.value}`
              : `${(Number(c.value) * 10).toFixed(1)}折`;
          return [
            escapeCSV(c.name),
            escapeCSV(c.code || ""),
            typeLabel,
            valueText,
            Number(c.minAmount).toFixed(2),
            c.totalLimit !== null ? c.totalLimit : "不限",
            c._count.userCoupons,
            c.userCoupons.length,
            c.endDate ? new Date(c.endDate).toISOString().slice(0, 10) : "领取后N天",
            c.isActive ? "上架" : "下架",
          ].join(",");
        })
        .join("\n");

      return new NextResponse(csvHeaders + csvRows, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="coupons-${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        coupons,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      },
    });
  } catch (e: unknown) {
    logError("AdminCoupons", e, { action: "list" });
    return NextResponse.json(
      { success: false, error: { code: "LIST_FAILED", message: "获取列表失败" } },
      { status: 500 }
    );
  }
}
