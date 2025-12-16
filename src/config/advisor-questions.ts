/**
 * AI 护肤顾问问题配置 - NIHPLOD 旎柏品牌
 * 共 8 道问题，以高奢品牌语调收集用户护肤需求和肌肤状况
 *
 * 品牌语调：优雅、专业、关怀、精致
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
    question: "您的肌肤属于哪种类型？",
    subtext: "请选择最贴近您日常肌肤感受的选项",
    options: [
      { value: "dry", label: "干性肌肤", description: "时常感到紧绷，偶有脱屑", emoji: "🏜️" },
      { value: "oily", label: "油性肌肤", description: "肌肤易泛油光，毛孔较明显", emoji: "✨" },
      { value: "combination", label: "混合性肌肤", description: "T区偏油，两颊偏干", emoji: "🔄" },
      { value: "sensitive", label: "敏感性肌肤", description: "易泛红，对刺激较敏感", emoji: "🌸" },
      { value: "normal", label: "中性肌肤", description: "水油平衡，肌肤状态稳定", emoji: "💧" },
      { value: "unknown", label: "尚不确定", description: "期待专业分析", emoji: "❓" },
    ],
  },
  {
    id: 2,
    fieldName: "primaryConcern",
    question: "您最希望改善的肌肤问题是？",
    subtext: "让我们了解您的核心护肤诉求",
    options: [
      { value: "aging", label: "细纹抗老", description: "淡化岁月痕迹，重塑紧致轮廓", emoji: "⏰" },
      { value: "dull", label: "暗沉提亮", description: "唤醒肌肤光彩，焕发自然光泽", emoji: "💡" },
      { value: "hydration", label: "深层保湿", description: "深度滋润，持久锁住水润", emoji: "💦" },
      { value: "pores", label: "毛孔细致", description: "收敛毛孔，呈现细腻肤质", emoji: "🔍" },
      { value: "sensitive", label: "舒缓修护", description: "镇静舒缓，强韧肌肤屏障", emoji: "🛡️" },
      { value: "acne", label: "净痘调理", description: "净化肌肤，预防反复困扰", emoji: "🎯" },
    ],
  },
  {
    id: 3,
    fieldName: "ageRange",
    question: "您的年龄区间是？",
    subtext: "不同年龄阶段，肌肤需求各有侧重",
    options: [
      { value: "18-24", label: "18-24 岁", description: "青春肌肤，以预防为主", emoji: "🌱" },
      { value: "25-30", label: "25-30 岁", description: "初抗老阶段，开启精致护理", emoji: "🌿" },
      { value: "31-40", label: "31-40 岁", description: "抗老黄金期，深度养护", emoji: "🌳" },
      { value: "41-50", label: "41-50 岁", description: "进阶抗老，焕活肌肤能量", emoji: "🍂" },
      { value: "50+", label: "50 岁以上", description: "臻享修护，滋养呵护", emoji: "🍁" },
    ],
  },
  {
    id: 4,
    fieldName: "currentRoutine",
    question: "您目前的护肤习惯是？",
    subtext: "帮助我们了解您的日常护肤仪式",
    options: [
      { value: "minimal", label: "极简护肤", description: "洁面与保湿，简约而精致", emoji: "1️⃣" },
      { value: "basic", label: "基础护肤", description: "洁面、精华、面霜基础步骤", emoji: "3️⃣" },
      { value: "complete", label: "完整护肤", description: "精华、面霜、防晒一应俱全", emoji: "5️⃣" },
      { value: "advanced", label: "进阶护理", description: "护理油、面膜等深度养护", emoji: "🔬" },
      { value: "none", label: "刚刚起步", description: "期待开启专属护肤之旅", emoji: "🆕" },
    ],
  },
  {
    id: 5,
    fieldName: "allergies",
    question: "您是否有成分敏感情况？",
    subtext: "帮助我们为您甄选更安心的产品",
    options: [
      { value: "none", label: "无敏感史", description: "大多数产品均可安心使用", emoji: "✅" },
      { value: "fragrance", label: "香精敏感", description: "对香料成分较为敏感", emoji: "🌺" },
      { value: "alcohol", label: "酒精敏感", description: "对酒精成分较为敏感", emoji: "🚫" },
      { value: "acid", label: "酸类不耐受", description: "使用果酸等易感不适", emoji: "⚠️" },
      { value: "multiple", label: "多重敏感", description: "需要格外谨慎选择", emoji: "🔴" },
      { value: "unknown", label: "尚不清楚", description: "未曾特别留意", emoji: "❓" },
    ],
  },
  {
    id: 6,
    fieldName: "budget",
    question: "您的护肤投入预期是？",
    subtext: "让我们为您推荐最适合的产品组合",
    options: [
      { value: "budget", label: "精明之选", description: "月均 ¥500 以内", emoji: "💰" },
      { value: "mid", label: "品质生活", description: "月均 ¥500-1500", emoji: "💎" },
      { value: "premium", label: "臻享品质", description: "月均 ¥1500-3000", emoji: "👑" },
      { value: "luxury", label: "奢享无限", description: "只为最好的自己", emoji: "✨" },
    ],
  },
  {
    id: 7,
    fieldName: "pregnancyStatus",
    question: "您目前是否处于特殊时期？",
    subtext: "备孕、孕期、产后或哺乳期，我们将提供更安心的建议",
    options: [
      { value: "yes", label: "是的", description: "我们将为您提供特别关怀", emoji: "🤰" },
      { value: "no", label: "否", description: "无特殊时期", emoji: "✅" },
      { value: "private", label: "暂不透露", description: "跳过此问题", emoji: "🔒" },
    ],
  },
  {
    id: 8,
    fieldName: "medicationHistory",
    question: "关于肌肤护理与用药经历",
    subtext: "帮助我们更全面地了解您的肌肤状况",
    options: [
      { value: "routine", label: "日常护理", description: "仅使用护肤品，无长期用药史", emoji: "🧴" },
      { value: "occasional", label: "偶有用药", description: "仅在需要时短期使用过非处方药膏", emoji: "💊" },
      { value: "ongoing", label: "持续治疗中", description: "目前或近期正在医生指导下用药", emoji: "🏥" },
      { value: "complex", label: "情况较复杂", description: "有皮肤病史或长期用药史", emoji: "⚕️" },
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

