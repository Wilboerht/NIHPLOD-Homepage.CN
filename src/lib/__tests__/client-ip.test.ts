import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getClientIP } from "@/lib/client-ip";

function createRequest(headers: Record<string, string>): Request {
  return new Request("http://localhost", {
    headers,
  });
}

describe("getClientIP", () => {
  beforeEach(() => {
    // 默认重置为不信任代理
  });

  afterEach(() => {
    // 清理环境变量存根
    if (typeof process !== "undefined") {
      delete process.env.TRUST_PROXY;
      delete process.env.TRUST_PROXY_HOPS;
    }
  });

  it("不信任代理时返回 unknown", () => {
    const request = createRequest({
      "x-forwarded-for": "1.2.3.4, 5.6.7.8",
    });

    expect(getClientIP(request)).toBe("unknown");
  });

  it("信任代理时默认取最近端（最后一段）IP", () => {
    process.env.TRUST_PROXY = "true";

    const request = createRequest({
      "x-forwarded-for": "1.2.3.4, 5.6.7.8",
    });

    expect(getClientIP(request)).toBe("5.6.7.8");
  });

  it("TRUST_PROXY_HOPS=1（1 层代理）取从右往左第 1 个条目", () => {
    process.env.TRUST_PROXY = "true";
    process.env.TRUST_PROXY_HOPS = "1";

    const request = createRequest({
      "x-forwarded-for": "1.2.3.4, 5.6.7.8",
    });

    expect(getClientIP(request)).toBe("5.6.7.8");
  });

  it("应尊重 TRUST_PROXY_HOPS 配置（2 层代理取右起第 2 个）", () => {
    process.env.TRUST_PROXY = "true";
    process.env.TRUST_PROXY_HOPS = "2";

    const request = createRequest({
      "x-forwarded-for": "1.2.3.4, 5.6.7.8, 9.10.11.12",
    });

    expect(getClientIP(request)).toBe("5.6.7.8");
  });

  it("客户端伪造 XFF 前缀不影响正值 hops 的取值（防限流 key 伪造）", () => {
    process.env.TRUST_PROXY = "true";
    process.env.TRUST_PROXY_HOPS = "1";

    // 攻击者伪造前缀 "9.9.9.9"，代理在尾部追加真实 IP；取右起第 1 个应为真实 IP
    const request = createRequest({
      "x-forwarded-for": "9.9.9.9, 1.2.3.4",
    });

    expect(getClientIP(request)).toBe("1.2.3.4");
  });

  it("HOPS 超过 IP 数量时收敛到第一个可用 IP", () => {
    process.env.TRUST_PROXY = "true";
    process.env.TRUST_PROXY_HOPS = "10";

    const request = createRequest({
      "x-forwarded-for": "1.2.3.4, 5.6.7.8",
    });

    expect(getClientIP(request)).toBe("1.2.3.4");
  });

  it("优先使用 X-Real-Ip", () => {
    process.env.TRUST_PROXY = "true";

    const request = createRequest({
      "x-real-ip": "9.9.9.9",
    });

    expect(getClientIP(request)).toBe("9.9.9.9");
  });

  it("开发环境自动信任代理", () => {
    process.env.TRUST_PROXY = "true";
    (process.env as Record<string, string | undefined>).NODE_ENV = "development";

    const request = createRequest({
      "x-forwarded-for": "1.2.3.4",
    });

    expect(getClientIP(request)).toBe("1.2.3.4");
  });
});
