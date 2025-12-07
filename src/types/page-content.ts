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
  // 底部版权
  copyright?: string;
}

// ============================================
// 品牌故事页面 (story)
// ============================================
export interface StoryPageContent {
  hero: HeroSection;
  intro: {
    title: string;
    content: string;
  };
  sections: ContentSection[];
  timeline?: Array<{
    year: string;
    event: string;
    description?: string;
  }>;
  values?: Array<{
    icon?: string;
    title: string;
    description: string;
  }>;
}

// ============================================
// 美丽仪式页面 (ritual)
// ============================================
export interface RitualPageContent {
  hero: HeroSection;
  intro: {
    title: string;
    content: string;
  };
  steps: Array<{
    id: string;
    order: number;
    title: string;
    description: string;
    image?: string;
    products?: string[]; // 关联产品 ID
  }>;
  tips?: Array<{
    title: string;
    content: string;
  }>;
}

// ============================================
// 联系我们页面 (contact)
// ============================================
export interface ContactPageContent {
  hero: HeroSection;
  info: {
    address: string;
    email: string;
    phone?: string;
    wechat?: string;
    workingHours?: string;
  };
  mapEmbed?: string;
  formTitle?: string;
  formDescription?: string;
}

// ============================================
// 加入我们页面 (careers)
// ============================================
export interface CareersPageContent {
  hero: HeroSection;
  intro: {
    title: string;
    content: string;
  };
  benefits?: Array<{
    icon?: string;
    title: string;
    description: string;
  }>;
  culture?: {
    title: string;
    content: string;
    images?: string[];
  };
  contactEmail?: string;
}

// ============================================
// 隐私政策页面 (privacy)
// ============================================
export interface PrivacyPageContent {
  title: string;
  lastUpdated?: string;
  sections: Array<{
    title: string;
    content: string;
  }>;
}

// ============================================
// 服务条款页面 (terms)
// ============================================
export interface TermsPageContent {
  title: string;
  lastUpdated?: string;
  sections: Array<{
    title: string;
    content: string;
  }>;
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
  story: { name: "品牌故事", description: "品牌历史与理念" },
  ritual: { name: "美丽仪式", description: "护肤步骤指南" },
  contact: { name: "联系我们", description: "联系方式与表单" },
  careers: { name: "加入我们", description: "招聘信息" },
  privacy: { name: "隐私政策", description: "隐私条款" },
  terms: { name: "服务条款", description: "使用条款" },
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
      copyright: "NIHPLOD All Rights Reserved.",
    },
    story: {
      hero: { title: "", subtitle: "" },
      intro: { title: "", content: "" },
      sections: [],
      timeline: [],
    },
    ritual: {
      hero: { title: "", subtitle: "" },
      intro: { title: "", content: "" },
      steps: [],
    },
    contact: {
      hero: { title: "", subtitle: "" },
      info: { address: "", email: "" },
    },
    careers: {
      hero: { title: "", subtitle: "" },
      intro: { title: "", content: "" },
    },
    privacy: {
      title: "隐私政策",
      sections: [],
    },
    terms: {
      title: "服务条款",
      sections: [],
    },
  };

  return templates[slug] as PageContentMap[typeof slug];
}

