
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAuth } from "@/lib/auth"; // Admin auth
import { z } from "zod";
import { logError } from "@/lib/logger";

const createSchema = z.object({
    name: z.string().min(1),
    type: z.enum(["DISCOUNT_AMOUNT", "DISCOUNT_PERCENT"]),
    value: z.number().positive(),
    minAmount: z.number().default(0),
    daysValid: z.number().optional(), // 相对有效期
    startDate: z.string().optional(), // 绝对有效期 (ISO string)
    endDate: z.string().optional(),
    totalLimit: z.number().optional().nullable(),
    userLimit: z.number().default(1),
    code: z.string().optional().nullable(),
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
        const message = e instanceof Error ? e.message : String(e);
        return NextResponse.json({ success: false, error: message }, { status: 400 });
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
        const message = e instanceof Error ? e.message : String(e);
        return NextResponse.json({ success: false, error: message || "Failed" }, { status: 500 });
    }
}
