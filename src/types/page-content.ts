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

// 隐私政策章节 ID
export type PrivacySectionId =
  | "summary"
  | "ch1" | "ch2" | "ch3" | "ch4" | "ch5"
  | "ch6" | "ch7" | "ch8" | "ch9" | "ch10"
  | "ch11" | "ch12" | "ch13" | "ch14";

// 隐私政策章节内容
export interface PrivacySectionContent {
  title: string;
  content: string[];
}

export interface PrivacyPageContent {
  // 页面标题
  pageTitle: {
    en: string; // PRIVACY POLICY
    zh: string; // 隐私政策
  };
  // 页面描述
  description: string;
  // 最后更新日期
  lastUpdated: string;
  // 章节内容
  sections: Record<PrivacySectionId, PrivacySectionContent>;
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
};

export type PageSlug = keyof PageContentMap;


