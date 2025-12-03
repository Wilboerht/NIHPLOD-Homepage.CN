/**
 * 微信 JS-SDK 集成
 * 用于在微信内置浏览器中实现自定义分享
 */

import crypto from "crypto";

// ============================================
// 类型定义
// ============================================

/** 微信配置签名 */
export interface WechatSignature {
  appId: string;
  timestamp: number;
  nonceStr: string;
  signature: string;
}

/** 分享数据 */
export interface WechatShareData {
  title: string;
  desc: string;
  link: string;
  imgUrl: string;
}

/** 缓存的 Access Token */
interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

/** 缓存的 JSApi Ticket */
interface CachedTicket {
  ticket: string;
  expiresAt: number;
}

// ============================================
// 缓存 (生产环境应使用 Redis)
// ============================================

let cachedAccessToken: CachedToken | null = null;
let cachedJsApiTicket: CachedTicket | null = null;

// ============================================
// 微信 API 调用
// ============================================

/**
 * 获取 Access Token
 * 有效期 7200 秒，需要缓存
 */
async function getAccessToken(): Promise<string> {
  const appId = process.env.WECHAT_APP_ID;
  const appSecret = process.env.WECHAT_APP_SECRET;

  if (!appId || !appSecret) {
    throw new Error("微信 AppID 或 AppSecret 未配置");
  }

  // 检查缓存
  const now = Date.now();
  if (cachedAccessToken && cachedAccessToken.expiresAt > now) {
    return cachedAccessToken.accessToken;
  }

  // 请求新的 Access Token
  const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${appId}&secret=${appSecret}`;
  
  const response = await fetch(url);
  const data = await response.json();

  if (data.errcode) {
    throw new Error(`获取 Access Token 失败: ${data.errmsg}`);
  }

  // 缓存 (提前 5 分钟过期，确保安全)
  cachedAccessToken = {
    accessToken: data.access_token,
    expiresAt: now + (data.expires_in - 300) * 1000,
  };

  return data.access_token;
}

/**
 * 获取 JSApi Ticket
 * 有效期 7200 秒，需要缓存
 */
async function getJsApiTicket(): Promise<string> {
  // 检查缓存
  const now = Date.now();
  if (cachedJsApiTicket && cachedJsApiTicket.expiresAt > now) {
    return cachedJsApiTicket.ticket;
  }

  // 先获取 Access Token
  const accessToken = await getAccessToken();

  // 请求 JSApi Ticket
  const url = `https://api.weixin.qq.com/cgi-bin/ticket/getticket?access_token=${accessToken}&type=jsapi`;
  
  const response = await fetch(url);
  const data = await response.json();

  if (data.errcode !== 0) {
    throw new Error(`获取 JSApi Ticket 失败: ${data.errmsg}`);
  }

  // 缓存 (提前 5 分钟过期)
  cachedJsApiTicket = {
    ticket: data.ticket,
    expiresAt: now + (data.expires_in - 300) * 1000,
  };

  return data.ticket;
}

// ============================================
// 签名生成
// ============================================

/**
 * 生成随机字符串
 */
function generateNonceStr(): string {
  return crypto.randomBytes(16).toString("hex");
}

/**
 * 生成签名
 */
function generateSign(
  ticket: string,
  nonceStr: string,
  timestamp: number,
  url: string
): string {
  // 按字典序排列参数
  const str = `jsapi_ticket=${ticket}&noncestr=${nonceStr}&timestamp=${timestamp}&url=${url}`;
  
  // SHA1 签名
  return crypto.createHash("sha1").update(str).digest("hex");
}

/**
 * 获取微信 JS-SDK 配置签名
 * @param url 当前页面 URL (不含 hash)
 */
export async function getWechatSignature(url: string): Promise<WechatSignature> {
  const appId = process.env.WECHAT_APP_ID;

  if (!appId) {
    throw new Error("微信 AppID 未配置");
  }

  // 获取 JSApi Ticket
  const ticket = await getJsApiTicket();

  // 生成签名参数
  const nonceStr = generateNonceStr();
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = generateSign(ticket, nonceStr, timestamp, url);

  return {
    appId,
    timestamp,
    nonceStr,
    signature,
  };
}

// ============================================
// 工具函数
// ============================================

/**
 * 检测是否在微信浏览器中
 */
export function isWechatBrowser(): boolean {
  if (typeof window === "undefined") return false;
  
  const ua = window.navigator.userAgent.toLowerCase();
  return ua.includes("micromessenger");
}

/**
 * 清除缓存 (用于调试)
 */
export function clearWechatCache(): void {
  cachedAccessToken = null;
  cachedJsApiTicket = null;
}

/**
 * 获取默认分享图片 URL
 */
export function getDefaultShareImage(): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "";
  return `${baseUrl}/images/og-image.jpg`;
}

/**
 * 格式化分享链接
 * 移除 hash，添加分享标记
 */
export function formatShareUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    urlObj.hash = ""; // 移除 hash
    urlObj.searchParams.set("from", "wechat");
    return urlObj.toString();
  } catch {
    return url;
  }
}

