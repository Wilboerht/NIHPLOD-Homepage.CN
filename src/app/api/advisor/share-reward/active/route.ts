import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/advisor/share-reward/active
 * 获取当前进行中的活动
 */
export async function GET() {
    try {
        const now = new Date();

        const campaign = await prisma.shareRewardCampaign.findFirst({
            where: {
                isActive: true,
                startDate: { lte: now },
                endDate: { gte: now },
            },
            select: {
                id: true,
                name: true,
                description: true,
                startDate: true,
                endDate: true,
                purchaseStartDate: true,
                purchaseEndDate: true,
                rewardType: true,
                rewardDescription: true,
            },
        });

        if (!campaign) {
            return NextResponse.json({
                success: true,
                data: null,
            });
        }

        return NextResponse.json({
            success: true,
            data: campaign,
        });
    } catch (error) {
        console.error("获取活动失败:", error);
        return NextResponse.json(
            { success: false, error: "系统繁忙" },
            { status: 500 }
        );
    }
}
