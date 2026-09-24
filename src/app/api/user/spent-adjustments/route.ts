/**
 * 消费补录申请 API（用户端）
 * GET  /api/user/spent-adjustments - 查询我的补录申请列表
 * POST /api/user/spent-adjustments - 提交消费补录申请（全渠道凭证）
 *
 * 审核规则：管理员人工审核，通过后以核实金额累加历史消费并重算会员等级；
 * 同一订单号在待审/已通过状态下全局唯一，驳回后可重新提交。
 * 数据操作核心（校验/列表/提交）与 OAuth 资源端点共用，
 * 见 src/lib/spent-adjustment-applications.ts。
 */
import { NextRequest, NextResponse } from "next/server";
import { withUserAuth } from "@/lib/auth";
import { rateLimit } from "@/lib/ratelimit";
import { apiConsole } from "@/lib/logger";
import {
  listSpentApplications,
  createSpentApplication,
  createSpentApplicationSchema,
} from "@/lib/spent-adjustment-applications";
import { MAX_PENDING_PER_USER } from "@/lib/spent-adjustment-meta";

export const dynamic = "force-dynamic";

// GET - 查询我的补录申请列表
export const GET = withUserAuth(async (_request: NextRequest, payload) => {
  try {
    const applications = await listSpentApplications(payload.id);
    return NextResponse.json({ success: true, data: { applications } });
  } catch (error) {
    apiConsole.error("[SpentAdjustment] 查询申请失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
});

// POST - 提交消费补录申请
export const POST = withUserAuth(async (request: NextRequest, payload) => {
  try {
    // 用户级提交限流（防批量刷单）
    const submitLimit = await rateLimit(`user-adjust-submit:${payload.id}`, "default", {
      maxRequests: 10,
      windowMs: 60 * 60 * 1000,
    });
    if (!submitLimit.success) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "RATE_LIMITED", message: "提交过于频繁，请稍后再试" },
        },
        { status: 429 }
      );
    }

    const body = await request.json();
    const parsed = createSpentApplicationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "INVALID_PARAMS", message: parsed.error.issues[0]?.message || "参数错误" },
        },
        { status: 400 }
      );
    }

    const result = await createSpentApplication({
      userId: payload.id,
      input: parsed.data,
      request,
    });

    if (!result.ok) {
      if (result.kind === "pending_limit") {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "PENDING_LIMIT",
              message: `最多同时有 ${MAX_PENDING_PER_USER} 条待审核申请，请等待审核完成后再提交`,
            },
          },
          { status: 400 }
        );
      }
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "ORDER_NO_DUPLICATE",
            message: "该订单号已有待审核或已通过的申请，请勿重复提交",
          },
        },
        { status: 409 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        application: {
          id: result.application.id,
          status: result.application.status,
          statusLabel: result.application.statusLabel,
        },
      },
    });
  } catch (error) {
    apiConsole.error("[SpentAdjustment] 提交申请失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
});
