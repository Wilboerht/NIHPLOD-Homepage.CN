/**
 * 管理端 - 抽奖参与记录 API
 * GET /api/admin/lottery/activities/[id]/entries - 获取参与记录列表
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyAuth } from "@/lib/auth";
import { decryptPhone, maskPhone } from "@/lib/lottery";

type Params = { params: Promise<{ id: string }> };

// GET - 获取参与记录列表
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权访问" } },
        { status: 401 }
      );
    }

    const { id: activityId } = await params;
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const pageSize = parseInt(searchParams.get("pageSize") || "50");
    const status = searchParams.get("status");
    const sortBy = searchParams.get("sortBy") || "createdAt";
    const sortOrder = searchParams.get("sortOrder") || "desc";

    // 构建查询条件
    const where: Record<string, unknown> = { activityId };
    if (status) where.status = status;

    // 构建排序
    const orderBy: Record<string, string> = {};
    if (sortBy === "riskScore") {
      orderBy.riskScore = sortOrder;
    } else {
      orderBy.createdAt = sortOrder;
    }

    const [entries, total] = await Promise.all([
      prisma.lotteryEntry.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.lotteryEntry.count({ where }),
    ]);

    // 处理敏感信息
    const processedEntries = entries.map((entry) => {
      let maskedPhoneDisplay = "***";
      try {
        const decrypted = decryptPhone(entry.phone);
        maskedPhoneDisplay = maskPhone(decrypted);
      } catch {
        // 解密失败，保持脱敏状态
      }

      return {
        id: entry.id,
        phone: maskedPhoneDisplay,
        drawingUrl: entry.drawingUrl,
        ip: entry.ip.replace(/\.\d+$/, ".*"), // IP 部分脱敏
        deviceId: entry.deviceId.slice(0, 8) + "...",
        riskScore: entry.riskScore,
        riskFactors: entry.riskFactors,
        status: entry.status,
        wonAt: entry.wonAt,
        wonRank: entry.wonRank,
        verifiedAt: entry.verifiedAt,
        createdAt: entry.createdAt,
      };
    });

    // 统计信息
    const stats = await prisma.lotteryEntry.groupBy({
      by: ["status"],
      where: { activityId },
      _count: true,
    });

    const statusCounts = stats.reduce((acc, s) => {
      acc[s.status] = s._count;
      return acc;
    }, {} as Record<string, number>);

    return NextResponse.json({
      success: true,
      data: {
        items: processedEntries,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
        stats: {
          total,
          pending: statusCounts.pending || 0,
          won: statusCounts.won || 0,
          verified: statusCounts.verified || 0,
          expired: statusCounts.expired || 0,
          invalid: statusCounts.invalid || 0,
        },
      },
    });
  } catch (error) {
    console.error("获取参与记录失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message: "获取失败" } },
      { status: 500 }
    );
  }
}

