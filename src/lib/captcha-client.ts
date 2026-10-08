/**
 * PoW 人机验证客户端求解器（与 lib/captcha.ts 服务端配套）
 *
 * invisible 模式：提交表单时调用 solveCaptcha() 后台完成"领挑战 → 求解 → 拿 token"，
 * 用户只看到按钮原有的 loading 态，无任何额外交互。
 */
import { apiPost } from "@/lib/api-client";

interface CaptchaChallengeData {
  id: string;
  salt: string;
  difficulty: number;
  expiresIn: number;
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * 领取挑战并求解，返回一次性 token（`${id}.${nonce}`）。
 * 求解期间不阻塞 UI：每次 digest 都是异步的，主线程在 await 间隙保持响应。
 * 抛出异常时由调用方按"人机验证失败"处理（一般是网络/CSRF 问题）。
 */
export async function solveCaptcha(): Promise<string> {
  const challenge = await apiPost<CaptchaChallengeData>("/api/auth/captcha/challenge");
  if (!challenge?.id || !challenge.salt || !challenge.difficulty) {
    throw new Error("人机验证挑战无效");
  }
  const prefix = "0".repeat(challenge.difficulty);
  for (let nonce = 0; ; nonce++) {
    const hash = await sha256Hex(`${challenge.salt}:${nonce}`);
    if (hash.startsWith(prefix)) {
      return `${challenge.id}.${nonce}`;
    }
  }
}
