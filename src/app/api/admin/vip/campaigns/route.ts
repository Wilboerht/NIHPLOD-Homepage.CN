/**
 * 积分活动管理 API (管理后台)
 * GET    /api/admin/vip/campaigns - 获取积分活动列表
 * POST   /api/admin/vip/campaigns - 新建积分活动
 * PUT    /api/admin/vip/campaigns - 更新积分活动
 * DELETE /api/admin/vip/campaigns - 删除积分活动
 *
 * 活动期间下单积分按 multiplier 倍发放（与生日 3 倍取最大，不叠加）
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { cuidSchema } from "@/lib/validation";
import { createAuditLog } from "@/lib/audit";
import { z } from "zod";
import { logError } from "@/lib/logger";

const campaignSchema = z
  .object({
    name: z.string().min(1, "请填写活动名称").max(50, "活动名称不能超过50个字符"),
    startAt: z.coerce.date(),
    endAt: z.coerce.date(),
    multiplier: z.number().int().min(2, "倍数至少为 2").max(10, "倍数最多为 10"),
    active: z.boolean().optional(),
  })
  .refine((d) => d.endAt > d.startAt, { message: "结束时间必须晚于开始时间" });

const updateCampaignSchema = campaignSchema.extend({ id: cuidSchema });
const deleteCampaignSchema = z.object({ id: cuidSchema });

export const dynamic = "force-dynamic";

// GET - 获取活动列表
export async function GET(request: NextRequest) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权" } },
        { status: 401 }
      );
    }

    const rateLimitResponse = await checkAdminRateLimit(request, "vip:read");
    if (rateLimitResponse) return rateLimitResponse;

    const campaigns = await prisma.pointCampaign.findMany({
      orderBy: { startAt: "desc" },
    });

    return NextResponse.json({ success: true, data: { campaigns } });
  } catch (error) {
    logError("AdminCampaigns GET", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}

// POST - 新建活动
export async function POST(request: NextRequest) {
  if (!validateCSRFToken(request)) {
    return csrfForbiddenResponse();
  }

  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权" } },
        { status: 401 }
      );
    }

    if (admin.role !== "owner") {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "仅超级管理员可管理积分活动" } },
        { status: 403 }
      );
    }

    const rateLimitResponse = await checkAdminRateLimit(request, "vip:write");
    if (rateLimitResponse) return rateLimitResponse;

    const body = await request.json();
    const parsed = campaignSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "INVALID_PARAMS", message: parsed.error.issues[0]?.message },
        },
        { status: 400 }
      );
    }

    const { name, startAt, endAt, multiplier, active } = parsed.data;

    const campaign = await prisma.pointCampaign.create({
      data: { name, startAt, endAt, multiplier, active: active ?? true },
    });

    await createAuditLog({
      action: "create_point_campaign",
      targetType: "point_campaign",
      targetId: campaign.id,
      detail: { name, startAt, endAt, multiplier },
      adminId: admin.id,
      request,
    });

    return NextResponse.json({ success: true, data: { campaign } });
  } catch (error) {
    logError("AdminCampaigns POST", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}

// PUT - 更新活动
export async function PUT(request: NextRequest) {
  if (!validateCSRFToken(request)) {
    return csrfForbiddenResponse();
  }

  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权" } },
        { status: 401 }
      );
    }

    if (admin.role !== "owner") {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "仅超级管理员可管理积分活动" } },
        { status: 403 }
      );
    }

    const rateLimitResponse = await checkAdminRateLimit(request, "vip:write");
    if (rateLimitResponse) return rateLimitResponse;

    const body = await request.json();
    const parsed = updateCampaignSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "INVALID_PARAMS", message: parsed.error.issues[0]?.message },
        },
        { status: 400 }
      );
    }

    const { id, name, startAt, endAt, multiplier, active } = parsed.data;

    const campaign = await prisma.pointCampaign.update({
      where: { id },
      data: { name, startAt, endAt, multiplier, ...(active !== undefined && { active }) },
    });

    await createAuditLog({
      action: "update_point_campaign",
      targetType: "point_campaign",
      targetId: id,
      detail: { name, startAt, endAt, multiplier, active },
      adminId: admin.id,
      request,
    });

    return NextResponse.json({ success: true, data: { campaign } });
  } catch (error) {
    logError("AdminCampaigns PUT", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}

// DELETE - 删除活动
export async function DELETE(request: NextRequest) {
  if (!validateCSRFToken(request)) {
    return csrfForbiddenResponse();
  }

  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权" } },
        { status: 401 }
      );
    }

    if (admin.role !== "owner") {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "仅超级管理员可管理积分活动" } },
        { status: 403 }
      );
    }

    const rateLimitResponse = await checkAdminRateLimit(request, "vip:write");
    if (rateLimitResponse) return rateLimitResponse;

    const url = new URL(request.url);
    const parsed = deleteCampaignSchema.safeParse({ id: url.searchParams.get("id") });
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_PARAMS", message: "缺少活动 ID" } },
        { status: 400 }
      );
    }

    const { id } = parsed.data;
    await prisma.pointCampaign.delete({ where: { id } });

    await createAuditLog({
      action: "delete_point_campaign",
      targetType: "point_campaign",
      targetId: id,
      detail: {},
      adminId: admin.id,
      request,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logError("AdminCampaigns DELETE", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}
