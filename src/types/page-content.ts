/**
 * 页面内容类型定义
 * 不同页面有不同的内容结构
 */

// SEO 配置
export interface SeoConfig {
  title?: string;
  description?: string;
  keywords?: string;
  ogImage?: string;
}

// 通用 Hero 区块
export interface HeroSection {
  title: string;
  subtitle?: string;
  backgroundImage?: string;
}

// 通用内容区块
export interface ContentSection {
  id: string;
  title: string;
  content: string;
  image?: string;
  layout: "left" | "right" | "center";
}

// ============================================
// 首页内容 (home) - 简洁品牌着陆页
// ============================================
export interface HomePageContent {
  // 品牌信息
  brand: {
    chineseName: string; // 中文名（旎柏）
    slogan: string; // 品牌语（逆转时光）
  };
  // 主要入口按钮
  buttons: {
    advisorText: string; // AI 顾问按钮文字
    advisorLink: string; // AI 顾问链接
    productsText: string; // 产品按钮文字
    productsLink: string; // 产品链接
  };
  // 底部导航链接
  footerLinks?: Array<{
    text: string;
    href: string;
  }>;
  // 底部版权
  copyright?: string;
}

// ============================================
// 关于旎柏页面 (story)
// ============================================

// 故事章节类型
export interface StorySection {
  type: "hero" | "section" | "mission-text" | "philosophy-item" | "media-image";
  title?: string;
  subtitle?: string;
  paragraphs?: string[];
  image?: string;
  imageAlt?: string;
}

// 单个标签页内容
export interface StoryTabContent {
  title: string;
  subtitle?: string; // 英文副标题
  slogan?: string; // 理念口号
  layout?: "default" | "cards" | "philosophy" | "mission-centered" | "media-images" | "awards-images";
  sections: StorySection[];
}

// 标签页ID
export type StoryTabId = "story" | "mission" | "philosophy" | "media" | "awards";

// 关于旎柏页面内容
export interface StoryPageContent {
  // 页面标题
  pageTitle: {
    en: string; // ABOUT NIHPLOD
    zh: string; // 关于旎柏
  };
  // 五个标签页内容
  tabs: Record<StoryTabId, StoryTabContent>;
}

// ============================================
// 护肤仪式页面 (ritual)
// ============================================

// 护肤步骤类型
export interface RitualStep {
  order: number;
  name: string;
  nameEn: string;
  description: string;
  duration: string;
  productSlug: string | null;
}

// 单个仪式标签页内容
export interface RitualTabContent {
  title: string;
  titleEn: string;
  description: string;
  steps: RitualStep[];
}

// 仪式标签页ID
export type RitualTabId = "morning" | "evening" | "couple" | "travel";

// 护肤仪式页面内容
export interface RitualPageContent {
  // 页面标题信息
  pageTitle: {
    en: string; // 英文标题 (SKINCARE RITUAL)
    zh: string; // 中文标题 (护肤仪式)
    description: string; // 副标题描述
  };
  // 三个标签页内容
  tabs: Record<RitualTabId, RitualTabContent>;
}

// ============================================
// 联系我们页面 (contact)
// ============================================
export interface ContactPageContent {
  // 页面标题
  title: {
    en: string; // 英文标题 (CONTACT US)
    zh: string; // 中文标题 (联系我们)
  };
  // 页面描述
  description: string;
  // 留言类型选项
  messageTypes?: Array<{
    value: string;
    label: string;
  }>;
  // 底部版权
  copyright?: string;
}

// ============================================
// 加入我们页面 (careers)
// ============================================
export interface CareersPageContent {
  // 页面标题
  title: {
    en: string; // 英文标题 (JOIN US)
    zh: string; // 中文标题 (加入我们)
  };
  // 页面描述
  description: string;
  // 投递提示
  submitTip?: {
    title: string;
    content: string;
  };
  // 失败时的联系邮箱
  contactEmail?: string;
}

// ============================================
// 隐私政策页面 (privacy)
// ============================================
export interface PrivacyPageContent {
  // 页面标题
  title: {
    en: string; // 英文标题 (PRIVACY POLICY)
    zh: string; // 中文标题 (隐私政策)
  };
  // 页面描述
  description: string;
  // 最后更新日期
  lastUpdated: string;
  // 四个标签页内容
  tabs: {
    // 信息收集
    collect: {
      title: string;
      content: string[]; // 每个元素是一个段落，支持换行符分隔小节
    };
    // 信息使用
    use: {
      title: string;
      content: string[];
    };
    // 信息保护
    protect: {
      title: string;
      content: string[];
    };
    // 您的权利
    rights: {
      title: string;
      content: string[];
    };
  };
}

// ============================================
// 服务条款页面 (terms)
// ============================================

// 服务条款标签页ID
export type TermsTabId = "general" | "product" | "responsibility" | "dispute";

// 服务条款标签页内容
export interface TermsTabContent {
  title: string;
  content: string[]; // 每个元素是一个段落
}

export interface TermsPageContent {
  // 页面标题
  pageTitle: {
    en: string; // TERMS OF SERVICE
    zh: string; // 服务条款
  };
  // 页面描述
  description: string;
  // 最后更新日期
  lastUpdated: string;
  // 四个标签页内容
  tabs: Record<TermsTabId, TermsTabContent>;
}

// ============================================
// 服务入口页面 (services)
// ============================================

// 服务链接
export interface ServiceLink {
  label: string; // 用户端 / 管理端
  url: string;
  isAdmin: boolean;
  description: string;
}

// 单个服务详情
export interface ServiceDetail {
  id: string; // vip / website / influencer
  label: string; // 标签名称
  title: string; // 服务标题
  nameEn: string; // 英文名
  description: string; // 服务描述
  links: ServiceLink[];
}

// 服务入口页面内容
export interface ServicesPageContent {
  // 页面标题
  pageTitle: {
    en: string; // SERVICES
    zh: string; // 服务入口
  };
  // 服务列表
  services: ServiceDetail[];
}

// ============================================
// 产品列表页面 (products)
// ============================================
export interface ProductsPageContent {
  // 页面配置
  pageTitle: {
    en: string; // PRODUCTS
    zh: string; // 探索产品
  };
}

// ============================================
// AI 护肤顾问页面 (advisor)
// ============================================
export interface AdvisorPageContent {
  // 欢迎页标题
  welcome: {
    title: string; // AI 护肤顾问
    subtitle: string; // 描述文字
  };
}

// 页面类型映射
export type PageContentMap = {
  home: HomePageContent;
  story: StoryPageContent;
  ritual: RitualPageContent;
  contact: ContactPageContent;
  careers: CareersPageContent;
  privacy: PrivacyPageContent;
  terms: TermsPageContent;
  services: ServicesPageContent;
  products: ProductsPageContent;
  advisor: AdvisorPageContent;
};

export type PageSlug = keyof PageContentMap;

// 页面数据类型
export interface PageData<T extends PageSlug = PageSlug> {
  id: string;
  title: string;
  slug: T;
  content: PageContentMap[T];
  seo: SeoConfig | null;
  published: boolean;
  updatedAt: string;
}

// 页面列表项
export interface PageListItem {
  id: string;
  title: string;
  slug: string;
  published: boolean;
  updatedAt: string;
}

// 页面元数据（用于列表显示）
export const PAGE_META: Record<string, { name: string; description: string }> = {
  home: { name: "首页", description: "网站首页内容" },
  story: { name: "关于旎柏", description: "品牌故事、使命与理念" },
  ritual: { name: "护肤仪式", description: "护肤步骤指南" },
  contact: { name: "联系我们", description: "联系方式与表单" },
  careers: { name: "加入我们", description: "招聘信息" },
  privacy: { name: "隐私政策", description: "隐私条款" },
  terms: { name: "服务条款", description: "使用条款" },
  services: { name: "服务入口", description: "各系统服务入口导航" },
  products: { name: "产品列表", description: "产品展示页面配置" },
  advisor: { name: "AI 护肤顾问", description: "AI 顾问欢迎页配置" },
};

// 获取空白页面内容模板
export function getEmptyContent(slug: PageSlug): PageContentMap[typeof slug] {
  const templates: Record<PageSlug, unknown> = {
    home: {
      brand: { chineseName: "旎柏", slogan: "逆转时光" },
      buttons: {
        advisorText: "AI 护肤顾问",
        advisorLink: "/advisor",
        productsText: "探索产品",
        productsLink: "/products",
      },
      footerLinks: [
        { text: "关于旎柏", href: "/about" },
        { text: "官方指南", href: "/guide" },
        { text: "联系我们", href: "/contact" },
        { text: "加入我们", href: "/careers" },
        { text: "隐私政策", href: "/privacy" },
        { text: "服务入口", href: "/services" },
      ],
      copyright: "NIHPLOD All Rights Reserved.",
    },
    story: {
      pageTitle: { en: "ABOUT NIHPLOD", zh: "关于旎柏" },
      tabs: {
        story: { title: "品牌故事", sections: [] },
        mission: { title: "公司使命", subtitle: "OUR MISSION", layout: "mission-centered", sections: [] },
        philosophy: { title: "经营理念", subtitle: "OUR PHILOSOPHY", slogan: "", layout: "philosophy", sections: [] },
        media: { title: "媒体报道", subtitle: "PRESS", layout: "media-images", sections: [] },
        awards: { title: "荣获奖项", layout: "awards-images", sections: [] },
      },
    },
    ritual: {
      pageTitle: {
        en: "SKINCARE RITUAL",
        zh: "护肤仪式",
        description: "每一次护肤，都是与自己对话的珍贵时光",
      },
      tabs: {
        morning: {
          title: "晨间仪式",
          titleEn: "MORNING RITUAL",
          description: "清晨护肤，唤醒肌肤活力，为新的一天注入能量",
          steps: [],
        },
        evening: {
          title: "晚间仪式",
          titleEn: "EVENING RITUAL",
          description: "夜间护肤，修护一天的疲惫，让肌肤在睡眠中焕新",
          steps: [],
        },
        couple: {
          title: "家庭护肤",
          titleEn: "FAMILY SKINCARE",
          description: "与家人一起，享受护肤的温馨时光，在彼此的呵护中，感受爱与美的交融",
          steps: [],
        },
      },
    },
    contact: {
      title: { en: "CONTACT US", zh: "联系我们" },
      description: "有任何问题或建议？我们期待与您的每一次交流",
      messageTypes: [
        { value: "consultation", label: "产品咨询" },
        { value: "cooperation", label: "商务合作" },
        { value: "feedback", label: "使用反馈" },
        { value: "complaint", label: "投诉建议" },
        { value: "other", label: "其他问题" },
      ],
      copyright: "NIHPLOD All Rights Reserved.",
    },
    careers: {
      title: { en: "JOIN US", zh: "加入我们" },
      description: "与热爱美好事物的人一起，创造高端护肤的未来",
      submitTip: {
        title: "简历投递",
        content: "请将简历直接投递到在招岗位的投递提交表单中\n简历命名格式：【应聘】职位名称 - 姓名",
      },
      contactEmail: "hr@nihplod.com",
    },
    privacy: {
      title: { en: "PRIVACY POLICY", zh: "隐私政策" },
      description: "我们重视并尊重您的隐私",
      lastUpdated: "2024年12月1日",
      tabs: {
        collect: {
          title: "信息收集",
          content: [],
        },
        use: {
          title: "信息使用",
          content: [],
        },
        protect: {
          title: "信息保护",
          content: [],
        },
        rights: {
          title: "您的权利",
          content: [],
        },
      },
    },
    terms: {
      pageTitle: { en: "TERMS OF SERVICE", zh: "服务条款" },
      description: "在使用我们的服务前，请仔细阅读以下条款",
      lastUpdated: "2024年12月1日",
      tabs: {
        general: { title: "总则", content: [] },
        product: { title: "产品服务", content: [] },
        responsibility: { title: "责任限制", content: [] },
        dispute: { title: "争议解决", content: [] },
      },
    },
    services: {
      pageTitle: { en: "SERVICES", zh: "服务入口" },
      services: [],
    },
    products: {
      pageTitle: { en: "PRODUCTS", zh: "探索产品" },
    },
    advisor: {
      welcome: {
        title: "AI 护肤顾问",
        subtitle: "通过 AI 智能分析，获取专属于您的个性化护肤方案",
      },
    },
  };

  return templates[slug] as PageContentMap[typeof slug];
}

