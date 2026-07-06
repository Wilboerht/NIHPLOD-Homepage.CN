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
let accessTokenPromise: Promise<string> | null = null;
let jsApiTicketPromise: Promise<string> | null = null;

// ============================================
// 微信 API 调用
// ============================================

/**
 * 获取 Access Token
 * 有效期 7200 秒，需要缓存
 * 使用 Promise 锁防止并发刷新导致频率超限
 */
export async function getWechatAccessToken(): Promise<string> {
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

  // 如果已有请求在获取中，复用该 Promise
  if (accessTokenPromise) {
    return accessTokenPromise;
  }

  accessTokenPromise = (async () => {
    try {
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
    } finally {
      accessTokenPromise = null;
    }
  })();

  return accessTokenPromise;
}

/**
 * 获取 JSApi Ticket
 * 有效期 7200 秒，需要缓存
 * 使用 Promise 锁防止并发刷新
 */
async function getJsApiTicket(): Promise<string> {
  // 检查缓存
  const now = Date.now();
  if (cachedJsApiTicket && cachedJsApiTicket.expiresAt > now) {
    return cachedJsApiTicket.ticket;
  }

  // 如果已有请求在获取中，复用该 Promise
  if (jsApiTicketPromise) {
    return jsApiTicketPromise;
  }

  jsApiTicketPromise = (async () => {
    try {
      // 先获取 Access Token
      const accessToken = await getWechatAccessToken();

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
    } finally {
      jsApiTicketPromise = null;
    }
  })();

  return jsApiTicketPromise;
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
  return `${baseUrl}/images/og-image.png`;
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

// ============================================
// 微信开放平台网页授权登录
// ============================================

/** 微信用户信息 */
export interface WechatUserInfo {
  openid: string;
  unionid?: string;
  nickname: string;
  sex: number;
  province: string;
  city: string;
  country: string;
  headimgurl: string;
  privilege: string[];
}

/**
 * 生成微信网页授权 URL
 * 用于 PC 端扫码登录
 */
export function getWechatOAuthUrl(redirectUri: string, state?: string): string {
  const appId = process.env.WECHAT_OPEN_APP_ID || process.env.WECHAT_APP_ID;

  if (!appId) {
    throw new Error("微信 AppID 未配置");
  }

  const encodedRedirect = encodeURIComponent(redirectUri);
  const oauthState = state || crypto.randomBytes(8).toString("hex");

  // 微信开放平台网页授权 URL
  return `https://open.weixin.qq.com/connect/qrconnect?appid=${appId}&redirect_uri=${encodedRedirect}&response_type=code&scope=snsapi_login&state=${oauthState}#wechat_redirect`;
}

/**
 * 生成微信公众号网页授权 URL
 * 用于微信内 H5 授权登录
 */
export function getWechatMpOAuthUrl(redirectUri: string, state?: string, scope: "snsapi_base" | "snsapi_userinfo" = "snsapi_userinfo"): string {
  const appId = process.env.WECHAT_MP_APP_ID || process.env.WECHAT_APP_ID;

  if (!appId) {
    throw new Error("微信公众号 AppID 未配置");
  }

  const encodedRedirect = encodeURIComponent(redirectUri);
  const oauthState = state || crypto.randomBytes(8).toString("hex");

  return `https://open.weixin.qq.com/connect/oauth2/authorize?appid=${appId}&redirect_uri=${encodedRedirect}&response_type=code&scope=${scope}&state=${oauthState}#wechat_redirect`;
}

/**
 * 通过 code 获取 Access Token 和 OpenID
 * @param code 微信回调的 code
 * @param type 登录类型: open(开放平台) | mp(公众号)
 */
export async function getWechatOAuthToken(code: string, type: "open" | "mp" = "open"): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  openid: string;
  unionid?: string;
  scope: string;
}> {
  let appId: string | undefined;
  let appSecret: string | undefined;

  if (type === "open") {
    appId = process.env.WECHAT_OPEN_APP_ID || process.env.WECHAT_APP_ID;
    appSecret = process.env.WECHAT_OPEN_APP_SECRET || process.env.WECHAT_APP_SECRET;
  } else {
    appId = process.env.WECHAT_MP_APP_ID || process.env.WECHAT_APP_ID;
    appSecret = process.env.WECHAT_MP_APP_SECRET || process.env.WECHAT_APP_SECRET;
  }

  if (!appId || !appSecret) {
    throw new Error("微信 AppID 或 AppSecret 未配置");
  }

  const url = `https://api.weixin.qq.com/sns/oauth2/access_token?appid=${appId}&secret=${appSecret}&code=${code}&grant_type=authorization_code`;

  const response = await fetch(url);
  const data = await response.json();

  if (data.errcode) {
    throw new Error(`获取微信 Access Token 失败: ${data.errmsg}`);
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
    openid: data.openid,
    unionid: data.unionid,
    scope: data.scope,
  };
}

/**
 * 通过 Access Token 获取微信用户信息
 */
export async function getWechatUserInfo(accessToken: string, openid: string): Promise<WechatUserInfo> {
  const url = `https://api.weixin.qq.com/sns/userinfo?access_token=${accessToken}&openid=${openid}&lang=zh_CN`;

  const response = await fetch(url);
  const data = await response.json();

  if (data.errcode) {
    throw new Error(`获取微信用户信息失败: ${data.errmsg}`);
  }

  return data as WechatUserInfo;
}

