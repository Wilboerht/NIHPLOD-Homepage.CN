import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { z } from "zod";

const SubmitSchema = z.object({
    campaignId: z.string().min(1),
    contact: z.string().min(5, "请输入有效的联系方式"),
    shareProofUrl: z.string().url("分享凭证无效"),
    purchaseProofUrl: z.string().url("购买凭证无效"),
    skinScore: z.number().optional(),
    percentile: z.number().optional(),
});

/**
 * POST /api/advisor/share-reward/submit
 * 提交凭证
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const result = SubmitSchema.safeParse(body);

        if (!result.success) {
            return NextResponse.json(
                {
                    success: false,
                    error: result.error.issues?.[0]?.message || "参数错误"
                },
                { status: 400 }
            );
        }

        const { campaignId, contact } = result.data;

        // 检查活动是否有效
        const campaign = await prisma.shareRewardCampaign.findUnique({
            where: { id: campaignId },
        });

        if (!campaign || !campaign.isActive) {
            return NextResponse.json(
                { success: false, error: "活动已结束" },
                { status: 400 }
            );
        }

        // 检查是否重复提交
        const existing = await prisma.shareRewardSubmission.findFirst({
            where: { campaignId, contact },
        });

        if (existing) {
            if (existing.status === "rejected") {
                // 如果被拒绝，允许重新提交
                // 但为了简单和记录，我们更新原记录或提示联系客服?
                // 这里的逻辑：需求说"每期活动只能参与一次"，通常意味着如果被拒了可能就结束了，
                // 或者允许重新提交。这里我们允许用户更新已拒绝的提交。

                await prisma.shareRewardSubmission.update({
                    where: { id: existing.id },
                    data: {
                        shareProofUrl: result.data.shareProofUrl,
                        purchaseProofUrl: result.data.purchaseProofUrl,
                        status: "pending", // 重置为待审核
                        rejectReason: null,
                        reviewedAt: null,
                    }
                });

                return NextResponse.json({
                    success: true,
                    message: "已重新提交审核",
                });
            }

            return NextResponse.json(
                { success: false, error: "您已提交过申请，请勿重复提交" },
                { status: 400 }
            );
        }

        // 创建新提交
        await prisma.shareRewardSubmission.create({
            data: result.data,
        });

        return NextResponse.json({
            success: true,
            message: "提交成功",
        });
    } catch (error) {
        console.error("提交失败:", error);
        return NextResponse.json(
            { success: false, error: "提交失败，请重试" },
            { status: 500 }
        );
    }
}
