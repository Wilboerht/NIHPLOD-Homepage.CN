/**
 * 头像 URL 可渲染性判断（客户端/服务端共用，无环境副作用）
 *
 * 允许：
 * - 站内相对路径：/images/**、/uploads/**（本地上传模式）
 * - https 绝对地址：官网域（含子域）、自有 OSS（aliyuncs.com）、NEXT_PUBLIC_* 配置域
 *
 * 拒绝：协议相对 URL（//evil.com）、反斜杠、http、任意外链。
 * 社会登录头像（微信/抖音）会在登录时镜像到自有存储，因此不在此放行，
 * 历史遗留外链会直接回退默认头像（不发起第三方请求，避免追踪与 CSP 报错）。
 */
const CONFIGURED_HOSTS = new Set(
  [
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.NEXT_PUBLIC_BASE_URL,
    process.env.NEXT_PUBLIC_WWW_URL,
  ].flatMap((raw) => {
    if (!raw) return [];
    try {
      return [new URL(raw).hostname.toLowerCase()];
    } catch {
      return [];
    }
  })
);

/** 社交平台头像域（登录时需镜像到自有存储，主站不直接渲染） */
const SOCIAL_AVATAR_HOSTS = [
  "qlogo.cn",
  "weixin.qq.com",
  "douyinpic.com",
  "douyincdn.com",
  "douyinstatic.com",
  "byteimg.com",
  "ibytedtos.com",
  "snssdk.com",
  "pstatp.com",
  "bytedance.com",
] as const;

export function isSocialAvatarHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return SOCIAL_AVATAR_HOSTS.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

export function isSocialAvatarUrl(raw: string | null | undefined): raw is string {
  if (!raw) return false;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    return isSocialAvatarHost(url.hostname);
  } catch {
    return false;
  }
}

export function isInternalAvatarPath(raw: string): boolean {
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return false;
  if (raw.includes("..")) return false;
  return raw.startsWith("/images/") || raw.startsWith("/uploads/");
}

function isOwnAvatarHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === "nihplod.cn" || host.endsWith(".nihplod.cn")) return true;
  if (host.endsWith(".aliyuncs.com")) return true;
  return CONFIGURED_HOSTS.has(host);
}

export function isRenderableAvatarUrl(raw: string | null | undefined): raw is string {
  if (!raw) return false;
  if (isInternalAvatarPath(raw)) return true;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return false;
    return isOwnAvatarHost(url.hostname);
  } catch {
    return false;
  }
}
