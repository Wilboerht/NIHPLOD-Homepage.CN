/**
 * NIHPLOD 护肤产品用量推荐规则
 * 基于 MOIDAS SPG™ 官方指导用量
 * 
 * 气候类型定义：
 * W1: 寒冷和干燥 | 低温: -6℃ — 7℃ | 低湿度: 5%—45%
 * A2: 凉爽和潮湿 | 低温: -6℃ — 7℃ | 高湿度: 65%—100%
 * S1: 正常和温和 | 常温: 7℃ — 26℃ | 正常湿度: 45%—65%
 * A1: 炎热和干燥 | 高温: 26℃ — 43℃ | 低湿度: 5%—45%
 * S2: 炎热和潮湿 | 高温: 26℃ — 43℃ | 高湿度: 65%—100%
 * M1: 高原和干燥 | 低温: -15℃ — -6℃ | 低湿度: 5%—45%
 */

export type ClimateType = "W1" | "A2" | "S1" | "A1" | "S2" | "M1";
export type SkinType = "oily" | "combination_oily" | "normal" | "combination_dry" | "dry" | "sensitive";

/** 气候类型中文名称 */
export const CLIMATE_LABELS: Record<ClimateType, string> = {
  W1: "寒冷干燥",
  A2: "凉爽潮湿",
  S1: "正常温和",
  A1: "炎热干燥",
  S2: "炎热潮湿",
  M1: "高原干燥",
};

/** 肤质类型中英文映射 */
export const SKIN_TYPE_MAP: Record<string, SkinType> = {
  oily: "oily",
  combination: "combination_oily",
  combination_oily: "combination_oily",
  normal: "normal",
  combination_dry: "combination_dry",
  dry: "dry",
  sensitive: "sensitive",
  油性: "oily",
  混油: "combination_oily",
  中性: "normal",
  混干: "combination_dry",
  干性: "dry",
  敏感: "sensitive",
};

/** 产品用量矩阵（单位：ml，面膜为片）
 *  行：肤质类型  列：气候类型 */
interface DosageMatrix {
  [skinType: string]: Record<ClimateType, number>;
}

/** 面霜用量 (ml) */
export const FACE_CREAM_DOSAGE: DosageMatrix = {
  oily: { W1: 5.1, A2: 2.2, S1: 2.4, A1: 3.2, S2: 2.0, M1: 3.0 },
  combination_oily: { W1: 5.4, A2: 2.5, S1: 2.7, A1: 3.5, S2: 2.3, M1: 4.0 },
  normal: { W1: 5.7, A2: 2.8, S1: 3.0, A1: 3.8, S2: 2.7, M1: 5.0 },
  combination_dry: { W1: 6.5, A2: 4.0, S1: 4.0, A1: 5.0, S2: 3.0, M1: 6.0 },
  dry: { W1: 8.0, A2: 4.5, S1: 4.0, A1: 5.5, S2: 3.0, M1: 7.0 },
  sensitive: { W1: 4.5, A2: 3.0, S1: 3.0, A1: 4.0, S2: 2.0, M1: 6.0 },
};

/** 精华用量 (ml) */
export const SERUM_DOSAGE: DosageMatrix = {
  oily: { W1: 1.5, A2: 1.2, S1: 1.2, A1: 1.5, S2: 1.2, M1: 1.6 },
  combination_oily: { W1: 1.6, A2: 1.3, S1: 1.3, A1: 1.6, S2: 1.3, M1: 1.7 },
  normal: { W1: 1.6, A2: 1.3, S1: 1.4, A1: 1.6, S2: 1.3, M1: 1.7 },
  combination_dry: { W1: 1.7, A2: 1.4, S1: 1.5, A1: 1.7, S2: 1.4, M1: 1.8 },
  dry: { W1: 2.0, A2: 1.5, S1: 1.6, A1: 1.8, S2: 1.5, M1: 2.0 },
  sensitive: { W1: 1.8, A2: 1.4, S1: 1.5, A1: 1.8, S2: 1.9, M1: 2.0 },
};

/** 洁面用量 (ml) - 按一次挤压量 */
export const CLEANSER_DOSAGE: DosageMatrix = {
  oily: { W1: 1.5, A2: 1.0, S1: 1.2, A1: 1.3, S2: 0.8, M1: 1.4 },
  combination_oily: { W1: 1.6, A2: 1.0, S1: 1.2, A1: 1.3, S2: 0.8, M1: 1.4 },
  normal: { W1: 1.5, A2: 0.9, S1: 1.0, A1: 1.2, S2: 0.7, M1: 1.3 },
  combination_dry: { W1: 1.4, A2: 0.8, S1: 0.9, A1: 1.1, S2: 0.6, M1: 1.2 },
  dry: { W1: 1.3, A2: 0.7, S1: 0.8, A1: 1.0, S2: 0.5, M1: 1.1 },
  sensitive: { W1: 1.3, A2: 0.7, S1: 0.8, A1: 1.0, S2: 0.5, M1: 1.1 },
};

/** 防晒用量 (ml) */
export const SUNSCREEN_DOSAGE: DosageMatrix = {
  oily: { W1: 1.2, A2: 0.9, S1: 0.9, A1: 1.2, S2: 1.0, M1: 1.3 },
  combination_oily: { W1: 1.3, A2: 1.0, S1: 1.0, A1: 1.3, S2: 1.1, M1: 1.4 },
  normal: { W1: 1.2, A2: 0.9, S1: 1.0, A1: 1.2, S2: 1.1, M1: 1.3 },
  combination_dry: { W1: 1.3, A2: 1.0, S1: 1.1, A1: 1.3, S2: 1.2, M1: 1.4 },
  dry: { W1: 2.0, A2: 1.5, S1: 1.5, A1: 1.5, S2: 1.6, M1: 1.8 },
  sensitive: { W1: 2.0, A2: 2.0, S1: 2.0, A1: 2.0, S2: 2.0, M1: 2.0 },
};

/** 磨砂膏用量 (ml) - 每周1-2次 */
export const SCRUB_DOSAGE: DosageMatrix = {
  oily: { W1: 7.5, A2: 7.0, S1: 8.0, A1: 9.5, S2: 7.0, M1: 7.5 },
  combination_oily: { W1: 9.5, A2: 6.0, S1: 8.5, A1: 9.5, S2: 6.5, M1: 6.0 },
  normal: { W1: 9.0, A2: 5.0, S1: 7.0, A1: 9.0, S2: 5.5, M1: 5.5 },
  combination_dry: { W1: 8.0, A2: 5.0, S1: 6.0, A1: 8.0, S2: 5.0, M1: 2.0 },
  dry: { W1: 7.0, A2: 4.0, S1: 6.5, A1: 7.0, S2: 4.5, M1: 3.5 },
  sensitive: { W1: 8.0, A2: 5.0, S1: 6.5, A1: 7.5, S2: 5.5, M1: 6.0 },
};

/** 面膜用量 (片/次) */
export const MASK_DOSAGE: DosageMatrix = {
  oily: { W1: 1, A2: 1, S1: 1, A1: 1, S2: 1, M1: 1 },
  combination_oily: { W1: 1, A2: 1, S1: 1, A1: 1, S2: 1, M1: 1 },
  normal: { W1: 1, A2: 1, S1: 1, A1: 1, S2: 1, M1: 1 },
  combination_dry: { W1: 1, A2: 1, S1: 1, A1: 1, S2: 1, M1: 1 },
  dry: { W1: 1, A2: 1, S1: 1, A1: 1, S2: 1, M1: 1 },
  sensitive: { W1: 1, A2: 1, S1: 1, A1: 1, S2: 1, M1: 1 },
};

/** 产品用量推荐 */
export interface ProductDosage {
  productSlug: string;
  productName: string;
  productNameEn: string;
  dosage: number;
  unit: string;
  description: string;
}

/** 根据产品slug获取用量矩阵 */
export function getDosageMatrix(productSlug: string): DosageMatrix | null {
  const matrices: Record<string, DosageMatrix> = {
    "foam-cleanser": CLEANSER_DOSAGE,
    "face-cream": FACE_CREAM_DOSAGE,
    "serum": SERUM_DOSAGE,
    "sunscreen": SUNSCREEN_DOSAGE,
    "face-scrub": SCRUB_DOSAGE,
    "face-mask": MASK_DOSAGE,
  };
  return matrices[productSlug] || null;
}

/** 产品单位映射 */
export const PRODUCT_UNITS: Record<string, string> = {
  "foam-cleanser": "ml",
  "face-cream": "ml",
  "serum": "ml",
  "sunscreen": "ml",
  "face-scrub": "ml",
  "face-mask": "片",
  "treatment-oil": "滴",
};

/**
 * 根据地区/省份判断气候类型
 * 简化的中国地区气候分类
 */
export function getClimateByRegion(province?: string, city?: string): ClimateType {
  if (!province && !city) return "S1"; // 默认正常温和

  const location = (province || "") + (city || "");

  // 高原地区 - M1
  if (/西藏|青海|新疆北部|内蒙古北部/.test(location)) {
    return "M1";
  }

  // 东北、华北冬季 - W1 寒冷干燥
  if (/黑龙江|吉林|辽宁|内蒙古|北京|天津|河北|山西|陕西北部/.test(location)) {
    return "W1";
  }

  // 华南沿海 - S2 炎热潮湿
  if (/广东|广西|海南|福建|台湾/.test(location)) {
    return "S2";
  }

  // 西北地区 - A1 炎热干燥
  if (/新疆|甘肃|宁夏/.test(location)) {
    return "A1";
  }

  // 华东沿海 - A2 凉爽潮湿
  if (/上海|江苏|浙江|山东/.test(location)) {
    return "A2";
  }

  // 中部地区 - S1 正常温和
  return "S1";
}

/**
 * 根据当前月份调整气候类型（季节因素）
 */
export function adjustClimateForSeason(baseClimate: ClimateType): ClimateType {
  const month = new Date().getMonth() + 1; // 1-12

  // 夏季 (6-8月): 更热更湿
  if (month >= 6 && month <= 8) {
    if (baseClimate === "W1") return "S1";
    if (baseClimate === "A2") return "S2";
    if (baseClimate === "S1") return "S2";
  }

  // 冬季 (12-2月): 更冷更干
  if (month === 12 || month <= 2) {
    if (baseClimate === "S2") return "S1";
    if (baseClimate === "A2") return "W1";
    if (baseClimate === "S1") return "W1";
  }

  return baseClimate;
}

/**
 * 获取产品推荐用量
 */
export function getProductDosage(
  productSlug: string,
  skinType: string,
  climate: ClimateType
): ProductDosage | null {
  const matrix = getDosageMatrix(productSlug);
  if (!matrix) return null;

  // 转换肤质类型
  const normalizedSkinType = SKIN_TYPE_MAP[skinType] || "normal";
  const dosageRow = matrix[normalizedSkinType];
  if (!dosageRow) return null;

  const dosage = dosageRow[climate];
  const unit = PRODUCT_UNITS[productSlug] || "ml";

  const productNames: Record<string, { name: string; nameEn: string }> = {
    "foam-cleanser": { name: "云朵洁面慕斯", nameEn: "Foam Cleanser" },
    "face-cream": { name: "逆龄面霜", nameEn: "Face Cream" },
    "serum": { name: "修护紧致精华", nameEn: "Serum" },
    "sunscreen": { name: "轻透防晒霜", nameEn: "Sunscreen" },
    "face-scrub": { name: "匀衡磨砂膏", nameEn: "Face Scrub" },
    "face-mask": { name: "臻萃修护面膜", nameEn: "Face Mask" },
    "treatment-oil": { name: "臻萃护理油", nameEn: "Treatment Oil" },
  };

  const product = productNames[productSlug] || { name: productSlug, nameEn: productSlug };

  return {
    productSlug,
    productName: product.name,
    productNameEn: product.nameEn,
    dosage,
    unit,
    description: getDosageDescription(dosage, unit, productSlug),
  };
}

/**
 * 生成用量描述文案
 */
function getDosageDescription(dosage: number, unit: string, productSlug: string): string {
  if (productSlug === "face-mask") {
    return "每次使用1片，敷15-20分钟";
  }

  if (productSlug === "treatment-oil") {
    return `每次${Math.round(dosage)}滴，温热后轻拍`;
  }

  if (dosage <= 1) {
    return `约${dosage.toFixed(1)}${unit}，约一颗黄豆大小`;
  } else if (dosage <= 2) {
    return `约${dosage.toFixed(1)}${unit}，约一颗花生大小`;
  } else if (dosage <= 4) {
    return `约${dosage.toFixed(1)}${unit}，约一枚硬币大小`;
  } else {
    return `约${dosage.toFixed(1)}${unit}，适量涂抹全脸`;
  }
}

/** 护肤方案类型 */
export type RoutineLevel = "daily" | "professional" | "ultimate";

/** 护肤场景 */
export type RoutineScenario = "morning" | "evening" | "home" | "travel";

/** 场景中文名称 */
export const SCENARIO_LABELS: Record<RoutineScenario, { name: string; nameEn: string }> = {
  morning: { name: "晨间护肤", nameEn: "Morning Ritual" },
  evening: { name: "晚间护肤", nameEn: "Evening Ritual" },
  home: { name: "居家护理", nameEn: "Home Care" },
  travel: { name: "旅行护肤", nameEn: "Travel Care" },
};

/** 方案级别中文名称 */
export const LEVEL_LABELS: Record<RoutineLevel, { name: string; nameEn: string; desc: string }> = {
  daily: { name: "日常护肤", nameEn: "Daily", desc: "简约高效，适合日常使用" },
  professional: { name: "专业护肤", nameEn: "Professional", desc: "进阶呵护，深层滋养" },
  ultimate: { name: "极致护肤", nameEn: "Ultimate", desc: "奢华体验，极致焕颜" },
};

/** 护肤步骤 */
export interface SkincareStep {
  order: number;
  name: string;
  nameEn: string;
  productSlug: string;
  duration: string;
  description: string;
  dosage?: ProductDosage;
  frequency?: string; // 如"每周1-2次"
}

/** 护肤方案 */
export interface SkincareRoutine {
  level: RoutineLevel;
  scenario: RoutineScenario;
  steps: SkincareStep[];
  totalDuration: string;
  tips?: string[];
}

/**
 * 生成完整护肤方案
 */
export function generateSkincareRoutines(
  skinType: string,
  climate: ClimateType
): Record<RoutineLevel, Record<RoutineScenario, SkincareRoutine>> {
  return {
    daily: {
      morning: generateRoutine("daily", "morning", skinType, climate),
      evening: generateRoutine("daily", "evening", skinType, climate),
      home: generateRoutine("daily", "home", skinType, climate),
      travel: generateRoutine("daily", "travel", skinType, climate),
    },
    professional: {
      morning: generateRoutine("professional", "morning", skinType, climate),
      evening: generateRoutine("professional", "evening", skinType, climate),
      home: generateRoutine("professional", "home", skinType, climate),
      travel: generateRoutine("professional", "travel", skinType, climate),
    },
    ultimate: {
      morning: generateRoutine("ultimate", "morning", skinType, climate),
      evening: generateRoutine("ultimate", "evening", skinType, climate),
      home: generateRoutine("ultimate", "home", skinType, climate),
      travel: generateRoutine("ultimate", "travel", skinType, climate),
    },
  };
}

/**
 * 生成单个护肤方案
 */
function generateRoutine(
  level: RoutineLevel,
  scenario: RoutineScenario,
  skinType: string,
  climate: ClimateType
): SkincareRoutine {
  const steps = getStepsForRoutine(level, scenario, skinType, climate);
  const totalMinutes = steps.reduce((sum, step) => {
    // 解析时间：支持 "1-2分钟", "30秒", "15-20分钟" 等格式
    const duration = step.duration;
    if (duration.includes("秒")) {
      // 秒转分钟，向上取整到0.5分钟
      const secs = parseInt(duration) || 30;
      return sum + Math.ceil(secs / 60);
    }
    // 取范围的中间值或单个值
    const match = duration.match(/(\d+)(?:-(\d+))?/);
    if (match) {
      const min = parseInt(match[1]) || 1;
      const max = match[2] ? parseInt(match[2]) : min;
      return sum + Math.round((min + max) / 2);
    }
    return sum + 1;
  }, 0);

  return {
    level,
    scenario,
    steps,
    totalDuration: `${totalMinutes}分钟`,
    tips: getRoutineTips(level, scenario, climate),
  };
}

/**
 * 获取护肤步骤列表
 */
function getStepsForRoutine(
  level: RoutineLevel,
  scenario: RoutineScenario,
  skinType: string,
  climate: ClimateType
): SkincareStep[] {
  // 基础步骤定义
  const cleanseStep: SkincareStep = {
    order: 1,
    name: "洁面",
    nameEn: "Cleanse",
    productSlug: "foam-cleanser",
    duration: "1-2分钟",
    description: "云朵洁面慕斯打出绵密泡沫，轻柔按摩全脸后冲洗",
    dosage: getProductDosage("foam-cleanser", skinType, climate) || undefined,
  };

  const serumStep: SkincareStep = {
    order: 2,
    name: "精华",
    nameEn: "Serum",
    productSlug: "serum",
    duration: "30秒",
    description: "修护紧致精华轻拍于面部，由内向外按压至吸收",
    dosage: getProductDosage("serum", skinType, climate) || undefined,
  };

  const creamStep: SkincareStep = {
    order: 3,
    name: "面霜",
    nameEn: "Cream",
    productSlug: "face-cream",
    duration: "1分钟",
    description: "逆龄面霜均匀涂抹，配合提拉手法锁住营养",
    dosage: getProductDosage("face-cream", skinType, climate) || undefined,
  };

  const sunscreenStep: SkincareStep = {
    order: 4,
    name: "防晒",
    nameEn: "Sunscreen",
    productSlug: "sunscreen",
    duration: "30秒",
    description: "轻透防晒霜均匀涂抹，日间外出必备",
    dosage: getProductDosage("sunscreen", skinType, climate) || undefined,
  };

  const scrubStep: SkincareStep = {
    order: 2,
    name: "去角质",
    nameEn: "Scrub",
    productSlug: "face-scrub",
    duration: "2-3分钟",
    description: "匀衡磨砂膏轻柔打圈按摩，去除老废角质",
    dosage: getProductDosage("face-scrub", skinType, climate) || undefined,
    frequency: "每周1-2次",
  };

  const maskStep: SkincareStep = {
    order: 3,
    name: "面膜",
    nameEn: "Mask",
    productSlug: "face-mask",
    duration: "15-20分钟",
    description: "臻萃修护面膜敷于面部，静享密集滋养",
    dosage: getProductDosage("face-mask", skinType, climate) || undefined,
    frequency: "每周2-3次",
  };

  const oilStep: SkincareStep = {
    order: 4,
    name: "护理油",
    nameEn: "Oil",
    productSlug: "treatment-oil",
    duration: "1分钟",
    description: "臻萃护理油温热后轻按，深层滋养修护",
    dosage: { productSlug: "treatment-oil", productName: "臻萃护理油", productNameEn: "Treatment Oil", dosage: 3, unit: "滴", description: "3-5滴，温热后轻拍" },
  };

  // 辅助函数：为步骤数组设置正确的 order
  const setOrders = (steps: SkincareStep[]): SkincareStep[] => {
    return steps.map((step, index) => ({ ...step, order: index + 1 }));
  };

  // 根据level和scenario组合步骤
  if (scenario === "morning") {
    if (level === "daily") {
      return setOrders([cleanseStep, creamStep, sunscreenStep]);
    } else if (level === "professional") {
      return setOrders([cleanseStep, serumStep, creamStep, sunscreenStep]);
    } else {
      return setOrders([cleanseStep, serumStep, { ...oilStep, description: "护理油与精华混合使用，加强滋养" }, creamStep, sunscreenStep]);
    }
  }

  if (scenario === "evening") {
    if (level === "daily") {
      return setOrders([cleanseStep, creamStep]);
    } else if (level === "professional") {
      return setOrders([cleanseStep, serumStep, creamStep]);
    } else {
      return setOrders([cleanseStep, { ...scrubStep, frequency: "每周1次晚间使用" }, serumStep, maskStep, oilStep, creamStep]);
    }
  }

  if (scenario === "home") {
    if (level === "daily") {
      return setOrders([cleanseStep, { ...maskStep, frequency: "放松时敷用" }, creamStep]);
    } else if (level === "professional") {
      return setOrders([cleanseStep, scrubStep, maskStep, serumStep, creamStep]);
    } else {
      return setOrders([cleanseStep, scrubStep, { ...maskStep, duration: "20分钟", description: "配合按摩仪使用效果更佳" }, serumStep, oilStep, creamStep]);
    }
  }

  // travel
  if (level === "daily") {
    return setOrders([{ ...cleanseStep, description: "旅途便携装，快速清洁" }, { ...creamStep, description: "机舱干燥环境下加强保湿" }]);
  } else if (level === "professional") {
    return setOrders([cleanseStep, serumStep, creamStep, sunscreenStep]);
  } else {
    return setOrders([cleanseStep, serumStep, maskStep, creamStep, sunscreenStep]);
  }
}

/**
 * 获取护肤方案小贴士
 */
function getRoutineTips(level: RoutineLevel, scenario: RoutineScenario, climate: ClimateType): string[] {
  const tips: string[] = [];

  // 气候相关提示
  if (climate === "W1" || climate === "M1") {
    tips.push("寒冷干燥环境下，建议增加面霜用量，加强保湿");
  } else if (climate === "S2") {
    tips.push("炎热潮湿环境下，可适当减少面霜用量，选择清爽质地");
  } else if (climate === "A1") {
    tips.push("干燥环境下注意补水，可随身携带保湿喷雾");
  }

  // 场景相关提示
  if (scenario === "morning") {
    tips.push("晨间护肤后等待2-3分钟再上妆，妆效更服帖");
  } else if (scenario === "evening") {
    tips.push("晚间护肤是肌肤修护的黄金时段，建议10点前完成");
  } else if (scenario === "travel") {
    tips.push("机舱内可随时补涂保湿产品，保持肌肤水润");
    tips.push("高海拔地区紫外线更强，防晒需加量");
  }

  // 级别相关提示
  if (level === "ultimate") {
    tips.push("极致护肤建议配合面部按摩手法，提升吸收效果");
  }

  return tips;
}

