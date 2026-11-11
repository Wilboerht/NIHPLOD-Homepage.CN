import { advisorRequest } from "@/lib/advisor-internal";
import { prisma } from "@/lib/prisma";
import { grantCheckinPoints } from "@/lib/points-ledger";
import { getUtc8DateKey } from "@/lib/timezone";
import { apiConsole } from "@/lib/logger";

interface DiaryEntryUpstream {
  id: string;
  date: string;
  skinState: string;
  tags: unknown;
  note: string | null;
}

interface DiaryUpsertUpstream {
  success?: boolean;
  data?: DiaryEntryUpstream | null;
  isFirstManualCheckin?: boolean;
  streak?: number;
  points?: number;
}

export type DiaryUpsertResult =
  | {
      ok: true;
      entry: DiaryEntryUpstream | null;
      points?: { granted: number; streak: number };
    }
  | { ok: false; status: number; code: string; message: string };

export async function upsertSkincareDiary(
  userId: string,
  body: unknown
): Promise<DiaryUpsertResult> {
  const result = await advisorRequest<DiaryUpsertUpstream>("/api/internal/diary", {
    method: "POST",
    query: { userId },
    body,
  });
  if (!result.ok) return result;

  const upstream = result.data;
  const entry = upstream?.data ?? null;
  const dateStr = entry && typeof entry.date === "string" ? entry.date.slice(0, 10) : "";
  const rawAmount = upstream?.points;
  const amountValid =
    typeof rawAmount === "number" &&
    Number.isInteger(rawAmount) &&
    rawAmount > 0 &&
    rawAmount <= 10;
  if (upstream?.isFirstManualCheckin && !amountValid) {
    apiConsole.warn("[skincare-archive] 打卡积分金额异常，已跳过发分", {
      userId,
      points: rawAmount,
    });
  }

  const isToday = Boolean(dateStr) && dateStr === getUtc8DateKey();
  const streak = typeof upstream?.streak === "number" ? upstream.streak : null;
  const fallbackAmount =
    streak !== null && Number.isInteger(streak) ? Math.min(3, Math.max(1, streak)) : null;
  const isFirst = upstream?.isFirstManualCheckin === true;
  const grantAmount = isFirst
    ? amountValid
      ? rawAmount
      : null
    : amountValid
      ? null
      : fallbackAmount;
  let points: { granted: number; streak: number } | undefined;
  if (isToday && grantAmount !== null) {
    try {
      const grant = await prisma.$transaction((tx) =>
        grantCheckinPoints(tx, {
          userId,
          amount: grantAmount,
          reference: `checkin:${userId}:${dateStr}`,
          note: streak !== null ? `连续第 ${streak} 天` : "打卡奖励",
        })
      );
      if (!grant.duplicated && grant.amount > 0) {
        points = { granted: grant.amount, streak: streak ?? 1 };
      }
    } catch (error) {
      apiConsole.error("[skincare-archive] 打卡积分发放失败", { error: String(error) });
    }
  }
  return { ok: true, entry, ...(points ? { points } : {}) };
}
