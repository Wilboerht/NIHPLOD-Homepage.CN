/**
 * 管理员调整用户积分 API
 * POST /api/admin/users/:id/points
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth";
import { adjustPoints } from "@/lib/points";
import { z } from "zod";

type RouteContext = { params: Promise<{ id: string }> };

const adjustSchema = z.object({
  amount: z.number().int().refine((v) => v !== 0, "调整数量不能为0"),
  description: z.string().min(1, "请填写调整原因").max(200),
});

// 强制动态渲染，禁止静态预渲染
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权" } },
        { status: 401 }
      );
    }

    const { id } = await context.params;
    const body = await request.json();

    const result = adjustSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_PARAMS", message: result.error.issues[0]?.message || "参数错误" } },
        { status: 400 }
      );
    }

    const { amount, description } = result.data;

    const adjustResult = await adjustPoints(id, amount, description);

    if (!adjustResult.success) {
      return NextResponse.json(
        { success: false, error: { code: "ADJUST_FAILED", message: adjustResult.error } },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        newBalance: adjustResult.newBalance,
        message: `积分已${amount > 0 ? "增加" : "扣减"}${Math.abs(amount)}点`,
      },
    });
  } catch (error) {
    console.error("[AdminAdjustPoints] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}

