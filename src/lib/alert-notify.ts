/**
 * 企业微信告警基础设施：响应后异步发送、告警去重与失败兜底。
 *
 * 供管理端系统告警与运营告警共用，避免各处重复实现 after() / 去重逻辑。
 */
import { after } from "next/server";
import { prisma } from "./prisma";
import { apiConsole } from "./logger";
import { sendWecomNotification, type WecomNotificationType } from "./wecom";

/** 响应返回后执行；非请求上下文（cron/测试）直接 fire-and-forget */
export function runAfterResponse(task: () => Promise<void>, context = "告警"): void {
  const run = () => {
    void task().catch((error) => apiConsole.warn(`[${context}] 异步任务异常:`, error));
  };
  try {
    after(run);
  } catch {
    run();
  }
}

/**
 * 告警去重：同一 ruleKey 在 cooldownMs 内只发送一次。
 * 复用 AuditAlertState 表（ruleKey 主键 + lastSentAt/lastCount）。
 */
export async function claimAlert(
  ruleKey: string,
  count: number,
  cooldownMs: number,
  now = new Date()
): Promise<boolean> {
  const state = await prisma.auditAlertState.findUnique({ where: { ruleKey } });
  if (state && now.getTime() - state.lastSentAt.getTime() < cooldownMs) return false;
  await prisma.auditAlertState.upsert({
    where: { ruleKey },
    create: { ruleKey, lastSentAt: now, lastCount: count },
    update: { lastSentAt: now, lastCount: count },
  });
  return true;
}

/** 发送 Markdown 告警（响应后异步，失败仅记录日志） */
export function sendAlert(type: WecomNotificationType, title: string, lines: string[]): void {
  runAfterResponse(async () => {
    const content = [`## ${title}`, "", ...lines].join("\n");
    const result = await sendWecomNotification(content, type);
    if (!result.success) {
      apiConsole.warn(`[AlertNotify] 企业微信通知未发送 (${title}): ${result.error ?? "unknown"}`);
    }
  }, "AlertNotify");
}

/** 带冷却的告警：先 claim 再发送；任何异常都不向外抛出 */
export function notifyWithCooldown(params: {
  ruleKey: string;
  count: number;
  cooldownMs: number;
  type: WecomNotificationType;
  title: string;
  lines: string[];
}): void {
  const { ruleKey, count, cooldownMs, type, title, lines } = params;
  runAfterResponse(async () => {
    let shouldSend = true;
    try {
      shouldSend = await claimAlert(ruleKey, count, cooldownMs);
    } catch (error) {
      // 去重检查依赖数据库；数据库异常时宁可重复发送，也不能静默丢失告警
      apiConsole.warn("[AlertNotify] 告警去重检查失败，继续发送:", error);
    }
    if (!shouldSend) return;
    const content = [`## ${title}`, "", ...lines].join("\n");
    const result = await sendWecomNotification(content, type);
    if (!result.success) {
      apiConsole.warn(`[AlertNotify] 企业微信通知未发送 (${title}): ${result.error ?? "unknown"}`);
    }
  }, "AlertNotify");
}
