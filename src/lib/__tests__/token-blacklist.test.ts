import { describe, it, expect, vi, beforeEach } from "vitest";

const mockStore = vi.hoisted(() => ({
  revokeAccessToken: vi.fn(),
  isAccessTokenRevoked: vi.fn(),
  blacklistUser: vi.fn(),
  isUserBlacklisted: vi.fn(),
  removeUserBlacklist: vi.fn(),
}));

vi.mock("@/lib/token-blacklist-store", () => ({
  tokenBlacklistStore: mockStore,
}));

import {
  blacklistUserTokens,
  isTokenBlacklisted,
  removeFromBlacklist,
  revokeAccessToken,
  isAccessTokenRevoked,
  tokenBlacklistStore,
} from "@/lib/token-blacklist";

describe("token-blacklist", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("blacklistUserTokens 应调用 store.blacklistUser", async () => {
    mockStore.blacklistUser.mockResolvedValue(undefined);
    await blacklistUserTokens("user-1", "fraud");
    expect(mockStore.blacklistUser).toHaveBeenCalledWith("user-1", "fraud");
  });

  it("isTokenBlacklisted 应返回 store 的结果", async () => {
    mockStore.isUserBlacklisted.mockResolvedValue({ reason: "fraud" });
    const result = await isTokenBlacklisted("user-1");
    expect(result).toEqual({ reason: "fraud" });
    expect(mockStore.isUserBlacklisted).toHaveBeenCalledWith("user-1");
  });

  it("removeFromBlacklist 应调用 store.removeUserBlacklist", async () => {
    mockStore.removeUserBlacklist.mockResolvedValue(undefined);
    await removeFromBlacklist("user-1");
    expect(mockStore.removeUserBlacklist).toHaveBeenCalledWith("user-1");
  });

  it("revokeAccessToken 应调用 store.revokeAccessToken", async () => {
    mockStore.revokeAccessToken.mockResolvedValue(undefined);
    await revokeAccessToken("jti-1");
    expect(mockStore.revokeAccessToken).toHaveBeenCalledWith("jti-1");
  });

  it("isAccessTokenRevoked 应返回 store 的结果", async () => {
    mockStore.isAccessTokenRevoked.mockResolvedValue(true);
    const result = await isAccessTokenRevoked("jti-1");
    expect(result).toBe(true);
    expect(mockStore.isAccessTokenRevoked).toHaveBeenCalledWith("jti-1");
  });

  it("应同步导出 tokenBlacklistStore", () => {
    expect(tokenBlacklistStore).toBe(mockStore);
  });
});
