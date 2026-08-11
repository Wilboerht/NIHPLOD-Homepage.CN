/**
 * DPoP (RFC 9449) 工具单元测试
 * - HMAC 签名 nonce 的签发与校验（服务端可验证、客户端不可伪造）
 * - getDPoPHtu 公网 origin 推导（path 区分大小写，scheme/host 不区分）
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { getDpopNonce, isDpopNonceIssued, getDPoPHtu } from "../dpop";

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
