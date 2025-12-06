import { NextResponse } from "next/server";

/**
 * POST /api/advisor
 *
 * ⚠️ 预留接口 - 当前产品设计不需要
 *
 * 当前产品流程：问卷 → 面部扫描(可选) → AI分析 → 结果展示
 * 不涉及对话式交互，分析功能由 /api/advisor/analyze 提供
 *
 * 此接口为未来可能的对话式交互预留，如：
 * - 用户对分析结果的追问
 * - 产品咨询对话
 *
 * 如无扩展计划，可删除此文件
 */
export async function POST() {
  return NextResponse.json(
    {
      success: false,
      error: {
        code: "NOT_IMPLEMENTED",
        message: "此接口为预留接口，当前产品设计不需要对话功能",
      },
    },
    { status: 501 }
  );
}
