import { describe, it, expect } from "vitest";
import {
  adminPageSchema,
  adminPageSizeSchema,
  validateCUID,
  invalidIdResponse,
} from "@/lib/validation";

describe("validation", () => {
  it("应验证合法 CUID v1 格式（c + 24 位 base36）", () => {
    expect(validateCUID("c" + "a".repeat(24))).toBe(true);
    expect(validateCUID("c" + "1".repeat(24))).toBe(true);
  });

  it("应验证合法 CUID2 格式（Prisma 6+ cuid() 默认，24 位小写字母）", () => {
    // cuid2：24 位小写字母、无固定前缀（如 tz4a98xxat96iws9zmbrgj3a）
    expect(validateCUID("tz4a98xxat96iws9zmbrgj3a")).toBe(true);
    expect(validateCUID("a".repeat(24))).toBe(true);
  });

  it("应拒绝非法 ID 格式", () => {
    expect(validateCUID("not-a-cuid")).toBe(false);
    // 长度不对（23 / 25 位但首字符不符合两种格式）
    expect(validateCUID("a".repeat(23))).toBe(false);
    expect(validateCUID("a".repeat(25))).toBe(false);
    // 含大写或符号
    expect(validateCUID("A".repeat(24))).toBe(false);
    expect(validateCUID("a-b".repeat(8))).toBe(false);
  });

  it("管理端分页参数应限制上限并保留默认值", () => {
    expect(adminPageSchema.parse(undefined)).toBe(1);
    expect(adminPageSchema.parse("")).toBe(1);
    expect(adminPageSchema.parse("1000")).toBe(1000);
    expect(adminPageSchema.safeParse("1001").success).toBe(false);
    expect(adminPageSizeSchema.parse(undefined)).toBe(20);
    expect(adminPageSizeSchema.parse("100")).toBe(100);
    expect(adminPageSizeSchema.safeParse("101").success).toBe(false);
    expect(adminPageSizeSchema.safeParse("0").success).toBe(false);
  });

  it("invalidIdResponse 应返回 400 JSON", async () => {
    const response = invalidIdResponse();
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("INVALID_ID");
  });
});
