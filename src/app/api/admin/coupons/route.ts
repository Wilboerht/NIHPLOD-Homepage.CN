
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyAuth } from "@/lib/auth"; // Admin auth
import { z } from "zod";
import { logError } from "@/lib/logger";

const createSchema = z.object({
    name: z.string().min(1, "优惠券名称不能为空"),
    type: z.enum(["DISCOUNT_AMOUNT", "DISCOUNT_PERCENT"]),
    value: z.number().positive("优惠值必须为正数"),
    minAmount: z.number().min(0).default(0),
    daysValid: z.number().int().positive().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    totalLimit: z.number().int().positive().nullable().optional(),
    userLimit: z.number().int().positive().default(1),
    code: z.string().optional().nullable(),
}).superRefine((data, ctx) => {
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
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    try {
        const admin = await verifyAuth(req);
        if (!admin) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

        const body = await req.json();
        const data = createSchema.parse(body);

        const coupon = await prisma.coupon.create({
            data: {
                ...data,
                startDate: data.startDate ? new Date(data.startDate) : null,
                endDate: data.endDate ? new Date(data.endDate) : null,
            },
        });

        return NextResponse.json({ success: true, data: coupon });
    } catch (e: unknown) {
        logError("AdminCoupons", e, { action: "create" });
        if (e instanceof z.ZodError) {
            return NextResponse.json(
                { success: false, error: { code: "VALIDATION_ERROR", message: "参数错误", details: e.issues } },
                { status: 400 }
            );
        }
        return NextResponse.json({ success: false, error: { code: "CREATE_FAILED", message: "创建失败" } }, { status: 500 });
    }
}

export async function GET(req: NextRequest) {
    try {
        const admin = await verifyAuth(req);
        if (!admin) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

        const coupons = await prisma.coupon.findMany({
            include: {
                _count: {
                    select: { userCoupons: true }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        return NextResponse.json({ success: true, data: coupons });
    } catch (e: unknown) {
        logError("AdminCoupons", e, { action: "list" });
        return NextResponse.json({ success: false, error: { code: "LIST_FAILED", message: "获取列表失败" } }, { status: 500 });
    }
}
