/**
 * OAuth JWKS 端点单元测试
 * GET /api/oauth/jwks
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// === Mock ratelimit ===
vi.mock("@/lib/ratelimit", () => ({
  rateLimit: vi.fn().mockResolvedValue({ success: true }),
  getClientIP: vi.fn().mockReturnValue("127.0.0.1"),
}));

// === Mock jwt public key ===
const mockGetAccessPublicKey = vi.fn();
const mockGetPrevAccessPublicKey = vi.fn();
const mockGetIdTokenPublicKey = vi.fn();
const mockGetPrevIdTokenPublicKey = vi.fn();
const mockGetLogoutTokenPublicKey = vi.fn();
const mockGetPrevLogoutTokenPublicKey = vi.fn();
vi.mock("@/lib/jwt", () => ({
  getAccessPublicKey: () => mockGetAccessPublicKey(),
  getPrevAccessPublicKey: () => mockGetPrevAccessPublicKey(),
  getAccessKeyId: () => "access-token-rs256-v1",
  getPrevAccessKeyId: () => "access-token-rs256-v0",
  getIdTokenPublicKey: () => mockGetIdTokenPublicKey(),
  getPrevIdTokenPublicKey: () => mockGetPrevIdTokenPublicKey(),
  getIdTokenKeyId: () => "id-token-rs256-v1",
  getPrevIdTokenKeyId: () => "id-token-rs256-v0",
  getLogoutTokenPublicKey: () => mockGetLogoutTokenPublicKey(),
  getPrevLogoutTokenPublicKey: () => mockGetPrevLogoutTokenPublicKey(),
  getLogoutTokenKeyId: () => "logout-token-rs256-v1",
  getPrevLogoutTokenKeyId: () => "logout-token-rs256-v0",
}));

describe("GET /api/oauth/jwks", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    mockGetAccessPublicKey.mockResolvedValue(null);
    mockGetPrevAccessPublicKey.mockResolvedValue(null);
    mockGetIdTokenPublicKey.mockResolvedValue(null);
    mockGetPrevIdTokenPublicKey.mockResolvedValue(null);
    mockGetLogoutTokenPublicKey.mockResolvedValue(null);
    mockGetPrevLogoutTokenPublicKey.mockResolvedValue(null);
  });

  it("未配置 RS256 公钥时返回空 keys（不暴露 HS256 占位，避免破坏标准 JWKS 客户端）", async () => {
    const { GET } = await import("../jwks/route");
    const req = new NextRequest("http://localhost/api/oauth/jwks");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.keys).toHaveLength(0);
  });

  it("配置 RS256 公钥时公开公钥 JWK", async () => {
    mockGetAccessPublicKey.mockResolvedValue({
      algorithm: { name: "RSASSA-PKCS1-v1_5" },
    } as unknown as CryptoKey);

    vi.spyOn(crypto.subtle, "exportKey").mockResolvedValue({
      kty: "RSA",
      n: "test-n",
      e: "AQAB",
    } as unknown as JsonWebKey);

    const { GET } = await import("../jwks/route");
    const req = new NextRequest("http://localhost/api/oauth/jwks");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    const rs256Key = body.keys.find((k: { kid?: string }) => k.kid === "access-token-rs256-v1");
    expect(rs256Key).toBeDefined();
    expect(rs256Key.alg).toBe("RS256");
    expect(rs256Key.n).toBe("test-n");
  });

  it("配置上一代公钥时同时暴露当前与上一代（各自 kid），支持密钥轮换", async () => {
    mockGetAccessPublicKey.mockResolvedValue({
      algorithm: { name: "RSASSA-PKCS1-v1_5" },
    } as unknown as CryptoKey);
    mockGetPrevAccessPublicKey.mockResolvedValue({
      algorithm: { name: "RSASSA-PKCS1-v1_5" },
    } as unknown as CryptoKey);

    vi.spyOn(crypto.subtle, "exportKey").mockResolvedValue({
      kty: "RSA",
      n: "test-n",
      e: "AQAB",
    } as unknown as JsonWebKey);

    const { GET } = await import("../jwks/route");
    const req = new NextRequest("http://localhost/api/oauth/jwks");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    const kids = body.keys.map((k: { kid?: string }) => k.kid);
    expect(kids).toContain("access-token-rs256-v1");
    expect(kids).toContain("access-token-rs256-v0");
  });
});
