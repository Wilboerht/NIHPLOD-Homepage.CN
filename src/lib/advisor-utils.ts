/**
 * AI 护肤顾问 - 共享工具函数
 *
 * 提取公共的标签映射和工具函数，避免代码重复
 *
 * v2.0: 对标 VISIA 专业皮肤分析系统，增加 8 维度评分
 */

// ============================================================================
// 基础类型定义
// ============================================================================

/** 肤质类型 */
export type SkinType = "dry" | "oily" | "combination" | "normal" | "sensitive" | "unknown";

/** 严重程度 */
export type Severity = "mild" | "moderate" | "severe";

/** 水分等级 */
export type HydrationLevel = "low" | "medium" | "high";

/** 图片验证状态 */
export type ImageValidation =
  | "valid"              // 有效的人脸照片
  | "not_human_face"     // 非人脸（动物、物品、卡通等）
  | "photo_of_photo"     // 照片的照片（翻拍）
  | "screen_photo"       // 屏幕照片（拍摄显示器/手机屏幕）
  | "video_frame"        // 视频帧/录制画面
  | "fake_face"          // 假人脸（面具、AI生成、3D打印等）
  | "low_quality"        // 图片质量太差
  | "partial_face"       // 人脸不完整
  | "multiple_faces"     // 多张人脸
  | "medical_condition"; // 检测到疑似需要就医的皮肤状况

// ============================================================================
// VISIA 风格 8 维度评分系统
// ============================================================================

/** 8 维度名称（对标 VISIA） */
export type SkinDimensionKey =
  | "spots"       // 斑点（色斑、晒斑、雀斑）
  | "wrinkles"    // 皱纹（细纹、深纹）
  | "texture"     // 纹理（皮肤光滑度）
  | "pores"       // 毛孔（大小、可见度）
  | "uvDamage"    // 紫外损伤（潜在色斑，防晒预警）
  | "brownSpots"  // 棕色区域（深层色素沉着）
  | "redAreas"    // 红色区域（泛红、血管扩张）
  | "acneRisk";   // 痘痘风险（油脂、毛孔堵塞）

/** 单个维度的评分 */
export interface DimensionScore {
  /** 评分 0-100，越高越好（皮肤状况越好） */
  score: number;
  /** 百分位排名（击败了多少同龄人），0-100 */
  percentile: number;
  /** 等级：excellent/good/average/fair/poor */
  grade: "excellent" | "good" | "average" | "fair" | "poor";
  /** 具体描述 */
  details: string;
}

/** 8 维度评分 */
export interface SkinDimensions {
  spots: DimensionScore;       // 斑点
  wrinkles: DimensionScore;    // 皱纹
  texture: DimensionScore;     // 纹理
  pores: DimensionScore;       // 毛孔
  uvDamage: DimensionScore;    // 紫外损伤
  brownSpots: DimensionScore;  // 棕色区域
  redAreas: DimensionScore;    // 红色区域
  acneRisk: DimensionScore;    // 痘痘风险
}

/** 面部区域分析 */
export interface ZoneAnalysis {
  /** T区（额头+鼻子） */
  tZone: {
    oil: number;     // 油脂程度 0-100
    pores: number;   // 毛孔明显度 0-100
    condition: string;
  };
  /** 左脸颊 */
  leftCheek: {
    texture: number;  // 纹理评分
    spots: number;    // 色斑程度
    redness: number;  // 泛红程度
    condition: string;
  };
  /** 右脸颊 */
  rightCheek: {
    texture: number;
    spots: number;
    redness: number;
    condition: string;
  };
  /** 眼周区域 */
  eyeArea: {
    wrinkles: number;     // 眼周细纹
    darkCircles: number;  // 黑眼圈程度
    firmness: number;     // 紧致度
    condition: string;
  };
  /** 额头 */
  forehead: {
    wrinkles: number;  // 抬头纹
    texture: number;   // 纹理
    oil: number;       // 油脂
    condition: string;
  };
  /** 下颌线 */
  jawline: {
    firmness: number;  // 紧致度
    contour: number;   // 轮廓清晰度
    condition: string;
  };
}

/** 肌肤年龄对比 */
export interface SkinAgeComparison {
  /** 估算的肌肤年龄 */
  estimated: number;
  /** 与实际年龄的对比 */
  comparison: "younger" | "average" | "older";
  /** 年龄差异（正数=看起来老，负数=看起来年轻） */
  yearsDiff: number;
  /** 影响因素 */
  factors: string[];
  /** TruSkin Age 说明 */
  description: string;
}

/** 面部分析结果 v2.0（VISIA 风格，用于 Vision API 返回） */
export interface FaceAnalysisResult {
  /** 图片验证结果 - 首先判断是否是有效的真人人脸 */
  validation?: {
    isValid: boolean;
    status: ImageValidation;
    message: string;
  };

  /** 综合皮肤健康评分 0-100 */
  overallScore: number;

  /** 8 维度评分（VISIA 核心功能） */
  dimensions: SkinDimensions;

  /** 区域分析（热力图数据源） */
  zoneAnalysis: ZoneAnalysis;

  /** 肤质类型 */
  skinType: {
    type: SkinType;
    confidence: number;
    description: string;
  };

  /** 肌肤年龄（TruSkin Age 风格） */
  skinAge: SkinAgeComparison;

  /** 水油平衡 */
  hydration: {
    level: HydrationLevel;
    percent: number;      // 水分百分比 0-100
    oilLevel: number;     // 油脂水平 0-100
    balance: "dry" | "balanced" | "oily" | "dehydrated-oily";
    description: string;
  };

  /** 检测到的皮肤问题（保留兼容） */
  skinConditions: {
    condition: string;
    severity: Severity;
    area: string;
    description: string;
  }[];

  /** 个性化护肤建议 */
  recommendations: string[];

  /** 重点关注项（优先需要改善的维度） */
  priorityAreas: SkinDimensionKey[];
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

/** 8 维度 → 中文标签（VISIA 风格） */
export const DIMENSION_LABELS: Record<SkinDimensionKey, string> = {
  spots: "色斑",
  wrinkles: "皱纹",
  texture: "纹理",
  pores: "毛孔",
  uvDamage: "光损伤",
  brownSpots: "色素",
  redAreas: "泛红",
  acneRisk: "痘痘风险",
};

/** 8 维度 → 说明文字 */
export const DIMENSION_DESCRIPTIONS: Record<SkinDimensionKey, string> = {
  spots: "表面可见的色斑、雀斑、晒斑",
  wrinkles: "细纹、深层皱纹、表情纹",
  texture: "皮肤表面光滑度和细腻程度",
  pores: "毛孔大小、可见度和堵塞情况",
  uvDamage: "紫外线造成的潜在损伤，防晒预警",
  brownSpots: "深层色素沉着、暗沉区域",
  redAreas: "血管扩张、敏感泛红、炎症",
  acneRisk: "油脂分泌、毛孔堵塞导致的痘痘风险",
};

/** 等级 → 中文标签 */
export const GRADE_LABELS: Record<string, { label: string; color: string }> = {
  excellent: { label: "优秀", color: "text-green-600" },
  good: { label: "良好", color: "text-blue-600" },
  average: { label: "一般", color: "text-yellow-600" },
  fair: { label: "需关注", color: "text-orange-500" },
  poor: { label: "需改善", color: "text-red-500" },
};

/** 水油平衡状态 → 中文标签 */
export const BALANCE_LABELS: Record<string, string> = {
  dry: "偏干",
  balanced: "水油平衡",
  oily: "偏油",
  "dehydrated-oily": "外油内干",
};

// ============================================================================
// 工具函数
// ============================================================================

/**
 * 获取肤质中文标签
 */
export function getSkinTypeLabel(type: string): string {
  return SKIN_TYPE_LABELS[type] || type;
}

/**
 * 获取关注点中文标签
 */
export function getConcernLabel(concern: string): string {
  return CONCERN_LABELS[concern] || concern;
}

/**
 * 获取维度中文标签
 */
export function getDimensionLabel(dimension: SkinDimensionKey): string {
  return DIMENSION_LABELS[dimension] || dimension;
}

/**
 * 获取维度说明
 */
export function getDimensionDescription(dimension: SkinDimensionKey): string {
  return DIMENSION_DESCRIPTIONS[dimension] || "";
}

/**
 * 获取等级标签和颜色
 */
export function getGradeInfo(grade: string): { label: string; color: string } {
  return GRADE_LABELS[grade] || { label: grade, color: "text-gray-600" };
}

/**
 * 根据分数计算等级
 */
export function scoreToGrade(score: number): "excellent" | "good" | "average" | "fair" | "poor" {
  if (score >= 85) return "excellent";
  if (score >= 70) return "good";
  if (score >= 55) return "average";
  if (score >= 40) return "fair";
  return "poor";
}

/**
 * 批量获取关注点中文标签
 */
export function getConcernLabels(concerns: string[]): string[] {
  return concerns.map(getConcernLabel);
}

/**
 * 将关注点数组转换为可读文本
 */
export function formatConcerns(concerns: string[], maxDisplay = 3): string {
  const labels = concerns.slice(0, maxDisplay).map(getConcernLabel);
  return labels.join("、");
}

/**
 * 验证肤质类型是否有效
 */
export function isValidSkinType(type: string): type is SkinType {
  return ["dry", "oily", "combination", "normal", "sensitive", "unknown"].includes(type);
}

/**
 * 创建默认维度评分
 */
function createDefaultDimensionScore(score = 60): DimensionScore {
  return {
    score,
    percentile: 50,
    grade: scoreToGrade(score),
    details: "暂无详细数据",
  };
}

/**
 * 获取默认的面部分析结果（降级方案）- VISIA 风格
 */
export function getDefaultFaceAnalysisResult(): FaceAnalysisResult {
  return {
    overallScore: 60,
    dimensions: {
      spots: createDefaultDimensionScore(65),
      wrinkles: createDefaultDimensionScore(70),
      texture: createDefaultDimensionScore(60),
      pores: createDefaultDimensionScore(55),
      uvDamage: createDefaultDimensionScore(60),
      brownSpots: createDefaultDimensionScore(65),
      redAreas: createDefaultDimensionScore(70),
      acneRisk: createDefaultDimensionScore(65),
    },
    zoneAnalysis: {
      tZone: { oil: 50, pores: 50, condition: "暂无详细数据" },
      leftCheek: { texture: 60, spots: 30, redness: 20, condition: "暂无详细数据" },
      rightCheek: { texture: 60, spots: 30, redness: 20, condition: "暂无详细数据" },
      eyeArea: { wrinkles: 30, darkCircles: 30, firmness: 70, condition: "暂无详细数据" },
      forehead: { wrinkles: 30, texture: 60, oil: 50, condition: "暂无详细数据" },
      jawline: { firmness: 70, contour: 70, condition: "暂无详细数据" },
    },
    skinType: {
      type: "combination",
      confidence: 0.5,
      description: "由于技术原因，无法精确判断您的肤质类型。建议结合您的日常感受来判断。",
    },
    skinAge: {
      estimated: 0,
      comparison: "average",
      yearsDiff: 0,
      factors: ["无法通过照片准确评估"],
      description: "建议在光线充足的环境下重新拍摄",
    },
    hydration: {
      level: "medium",
      percent: 55,
      oilLevel: 50,
      balance: "balanced",
      description: "建议日常保持良好的补水习惯",
    },
    skinConditions: [],
    recommendations: [
      "建议早晚使用温和的洁面产品清洁肌肤",
      "保持每日饮水量在 2000ml 以上",
      "根据季节调整护肤品的滋润度",
      "建议在光线充足的环境下重新拍摄以获取更准确的分析",
    ],
    priorityAreas: [],
  };
}

