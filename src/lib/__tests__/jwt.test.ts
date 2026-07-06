import { describe, it, expect, beforeAll } from "vitest";
import {
  signToken,
  verifyToken,
  signUserToken,
  verifyUserToken,
  signRefreshToken,
  verifyRefreshToken,
} from "../jwt";

const TEST_SECRET = "test-secret-key-at-least-32-characters-long";

beforeAll(() => {
  process.env.JWT_SECRET = TEST_SECRET;
});

describe("JWT 工具", () => {
  describe("管理员 Token", () => {
    it("应能签发并验证管理员 Token", async () => {
      const token = await signToken({
        id: "admin-1",
        email: "admin@example.com",
        name: "Admin",
        role: "owner",
      });

      expect(token).toBeTruthy();

      const payload = await verifyToken(token);
      expect(payload).toMatchObject({
        id: "admin-1",
        email: "admin@example.com",
        name: "Admin",
        role: "owner",
        type: "admin",
      });
    });

    it("应拒绝非管理员 Token", async () => {
      const userToken = await signUserToken({ id: "user-1", phone: "13800138000" });
      const result = await verifyToken(userToken);
      expect(result).toBeNull();
    });

    it("应拒绝伪造 Token", async () => {
      const result = await verifyToken("this.is.not_valid");
      expect(result).toBeNull();
    });
  });

  describe("C 端用户 Token", () => {
    it("应能签发并验证用户 Access Token", async () => {
      const token = await signUserToken({ id: "user-1", phone: "13800138000" });
      const payload = await verifyUserToken(token);
      expect(payload).toMatchObject({
        id: "user-1",
        phone: "13800138000",
        type: "user",
      });
    });

    it("应拒绝管理员 Token 作为用户 Token", async () => {
      const adminToken = await signToken({
        id: "admin-1",
        email: "admin@example.com",
        name: "Admin",
        role: "owner",
      });
      const result = await verifyUserToken(adminToken);
      expect(result).toBeNull();
    });

    it("应拒绝伪造 Token", async () => {
      const result = await verifyUserToken("invalid.token.here");
      expect(result).toBeNull();
    });
  });

  describe("Refresh Token", () => {
    it("应能签发并验证 Refresh Token", async () => {
      const token = await signRefreshToken({ id: "user-1", phone: "13800138000" });
      const payload = await verifyRefreshToken(token);
      expect(payload).toMatchObject({
        id: "user-1",
        phone: "13800138000",
        type: "refresh",
      });
    });

    it("应拒绝 Access Token 作为 Refresh Token", async () => {
      const accessToken = await signUserToken({ id: "user-1", phone: "13800138000" });
      const result = await verifyRefreshToken(accessToken);
      expect(result).toBeNull();
    });
  });
});
