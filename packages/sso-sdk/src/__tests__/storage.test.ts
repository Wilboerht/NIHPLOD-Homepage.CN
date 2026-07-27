/**
 * Token 存储层测试
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  saveTokenData,
  getTokenData,
  removeTokenData,
  savePkceVerifier,
  getPkceVerifier,
  removePkceVerifier,
  saveOAuthState,
  getOAuthState,
  removeOAuthState,
  saveReturnUrl,
  getReturnUrl,
  removeReturnUrl,
  clearAllSsoData,
  setTokenStorage,
  type TokenData,
} from "../core/storage";

// Mock storage
const mockStore = new Map<string, string>();

const mockStorage = {
  get: (key: string) => mockStore.get(key) ?? null,
  set: (key: string, value: string) => mockStore.set(key, value),
  remove: (key: string) => mockStore.delete(key),
};

describe("Token Storage", () => {
  beforeEach(() => {
    mockStore.clear();
    setTokenStorage(mockStorage);
  });

  const sampleToken: TokenData = {
    access_token: "test-access-token",
    token_type: "Bearer",
    expires_in: 900,
    refresh_token: "test-refresh-token",
    id_token: "test-id-token",
    issued_at: 1700000000000,
    expires_at: 1700000900000,
  };

  describe("saveTokenData / getTokenData / removeTokenData", () => {
    it("保存并读取 token", () => {
      saveTokenData(sampleToken);
      const retrieved = getTokenData();
      expect(retrieved).not.toBeNull();
      expect(retrieved!.access_token).toBe("test-access-token");
      expect(retrieved!.refresh_token).toBe("test-refresh-token");
      expect(retrieved!.issued_at).toBe(1700000000000);
    });

    it("无数据时返回 null", () => {
      expect(getTokenData()).toBeNull();
    });

    it("删除 token 后返回 null", () => {
      saveTokenData(sampleToken);
      removeTokenData();
      expect(getTokenData()).toBeNull();
    });
  });

  describe("PKCE verifier", () => {
    it("保存并读取 verifier", () => {
      savePkceVerifier("client-1", "test-verifier");
      expect(getPkceVerifier("client-1")).toBe("test-verifier");
    });

    it("不同 clientId 的 verifier 隔离", () => {
      savePkceVerifier("client-1", "verifier-1");
      savePkceVerifier("client-2", "verifier-2");
      expect(getPkceVerifier("client-1")).toBe("verifier-1");
      expect(getPkceVerifier("client-2")).toBe("verifier-2");
    });

    it("删除 verifier", () => {
      savePkceVerifier("client-1", "verifier-1");
      removePkceVerifier("client-1");
      expect(getPkceVerifier("client-1")).toBeNull();
    });
  });

  describe("State / Return URL", () => {
    it("保存并读取 state", () => {
      saveOAuthState("test-state-123");
      expect(getOAuthState()).toBe("test-state-123");
      removeOAuthState();
      expect(getOAuthState()).toBeNull();
    });

    it("保存并读取 return URL", () => {
      saveReturnUrl("/dashboard");
      expect(getReturnUrl()).toBe("/dashboard");
      removeReturnUrl();
      expect(getReturnUrl()).toBeNull();
    });
  });

  describe("clearAllSsoData", () => {
    it("清除所有数据", () => {
      saveTokenData(sampleToken);
      saveOAuthState("state-123");
      saveReturnUrl("/dashboard");

      clearAllSsoData();

      expect(getTokenData()).toBeNull();
      expect(getOAuthState()).toBeNull();
      expect(getReturnUrl()).toBeNull();
    });
  });
});
