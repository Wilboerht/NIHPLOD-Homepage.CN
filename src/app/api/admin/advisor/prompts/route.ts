import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth";
import {
  TEXT_ANALYSIS_SYSTEM_PROMPT,
  VISION_ANALYSIS_SYSTEM_PROMPT,
  CLAUDE_VISION_PROMPT,
  QWEN_VISION_PROMPT,
  buildTextAnalysisPrompt,
} from "@/config/ai-prompts";

/**
 * 生成文本分析提示词示例（用于管理端预览）
 * 包含完整的问卷信息和模拟的视觉分析结果
 */
function getTextAnalysisPromptExample(): string {
  // 生成一个带有视觉分析结果的完整示例，展示真实的提示词结构
  const examplePrompt = buildTextAnalysisPrompt({
    skinTypeLabel: "混合性肌肤",
    concernLabel: "抗老紧致、改善细纹",
    ageRange: "30-35",
    currentRoutine: "complete",
    allergies: "none",
    budget: "mid",
    pregnancyStatus: "no",
    medicationHistory: "routine",
    // 添加模拟的视觉分析结果，让管理员看到完整结构
    faceAnalysis: {
      skinType: {
        type: "combination",
        confidence: 0.85,
        description: "T区略有光泽，两颊较为干燥，整体呈现混合性肌肤特征",
      },
      hydration: {
        level: "medium",
        percent: 52,
        description: "水分含量适中，但两颊区域略显干燥需要加强保湿",
      },
      skinAge: {
        estimated: 28,
        factors: ["皮肤弹性良好", "眼周有轻微细纹", "整体肤色均匀"],
      },
      skinConditions: [
        {
          condition: "轻微细纹",
          severity: "mild",
          area: "眼周",
          description: "眼角处可见浅表性细纹，属于表情纹初期表现",
        },
        {
          condition: "毛孔粗大",
          severity: "mild",
          area: "T区",
          description: "鼻翼两侧毛孔较为明显，与油脂分泌有关",
        },
      ],
      recommendations: [
        "建议使用含有视黄醇或胜肽成分的精华，有助于预防和改善细纹",
        "T区可适当控油，两颊需要加强保湿",
        "日间做好防晒，有助于预防光老化",
      ],
    },
  });

  return examplePrompt;
}

/**
 * GET /api/admin/advisor/prompts
 * 获取默认系统提示词（用于管理端显示和恢复默认）
 */
export async function GET(request: NextRequest) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权访问" } },
        { status: 401 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        // 文本分析系统提示词（短版，作为 system message）
        textSystemPrompt: TEXT_ANALYSIS_SYSTEM_PROMPT,
        // 文本分析用户提示词模板示例（完整版，展示结构）
        textAnalysisPromptExample: getTextAnalysisPromptExample(),
        // 视觉分析默认提示词（OpenAI/通用）
        visionSystemPrompt: VISION_ANALYSIS_SYSTEM_PROMPT,
        // 各服务商专用提示词
        providerPrompts: {
          openai: VISION_ANALYSIS_SYSTEM_PROMPT,
          anthropic: CLAUDE_VISION_PROMPT,
          qwen: QWEN_VISION_PROMPT,
        },
      },
    });
  } catch (error) {
    console.error("获取默认提示词失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message: "获取默认提示词失败" } },
      { status: 500 }
    );
  }
}

