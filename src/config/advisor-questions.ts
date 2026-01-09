/**
 * AI 护肤顾问问题配置 - NIHPLOD 旎柏品牌
 * 共 8 道问题，以高奢品牌语调收集用户护肤需求和肌肤状况
 *
 * 品牌语调：优雅、专业、关怀、精致
 */

export interface QuestionOption {
  value: string;
  label: string;
  description?: string;
  emoji?: string;
}

export interface Question {
  id: number;
  fieldName: string;
  question: string;
  subtext?: string;
  type?: "single" | "multiple";
  options: QuestionOption[];
  gender?: "male" | "female" | "all";
}

export const advisorQuestions: Question[] = [
  {
    id: 1,
    fieldName: "skinType",
    question: "您的肌肤类型更偏向？",
    subtext: "请选择最贴近您日常肌肤感受的选项",
    gender: "all",
    options: [
      { value: "sensitive", label: "敏感性肌肤", description: "易泛红、刺痛、发痒。", emoji: "🌸" },
      { value: "normal", label: "中性肌肤", description: "不油不干，状态稳定。", emoji: "💧" },
      { value: "combination", label: "混合型肌肤", description: "T区（额头、鼻、下巴）油，两颊干/中性。", emoji: "🔄" },
      { value: "dry", label: "干性肌肤", description: "全脸干燥，易起皮、紧绷。", emoji: "🏜️" },
      { value: "combination_dry", label: "混干性肌肤", description: "T区中性或微油，两颊明显干燥。", emoji: "🍂" },
      { value: "oily", label: "油性肌肤", description: "全脸易出油、毛孔明显。", emoji: "✨" },
      { value: "combination_oily", label: "混油性肌肤", description: "T区很油，两颊和眼周偏干燥。", emoji: "💫" },
      { value: "unknown", label: "我不太确定", description: "可根据日常感受猜测，或选此项由系统辅助判断。", emoji: "❓" },
    ],
  },
  {
    id: 2,
    fieldName: "pregnancyStatus",
    question: "您目前是否处于特殊时期？",
    subtext: "备孕、孕期、产后或哺乳期，我们将提供更安心的建议",
    gender: "female",
    options: [
      { value: "yes", label: "是的", description: "我们将为您提供特别关怀", emoji: "🤰" },
      { value: "no", label: "否", description: "无特殊时期", emoji: "✅" },
    ],
  },
  {
    id: 3,
    fieldName: "medicalBeautyHistory",
    question: "您在近6个月内是否有过轻医美或手术型医美经历？",
    subtext: "帮助我们为您避开不适用的成分",
    gender: "female",
    options: [
      { value: "none", label: "没有", description: "不考虑任何医美方案", emoji: "❌" },
      { value: "planning", label: "暂时没有", description: "有计划轻医美/手术型医美的打算或可能", emoji: "📅" },
      { value: "light", label: "有过轻医美治疗", description: "有过注射或仪器类治疗", emoji: "💉" },
      { value: "surgery", label: "有过手术类医美治疗", description: "有过面部、眼部、鼻部创伤性调整", emoji: "🏥" },
    ],
  },
  {
    id: 4,
    fieldName: "primaryConcern",
    question: "您最关注的肌肤问题是哪些？",
    subtext: "可多选，让我们了解您的核心护肤诉求",
    type: "multiple",
    gender: "all",
    options: [
      { value: "anti_aging", label: "延衰抗老", description: "改善松弛、皱纹、皮肤弹性。", emoji: "🕰️" },
      { value: "fine_lines", label: "淡化细纹", description: "针对眼角、额头及颈部等已形成的细纹。", emoji: "〰️" },
      { value: "dullness", label: "暗沉提亮", description: "改善肤色发黄、不透亮。", emoji: "🌟" },
      { value: "pigmentation", label: "色素不均", description: "指色斑、痘印等局部颜色深浅不一。", emoji: "🌖" },
      { value: "hydration", label: "补水保湿", description: "缓解干燥、起皮、紧绷感。", emoji: "💧" },
      { value: "pores", label: "毛孔粗大", description: "主要指鼻翼、脸颊的明显毛孔。", emoji: "🍊" },
      { value: "sensitivity", label: "敏感泛红", description: "皮肤易受刺激出现发红、发热。", emoji: "🌸" },
      { value: "acne", label: "痘痘粉刺", description: "包括黑头、白头、红肿痘痘。", emoji: "🔴" },
    ],
  },
  {
    id: 5,
    fieldName: "ageRange",
    question: "您的年龄段是？",
    subtext: "不同年龄阶段，肌肤需求各有侧重",
    gender: "all",
    options: [
      { value: "under_23", label: "<23 岁", description: "青春肌肤，以预防为主", emoji: "🌱" },
      { value: "23-30", label: "23-30 岁", description: "初抗老阶段，开启精致护理", emoji: "🌿" },
      { value: "31-40", label: "31-40 岁", description: "抗老黄金期，深度养护", emoji: "🌳" },
      { value: "41-50", label: "41-50 岁", description: "进阶抗老，焕活肌肤能量", emoji: "🍂" },
      { value: "above_50", label: ">50 岁", description: "臻享修护，滋养呵护", emoji: "🍁" },
    ],
  },
  {
    id: 6,
    fieldName: "currentRoutine",
    question: "您目前的护肤水平是？",
    subtext: "帮助我们了解您的日常护肤仪式",
    gender: "all",
    options: [
      { value: "beginner", label: "全新小白", description: "不太了解护肤步骤和成分。", emoji: "🆕" },
      { value: "basic", label: "基础入门", description: "知道洁面、水乳、防晒等基础步骤。", emoji: "🧴" },
      { value: "intermediate", label: "略有心得", description: "会根据肤质挑选产品，关注部分功效成分。", emoji: "📖" },
      { value: "advanced", label: "资深达人", description: "能看懂成分表，擅长搭配不同功效产品。", emoji: "🔬" },
      { value: "expert", label: "行业专家", description: "从事护肤、美容等相关专业工作。", emoji: "🎓" },
    ],
  },
  {
    id: 7,
    fieldName: "skincareHabit",
    question: "您的护肤习惯是？",
    subtext: "帮助我们了解您的日常投入度",
    gender: "all",
    options: [
      { value: "rarely", label: "几乎不护肤", description: "很少护肤或随意护肤。", emoji: "❌" },
      { value: "simple", label: "简易打理", description: "仅进行 1-2 步基础护理（如只涂面霜）。", emoji: "🧴" },
      { value: "dedicated", label: "认真对待", description: "追求合适的产品、使用步骤和方法，偶尔使用居家美容仪器。", emoji: "✨" },
      { value: "professional", label: "专业护理", description: "定期或不定期的进行医美或专业院线级护理。", emoji: "💆‍♀️" },
    ],
  },
  {
    id: 8,
    fieldName: "allergies",
    question: "您是否有成分敏感情况？",
    subtext: "帮助我们为您甄选更安心的产品",
    gender: "all",
    options: [
      { value: "none", label: "无敏感史", description: "从未对护肤品或成分过敏", emoji: "✅" },
      { value: "fragrance", label: "香精敏感", description: "对护肤品中的\"香精\"成分敏感", emoji: "🌺" },
      { value: "alcohol", label: "酒精敏感", description: "对\"乙醇\"、\"变性乙醇\"等成分敏感", emoji: "🚫" },
      { value: "acid", label: "酸类不耐受", description: "使用水杨酸、果酸等产品易刺痛泛红", emoji: "⚠️" },
      { value: "multiple", label: "多重敏感", description: "对多种成分或产品类型有过过敏反应", emoji: "🔴" },
      { value: "unknown", label: "尚不清楚", description: "不确定自己对哪些成分过敏", emoji: "❓" },
    ],
  },
  {
    id: 9,
    fieldName: "budget",
    question: "您的护肤预算是？",
    subtext: "让我们为您推荐最适合的产品组合",
    gender: "all",
    options: [
      { value: "budget", label: "追求性价比", emoji: "💰" },
      { value: "mid", label: "中等预算", emoji: "💎" },
      { value: "premium", label: "品质优先", emoji: "👑" },
      { value: "luxury", label: "不设上限", emoji: "✨" },
      { value: "unknown", label: "不确定", description: "暂无明确预算，期待专业建议", emoji: "❓" },
    ],
  },
  {
    id: 10,
    fieldName: "medicationHistory",
    question: "关于肌肤护理与用药经历",
    subtext: "帮助我们更全面地了解您的肌肤状况",
    gender: "all",
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

