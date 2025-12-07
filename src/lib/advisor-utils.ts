/**
 * AI 护肤顾问 - 共享工具函数
 * 
 * 提取公共的标签映射和工具函数，避免代码重复
 */

// ============================================================================
// 类型定义
// ============================================================================

/** 肤质类型 */
export type SkinType = "dry" | "oily" | "combination" | "normal" | "sensitive" | "unknown";

/** 严重程度 */
export type Severity = "mild" | "moderate" | "severe";

/** 水分等级 */
export type HydrationLevel = "low" | "medium" | "high";

/** 面部分析结果（完整版，用于 Vision API 返回） */
export interface FaceAnalysisResult {
  skinType: {
    type: SkinType;
    confidence: number;
    description: string;
  };
  skinConditions: {
    condition: string;
    severity: Severity;
    area: string;
    description: string;
  }[];
  skinAge: {
    estimated: number;
    factors: string[];
  };
  hydration: {
    level: HydrationLevel;
    percent: number; // 0-100 的精确水分百分比
    description: string;
  };
  recommendations: string[];
}

// ============================================================================
// 标签映射
// ============================================================================

/** 肤质类型 → 中文标签 */
export const SKIN_TYPE_LABELS: Record<string, string> = {
  dry: "干性肌肤",
  oily: "油性肌肤",
  combination: "混合性肌肤",
  normal: "中性肌肤",
  sensitive: "敏感性肌肤",
  unknown: "待确定肤质",
};

/** 关注点 → 中文标签 */
export const CONCERN_LABELS: Record<string, string> = {
  aging: "抗老紧致",
  dull: "提亮肤色",
  hydration: "补水保湿",
  pores: "毛孔护理",
  sensitive: "舒缓修护",
  acne: "祛痘净肤",
  wrinkles: "淡化细纹",
  spots: "淡斑匀肤",
  dryness: "深层滋润",
};

// ============================================================================
// 工具函数
// ============================================================================

/**
 * 获取肤质中文标签
 * @param type 肤质类型
 * @returns 中文标签
 */
export function getSkinTypeLabel(type: string): string {
  return SKIN_TYPE_LABELS[type] || type;
}

/**
 * 获取关注点中文标签
 * @param concern 关注点
 * @returns 中文标签
 */
export function getConcernLabel(concern: string): string {
  return CONCERN_LABELS[concern] || concern;
}

/**
 * 批量获取关注点中文标签
 * @param concerns 关注点数组
 * @returns 中文标签数组
 */
export function getConcernLabels(concerns: string[]): string[] {
  return concerns.map(getConcernLabel);
}

/**
 * 将关注点数组转换为可读文本
 * @param concerns 关注点数组
 * @param maxDisplay 最多显示几个（默认 3）
 * @returns 格式化的文本，如 "补水保湿、抗老紧致、毛孔护理"
 */
export function formatConcerns(concerns: string[], maxDisplay = 3): string {
  const labels = concerns.slice(0, maxDisplay).map(getConcernLabel);
  return labels.join("、");
}

/**
 * 验证肤质类型是否有效
 * @param type 待验证的肤质类型
 * @returns 是否是有效的肤质类型
 */
export function isValidSkinType(type: string): type is SkinType {
  return ["dry", "oily", "combination", "normal", "sensitive", "unknown"].includes(type);
}

/**
 * 获取默认的面部分析结果（降级方案）
 */
export function getDefaultFaceAnalysisResult(): FaceAnalysisResult {
  return {
    skinType: {
      type: "combination",
      confidence: 0.5,
      description: "由于技术原因，无法精确判断您的肤质类型。建议结合您的日常感受来判断。",
    },
    skinConditions: [],
    skinAge: {
      estimated: 0,
      factors: ["无法通过照片准确评估"],
    },
    hydration: {
      level: "medium",
      percent: 55,
      description: "建议日常保持良好的补水习惯",
    },
    recommendations: [
      "建议早晚使用温和的洁面产品清洁肌肤",
      "保持每日饮水量在 2000ml 以上",
      "根据季节调整护肤品的滋润度",
      "建议到专业机构进行详细的肌肤检测",
    ],
  };
}

