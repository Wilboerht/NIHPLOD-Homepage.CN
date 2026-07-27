/**
 * PKCE 工具函数测试
 */
import { describe, it, expect } from "vitest";
import {
  generateCodeVerifier,
  generateCodeChallenge,
  generateState,
} from "../core/pkce";

describe("generateCodeVerifier", () => {
  it("生成默认长度 64 的 verifier", () => {
    const v = generateCodeVerifier();
    expect(v.length).toBe(64);
  });

  it("生成长度在合法范围内的 verifier", () => {
    const v = generateCodeVerifier(43);
    expect(v.length).toBe(43);

    const v2 = generateCodeVerifier(128);
    expect(v2.length).toBe(128);
  });

  it("长度小于 43 时抛出错误", () => {
    expect(() => generateCodeVerifier(42)).toThrow(
      "code_verifier length must be between 43 and 128"
    );
  });

  it("长度大于 128 时抛出错误", () => {
    expect(() => generateCodeVerifier(129)).toThrow(
      "code_verifier length must be between 43 and 128"
    );
  });

  it("每次生成的 verifier 不同", () => {
    const v1 = generateCodeVerifier();
    const v2 = generateCodeVerifier();
    expect(v1).not.toBe(v2);
  });

  it("verifier 仅包含合法字符", () => {
    const v = generateCodeVerifier(100);
    expect(v).toMatch(/^[A-Za-z0-9\-._~]+$/);
  });
});

describe("generateCodeChallenge", () => {
  it("SHA-256 哈希后 base64url 编码", async () => {
    const verifier = "test-verifier-1234567890123456789012345678901234567890abcd";
    const challenge = await generateCodeChallenge(verifier);
    // challenge 应该是 base64url 格式
    expect(challenge).toMatch(/^[A-Za-z0-9\-_]+$/);
    // 长度：SHA-256 输出 32 字节，base64url 约 43 字符
    expect(challenge.length).toBeGreaterThan(30);
    expect(challenge.length).toBeLessThan(50);
  });

  it("相同 verifier 生成相同 challenge", async () => {
    const verifier = generateCodeVerifier();
    const c1 = await generateCodeChallenge(verifier);
    const c2 = await generateCodeChallenge(verifier);
    expect(c1).toBe(c2);
  });

  it("不同 verifier 生成不同 challenge", async () => {
    const v1 = generateCodeVerifier();
    const v2 = generateCodeVerifier();
    const c1 = await generateCodeChallenge(v1);
    const c2 = await generateCodeChallenge(v2);
    expect(c1).not.toBe(c2);
  });
});

describe("generateState", () => {
  it("生成 64 字符 hex 字符串", () => {
    const state = generateState();
    // 32 bytes = 64 hex chars
    expect(state.length).toBe(64);
    expect(state).toMatch(/^[0-9a-f]+$/);
  });

  it("每次生成的 state 不同", () => {
    const s1 = generateState();
    const s2 = generateState();
    expect(s1).not.toBe(s2);
  });
});
