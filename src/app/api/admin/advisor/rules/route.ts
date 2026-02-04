import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyAuth } from "@/lib/auth";
import { z } from "zod";

// 创建规则 Schema
const CreateRuleSchema = z.object({
  conditions: z.record(z.string(), z.array(z.string())), // { skinType: ['dry'], concern: ['aging'] }
  productIds: z.array(z.string()).min(1, "请选择至少一个产品"),
  priority: z.number().min(0).default(0),
  message: z.string().max(500).optional(),
});

// GET /api/admin/advisor/rules - 获取规则列表
// 强制动态渲染，禁止静态预渲染
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权访问" } },
        { status: 401 }
      );
    }

    const rules = await prisma.recommendationRule.findMany({
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
    });

    // 获取所有相关产品信息
    const productIds = Array.from(new Set(rules.flatMap((r) => r.productIds)));
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true, nameEn: true },
    });
    const productMap = new Map(products.map((p) => [p.id, p]));

    // 获取所有问题信息（用于显示条件）
    const questions = await prisma.advisorQuestion.findMany({
      select: { fieldName: true, question: true, options: true },
    });
    const questionMap = new Map(questions.map((q) => [q.fieldName, q]));

    return NextResponse.json({
      success: true,
      data: rules.map((rule) => ({
        ...rule,
        createdAt: rule.createdAt.toISOString(),
        updatedAt: rule.updatedAt.toISOString(),
        products: rule.productIds.map((id) => productMap.get(id)).filter(Boolean),
        conditionDetails: Object.entries(rule.conditions as Record<string, string[]>).map(
          ([fieldName, values]) => {
            const question = questionMap.get(fieldName);
            const options = (question?.options as Array<{ value: string; label: string }>) || [];
            return {
              fieldName,
              questionText: question?.question || fieldName,
              values: values.map((v) => {
                const opt = options.find((o) => o.value === v);
                return { value: v, label: opt?.label || v };
              }),
            };
          }
        ),
      })),
    });
  } catch (error) {
    console.error("获取规则列表失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message: "获取规则列表失败" } },
      { status: 500 }
    );
  }
}

// POST /api/admin/advisor/rules - 创建规则
export async function POST(request: NextRequest) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权访问" } },
        { status: 401 }
      );
    }

    const body = await request.json();
    const validated = CreateRuleSchema.parse(body);

    // 验证产品是否存在
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

    // 创建规则
    const rule = await prisma.recommendationRule.create({
      data: {
        conditions: validated.conditions,
        productIds: validated.productIds,
        priority: validated.priority,
        message: validated.message || null,
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
    console.error("创建规则失败:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: error.issues[0]?.message || "参数错误" } },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message: "创建规则失败" } },
      { status: 500 }
    );
  }
}

