import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyAuth } from "@/lib/auth";
import { logError } from "@/lib/logger";
import { z } from "zod";

// 选项 Schema
const OptionSchema = z.object({
  value: z.string().min(1),
  label: z.string().min(1),
  labelEn: z.string().optional(),
  description: z.string().optional(),
  emoji: z.string().optional(),
});

// 更新问题 Schema
const UpdateQuestionSchema = z.object({
  question: z.string().min(1).max(200).optional(),
  fieldName: z.string().min(1).max(50).optional(),
  type: z.enum(["single", "multiple"]).optional(),
  options: z.array(OptionSchema).min(1).optional(),
  active: z.boolean().optional(),
  order: z.number().optional(),
});

// GET /api/admin/advisor/questions/[id] - 获取问题详情
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

    const question = await prisma.advisorQuestion.findUnique({
      where: { id },
    });

    if (!question) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "问题不存在" } },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        ...question,
        updatedAt: question.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    logError("AdvisorQuestionAPI", error, { action: "GET", questionId: (await params).id });
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message: "获取问题详情失败" } },
      { status: 500 }
    );
  }
}

// PUT /api/admin/advisor/questions/[id] - 更新问题
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
    const validated = UpdateQuestionSchema.parse(body);

    // 检查是否存在
    const existing = await prisma.advisorQuestion.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "问题不存在" } },
        { status: 404 }
      );
    }

    // 如果更新 fieldName，检查是否重复
    if (validated.fieldName && validated.fieldName !== existing.fieldName) {
      const duplicate = await prisma.advisorQuestion.findUnique({
        where: { fieldName: validated.fieldName },
      });
      if (duplicate) {
        return NextResponse.json(
          { success: false, error: { code: "DUPLICATE", message: "字段名已存在" } },
          { status: 400 }
        );
      }
    }

    // 更新问题
    const question = await prisma.advisorQuestion.update({
      where: { id },
      data: {
        ...(validated.question !== undefined && { question: validated.question }),
        ...(validated.fieldName !== undefined && { fieldName: validated.fieldName }),
        ...(validated.type !== undefined && { type: validated.type }),
        ...(validated.options !== undefined && { options: validated.options }),
        ...(validated.active !== undefined && { active: validated.active }),
        ...(validated.order !== undefined && { order: validated.order }),
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
    logError("AdvisorQuestionAPI", error, { action: "PUT", questionId: (await params).id });
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: error.issues[0]?.message || "参数错误" } },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message: "更新问题失败" } },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/advisor/questions/[id] - 删除问题
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
    const existing = await prisma.advisorQuestion.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "问题不存在" } },
        { status: 404 }
      );
    }

    // 删除问题
    await prisma.advisorQuestion.delete({ where: { id } });

    return NextResponse.json({
      success: true,
      data: { message: "问题已删除" },
    });
  } catch (error) {
    logError("AdvisorQuestionAPI", error, { action: "DELETE", questionId: (await params).id });
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message: "删除问题失败" } },
      { status: 500 }
    );
  }
}

