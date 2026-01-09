import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { z } from "zod";

/**
 * 活动更新 Schema
 */
const UpdateCampaignSchema = z.object({
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    startDate: z.string().transform((s) => new Date(s)).optional(),
    endDate: z.string().transform((s) => new Date(s)).optional(),
    purchaseStartDate: z.string().transform((s) => new Date(s)).optional(),
    purchaseEndDate: z.string().transform((s) => new Date(s)).optional(),
    rewardType: z.enum(["coupon", "sample"]).optional(),
    rewardDescription: z.string().optional(),
    posterTemplate: z.string().optional().nullable(),
    posterConfig: z.any().optional(),
    isActive: z.boolean().optional(),
});

interface RouteParams {
    params: Promise<{ id: string }>;
}

/**
 * GET /api/admin/share-reward/campaigns/[id]
 * 获取单个活动
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
    try {
        const { id } = await params;

        const campaign = await prisma.shareRewardCampaign.findUnique({
            where: { id },
            include: {
                _count: {
                    select: { submissions: true },
                },
            },
        });

        if (!campaign) {
            return NextResponse.json(
                { success: false, error: "活动不存在" },
                { status: 404 }
            );
        }

        return NextResponse.json({
            success: true,
            data: campaign,
        });
    } catch (error) {
        console.error("获取活动失败:", error);
        return NextResponse.json(
            { success: false, error: "获取活动失败" },
            { status: 500 }
        );
    }
}

/**
 * PUT /api/admin/share-reward/campaigns/[id]
 * 更新活动
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
    try {
        const { id } = await params;
        const body = await request.json();
        const result = UpdateCampaignSchema.safeParse(body);

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

        const campaign = await prisma.shareRewardCampaign.update({
            where: { id },
            data: result.data,
        });

        return NextResponse.json({
            success: true,
            data: campaign,
        });
    } catch (error) {
        console.error("更新活动失败:", error);
        return NextResponse.json(
            { success: false, error: "更新活动失败" },
            { status: 500 }
        );
    }
}

/**
 * DELETE /api/admin/share-reward/campaigns/[id]
 * 删除活动
 */
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
    try {
        const { id } = await params;

        await prisma.shareRewardCampaign.delete({
            where: { id },
        });

        return NextResponse.json({
            success: true,
            message: "活动已删除",
        });
    } catch (error) {
        console.error("删除活动失败:", error);
        return NextResponse.json(
            { success: false, error: "删除活动失败" },
            { status: 500 }
        );
    }
}
