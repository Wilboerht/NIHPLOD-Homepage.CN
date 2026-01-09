import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { z } from "zod";

/**
 * 活动创建/更新 Schema
 */
const CampaignSchema = z.object({
    name: z.string().min(1, "活动名称不能为空"),
    description: z.string().optional(),
    startDate: z.string().transform((s) => new Date(s)),
    endDate: z.string().transform((s) => new Date(s)),
    purchaseStartDate: z.string().transform((s) => new Date(s)),
    purchaseEndDate: z.string().transform((s) => new Date(s)),
    rewardType: z.enum(["coupon", "sample"]),
    rewardDescription: z.string().min(1, "奖励描述不能为空"),
    posterTemplate: z.string().optional(),
    posterConfig: z.any().optional(),
    isActive: z.boolean().default(false),
});

/**
 * GET /api/admin/share-reward/campaigns
 * 获取活动列表
 */
export async function GET() {
    try {
        const campaigns = await prisma.shareRewardCampaign.findMany({
            orderBy: { createdAt: "desc" },
            include: {
                _count: {
                    select: { submissions: true },
                },
            },
        });

        return NextResponse.json({
            success: true,
            data: campaigns,
        });
    } catch (error) {
        console.error("获取活动列表失败:", error);
        return NextResponse.json(
            { success: false, error: "获取活动列表失败" },
            { status: 500 }
        );
    }
}

/**
 * POST /api/admin/share-reward/campaigns
 * 创建活动
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const result = CampaignSchema.safeParse(body);

        if (!result.success) {
            return NextResponse.json(
                {
                    success: false,
                    error: "参数错误",
                    details: result.error.flatten().fieldErrors
                },
                { status: 400 }
            );
        }

        const campaign = await prisma.shareRewardCampaign.create({
            data: result.data,
        });

        return NextResponse.json({
            success: true,
            data: campaign,
        });
    } catch (error) {
        console.error("创建活动失败:", error);
        return NextResponse.json(
            { success: false, error: "创建活动失败" },
            { status: 500 }
        );
    }
}
