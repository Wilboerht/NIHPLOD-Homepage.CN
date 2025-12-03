import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyAuth } from "@/lib/auth";
import { z } from "zod";

// 更新规则 Schema
const UpdateRuleSchema = z.object({
  conditions: z.record(z.string(), z.array(z.string())).optional(),
  productIds: z.array(z.string()).min(1).optional(),
  priority: z.number().min(0).optional(),
  message: z.string().max(500).optional().nullable(),
});

// GET /api/admin/advisor/rules/[id] - 获取规则详情
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权访问" } },
        { status: 401 }
      );
    }

    const { id } = await params;

    const rule = await prisma.recommendationRule.findUnique({
      where: { id },
    });

    if (!rule) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "规则不存在" } },
        { status: 404 }
      );
    }

    // 获取产品信息
    const products = await prisma.product.findMany({
      where: { id: { in: rule.productIds } },
      select: { id: true, name: true, nameEn: true },
    });

    return NextResponse.json({
      success: true,
      data: {
        ...rule,
        createdAt: rule.createdAt.toISOString(),
        updatedAt: rule.updatedAt.toISOString(),
        products,
      },
    });
  } catch (error) {
    console.error("获取规则详情失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message: "获取规则详情失败" } },
      { status: 500 }
    );
  }
}

// PUT /api/admin/advisor/rules/[id] - 更新规则
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权访问" } },
        { status: 401 }
      );
    }

    const { id } = await params;
    const body = await request.json();
    const validated = UpdateRuleSchema.parse(body);

    // 检查是否存在
    const existing = await prisma.recommendationRule.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "规则不存在" } },
        { status: 404 }
      );
    }

    // 如果更新产品，验证产品是否存在
    if (validated.productIds) {
      const products = await prisma.product.findMany({
        where: { id: { in: validated.productIds } },
        select: { id: true },
      });
      if (products.length !== validated.productIds.length) {
        return NextResponse.json(
          { success: false, error: { code: "INVALID_PRODUCTS", message: "部分产品不存在" } },
          { status: 400 }
        );
      }
    }

    // 更新规则
    const rule = await prisma.recommendationRule.update({
      where: { id },
      data: {
        ...(validated.conditions !== undefined && { conditions: validated.conditions }),
        ...(validated.productIds !== undefined && { productIds: validated.productIds }),
        ...(validated.priority !== undefined && { priority: validated.priority }),
        ...(validated.message !== undefined && { message: validated.message }),
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        ...rule,
        createdAt: rule.createdAt.toISOString(),
        updatedAt: rule.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("更新规则失败:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: error.issues[0]?.message || "参数错误" } },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message: "更新规则失败" } },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/advisor/rules/[id] - 删除规则
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权访问" } },
        { status: 401 }
      );
    }

    const { id } = await params;

    // 检查是否存在
    const existing = await prisma.recommendationRule.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "规则不存在" } },
        { status: 404 }
      );
    }

    // 删除规则
    await prisma.recommendationRule.delete({ where: { id } });

    return NextResponse.json({
      success: true,
      data: { message: "规则已删除" },
    });
  } catch (error) {
    console.error("删除规则失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message: "删除规则失败" } },
      { status: 500 }
    );
  }
}

