import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

/**
 * GET /api/admin/share-reward/submissions
 * 获取提交列表（支持筛选）
 */
// 强制动态渲染，禁止静态预渲染
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const campaignId = searchParams.get("campaignId");
        const status = searchParams.get("status");
        const page = parseInt(searchParams.get("page") || "1");
        const pageSize = parseInt(searchParams.get("pageSize") || "20");

        // 构建查询条件
        const where: {
            campaignId?: string;
            status?: string;
        } = {};

        if (campaignId) {
            where.campaignId = campaignId;
        }
        if (status) {
            where.status = status;
        }

        // 获取总数
        const total = await prisma.shareRewardSubmission.count({ where });

        // 获取列表
        const submissions = await prisma.shareRewardSubmission.findMany({
            where,
            orderBy: { createdAt: "desc" },
            skip: (page - 1) * pageSize,
            take: pageSize,
            include: {
                campaign: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
            },
        });

        return NextResponse.json({
            success: true,
            data: submissions,
            pagination: {
                page,
                pageSize,
                total,
                totalPages: Math.ceil(total / pageSize),
            },
        });
    } catch (error) {
        console.error("获取提交列表失败:", error);
        return NextResponse.json(
            { success: false, error: "获取提交列表失败" },
            { status: 500 }
        );
    }
}
