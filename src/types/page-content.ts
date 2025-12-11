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
      footerLinks: [
        { text: "关于旎柏", href: "/story" },
        { text: "护肤仪式", href: "/ritual" },
        { text: "联系我们", href: "/contact" },
        { text: "加入我们", href: "/careers" },
        { text: "隐私政策", href: "/privacy" },
        { text: "服务入口", href: "/services" },
      ],
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
      title: "服务条款",
      sections: [],
    },
  };

  return templates[slug] as PageContentMap[typeof slug];
}

