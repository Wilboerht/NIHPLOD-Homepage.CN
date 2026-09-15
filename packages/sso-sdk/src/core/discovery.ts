/**
 * OIDC Discovery 文档的共享获取：模块级缓存 + 单飞。
 *
 * Discovery 文档是准静态的（端点路径极少变更），但 logout 等热路径
 * 原先每次调用都重新拉取（一次登出甚至连续拉两次）。在子站与 SSO 中心
 * 经公网/代理互联的部署下，每次拉取都是一次数百毫秒的往返。
 *
 * 设计要点：
 * - 只缓存成功结果（5 分钟）：失败返回 null 不缓存，主站短暂抖动不会
 *   把"无 discovery 可用"的状态固话住，下一次调用立即重试；
 * - 单飞：并发调用共享同一个在途 Promise，缓存未命中时不会打出并发请求；
 * - 模块级 Map：Node/Edge Runtime 均可（middleware 在 Edge 下按 isolate 各自缓存，
 *   对正确性无影响）。
 */

export interface SharedDiscoveryDoc {
  issuer?: string;
  revocation_endpoint?: string;
  end_session_endpoint?: string;
  [key: string]: unknown;
}

const DISCOVERY_CACHE_TTL_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 5000;

const cache = new Map<string, { doc: SharedDiscoveryDoc; expiresAt: number }>();
const inflight = new Map<string, Promise<SharedDiscoveryDoc | null>>();

export function fetchDiscoveryCached(baseUrl: string): Promise<SharedDiscoveryDoc | null> {
  const hit = cache.get(baseUrl);
  if (hit && hit.expiresAt > Date.now()) {
    return Promise.resolve(hit.doc);
  }

  const existing = inflight.get(baseUrl);
  if (existing) return existing;

  const promise = (async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(`${baseUrl}/api/oauth/.well-known/openid-configuration`, {
        signal: controller.signal,
      });
      if (!res.ok) return null;
      const doc = (await res.json()) as SharedDiscoveryDoc;
      // 只缓存成功结果
      cache.set(baseUrl, { doc, expiresAt: Date.now() + DISCOVERY_CACHE_TTL_MS });
      return doc;
    } catch {
      return null;
    } finally {
      clearTimeout(timeoutId);
      inflight.delete(baseUrl);
    }
  })();

  inflight.set(baseUrl, promise);
  return promise;
}

/** 清空 discovery 缓存（测试用） */
export function clearDiscoveryCache(): void {
  cache.clear();
}
