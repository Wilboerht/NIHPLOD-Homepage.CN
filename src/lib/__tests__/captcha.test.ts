/**
 * lib/captcha PoW 人机验证测试
 * 覆盖：挑战签发（难度默认值/钳制）、token 校验（缺失/格式错误/不存在/过期/已用/
 * 哈希不匹配不消耗/正确则一次性消费/并发复用只有一方成功）
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHash } from "crypto";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    captchaChallenge: {
      create: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";
import { createCaptchaChallenge, verifyCaptchaToken } from "@/lib/captcha";

const mockCreate = prisma.captchaChallenge.create as ReturnType<typeof vi.fn>;
const mockFindUnique = prisma.captchaChallenge.findUnique as ReturnType<typeof vi.fn>;
const mockUpdateMany = prisma.captchaChallenge.updateMany as ReturnType<typeof vi.fn>;
const mockDeleteMany = prisma.captchaChallenge.deleteMany as ReturnType<typeof vi.fn>;

/** 本地求解：找到使 sha256(`${salt}:${nonce}`) 以 difficulty 个 0 开头的 nonce */
function solve(salt: string, difficulty: number): string {
  const prefix = "0".repeat(difficulty);
  for (let nonce = 0; ; nonce++) {
    const hash = createHash("sha256").update(`${salt}:${nonce}`).digest("hex");
    if (hash.startsWith(prefix)) return String(nonce);
  }
}

function makeChallenge(overrides: Record<string, unknown> = {}) {
  return {
    id: "challenge-1",
    salt: "a".repeat(32),
    difficulty: 1,
    usedAt: null,
    expiresAt: new Date(Date.now() + 60 * 1000),
    createdAt: new Date(),
    ...overrides,
  };
}

describe("createCaptchaChallenge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: "challenge-1",
      ...data,
    }));
    mockDeleteMany.mockResolvedValue({ count: 0 });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("默认难度 4，返回 id/salt/difficulty/expiresIn", async () => {
    const challenge = await createCaptchaChallenge();

    expect(challenge.id).toBe("challenge-1");
    expect(challenge.salt).toMatch(/^[0-9a-f]{32}$/);
    expect(challenge.difficulty).toBe(4);
    expect(challenge.expiresIn).toBe(180);
  });

  it("CAPTCHA_DIFFICULTY 生效且钳制在 1..6", async () => {
    vi.stubEnv("CAPTCHA_DIFFICULTY", "2");
    expect((await createCaptchaChallenge()).difficulty).toBe(2);

    vi.stubEnv("CAPTCHA_DIFFICULTY", "99");
    expect((await createCaptchaChallenge()).difficulty).toBe(6);

    vi.stubEnv("CAPTCHA_DIFFICULTY", "abc");
    expect((await createCaptchaChallenge()).difficulty).toBe(4);
  });
});

describe("verifyCaptchaToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("token 缺失/非字符串：missing", async () => {
    expect(await verifyCaptchaToken(undefined)).toEqual({ ok: false, reason: "missing" });
    expect(await verifyCaptchaToken("")).toEqual({ ok: false, reason: "missing" });
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("token 格式错误（无分隔符/nonce 非数字）：invalid", async () => {
    expect(await verifyCaptchaToken("nodot")).toEqual({ ok: false, reason: "invalid" });
    expect(await verifyCaptchaToken("id.abc")).toEqual({ ok: false, reason: "invalid" });
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("挑战不存在/已过期/已使用：invalid，且不消耗", async () => {
    mockFindUnique.mockResolvedValueOnce(null);
    expect(await verifyCaptchaToken("x.1")).toEqual({ ok: false, reason: "invalid" });

    mockFindUnique.mockResolvedValueOnce(
      makeChallenge({ expiresAt: new Date(Date.now() - 1000) })
    );
    expect(await verifyCaptchaToken("challenge-1.1")).toEqual({ ok: false, reason: "invalid" });

    mockFindUnique.mockResolvedValueOnce(makeChallenge({ usedAt: new Date() }));
    expect(await verifyCaptchaToken("challenge-1.1")).toEqual({ ok: false, reason: "invalid" });

    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  it("哈希不匹配：invalid 且不消耗 token（不误烧合法挑战）", async () => {
    const challenge = makeChallenge();
    mockFindUnique.mockResolvedValue(challenge);
    // 找到一个不满足难度的 nonce（difficulty=1，约 15/16 的概率一次找到）
    let badNonce = "0";
    for (let nonce = 0; ; nonce++) {
      const hash = createHash("sha256").update(`${challenge.salt}:${nonce}`).digest("hex");
      if (!hash.startsWith("0")) {
        badNonce = String(nonce);
        break;
      }
    }

    expect(await verifyCaptchaToken(`${challenge.id}.${badNonce}`)).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  it("正确解：ok 且原子标记 usedAt", async () => {
    const challenge = makeChallenge();
    mockFindUnique.mockResolvedValue(challenge);
    mockUpdateMany.mockResolvedValue({ count: 1 });
    const nonce = solve(challenge.salt, challenge.difficulty);

    const result = await verifyCaptchaToken(`${challenge.id}.${nonce}`);

    expect(result).toEqual({ ok: true });
    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { id: challenge.id, usedAt: null },
      data: { usedAt: expect.any(Date) },
    });
  });

  it("一次性：原子消费失败（并发重放）返回 invalid", async () => {
    const challenge = makeChallenge();
    mockFindUnique.mockResolvedValue(challenge);
    mockUpdateMany.mockResolvedValue({ count: 0 }); // 已被并发请求抢先消费
    const nonce = solve(challenge.salt, challenge.difficulty);

    expect(await verifyCaptchaToken(`${challenge.id}.${nonce}`)).toEqual({
      ok: false,
      reason: "invalid",
    });
  });
});
