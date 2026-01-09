import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyAuth } from "@/lib/auth";
import { z } from "zod";

// 选项 Schema
const OptionSchema = z.object({
  value: z.string().min(1),
  label: z.string().min(1),
  labelEn: z.string().optional(),
  description: z.string().optional(),
  emoji: z.string().optional(),
});

// 创建问题 Schema
// 创建问题 Schema
const CreateQuestionSchema = z.object({
  question: z.string().min(1, "请输入问题内容").max(200),
  fieldName: z.string().min(1, "请输入字段名").max(50),
  type: z.enum(["single", "multiple"]).default("single"),
  options: z.array(OptionSchema).min(1, "请添加至少一个选项"),
  active: z.boolean().optional(),
  gender: z.enum(["all", "male", "female"]).default("all"),
});

// GET /api/admin/advisor/questions - 获取问题列表
export async function GET(request: NextRequest) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权访问" } },
        { status: 401 }
      );
    }

    const questions = await prisma.advisorQuestion.findMany({
      orderBy: [{ order: "asc" }, { updatedAt: "desc" }],
    });

    return NextResponse.json({
      success: true,
      data: questions.map((q) => ({
        ...q,
        updatedAt: q.updatedAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("获取问题列表失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message: "获取问题列表失败" } },
      { status: 500 }
    );
  }
}

// POST /api/admin/advisor/questions - 创建问题
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
    const validated = CreateQuestionSchema.parse(body);

    // 检查 fieldName 是否重复
    const existing = await prisma.advisorQuestion.findUnique({
      where: { fieldName: validated.fieldName },
    });
    if (existing) {
      return NextResponse.json(
        { success: false, error: { code: "DUPLICATE", message: "字段名已存在" } },
        { status: 400 }
      );
    }

    // 获取最大排序值
    const maxOrder = await prisma.advisorQuestion.aggregate({
      _max: { order: true },
    });

    // 创建问题
    const question = await prisma.advisorQuestion.create({
      data: {
        question: validated.question,
        fieldName: validated.fieldName,
        type: validated.type,
        options: validated.options,
        active: validated.active ?? true,
        gender: validated.gender,
        order: (maxOrder._max.order || 0) + 1,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        ...question,
        updatedAt: question.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("创建问题失败:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: error.issues[0]?.message || "参数错误" } },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message: "创建问题失败" } },
      { status: 500 }
    );
  }
}

