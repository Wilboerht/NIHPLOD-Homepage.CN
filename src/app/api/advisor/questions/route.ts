import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { advisorQuestions as fallbackQuestions } from "@/config/advisor-questions";

/**
 * 问题选项类型
 */
interface QuestionOption {
  value: string;
  label: string;
  labelEn?: string;
  description?: string;
  emoji?: string;
}

/**
 * 问题类型（API 响应格式）
 */
interface QuestionResponse {
  id: string;
  fieldName: string;
  question: string;
  subtext?: string;
  type: "single" | "multiple";
  options: QuestionOption[];
  order: number;
}

/**
 * GET /api/advisor/questions
 * 获取启用的问卷问题列表（公共接口，无需认证）
 * 
 * 优先从数据库获取，如果数据库为空则返回硬编码的默认问题
 */
export async function GET() {
  try {
    // 从数据库获取启用的问题，按顺序排列
    const dbQuestions = await prisma.advisorQuestion.findMany({
      where: { active: true },
      orderBy: [{ order: "asc" }, { updatedAt: "desc" }],
    });

    // 如果数据库有数据，使用数据库问题
    if (dbQuestions.length > 0) {
      const questions: QuestionResponse[] = dbQuestions.map((q) => {
        // 解析选项数据
        const rawOptions = q.options as QuestionOption[];
        
        return {
          id: q.id,
          fieldName: q.fieldName,
          question: q.question,
          type: q.type as "single" | "multiple",
          options: rawOptions.map((opt) => ({
            value: opt.value,
            label: opt.label,
            labelEn: opt.labelEn,
            description: opt.description || opt.labelEn || "",
            emoji: opt.emoji,
          })),
          order: q.order,
        };
      });

      return NextResponse.json({
        success: true,
        source: "database",
        data: questions,
      });
    }

    // 数据库为空，使用硬编码的默认问题
    const questions: QuestionResponse[] = fallbackQuestions.map((q, index) => ({
      id: `fallback-${q.id}`,
      fieldName: q.fieldName,
      question: q.question,
      subtext: q.subtext,
      type: "single" as const,
      options: q.options.map((opt) => ({
        value: opt.value,
        label: opt.label,
        description: opt.description,
        emoji: opt.emoji,
      })),
      order: index + 1,
    }));

    return NextResponse.json({
      success: true,
      source: "fallback",
      data: questions,
    });
  } catch (error) {
    console.error("获取问卷问题失败:", error);

    // 出错时也返回默认问题，确保功能可用
    const questions: QuestionResponse[] = fallbackQuestions.map((q, index) => ({
      id: `fallback-${q.id}`,
      fieldName: q.fieldName,
      question: q.question,
      subtext: q.subtext,
      type: "single" as const,
      options: q.options.map((opt) => ({
        value: opt.value,
        label: opt.label,
        description: opt.description,
        emoji: opt.emoji,
      })),
      order: index + 1,
    }));

    return NextResponse.json({
      success: true,
      source: "fallback",
      notice: "使用默认问题配置",
      data: questions,
    });
  }
}

