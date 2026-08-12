/**
 * DPoP (RFC 9449) 工具单元测试
 * - HMAC 签名 nonce 的签发与校验（服务端可验证、客户端不可伪造）
 * - getDPoPHtu 公网 origin 推导（path 区分大小写，scheme/host 不区分）
 * - jti / nonce 防重放：DB（TokenBlacklist 表）共享记录 + 内存快速路径
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { generateKeyPair, exportJWK, SignJWT } from "jose";

// === Mock Prisma（factory 内联，避免 hoisting 引用问题）===
vi.mock("@/lib/prisma", () => ({
  prisma: {
    tokenBlacklist: {
      create: vi.fn().mockResolvedValue({}),
    },
  },
}));

import { getDpopNonce, isDpopNonceIssued, getDPoPHtu, validateDPoPProof } from "../dpop";
import { prisma } from "@/lib/prisma";

describe("DPoP nonce", () => {
  it("服务端签发的 nonce 应通过校验", () => {
    const nonce = getDpopNonce("client:user");
    expect(isDpopNonceIssued(nonce)).toBe(true);
  });

  it("格式非法或无签名的 nonce 应被拒绝", () => {
    expect(isDpopNonceIssued("")).toBe(false);
    expect(isDpopNonceIssued("no-signature-part")).toBe(false);
    expect(isDpopNonceIssued("aaaa.bbbb")).toBe(false);
  });

  it("篡改后的 nonce 应被拒绝", () => {
    const nonce = getDpopNonce("client:user");
    const tampered = `${nonce.slice(0, -2)}xx`;
    expect(isDpopNonceIssued(tampered)).toBe(false);
  });
});

describe("getDPoPHtu", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("未配置公网 URL 时回退到 request origin", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    vi.stubEnv("NEXT_PUBLIC_BASE_URL", "");
    const req = new NextRequest("http://localhost/api/oauth/token");
    expect(getDPoPHtu(req)).toBe("http://localhost/api/oauth/token");
  });

  it("配置公网 URL 后使用公网 origin（反向代理后 request.url 为内网地址）", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://nihplod.cn");
    const req = new NextRequest("http://localhost:3000/api/oauth/token");
    expect(getDPoPHtu(req)).toBe("https://nihplod.cn/api/oauth/token");
  });

  it("path 保持原样大小写，仅 scheme/host 规范化", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://NIHPLOD.cn");
    const req = new NextRequest("http://localhost/Api/OAuth/Token");
    expect(getDPoPHtu(req)).toBe("https://nihplod.cn/Api/OAuth/Token");
  });
});

const TEST_HTU = "https://example.com/api/oauth/token";

/** 生成一个合法签名的 DPoP proof JWT（ES256，jwk 内联），可携带 nonce claim */
async function makeProof(jti: string, nonce?: string): Promise<string> {
  const { publicKey, privateKey } = await generateKeyPair("ES256", { extractable: true });
  const jwk = await exportJWK(publicKey);
  const claims: Record<string, string> = { htm: "POST", htu: TEST_HTU };
  if (nonce) claims.nonce = nonce;
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "ES256", typ: "dpop+jwt", jwk })
    .setJti(jti)
    .setIssuedAt()
    .sign(privateKey);
}

describe("DPoP jti 防重放（DB 共享）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.tokenBlacklist.create).mockResolvedValue({} as never);
  });

  it("首次使用的 jti 应通过验证并写入 TokenBlacklist", async () => {
    const proof = await makeProof("jti-first-use");
    const result = await validateDPoPProof(proof, "POST", TEST_HTU);
    expect(result.valid).toBe(true);
    expect(result.jkt).toBeDefined();
    expect(prisma.tokenBlacklist.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: "dpop_jti",
        key: "dpop-jti:jti-first-use",
        expiresAt: expect.any(Date),
      }),
    });
  });

  it("相同 jti 重放应被拒绝（内存快速路径，无二次 DB 写入）", async () => {
    const proof = await makeProof("jti-replay-memory");
    const first = await validateDPoPProof(proof, "POST", TEST_HTU);
    expect(first.valid).toBe(true);

    const second = await validateDPoPProof(proof, "POST", TEST_HTU);
    expect(second.valid).toBe(false);
    expect(second.error).toBe("invalid_dpop_proof");
    expect(second.errorDescription).toContain("jti");
    // 第二次命中进程内缓存，不再写 DB
    expect(prisma.tokenBlacklist.create).toHaveBeenCalledTimes(1);
  });

  it("DB 唯一约束冲突（P2002）应判定为跨实例重放并拒绝", async () => {
    vi.mocked(prisma.tokenBlacklist.create).mockRejectedValueOnce({ code: "P2002" });
    const proof = await makeProof("jti-replay-db");
    const result = await validateDPoPProof(proof, "POST", TEST_HTU);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("invalid_dpop_proof");
    expect(result.errorDescription).toContain("jti");
  });

  it("DB 不可用时应 fail-closed 拒绝（防止跨实例重放窗口）", async () => {
    vi.mocked(prisma.tokenBlacklist.create).mockRejectedValueOnce(new Error("db down"));
    const proof = await makeProof("jti-db-down");
    const result = await validateDPoPProof(proof, "POST", TEST_HTU);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("invalid_dpop_proof");
  });
});

describe("DPoP nonce 防重放（DB 共享）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.tokenBlacklist.create).mockResolvedValue({} as never);
  });

  it("首次使用的 nonce 应通过验证并写入 TokenBlacklist（key 前缀 dpop-nonce:）", async () => {
    const nonce = getDpopNonce("client:user-nonce-first");
    const proof = await makeProof("jti-nonce-first", nonce);
    const result = await validateDPoPProof(proof, "POST", TEST_HTU);
    expect(result.valid).toBe(true);
    expect(prisma.tokenBlacklist.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: "dpop_jti",
        key: `dpop-nonce:${nonce}`,
        expiresAt: expect.any(Date),
      }),
    });
  });

  it("相同 nonce 重放（不同 jti）应被拒绝（内存快速路径）", async () => {
    const nonce = getDpopNonce("client:user-nonce-replay");
    const first = await validateDPoPProof(
      await makeProof("jti-nonce-replay-1", nonce),
      "POST",
      TEST_HTU
    );
    expect(first.valid).toBe(true);

    const second = await validateDPoPProof(
      await makeProof("jti-nonce-replay-2", nonce),
      "POST",
      TEST_HTU
    );
    expect(second.valid).toBe(false);
    expect(second.error).toBe("invalid_dpop_proof");
    expect(second.errorDescription).toContain("nonce");
    // jti 写 2 次 + nonce 写 1 次（第二次命中进程内缓存，不再写 DB）
    expect(prisma.tokenBlacklist.create).toHaveBeenCalledTimes(3);
  });

  it("nonce 记录 DB 唯一约束冲突（P2002）应判定为跨实例重放并拒绝", async () => {
    const nonce = getDpopNonce("client:user-nonce-p2002");
    // 第一次 create（jti）成功，第二次 create（nonce）P2002 → 模拟另一实例已消费该 nonce
    vi.mocked(prisma.tokenBlacklist.create)
      .mockResolvedValueOnce({} as never)
      .mockRejectedValueOnce({ code: "P2002" });
    const proof = await makeProof("jti-nonce-p2002", nonce);
    const result = await validateDPoPProof(proof, "POST", TEST_HTU);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("invalid_dpop_proof");
    expect(result.errorDescription).toContain("nonce");
  });

  it("nonce 记录 DB 不可用时应 fail-closed 拒绝（防止跨实例重放窗口）", async () => {
    const nonce = getDpopNonce("client:user-nonce-dbdown");
    vi.mocked(prisma.tokenBlacklist.create)
      .mockResolvedValueOnce({} as never)
      .mockRejectedValueOnce(new Error("db down"));
    const proof = await makeProof("jti-nonce-dbdown", nonce);
    const result = await validateDPoPProof(proof, "POST", TEST_HTU);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("invalid_dpop_proof");
    expect(result.errorDescription).toContain("nonce");
  });
});
