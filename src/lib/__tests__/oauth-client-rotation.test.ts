/**
 * OAuth Client 密钥轮换过渡期（多实例共享）单元测试
 * - previousSecretHash / secretRotatedAt 持久化到 DB，过渡期内旧 secret 可验证
 * - 过渡期（5 分钟）外旧 secret 不再被接受
 * - cacheOldSecret 同步写内存缓存 + fire-and-forget 持久化 DB
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// === Mock Prisma（factory 内联，避免 hoisting 引用问题）===
vi.mock("@/lib/prisma", () => ({
  prisma: {
    oAuthClient: {
      findFirst: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
  },
}));

// === Mock bcryptjs：hash 形如 "hashed:<secret>" 即视为匹配 ===
vi.mock("bcryptjs", () => ({
  default: {
    hash: vi.fn(async (s: string) => `hashed:${s}`),
    compare: vi.fn(async (s: string, h: string) => h === `hashed:${s}`),
  },
  hash: vi.fn(async (s: string) => `hashed:${s}`),
  compare: vi.fn(async (s: string, h: string) => h === `hashed:${s}`),
}));

import { verifyOAuthClientSecret, cacheOldSecret, SECRET_ROTATION_GRACE_MS } from "../oauth-client";
import { prisma } from "@/lib/prisma";

function clientRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "id-1",
    clientId: "cid-1",
    clientSecret: "hashed:new-secret",
    previousSecretHash: null as string | null,
    secretRotatedAt: null as Date | null,
    name: "Test",
    redirectUris: ["https://example.com/cb"],
    postLogoutRedirectUris: [],
    scopes: ["openid"],
    isActive: true,
    isPublic: false,
    backchannelLogoutUri: null,
    codeTtlSeconds: 300,
    accessTokenTtlSeconds: 900,
    tenantId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("verifyOAuthClientSecret 密钥轮换过渡期", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.oAuthClient.update).mockResolvedValue({} as never);
  });

  it("当前 hash 匹配时直接通过（不查旧 hash）", async () => {
    vi.mocked(prisma.oAuthClient.findFirst).mockResolvedValue(clientRecord() as never);
    const result = await verifyOAuthClientSecret("cid-1", "new-secret");
    expect(result.reason).toBe("ok");
    expect(result.client?.clientId).toBe("cid-1");
  });

  it("过渡期内：当前 hash 不匹配但 DB previousSecretHash 匹配应通过", async () => {
    vi.mocked(prisma.oAuthClient.findFirst).mockResolvedValue(
      clientRecord({
        previousSecretHash: "hashed:old-secret",
        secretRotatedAt: new Date(Date.now() - 60 * 1000), // 1 分钟前轮换
      }) as never
    );
    const result = await verifyOAuthClientSecret("cid-1", "old-secret");
    expect(result.reason).toBe("ok");
  });

  it("过渡期外：secretRotatedAt 超过 5 分钟，旧 secret 应被拒绝", async () => {
    vi.mocked(prisma.oAuthClient.findFirst).mockResolvedValue(
      clientRecord({
        previousSecretHash: "hashed:old-secret",
        secretRotatedAt: new Date(Date.now() - SECRET_ROTATION_GRACE_MS - 1000),
      }) as never
    );
    const result = await verifyOAuthClientSecret("cid-1", "old-secret");
    expect(result.reason).toBe("invalid_secret");
    expect(result.client).toBeNull();
  });

  it("无 previousSecretHash 时旧 secret 应被拒绝", async () => {
    vi.mocked(prisma.oAuthClient.findFirst).mockResolvedValue(clientRecord() as never);
    const result = await verifyOAuthClientSecret("cid-1", "old-secret");
    expect(result.reason).toBe("invalid_secret");
  });

  it("secretRotatedAt 在未来（时钟回拨防护）不应接受旧 secret", async () => {
    vi.mocked(prisma.oAuthClient.findFirst).mockResolvedValue(
      clientRecord({
        previousSecretHash: "hashed:old-secret",
        secretRotatedAt: new Date(Date.now() + 60 * 1000),
      }) as never
    );
    const result = await verifyOAuthClientSecret("cid-1", "old-secret");
    expect(result.reason).toBe("invalid_secret");
  });
});

describe("cacheOldSecret 持久化", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.oAuthClient.update).mockResolvedValue({} as never);
  });

  it("应将旧 hash 与轮换时间写入 DB（多实例共享）", () => {
    cacheOldSecret("cid-persist", "hashed:old-secret");
    expect(prisma.oAuthClient.update).toHaveBeenCalledWith({
      where: { clientId: "cid-persist" },
      data: {
        previousSecretHash: "hashed:old-secret",
        secretRotatedAt: expect.any(Date),
      },
    });
  });

  it("DB 记录缺少 previousSecretHash 时，内存缓存仍作为本实例快速路径", async () => {
    // 模拟 DB 持久化尚未完成/失败，但本实例内存缓存已写入的场景
    cacheOldSecret("cid-memory", "hashed:old-secret");
    vi.mocked(prisma.oAuthClient.findFirst).mockResolvedValue(
      clientRecord({ clientId: "cid-memory" }) as never
    );
    const result = await verifyOAuthClientSecret("cid-memory", "old-secret");
    expect(result.reason).toBe("ok");
  });
});
