/**
 * 用户端 - 领奖 API
 * GET /api/lottery/claim/:id - 获取中奖信息
 * POST /api/lottery/claim/:id - 提交领奖信息
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";

// 领奖信息校验
const ClaimInfoSchema = z.object({
  name: z.string().min(1, "请填写收件人姓名"),
  phone: z.string().regex(/^1[3-9]\d{9}$/, "请输入正确的手机号"),
  address: z.string().min(10, "请填写详细收货地址"),
});

// GET - 获取中奖信息
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const entry = await prisma.lotteryEntry.findUnique({
      where: { id },
      include: {
        activity: {
          select: {
            name: true,
            prizeName: true,
            prizeImage: true,
          },
        },
      },
    });

    if (!entry) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "记录不存在" } },
        { status: 404 }
      );
    }

    if (entry.status !== "won" && entry.status !== "verified") {
      return NextResponse.json(
        { success: false, error: { code: "NOT_WINNER", message: "您未中奖" } },
        { status: 403 }
      );
    }

    // 判断是否已填写领奖信息
    const claimed = !!(entry.recipientName && entry.recipientPhone && entry.recipientAddress);

    return NextResponse.json({
      success: true,
      data: {
        id: entry.id,
        phone: entry.phone.replace(/(\d{3})\d{4}(\d{4})/, "$1****$2"),
        drawingUrl: entry.drawingUrl,
        activity: entry.activity,
        claimed,
        claimInfo: claimed ? {
          name: entry.recipientName,
          phone: entry.recipientPhone,
          address: entry.recipientAddress,
        } : null,
      },
    });
  } catch (error) {
    console.error("获取中奖信息失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message: "获取失败" } },
      { status: 500 }
    );
  }
}

// POST - 提交领奖信息
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    // 验证参数
    const validated = ClaimInfoSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: validated.error.issues[0]?.message } },
        { status: 400 }
      );
    }

    // 获取中奖记录
    const entry = await prisma.lotteryEntry.findUnique({
      where: { id },
    });

    if (!entry) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "记录不存在" } },
        { status: 404 }
      );
    }

    if (entry.status !== "won" && entry.status !== "verified") {
      return NextResponse.json(
        { success: false, error: { code: "NOT_WINNER", message: "您未中奖" } },
        { status: 403 }
      );
    }

    if (entry.recipientName && entry.recipientPhone && entry.recipientAddress) {
      return NextResponse.json(
        { success: false, error: { code: "ALREADY_CLAIMED", message: "您已提交过领奖信息" } },
        { status: 400 }
      );
    }

    // 保存领奖信息
    await prisma.lotteryEntry.update({
      where: { id },
      data: {
        recipientName: validated.data.name,
        recipientPhone: validated.data.phone,
        recipientAddress: validated.data.address,
      },
    });

    return NextResponse.json({
      success: true,
      data: { message: "领奖信息提交成功" },
    });
  } catch (error) {
    console.error("提交领奖信息失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message: "提交失败" } },
      { status: 500 }
    );
  }
}

