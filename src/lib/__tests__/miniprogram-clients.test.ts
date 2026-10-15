/**
 * miniprogram-clients 多小程序凭证解析测试
 * 覆盖：JSON 解析（合法/损坏/非数组）、条目校验（appId/secret/重复）、
 * 按 clientId 解析、旧版单小程序变量回退（仅缺省客户端）
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), log: vi.fn(), debug: vi.fn() },
}));

import {
  DEFAULT_MINIPROGRAM_CLIENT_ID,
  parseMiniprogramClientsEnv,
  resolveMiniprogramCredentials,
} from "@/lib/miniprogram-clients";

const ENV_KEYS = [
  "MINIPROGRAM_CLIENTS",
  "WECHAT_MINIPROGRAM_APP_ID",
  "WECHAT_MINIPROGRAM_APP_SECRET",
  "WECHAT_APP_ID",
  "WECHAT_APP_SECRET",
] as const;

const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

const VALID_SKIN = {
  clientId: "wechat-mp-skin",
  appId: "wx1234567890abcdef",
  appSecret: "a".repeat(32),
};
const VALID_POINTS = {
  clientId: "wechat-mp-points",
  appId: "wxabcdef1234567890",
  appSecret: "b".repeat(32),
};

describe("parseMiniprogramClientsEnv", () => {
  it("未配置/空串 → configured=false 且无错误", () => {
    expect(parseMiniprogramClientsEnv(undefined)).toEqual({
      configured: false,
      entries: [],
      errors: [],
    });
    expect(parseMiniprogramClientsEnv("   ")).toEqual({
      configured: false,
      entries: [],
      errors: [],
    });
  });

  it("合法 JSON 数组 → 解析全部条目", () => {
    const result = parseMiniprogramClientsEnv(JSON.stringify([VALID_SKIN, VALID_POINTS]));
    expect(result.configured).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.entries).toEqual([VALID_SKIN, VALID_POINTS]);
  });

  it("非法 JSON / 非数组 → 整体报错且无条目", () => {
    expect(parseMiniprogramClientsEnv("{broken").errors).toEqual(["不是合法 JSON"]);
    expect(parseMiniprogramClientsEnv('{"clientId":"x"}').errors).toEqual(["需为 JSON 数组"]);
  });

  it("非法条目被丢弃并报错，合法条目保留", () => {
    const result = parseMiniprogramClientsEnv(
      JSON.stringify([
        VALID_SKIN,
        { clientId: "", appId: "wx1234567890abcdef", appSecret: "c".repeat(32) },
        { clientId: "bad-appid", appId: "nope", appSecret: "c".repeat(32) },
        { clientId: "short-secret", appId: "wx1234567890abcdef", appSecret: "short" },
        { clientId: "placeholder", appId: "wx1234567890abcdef", appSecret: "replace-with-32-char" },
        { ...VALID_POINTS, clientId: "wechat-mp-skin" },
      ])
    );
    expect(result.entries).toEqual([VALID_SKIN]);
    expect(result.errors).toHaveLength(5);
  });
});

describe("resolveMiniprogramCredentials", () => {
  it("配置命中 → 返回对应凭证", () => {
    process.env.MINIPROGRAM_CLIENTS = JSON.stringify([VALID_SKIN, VALID_POINTS]);

    expect(resolveMiniprogramCredentials("wechat-mp-points")).toEqual({
      appId: VALID_POINTS.appId,
      appSecret: VALID_POINTS.appSecret,
    });
  });

  it("配置未命中：缺省客户端回退旧变量；其它客户端返回 null", () => {
    process.env.MINIPROGRAM_CLIENTS = JSON.stringify([VALID_POINTS]);
    process.env.WECHAT_MINIPROGRAM_APP_ID = "wx0000000000000000";
    process.env.WECHAT_MINIPROGRAM_APP_SECRET = "legacy-secret-0123456789";

    expect(resolveMiniprogramCredentials(DEFAULT_MINIPROGRAM_CLIENT_ID)).toEqual({
      appId: "wx0000000000000000",
      appSecret: "legacy-secret-0123456789",
    });
    expect(resolveMiniprogramCredentials("wechat-mp-unknown")).toBeNull();
  });

  it("未配置 env：缺省客户端回退旧变量（WECHAT_* 兼容链），其它客户端返回 null", () => {
    process.env.WECHAT_APP_ID = "wx1111111111111111";
    process.env.WECHAT_APP_SECRET = "fallback-secret-0123456789";

    expect(resolveMiniprogramCredentials(DEFAULT_MINIPROGRAM_CLIENT_ID)).toEqual({
      appId: "wx1111111111111111",
      appSecret: "fallback-secret-0123456789",
    });
    expect(resolveMiniprogramCredentials("wechat-mp-points")).toBeNull();
  });

  it("缺省客户端显式配置时优先于旧变量", () => {
    process.env.MINIPROGRAM_CLIENTS = JSON.stringify([VALID_SKIN]);
    process.env.WECHAT_MINIPROGRAM_APP_ID = "wx0000000000000000";
    process.env.WECHAT_MINIPROGRAM_APP_SECRET = "legacy-secret-0123456789";

    expect(resolveMiniprogramCredentials(DEFAULT_MINIPROGRAM_CLIENT_ID)).toEqual({
      appId: VALID_SKIN.appId,
      appSecret: VALID_SKIN.appSecret,
    });
  });

  it("完全未配置任何凭证 → null", () => {
    expect(resolveMiniprogramCredentials(DEFAULT_MINIPROGRAM_CLIENT_ID)).toBeNull();
    expect(resolveMiniprogramCredentials("wechat-mp-points")).toBeNull();
  });
});
