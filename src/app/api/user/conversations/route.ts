/**
 * 用户对话列表 API
 * GET /api/user/conversations - 获取对话列表
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyUserAuth } from "@/lib/auth";

// 强制动态渲染，禁止静态预渲染
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const payload = await verifyUserAuth(request);
    
    if (!payload) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "请先登录" } },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const pageSize = parseInt(searchParams.get("pageSize") || "20");

    // 获取对话列表
    const [conversations, total] = await Promise.all([
      prisma.advisorConversation.findMany({
        where: { userId: payload.id },
        orderBy: { updatedAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          messages: {
            orderBy: { createdAt: "desc" },
            take: 1, // 只取最后一条消息
          },
        },
      }),
      prisma.advisorConversation.count({ where: { userId: payload.id } }),
    ]);

    // 格式化返回数据
    const formattedConversations = conversations.map((conv) => ({
      id: conv.id,
      lastMessage: conv.messages[0]?.content.slice(0, 50) || "",
      messageCount: conv.messageCount,
      createdAt: conv.createdAt,
      updatedAt: conv.updatedAt,
    }));

    return NextResponse.json({
      success: true,
      data: {
        conversations: formattedConversations,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      },
    });
  } catch (error) {
    console.error("[GetConversations] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}

