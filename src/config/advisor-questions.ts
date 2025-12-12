/**
 * AI 护肤顾问问题配置
 * 共 8 道问题，收集用户护肤需求和肌肤状况
 */

export interface QuestionOption {
  value: string;
  label: string;
  description: string;
  emoji?: string;
}

export interface Question {
  id: number;
  fieldName: string;
  question: string;
  subtext?: string;
  options: QuestionOption[];
}

export const advisorQuestions: Question[] = [
  {
    id: 1,
    fieldName: "skinType",
    question: "你的肌肤类型是？",
    subtext: "选择最符合你日常感受的选项",
    options: [
      { value: "dry", label: "干性肌肤", description: "常感紧绷、脱皮", emoji: "🏜️" },
      { value: "oily", label: "油性肌肤", description: "容易出油、有光泽", emoji: "✨" },
      { value: "combination", label: "混合性肌肤", description: "T区油、两颊干", emoji: "🔄" },
      { value: "sensitive", label: "敏感性肌肤", description: "易泛红、刺激", emoji: "🌸" },
      { value: "normal", label: "中性肌肤", description: "水油平衡、状态稳定", emoji: "💧" },
      { value: "unknown", label: "不太确定", description: "需要专业判断", emoji: "❓" },
    ],
  },
  {
    id: 2,
    fieldName: "primaryConcern",
    question: "你最关注的肌肤问题是？",
    subtext: "选择最想改善的问题",
    options: [
      { value: "aging", label: "细纹抗老", description: "淡化细纹、紧致提升", emoji: "⏰" },
      { value: "dull", label: "暗沉提亮", description: "提亮肤色、焕发光彩", emoji: "💡" },
      { value: "hydration", label: "补水保湿", description: "深层补水、持久锁水", emoji: "💦" },
      { value: "pores", label: "毛孔粗大", description: "收缩毛孔、细腻肌肤", emoji: "🔍" },
      { value: "sensitive", label: "敏感泛红", description: "舒缓镇静、修护屏障", emoji: "🛡️" },
      { value: "acne", label: "痘痘粉刺", description: "清除痘痘、预防反复", emoji: "🎯" },
    ],
  },
  {
    id: 3,
    fieldName: "ageRange",
    question: "你的年龄段是？",
    subtext: "不同年龄肌肤需求不同",
    options: [
      { value: "18-24", label: "18-24 岁", description: "肌肤年轻、预防为主", emoji: "🌱" },
      { value: "25-30", label: "25-30 岁", description: "初抗老阶段", emoji: "🌿" },
      { value: "31-40", label: "31-40 岁", description: "抗老保养关键期", emoji: "🌳" },
      { value: "41-50", label: "41-50 岁", description: "深度抗老需求", emoji: "🍂" },
      { value: "50+", label: "50 岁以上", description: "修护滋养为主", emoji: "🍁" },
    ],
  },
  {
    id: 4,
    fieldName: "currentRoutine",
    question: "你目前的护肤习惯是？",
    subtext: "了解你的日常护肤流程",
    options: [
      { value: "minimal", label: "极简护肤", description: "洁面+保湿即可", emoji: "1️⃣" },
      { value: "basic", label: "基础护肤", description: "洁面、面霜基本步骤", emoji: "3️⃣" },
      { value: "complete", label: "完整护肤", description: "精华、面霜、防晒都用", emoji: "5️⃣" },
      { value: "advanced", label: "进阶护理", description: "会用护理油、面膜等", emoji: "🔬" },
      { value: "none", label: "几乎不护肤", description: "想开始但不知如何", emoji: "🆕" },
    ],
  },
  {
    id: 5,
    fieldName: "allergies",
    question: "你有以下过敏情况吗？",
    subtext: "帮助我们排除不适合的成分",
    options: [
      { value: "none", label: "没有过敏史", description: "大部分产品都能用", emoji: "✅" },
      { value: "fragrance", label: "香精过敏", description: "对香料成分敏感", emoji: "🌺" },
      { value: "alcohol", label: "酒精过敏", description: "对酒精成分敏感", emoji: "🚫" },
      { value: "acid", label: "酸类不耐受", description: "用果酸等会刺激", emoji: "⚠️" },
      { value: "multiple", label: "多种过敏", description: "需要特别小心", emoji: "🔴" },
      { value: "unknown", label: "不太清楚", description: "没有特别注意过", emoji: "❓" },
    ],
  },
  {
    id: 6,
    fieldName: "budget",
    question: "你的护肤预算是？",
    subtext: "方便我们推荐合适价位的产品",
    options: [
      { value: "budget", label: "追求性价比", description: "¥500 以内/月", emoji: "💰" },
      { value: "mid", label: "中等预算", description: "¥500-1500/月", emoji: "💎" },
      { value: "premium", label: "品质优先", description: "¥1500-3000/月", emoji: "👑" },
      { value: "luxury", label: "不设上限", description: "只选最好的", emoji: "✨" },
    ],
  },
  {
    id: 7,
    fieldName: "pregnancyStatus",
    question: "您目前是否处于备孕、孕期、产后或哺乳期？",
    subtext: "帮助我们提供更安全的产品建议",
    options: [
      { value: "yes", label: "是", description: "我们将提供特别关怀建议", emoji: "🤰" },
      { value: "no", label: "否", description: "无特殊时期", emoji: "✅" },
      { value: "private", label: "暂不透露", description: "跳过此问题", emoji: "🔒" },
    ],
  },
  {
    id: 8,
    fieldName: "medicationHistory",
    question: "关于肌肤的护理与用药经历，以下哪项最符合？",
    subtext: "帮助我们了解您的肌肤护理背景",
    options: [
      { value: "routine", label: "常规护理", description: "仅使用护肤品，未长期使用药膏或口服药", emoji: "🧴" },
      { value: "occasional", label: "偶有用药", description: "仅在严重时短期使用过非处方药膏，非长期依赖", emoji: "💊" },
      { value: "ongoing", label: "持续治疗", description: "目前或近期（6个月内）正在医生指导下使用处方药", emoji: "🏥" },
      { value: "complex", label: "情况复杂", description: "有明确皮肤病史或长期用药史，希望获得更谨慎的建议", emoji: "⚕️" },
    ],
  },
];

/**
 * 获取问题总数
 */
export const getTotalQuestions = () => advisorQuestions.length;

/**
 * 根据 ID 获取问题
 */
export const getQuestionById = (id: number) => 
  advisorQuestions.find((q) => q.id === id);

/**
 * 根据字段名获取问题
 */
export const getQuestionByFieldName = (fieldName: string) =>
  advisorQuestions.find((q) => q.fieldName === fieldName);

