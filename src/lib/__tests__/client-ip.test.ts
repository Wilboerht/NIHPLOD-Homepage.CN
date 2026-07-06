import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getClientIP } from "../client-ip";

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
      delete process.env.VERCEL;
    }
  });

  it("不信任代理时返回 unknown", () => {
    const request = createRequest({
      "x-forwarded-for": "1.2.3.4, 5.6.7.8",
    });

    expect(getClientIP(request)).toBe("unknown");
  });

  it("信任代理时取 X-Forwarded-For 第一个 IP", () => {
    process.env.TRUST_PROXY = "true";
    process.env.TRUST_PROXY_HOPS = "1";

    const request = createRequest({
      "x-forwarded-for": "1.2.3.4, 5.6.7.8",
    });

    expect(getClientIP(request)).toBe("1.2.3.4");
  });

  it("应尊重 TRUST_PROXY_HOPS 配置", () => {
    process.env.TRUST_PROXY = "true";
    process.env.TRUST_PROXY_HOPS = "2";

    const request = createRequest({
      "x-forwarded-for": "1.2.3.4, 5.6.7.8, 9.10.11.12",
    });

    expect(getClientIP(request)).toBe("5.6.7.8");
  });

  it("HOPS 超过 IP 数量时应取最后一个可用 IP", () => {
    process.env.TRUST_PROXY = "true";
    process.env.TRUST_PROXY_HOPS = "10";

    const request = createRequest({
      "x-forwarded-for": "1.2.3.4, 5.6.7.8",
    });

    expect(getClientIP(request)).toBe("5.6.7.8");
  });

  it("优先使用 X-Real-Ip", () => {
    process.env.TRUST_PROXY = "true";

    const request = createRequest({
      "x-real-ip": "9.9.9.9",
    });

    expect(getClientIP(request)).toBe("9.9.9.9");
  });

  it("Vercel 环境自动信任代理", () => {
    process.env.TRUST_PROXY = "false";
    process.env.VERCEL = "1";

    const request = createRequest({
      "x-forwarded-for": "1.2.3.4",
    });

    expect(getClientIP(request)).toBe("1.2.3.4");
  });
});
