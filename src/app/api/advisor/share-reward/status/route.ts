import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/advisor/share-reward/status
 * 查询用户的提交状态
 */
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const campaignId = searchParams.get("campaignId");
        const contact = searchParams.get("contact");

        if (!campaignId || !contact) {
            return NextResponse.json(
                { success: false, error: "参数不完整" },
                { status: 400 }
            );
        }

        const submission = await prisma.shareRewardSubmission.findFirst({
            where: {
                campaignId,
                contact,
            },
            select: {
                id: true,
                status: true,
                rejectReason: true,
                shippingStatus: true,
                createdAt: true,
            },
        });

        return NextResponse.json({
            success: true,
            data: submission,
        });
    } catch (error) {
        console.error("获取状态失败:", error);
        return NextResponse.json(
            { success: false, error: "系统繁忙" },
            { status: 500 }
        );
    }
}
