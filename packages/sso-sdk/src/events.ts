/**
 * SDK 事件系统
 *
 * 基于 EventEmitter 模式的事件总线。
 * 子项目可监听以下事件来更新 UI 状态：
 * - tokensRefreshed: Token 刷新成功
 * - tokenExpired: Token 过期
 * - userLoggedOut: 用户登出
 * - sessionRevoked: 会话被撤销
 * - providerUnavailable: 主站不可用（降级模式）
 */
import { EventEmitter } from "events";

// ============================================
// Event Types
// ============================================

export interface SsoSdkEvents {
  /** Token 刷新成功，携带新的 token 数据 */
  tokensRefreshed: (data: { accessToken: string; expiresAt: number }) => void;

  /** Token 过期 */
  tokenExpired: () => void;

  /** 用户登出（主站发起或本地发起） */
  userLoggedOut: (source: "local" | "remote") => void;

  /** 会话被撤销（管理员封禁或用户撤销授权） */
  sessionRevoked: (data: { userId: string; reason?: string }) => void;

  /** 主站不可用，进入降级模式 */
  providerUnavailable: (error: Error) => void;

  /** 主站恢复可用 */
  providerRecovered: () => void;
}

// ============================================
// Typed Event Emitter
// ============================================

export class SsoEventEmitter {
  private emitter = new EventEmitter();

  on<E extends keyof SsoSdkEvents>(
    event: E,
    listener: SsoSdkEvents[E]
  ): this {
    this.emitter.on(event, listener);
    return this;
  }

  once<E extends keyof SsoSdkEvents>(
    event: E,
    listener: SsoSdkEvents[E]
  ): this {
    this.emitter.once(event, listener);
    return this;
  }

  off<E extends keyof SsoSdkEvents>(
    event: E,
    listener: SsoSdkEvents[E]
  ): this {
    this.emitter.off(event, listener);
    return this;
  }

  emit<E extends keyof SsoSdkEvents>(
    event: E,
    ...args: Parameters<SsoSdkEvents[E]>
  ): boolean {
    return this.emitter.emit(event, ...args);
  }

  removeAllListeners(event?: keyof SsoSdkEvents): this {
    this.emitter.removeAllListeners(event);
    return this;
  }
}
