/**
 * AI 队列状态 API
 * 
 * GET /api/advisor/queue-status
 * 返回当前 AI 请求队列的状态信息
 */

import { NextResponse } from "next/server";
import { aiQueue } from "@/lib/ai-queue";

// 强制动态渲染，禁止静态预渲染
export const dynamic = 'force-dynamic';

export async function GET() {
    const stats = aiQueue.getStats();

    return NextResponse.json({
        success: true,
        data: {
            ...stats,
            // 友好提示信息
            message: stats.isBusy
                ? `当前有 ${stats.queueLength} 位用户正在排队，预计等待 ${stats.estimatedWaitSeconds} 秒`
                : "服务畅通，无需等待",
        },
    });
}
