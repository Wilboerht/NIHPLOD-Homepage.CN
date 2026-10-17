/**
 * AI 测肤用量（测肤子站内部接口代理，共享核心）
 *
 * 主站 /api/user/vip 与 OAuth /api/oauth/skin-test-usage 共用，
 * 避免两处对子站接口字段与失败降级口径漂移。
 * 任何失败（env 未配置 / 超时 / 网络错误 / 非 2xx）都返回 null，绝不影响调用方主流程。
 */
import { advisorJson } from "@/lib/advisor-internal";

/** 测肤子站（smart.nihplod.cn）返回的 AI 测肤用量 */
export interface SkinTestUsage {
  // level 可能为 null：子站对从未使用过测肤的用户返回 level: null
  level: string | null;
  totalUsed: number;
  todayUsed: number;
  quota: {
    lifetimeLimit: number | null;
    dailyLimit: number | null;
    unlimited: boolean;
  };
  remaining: number | null;
  /** 今日是否已完成手动打卡（自动测肤日记不计入）；旧版子站可能缺失 */
  todayCheckedIn?: boolean;
}

/**
 * 查询测肤子站的 AI 测肤已用次数（服务端到服务端内部接口）。
 * 任何失败返回 null（fail-soft）。
 */
export function fetchSkinTestUsage(userId: string): Promise<SkinTestUsage | null> {
  return advisorJson<SkinTestUsage>("/api/internal/skin-test-usage", {
    query: { userId },
    timeoutMs: 3000,
  });
}
