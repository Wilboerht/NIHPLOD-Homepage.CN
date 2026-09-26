/**
 * SsoProvider - React Context Provider
 *
 * 包裹子项目根组件，提供全局 SSO 认证状态管理：
 * - 自动管理 token 刷新定时器（过期前 60s 静默刷新）
 * - 监听 storage 事件实现跨 Tab 同步
 * - 提供 useSso() hook
 */

"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { SsoClient } from "../core/SsoClient";
import { getTokenData, removeTokenData } from "../core/storage";
import type { TokenData } from "../core/storage";
import { SsoError } from "../core/errors";
import type { SsoClientConfig, SsoUser } from "../core/SsoClient";

// ============================================
// Context 类型
// ============================================

/**
 * 认证状态为三态：
 * - isLoading=true：初始化/刷新中，user 与 error 均可能为 null
 * - error 非 null：加载用户信息失败（如会话已失效），user 为 null
 * - isAuthenticated=true 且 user 非 null：已登录
 */
export interface SsoContextValue {
  /** 当前用户信息 */
  user: SsoUser | null;

  /** 是否已认证 */
  isAuthenticated: boolean;

  /** 是否正在加载（初始化/刷新中） */
  isLoading: boolean;

  /** 最近一次加载用户信息失败的错误（成功或登出后为 null） */
  error: SsoError | null;

  /** 发起登录（同页重定向） */
  login: (returnUrl?: string) => Promise<void>;

  /** 弹窗模式登录（保持当前页面状态不丢失） */
  loginPopup: (options?: { returnUrl?: string; width?: number; height?: number }) => Promise<TokenData>;

  /** 登出 */
  logout: (redirectToSso?: boolean) => Promise<void>;

  /** 刷新用户信息 */
  refreshUser: () => Promise<void>;

  /** 获取 access_token（自动刷新过期 token） */
  getAccessToken: () => Promise<string | null>;

  /**
   * 会话已失效（refresh_token 被撤销/过期），需要用户重新登录。
   * 与 `error` 不同：该标志在 loadUser 拿到"无 token"时不会被清空，
   * 登录成功后才复位，便于子站稳定展示"登录已过期"提示。
   */
  sessionExpired: boolean;

  /** SsoClient 实例（高级用法） */
  client: SsoClient;
}

const SsoContext = createContext<SsoContextValue | null>(null);

// ============================================
// Provider Props
// ============================================

export interface SsoProviderProps {
  /** SSO 客户端配置 */
  config: SsoClientConfig;

  /** 子组件 */
  children: ReactNode;

  /**
   * 自动刷新阈值（秒）
   * access_token 过期前多少秒触发静默刷新。
   * 默认 60 秒。
   */
  refreshThreshold?: number;

  /**
   * Token 静默刷新成功后的回调（可选）。
   * 每次刷新成功时以新的 access_token 调用，可用于同步 token 到外部状态；
   * SDK 不会据此自动重试先前失败的 API 请求，重试需由调用方自行实现。
   */
  onTokenRefreshed?: (token: string) => void;

  /**
   * 会话失效回调（可选）。refresh_token 被撤销/过期时触发一次，
   * 子站可据此展示"登录已过期，请重新登录"或埋点上报。
   */
  onSessionExpired?: (error: SsoError) => void;
}

// 跨 Tab 刷新锁（基于 localStorage + 时间戳，避免多 Tab 同时刷新导致旧 RT 被撤销）
const REFRESH_LOCK_PREFIX = "nihplod_sso_refresh_lock:";
const LOCK_TTL_MS = 5000;

// 跨 Tab 登录态事件（BroadcastChannel）：默认 token 存 sessionStorage，
// storage 事件不会触发，需显式广播让其他 Tab 感知登出/token 轮换
const CHANNEL_PREFIX = "nihplod_sso_events:";

/** 当前 Tab 标识：用于忽略自己发出的广播（同 Tab 的监听对象也会收到消息） */
const TAB_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

/**
 * 广播跨 Tab 登录态事件（logout / token）。
 * BroadcastChannel 不可用（旧浏览器/隐私模式）时静默跳过，行为退化为原有方式。
 */
export function broadcastSsoEvent(clientId: string, type: "logout" | "token"): void {
  if (typeof BroadcastChannel === "undefined") return;
  try {
    const channel = new BroadcastChannel(CHANNEL_PREFIX + clientId);
    channel.postMessage({ type, sourceTabId: TAB_ID });
    channel.close();
  } catch {
    // 忽略：广播失败不影响主流程
  }
}

// 本 Tab 持有的锁 token（用于释放时校验所有权，避免误删其他 Tab 的锁）
const ownedLocks = new Map<string, string>();

function lockKey(clientId: string): string {
  return REFRESH_LOCK_PREFIX + clientId;
}

/**
 * 尝试获取跨 Tab 刷新锁。
 *
 * 权衡说明：localStorage 没有原子的 check-and-set，多 Tab 并发时无法完全避免
 * 竞态（两个 Tab 同毫秒通过存在性检查后都写入）。这里采用「写入唯一 token 后
 * 立刻 read-back 校验」将竞态窗口缩到最小；残余的双刷新风险由 SSO 服务端
 * refresh_token 轮换宽限期兜底，属于可接受权衡。
 */
function acquireRefreshLock(clientId: string): boolean {
  if (typeof localStorage === "undefined") return true;
  const key = lockKey(clientId);
  const now = Date.now();
  const raw = localStorage.getItem(key);
  if (raw) {
    const ts = parseInt(raw, 10);
    if (!isNaN(ts) && now - ts < LOCK_TTL_MS) {
      return false;
    }
  }
  const token = `${now}:${Math.random().toString(36).slice(2)}`;
  localStorage.setItem(key, token);
  // read-back：若读回的不是自己写入的值，说明其他 Tab 并发抢锁成功
  if (localStorage.getItem(key) !== token) return false;
  ownedLocks.set(clientId, token);
  return true;
}

function releaseRefreshLock(clientId: string): void {
  if (typeof localStorage === "undefined") return;
  const owned = ownedLocks.get(clientId);
  ownedLocks.delete(clientId);
  // 仅当锁仍归本 Tab 所有时才删除，避免误删其他 Tab 新获取的锁
  if (owned && localStorage.getItem(lockKey(clientId)) === owned) {
    localStorage.removeItem(lockKey(clientId));
  }
}

/**
 * 在跨 Tab 互斥锁下执行静默刷新。
 *
 * 优先使用 Web Locks API（navigator.locks）实现浏览器级真互斥：
 * 拿到锁的 Tab 执行刷新；其他 Tab 以 ifAvailable 模式拿到 null lock
 * 直接返回，等待 storage 事件同步刷新结果。navigator.locks 不存在
 * 或调用异常（如隐私模式禁用）时回退 localStorage 锁逻辑。
 *
 * @returns true 表示本 Tab 持锁执行了刷新；false 表示未抢到锁（其他 Tab 正在刷新）
 *
 * 注意：task 必须自行消化内部异常（不得向外抛出），以便
 * navigator.locks.request 的 reject 可安全视为锁 API 故障并回退。
 */
export async function withRefreshLock(clientId: string, task: () => Promise<void>): Promise<boolean> {
  if (
    typeof navigator !== "undefined" &&
    typeof navigator.locks?.request === "function"
  ) {
    try {
      let ran = false;
      await navigator.locks.request(
        `nihplod_sso_refresh_${clientId}`,
        { ifAvailable: true },
        async (lock) => {
          if (!lock) return;
          ran = true;
          await task();
        }
      );
      return ran;
    } catch {
      // Web Locks API 故障，回退 localStorage 锁
    }
  }

  if (!acquireRefreshLock(clientId)) return false;
  try {
    await task();
    return true;
  } finally {
    releaseRefreshLock(clientId);
  }
}

// ============================================
// Provider 实现
// ============================================

export function SsoProvider({
  config,
  children,
  refreshThreshold = 60,
  onTokenRefreshed,
  onSessionExpired,
}: SsoProviderProps) {
  const [user, setUser] = useState<SsoUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [error, setError] = useState<SsoError | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  // 实例用 useState 懒初始化保持稳定引用（避免渲染期读取 ref）
  const [client] = useState(() => new SsoClient(config));
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedRef = useRef(false);
  // 回调 ref：调用方传内联函数时不触发 loadUser/refresh 依赖变化
  const onSessionExpiredRef = useRef(onSessionExpired);
  useEffect(() => {
    onSessionExpiredRef.current = onSessionExpired;
  });
  // 每次"会话失效"仅通知一次（登录成功/显式登出后复位），避免重复回调
  const sessionExpiredNotifiedRef = useRef(false);
  // 连续可恢复刷新失败计数（网络抖动/网关异常）：达上限才判定会话终结
  const refreshFailureCountRef = useRef(0);
  const MAX_REFRESH_FAILURES = 3;

  /** 标记会话失效：保留 error/sessionExpired 供调用方展示，并（仅一次）触发回调 */
  const markSessionExpired = useCallback((error: SsoError) => {
    setError(error);
    setSessionExpired(true);
    if (!sessionExpiredNotifiedRef.current) {
      sessionExpiredNotifiedRef.current = true;
      onSessionExpiredRef.current?.(error);
    }
  }, []);

  // 加载用户信息
  const loadUser = useCallback(async () => {
    // 以「本地存在 token 数据」为准而非 isAuthenticated()：
    // access_token 已过期时 getTokenData 仍返回数据（保留 refresh_token），
    // getUserInfo 内部会自动刷新恢复会话，避免过期即丢登录态。
    const tokenData = getTokenData(client.config.clientId);
    if (!tokenData) {
      setUser(null);
      setIsAuthenticated(false);
      // 不在此处清空 error/sessionExpired：会话过期提示需保留给调用方，
      // 显式登出路径会主动复位（见 logout）
      setIsLoading(false);
      return;
    }

    try {
      const u = await client.getUserInfo();
      setUser(u);
      setIsAuthenticated(true);
      setError(null);
      setSessionExpired(false);
      sessionExpiredNotifiedRef.current = false;
      refreshFailureCountRef.current = 0;
    } catch (err) {
      setUser(null);
      setIsAuthenticated(false);
      const errorObj =
        err instanceof SsoError
          ? err
          : new SsoError("userinfo_failed", err instanceof Error ? err.message : String(err));
      // 写入 error 状态，调用方可据此展示"会话失效，请重新登录"等提示
      setError(errorObj);
      // 仅鉴权类错误（会话失效/未认证）清除本地 token；网络瞬断等可恢复错误
      // 保留 token，避免一次抖动就强制重新登录，下次加载/刷新会自动重试
      if (errorObj.code === "not_authenticated" || errorObj.code === "session_expired") {
        removeTokenData(client.config.clientId);
        markSessionExpired(errorObj);
      }
    } finally {
      setIsLoading(false);
    }
  }, [client, markSessionExpired]);

  // 初始化（微任务延迟，避免 effect 内同步 setState）
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;

    Promise.resolve().then(() => {
      // 本地存在 token 数据即尝试加载（过期 token 会在 loadUser 内自动刷新）
      if (getTokenData(client.config.clientId)) {
        loadUser();
      } else {
        setIsLoading(false);
      }
    });
  }, [client, loadUser]);

  // Token 自动刷新定时器（setTimeout 递归调度，避免 setInterval 堆积）
  useEffect(() => {
    let active = true;

    // 跨 Tab 互斥下的静默刷新：拿到锁的 Tab 执行刷新，
    // 刷新失败可能是其他 Tab 已刷新，短暂后重新加载本地 token
    const attemptRefresh = () =>
      withRefreshLock(client.config.clientId, async () => {
        try {
          const td = await client.refreshToken();
          refreshFailureCountRef.current = 0;
          onTokenRefreshed?.(td.access_token);
          broadcastSsoEvent(client.config.clientId, "token");
          loadUser();
        } catch (err) {
          // refresh_token 被撤销/过期：立即保留"会话已过期"信号（否则 loadUser 走
          // 无 token 分支会静默掉线，调用方拿不到任何提示）
          if (
            err instanceof SsoError &&
            (err.code === "session_expired" ||
              err.code === "no_refresh_token" ||
              err.code === "not_authenticated")
          ) {
            removeTokenData(client.config.clientId);
            markSessionExpired(err);
          } else {
            // 网络抖动/网关异常等可恢复失败：计数，连续失败达上限才判定会话终结
            // （避免一次断网就强制登出丢状态）
            refreshFailureCountRef.current += 1;
            if (refreshFailureCountRef.current >= MAX_REFRESH_FAILURES) {
              markSessionExpired(
                err instanceof SsoError
                  ? err
                  : new SsoError("session_expired", "多次刷新失败，请重新登录")
              );
            }
          }
          setTimeout(() => loadUser(), 500);
        }
      }).finally(() => {
        // 无论是否抢到锁/刷新成功都重新排程：
        // - 成功：按新 token 的过期时间排程
        // - 失败/未抢到锁：minDelayMs（5s）后重试，避免紧密循环；
        //   token 也可能已被其他 Tab 刷新，重新排程会自然按新过期时间走
        if (active) scheduleNextRefresh(5_000);
      });

    const scheduleNextRefresh = (minDelayMs = 0) => {
      if (!active) return;

      // 清除已有定时器
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }

      const tokenData = getTokenData(client.config.clientId);
      if (!tokenData) return;

      // 计算距离过期还有多少秒
      const remainingSec = (tokenData.expires_at - Date.now()) / 1000;

      // 已过期或即将过期：短延迟后带锁刷新（统一经定时器，保证失败后仍会重新排程）
      if (remainingSec <= 0 || remainingSec <= refreshThreshold) {
        refreshTimerRef.current = setTimeout(
          () => {
            if (active) void attemptRefresh();
          },
          Math.max(minDelayMs, 1000)
        );
        return;
      }

      // 在过期前 refreshThreshold 秒触发刷新
      const delayMs = Math.max((remainingSec - refreshThreshold) * 1000, minDelayMs, 1000);

      refreshTimerRef.current = setTimeout(() => {
        if (!active) return;
        const td = getTokenData(client.config.clientId);
        if (!td) return;

        const secLeft = (td.expires_at - Date.now()) / 1000;
        if (secLeft <= refreshThreshold) {
          void attemptRefresh();
        } else {
          // token 已被其他 Tab 刷新（storage 事件同步），按新过期时间重新排程
          scheduleNextRefresh();
        }
      }, delayMs);
    };

    scheduleNextRefresh();

    return () => {
      active = false;
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, [client, loadUser, refreshThreshold, onTokenRefreshed]);

  // 监听 storage 事件实现跨 Tab 同步（仅 persist 存储生效）
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (
        e.key &&
        e.key.startsWith("nihplod_sso_") &&
        !e.key.startsWith(REFRESH_LOCK_PREFIX)
      ) {
        loadUser();
      }
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, [loadUser]);

  // 跨 Tab 事件同步（BroadcastChannel）：补足 sessionStorage 默认存储下 storage 事件不触发的缺口。
  // 忽略自己发出的消息（同 Tab 监听对象也会收到）：token 事件由发起方自行 loadUser，
  // logout 事件按"全局登出"处理——清除本地 token 并同步 UI，避免其他 Tab 定时刷新把用户"登回来"
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel(CHANNEL_PREFIX + client.config.clientId);
    channel.onmessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; sourceTabId?: string } | null;
      if (!data || data.sourceTabId === TAB_ID) return;
      if (data.type === "logout") {
        removeTokenData(client.config.clientId);
        setUser(null);
        setIsAuthenticated(false);
        setError(null);
        setSessionExpired(false);
        sessionExpiredNotifiedRef.current = false;
        refreshFailureCountRef.current = 0;
      } else if (data.type === "token") {
        loadUser();
      }
    };
    return () => channel.close();
  }, [client, loadUser]);

  // 登录
  const login = useCallback(
    async (returnUrl?: string) => {
      await client.login(returnUrl);
    },
    [client]
  );

  // 弹窗模式登录
  const loginPopup = useCallback(
    async (options?: { returnUrl?: string; width?: number; height?: number }) => {
      const tokenData = await client.loginPopup(options);
      await loadUser();
      return tokenData;
    },
    [client, loadUser]
  );

  // 登出（本地优先：先同步 UI 状态，再等待服务端撤销/跳转，避免按钮"没反应"）
  const logout = useCallback(
    async (redirectToSso: boolean = false) => {
      setUser(null);
      setIsAuthenticated(false);
      setError(null);
      setSessionExpired(false);
      sessionExpiredNotifiedRef.current = false;
      refreshFailureCountRef.current = 0;
      // 通知其他 Tab 同步登出（sessionStorage 默认存储下 storage 事件不触发）
      broadcastSsoEvent(client.config.clientId, "logout");
      try {
        await client.logout(redirectToSso);
      } catch {
        // 本地已登出；撤销/跳转失败不阻塞调用方
      }
    },
    [client]
  );

  // 刷新用户信息
  const refreshUser = useCallback(async () => {
    await loadUser();
  }, [loadUser]);

  // 获取 access_token
  const getAccessToken = useCallback(async (): Promise<string | null> => {
    return client.getAccessToken();
  }, [client]);

  const value: SsoContextValue = {
    user,
    isAuthenticated,
    isLoading,
    error,
    login,
    loginPopup,
    logout,
    refreshUser,
    getAccessToken,
    sessionExpired,
    client,
  };

  return React.createElement(SsoContext.Provider, { value }, children);
}

// ============================================
// Hook
// ============================================

/**
 * useSso Hook
 *
 * 在 SsoProvider 内部使用，获取 SSO 认证状态和操作方法。
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { user, isAuthenticated, login, logout } = useSso();
 *   if (!isAuthenticated) return <button onClick={() => login()}>登录</button>;
 *   return <div>欢迎, {user?.nickname}</div>;
 * }
 * ```
 */
export function useSso(): SsoContextValue {
  const ctx = useContext(SsoContext);
  if (!ctx) {
    throw new Error("useSso() 必须在 <SsoProvider> 内部使用");
  }
  return ctx;
}
