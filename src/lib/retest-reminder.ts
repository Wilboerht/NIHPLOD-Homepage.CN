/**
 * 复测提醒编排（官网 cron 每日调用）
 *
 * 流程：从测肤子站内部接口取「今天到期」的用户名单（上次测肤完成满 30 天，
 * CST 自然日窗口，子站侧天然去重）→ 逐个发送测肤小程序订阅消息。
 *
 * 全部 fail-soft：
 * - 子站不可达/未配置密钥：本轮静默跳过（advisorJson 降级为 null）；
 * - 单个用户发送失败（未订阅 43101 / 无 openid 等）：notify 函数内部静默处理；
 * - 模板未配置（MP_SKIN_TEMPLATE_RETEST_REMINDER 为空）：notify 内部静默跳过，
 *   名单为空或模板未配置时本模块仍正常返回。
 */
import { advisorJson } from "@/lib/advisor-internal";
import { notifySkinRetestReminder } from "@/lib/miniprogram-notify";
import { apiConsole } from "@/lib/logger";

interface RetestDueResponse {
  users?: Array<{ userId?: string; lastTestAt?: string | null }>;
}

/** 发送并发上限（微信接口单用户一次调用，批量时适度并行控制总时长） */
const SEND_CONCURRENCY = 10;

/**
 * 执行一轮复测提醒
 * @returns due=子站返回的到期人数；attempted=已尝试发送的人数（发送结果由微信侧决定）
 */
export async function sendRetestReminders(): Promise<{ due: number; attempted: number }> {
  const data = await advisorJson<RetestDueResponse>("/api/internal/retest-due");
  const rawUsers = data?.users;
  if (!Array.isArray(rawUsers) || rawUsers.length === 0) {
    return { due: 0, attempted: 0 };
  }

  const users = rawUsers.filter(
    (u): u is { userId: string } => !!u && typeof u.userId === "string" && u.userId.length > 0
  );
  if (users.length === 0) return { due: 0, attempted: 0 };

  let attempted = 0;
  for (let i = 0; i < users.length; i += SEND_CONCURRENCY) {
    const chunk = users.slice(i, i + SEND_CONCURRENCY);
    await Promise.all(chunk.map((u) => notifySkinRetestReminder({ userId: u.userId })));
    attempted += chunk.length;
  }

  if (attempted < rawUsers.length) {
    apiConsole.warn("[RetestReminder] 存在无效条目被跳过", {
      received: rawUsers.length,
      valid: attempted,
    });
  }

  return { due: users.length, attempted };
}
