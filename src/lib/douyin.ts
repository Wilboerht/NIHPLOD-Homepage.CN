/**
 * 抖音开放平台登录（网站应用扫码登录）
 *
 * OAuth 2.0 授权码模式：
 * 1. 引导用户跳转 open.douyin.com/platform/oauth/connect 扫码授权
 * 2. 回调携带 code，服务端换 access_token（返回 open_id / union_id）
 * 3. 以 access_token + open_id 拉取用户信息（nickname / avatar）
 *
 * 多平台聚合：身份信息写入 ExternalIdentity（provider="douyin"），
 * 不写 User.wechatOpenId/wechatUnionId 微信系旧列。
 * 抖音 unionid 仅在抖音主体内跨应用聚合，与微信 UnionID 无互通，
 * 跨平台归并依赖手机号绑定（复用现有 bind 流程）。
 */

const DOUYIN_API_TIMEOUT_MS = 10_000;

/** 带超时的抖音 API fetch（client_secret 在 query string 中是抖音 API 设计要求） */
async function douyinFetch(url: string): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DOUYIN_API_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

function getDouyinCredentials(): { clientKey: string; clientSecret: string } {
  const clientKey = process.env.DOUYIN_CLIENT_KEY;
  const clientSecret = process.env.DOUYIN_CLIENT_SECRET;
  if (!clientKey || !clientSecret) {
    throw new Error("抖音 Client Key 或 Client Secret 未配置");
  }
  return { clientKey, clientSecret };
}

/**
 * 构造抖音网站登录授权 URL
 * @param redirectUri 授权回调地址（需在抖音开放平台登记的网站回调域名内）
 * @param state 防 CSRF 状态参数（base64url 编码的 JSON，含 nonce）
 */
export function getDouyinOAuthUrl(redirectUri: string, state: string): string {
  const { clientKey } = getDouyinCredentials();
  const params = new URLSearchParams({
    client_key: clientKey,
    response_type: "code",
    scope: "user_info",
    redirect_uri: redirectUri,
    state,
  });
  return `https://open.douyin.com/platform/oauth/connect?${params.toString()}`;
}

/** 抖音 code 换 token 结果 */
export interface DouyinOAuthToken {
  accessToken: string;
  openId: string;
  unionId?: string;
  expiresIn: number;
}

/**
 * 授权码换取 access_token
 * 抖音响应结构：{ data: { access_token, expires_in, open_id, union_id?, error_code, description } }
 */
export async function getDouyinOAuthToken(code: string): Promise<DouyinOAuthToken> {
  const { clientKey, clientSecret } = getDouyinCredentials();
  const params = new URLSearchParams({
    client_key: clientKey,
    client_secret: clientSecret,
    code,
    grant_type: "authorization_code",
  });
  const response = await douyinFetch(`https://open.douyin.com/oauth/access_token/?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`抖音 access_token 请求失败: HTTP ${response.status}`);
  }
  const json = (await response.json()) as {
    data?: {
      access_token?: string;
      expires_in?: number;
      open_id?: string;
      union_id?: string;
      error_code?: number;
      description?: string;
    };
  };
  const data = json.data;
  if (!data || data.error_code !== 0) {
    throw new Error(`抖音授权码换取失败: ${data?.description || "未知错误"}`);
  }
  if (!data.access_token || !data.open_id || typeof data.expires_in !== "number") {
    throw new Error("抖音 access_token 响应数据不完整");
  }
  return {
    accessToken: data.access_token,
    openId: data.open_id,
    unionId: data.union_id || undefined,
    expiresIn: data.expires_in,
  };
}

/** 抖音用户信息 */
export interface DouyinUserInfo {
  openid: string;
  unionid?: string;
  nickname?: string;
  avatar?: string;
}

/**
 * 获取抖音用户信息（昵称/头像）
 * 抖音响应结构：{ data: { openid, unionid, nickname, avatar, error_code, description } }
 */
export async function getDouyinUserInfo(accessToken: string, openId: string): Promise<DouyinUserInfo> {
  const params = new URLSearchParams({
    access_token: accessToken,
    open_id: openId,
  });
  const response = await douyinFetch(`https://open.douyin.com/oauth/userinfo/?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`抖音用户信息请求失败: HTTP ${response.status}`);
  }
  const json = (await response.json()) as {
    data?: {
      openid?: string;
      unionid?: string;
      nickname?: string;
      avatar?: string;
      error_code?: number;
      description?: string;
    };
  };
  const data = json.data;
  if (!data || data.error_code !== 0) {
    throw new Error(`抖音用户信息获取失败: ${data?.description || "未知错误"}`);
  }
  return {
    openid: data.openid || openId,
    unionid: data.unionid || undefined,
    nickname: data.nickname || undefined,
    avatar: data.avatar || undefined,
  };
}
