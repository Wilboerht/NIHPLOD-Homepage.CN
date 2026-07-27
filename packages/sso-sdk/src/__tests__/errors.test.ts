/**
 * 错误类测试
 */
import { describe, it, expect } from "vitest";
import { SsoError, OAuthError } from "../core/errors";

describe("SsoError", () => {
  it("正确设置 name、code、description", () => {
    const err = new SsoError("invalid_config", "clientId 不能为空");
    expect(err.name).toBe("SsoError");
    expect(err.code).toBe("invalid_config");
    expect(err.description).toBe("clientId 不能为空");
    expect(err.message).toContain("[SSO SDK]");
    expect(err.message).toContain("invalid_config");
  });

  it("支持传入 cause", () => {
    const cause = new Error("原始错误");
    const err = new SsoError("network_error", "网络请求失败", cause);
    expect(err.cause).toBe(cause);
  });

  it("是 Error 的子类", () => {
    const err = new SsoError("not_authenticated", "未登录");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(SsoError);
  });
});

describe("OAuthError", () => {
  it("正确设置 code 和 description", () => {
    const err = new OAuthError("invalid_grant", "Authorization code 无效");
    expect(err.name).toBe("OAuthError");
    expect(err.code).toBe("invalid_grant");
    expect(err.description).toBe("Authorization code 无效");
  });

  it("支持传入 uri", () => {
    const err = new OAuthError(
      "invalid_request",
      "参数错误",
      "https://example.com/help"
    );
    expect(err.uri).toBe("https://example.com/help");
  });

  it("是 Error 的子类", () => {
    const err = new OAuthError("access_denied", "用户拒绝授权");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(OAuthError);
  });
});
