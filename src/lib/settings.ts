/**
 * 网站设置工具函数
 * 用于获取数据库中存储的网站配置
 */

import prisma from "@/lib/prisma";

// ============================================
// 类型定义
// ============================================

export interface SiteSettings {
  name: string;
  description: string;
  logo: string;
  favicon: string;
}

export interface SocialSettings {
  wechat_qrcode: string;
  weibo: string;
  xiaohongshu: string;
  douyin: string;
  instagram: string;
}

export interface ContactSettings {
  email: string;
  phone: string;
  address: string;
  workingHours: string;
}

export interface AllSettings {
  site: SiteSettings;
  social: SocialSettings;
  contact: ContactSettings;
}

// ============================================
// 默认值
// ============================================

const DEFAULT_SITE_SETTINGS: SiteSettings = {
  name: "NIHPLOD 旎柏",
  description: "源自摩纳哥的高端护肤品牌",
  logo: "/images/logo.png",
  favicon: "/favicon.ico",
};

const DEFAULT_SOCIAL_SETTINGS: SocialSettings = {
  wechat_qrcode: "",
  weibo: "",
  xiaohongshu: "",
  douyin: "",
  instagram: "",
};

const DEFAULT_CONTACT_SETTINGS: ContactSettings = {
  email: "",
  phone: "",
  address: "",
  workingHours: "",
};

// ============================================
// 服务端获取函数
// ============================================

/**
 * 获取站点设置 (服务端)
 */
export async function getSiteSettings(): Promise<SiteSettings> {
  try {
    const setting = await prisma.setting.findUnique({
      where: { key: "site" },
    });

    if (!setting || !setting.value) {
      return DEFAULT_SITE_SETTINGS;
    }

    return {
      ...DEFAULT_SITE_SETTINGS,
      ...(setting.value as Partial<SiteSettings>),
    };
  } catch (error) {
    console.error("获取站点设置失败:", error);
    return DEFAULT_SITE_SETTINGS;
  }
}

/**
 * 获取社交媒体设置 (服务端)
 */
export async function getSocialSettings(): Promise<SocialSettings> {
  try {
    const setting = await prisma.setting.findUnique({
      where: { key: "social" },
    });

    if (!setting || !setting.value) {
      return DEFAULT_SOCIAL_SETTINGS;
    }

    return {
      ...DEFAULT_SOCIAL_SETTINGS,
      ...(setting.value as Partial<SocialSettings>),
    };
  } catch (error) {
    console.error("获取社交设置失败:", error);
    return DEFAULT_SOCIAL_SETTINGS;
  }
}

/**
 * 获取联系信息设置 (服务端)
 */
export async function getContactSettings(): Promise<ContactSettings> {
  try {
    const setting = await prisma.setting.findUnique({
      where: { key: "contact" },
    });

    if (!setting || !setting.value) {
      return DEFAULT_CONTACT_SETTINGS;
    }

    return {
      ...DEFAULT_CONTACT_SETTINGS,
      ...(setting.value as Partial<ContactSettings>),
    };
  } catch (error) {
    console.error("获取联系设置失败:", error);
    return DEFAULT_CONTACT_SETTINGS;
  }
}

/**
 * 获取所有设置 (服务端)
 */
export async function getAllSettings(): Promise<AllSettings> {
  const [site, social, contact] = await Promise.all([
    getSiteSettings(),
    getSocialSettings(),
    getContactSettings(),
  ]);

  return { site, social, contact };
}

