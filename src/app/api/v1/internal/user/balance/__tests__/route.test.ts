/**
 * POST /api/v1/internal/user/balance 路由测试
 * 覆盖：缺鉴权头 401、签名错误 401、参数校验 400、用户不存在 404、成功返回权威余额
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    tokenBlacklist: { create: vi.fn().mockResolvedValue({}) },
  },
}));

vi.mock("@/lib/ratelimit", () => ({
  rateLimit: vi.fn(),
  getClientIP: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), log: vi.fn(), debug: vi.fn() },
}));

import { prisma } from "@/lib/prisma";
import { rateLimit, getClientIP } from "@/lib/ratelimit";
import { generateInternalApiSignature, hashRequestBody } from "@/lib/internal-api";
import { POST } from "@/app/api/v1/internal/user/balance/route";

const mockRateLimit = rateLimit as ReturnType<typeof vi.fn>;
const mockUserFindUnique = (prisma.user as unknown as { findUnique: ReturnType<typeof vi.fn> })
  .findUnique;

const PATH = "/api/v1/internal/user/balance";
const KEY = "mall-key";
const SECRET = "mall-secret";

let nonceCounter = 0;

/** 构造带合法签名的请求（与商城侧签名算法一致） */
function createSignedRequest(body: unknown, options?: { badSignature?: boolean }): NextRequest {
  const bodyText = JSON.stringify(body);
  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = `test-nonce-${++nonceCounter}`;
  const bodyHash = hashRequestBody(bodyText);
  let signature = generateInternalApiSignature(SECRET, "POST", PATH, timestamp, nonce, bodyHash);
  if (options?.badSignature) {
    signature = signature.replace(/.$/, signature.endsWith("0") ? "1" : "0");
  }

  return new NextRequest(new URL(PATH, "http://localhost:3000"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-api-key": KEY,
      "x-internal-api-signature": signature,
      "x-internal-api-timestamp": String(timestamp),
      "x-internal-api-nonce": nonce,
    },
    body: bodyText,
  } as never);
}

describe("POST /api/v1/internal/user/balance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.INTERNAL_API_KEYS = JSON.stringify([{ project: "mall", key: KEY, secret: SECRET }]);
    mockRateLimit.mockResolvedValue({ success: true });
    (getClientIP as ReturnType<typeof vi.fn>).mockReturnValue("127.0.0.1");
  });

  it("缺少鉴权头应返回 401 MISSING_AUTH", async () => {
    const req = new NextRequest(new URL(PATH, "http://localhost:3000"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "13800138000" }),
    } as never);

    const res = await POST(req);

    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("MISSING_AUTH");
  });

  it("签名错误应返回 401 UNAUTHORIZED", async () => {
    const res = await POST(createSignedRequest({ phone: "13800138000" }, { badSignature: true }));

    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("UNAUTHORIZED");
  });

  it("手机号格式非法应返回 400 INVALID_PARAMS", async () => {
    const res = await POST(createSignedRequest({ phone: "12345" }));

    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("INVALID_PARAMS");
  });

  it("用户不存在应返回 404 USER_NOT_FOUND", async () => {
    mockUserFindUnique.mockResolvedValue(null);

    const res = await POST(createSignedRequest({ phone: "13800138000" }));

    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("USER_NOT_FOUND");
  });

  it("成功返回官网权威余额与等级", async () => {
    mockUserFindUnique.mockResolvedValue({
      totalPoints: 320,
      totalSpent: 5200,
      membershipLevel: "ADVANCED",
    });

    const res = await POST(createSignedRequest({ phone: "13800138000" }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual({
      success: true,
      data: { totalPoints: 320, totalSpent: 5200, membershipLevel: "ADVANCED" },
    });
    expect(mockUserFindUnique).toHaveBeenCalledWith({
      where: { phone: "13800138000" },
      select: { totalPoints: true, totalSpent: true, membershipLevel: true },
    });
  });
});
