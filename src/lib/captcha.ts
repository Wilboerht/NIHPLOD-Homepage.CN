/**
 * 轻量 PoW 人机验证（自研，原理同 Cap.js：SHA-256 前导零工作量证明）
 *
 * 流程：
 * 1. 客户端 POST /api/auth/captcha/challenge 领取挑战 { id, salt, difficulty }
 * 2. 客户端寻找 nonce，使 sha256(`${salt}:${nonce}`) 的十六进制以 difficulty 个 0 开头
 * 3. 客户端随业务请求提交 token `${id}.${nonce}`，服务端校验后一次性作废
 *
 * 定位：与按量限流互补——限流管"量"，PoW 抬高自动化批量请求的单位成本。
 * 不防御针对性攻击，只显著增加脚本批量滥用的代价。
 */
import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";

/** 挑战有效期（毫秒）：客户端求解耗时 + 网络往返，3 分钟足够宽松 */
const CHALLENGE_TTL_MS = 3 * 60 * 1000;
/** 默认难度：哈希十六进制前导零个数。4 ≈ 平均 6.5 万次哈希，现代手机约 0.5~2 秒 */
const DEFAULT_DIFFICULTY = 4;
const MAX_DIFFICULTY = 6;
/** token 最大长度（cuid + "." + nonce 数字），防御性限制 */
const MAX_TOKEN_LENGTH = 64;

function getDifficulty(): number {
  const raw = Number(process.env.CAPTCHA_DIFFICULTY);
  if (!Number.isInteger(raw) || raw < 1) return DEFAULT_DIFFICULTY;
  return Math.min(raw, MAX_DIFFICULTY);
}

export interface CaptchaChallengeData {
  id: string;
  salt: string;
  difficulty: number;
  /** 有效期（秒） */
  expiresIn: number;
}

/** 签发一个挑战（小概率顺手清理过期挑战，避免无界增长） */
export async function createCaptchaChallenge(): Promise<CaptchaChallengeData> {
  const salt = randomBytes(16).toString("hex");
  const difficulty = getDifficulty();
  const challenge = await prisma.captchaChallenge.create({
    data: {
      salt,
      difficulty,
      expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
    },
  });
  // 2% 概率惰性清理过期挑战（该表无定时任务入口）
  if (Math.random() < 0.02) {
    await prisma.captchaChallenge
      .deleteMany({ where: { expiresAt: { lt: new Date() } } })
      .catch(() => {});
  }
  return { id: challenge.id, salt, difficulty, expiresIn: CHALLENGE_TTL_MS / 1000 };
}

export type CaptchaVerifyResult =
  | { ok: true }
  | { ok: false; reason: "missing" | "invalid" };

/**
 * 校验 PoW token（一次性：通过后原子标记 usedAt，重放/并发复用无效）。
 * 先验哈希再作废：哈希不对不消耗 token，避免误烧合法挑战。
 */
export async function verifyCaptchaToken(token: unknown): Promise<CaptchaVerifyResult> {
  if (typeof token !== "string" || !token) return { ok: false, reason: "missing" };
  if (token.length > MAX_TOKEN_LENGTH) return { ok: false, reason: "invalid" };
  const dotIndex = token.indexOf(".");
  if (dotIndex <= 0) return { ok: false, reason: "invalid" };
  const id = token.slice(0, dotIndex);
  const nonce = token.slice(dotIndex + 1);
  if (!/^\d+$/.test(nonce)) return { ok: false, reason: "invalid" };

  const challenge = await prisma.captchaChallenge.findUnique({ where: { id } });
  if (!challenge || challenge.usedAt || challenge.expiresAt < new Date()) {
    return { ok: false, reason: "invalid" };
  }

  const hash = createHash("sha256").update(`${challenge.salt}:${nonce}`).digest("hex");
  if (!hash.startsWith("0".repeat(challenge.difficulty))) {
    return { ok: false, reason: "invalid" };
  }

  // 原子消费：并发携带同一 token 时只有一个请求能标记成功
  const consumed = await prisma.captchaChallenge.updateMany({
    where: { id, usedAt: null },
    data: { usedAt: new Date() },
  });
  return consumed.count === 1 ? { ok: true } : { ok: false, reason: "invalid" };
}
