import { describe, it, expect } from "vitest";
import { getClientCredentials, safeEqual } from "@/lib/oauth-client-auth";

describe("oauth-client-auth", () => {
  describe("getClientCredentials", () => {
    it("应从 Authorization Basic header 提取 client_id / client_secret", () => {
      const credentials = Buffer.from("client-id:client-secret").toString("base64");
      const request = {
        headers: { get: () => `Basic ${credentials}` },
      };
      const result = getClientCredentials(request, {});
      expect(result).toEqual({ client_id: "client-id", client_secret: "client-secret" });
    });

    it("Basic header 缺少冒号时应返回 null", () => {
      const credentials = Buffer.from("clientidonly").toString("base64");
      const request = {
        headers: { get: () => `Basic ${credentials}` },
      };
      const result = getClientCredentials(request, { client_id: "fallback-id" });
      expect(result.client_id).toBe("fallback-id");
    });

    it("Basic header 无效 base64 时应回退到 body", () => {
      const request = {
        headers: { get: () => "Basic !!!" },
      };
      const result = getClientCredentials(request, { client_id: "body-id", client_secret: "body-secret" });
      expect(result).toEqual({ client_id: "body-id", client_secret: "body-secret" });
    });

    it("无 Authorization header 时应从 body 提取", () => {
      const request = {
        headers: { get: () => null },
      };
      const result = getClientCredentials(request, { client_id: "body-id" });
      expect(result.client_id).toBe("body-id");
    });

    it("body 中 client_secret 为空字符串时应返回 undefined", () => {
      const request = {
        headers: { get: () => null },
      };
      const result = getClientCredentials(request, { client_id: "public-client", client_secret: "" });
      expect(result.client_secret).toBeUndefined();
    });
  });

  describe("safeEqual", () => {
    it("相同字符串应返回 true", () => {
      expect(safeEqual("abc", "abc")).toBe(true);
    });

    it("不同长度字符串应返回 false", () => {
      expect(safeEqual("abc", "abcd")).toBe(false);
    });

    it("不同内容但相同长度字符串应返回 false", () => {
      expect(safeEqual("abc", "abx")).toBe(false);
    });
  });
});
