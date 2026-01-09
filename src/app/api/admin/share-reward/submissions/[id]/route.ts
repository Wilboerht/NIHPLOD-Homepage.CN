import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { z } from "zod";

/**
 * 更新提交 Schema
 */
const UpdateSubmissionSchema = z.object({
    status: z.enum(["pending", "approved", "rejected"]).optional(),
    rejectReason: z.string().optional(),
    shippingStatus: z.enum(["none", "contacted", "shipped"]).optional(),
});

interface RouteParams {
    params: Promise<{ id: string }>;
}

/**
 * GET /api/admin/share-reward/submissions/[id]
 * 获取单个提交详情
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
    try {
        const { id } = await params;

        const submission = await prisma.shareRewardSubmission.findUnique({
            where: { id },
            include: {
                campaign: true,
            },
        });

        if (!submission) {
            return NextResponse.json(
                { success: false, error: "提交记录不存在" },
                { status: 404 }
            );
        }

        return NextResponse.json({
            success: true,
            data: submission,
        });
    } catch (error) {
        console.error("获取提交详情失败:", error);
        return NextResponse.json(
            { success: false, error: "获取提交详情失败" },
            { status: 500 }
        );
    }
}

/**
 * PUT /api/admin/share-reward/submissions/[id]
 * 更新审核状态/发货状态
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
    try {
        const { id } = await params;
        const body = await request.json();
        const result = UpdateSubmissionSchema.safeParse(body);

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

        const updateData: {
            status?: string;
            rejectReason?: string;
            shippingStatus?: string;
            reviewedAt?: Date;
        } = { ...result.data };

        // 如果状态变更，记录审核时间
        if (result.data.status && result.data.status !== "pending") {
            updateData.reviewedAt = new Date();
        }

        const submission = await prisma.shareRewardSubmission.update({
            where: { id },
            data: updateData,
        });

        return NextResponse.json({
            success: true,
            data: submission,
        });
    } catch (error) {
        console.error("更新提交失败:", error);
        return NextResponse.json(
            { success: false, error: "更新提交失败" },
            { status: 500 }
        );
    }
}
