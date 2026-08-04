import { describe, it, expect } from "vitest";
import { validateCUID, invalidIdResponse } from "@/lib/validation";

describe("validation", () => {
  it("应验证合法 cuid 格式", () => {
    expect(validateCUID("c" + "a".repeat(24))).toBe(true);
  });

  it("应拒绝非法 cuid 格式", () => {
    expect(validateCUID("not-a-cuid")).toBe(false);
    expect(validateCUID("c" + "a".repeat(23))).toBe(false);
  });

  it("invalidIdResponse 应返回 400 JSON", async () => {
    const response = invalidIdResponse();
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("INVALID_ID");
  });
});
