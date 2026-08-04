import { describe, it, expect } from "vitest";
import { toInputJson } from "@/lib/prisma-json";

describe("prisma-json", () => {
  it("应将普通对象转换为 Prisma InputJsonValue", () => {
    const value = { foo: "bar" };
    expect(toInputJson(value)).toBe(value);
  });

  it("null/undefined 应返回原值", () => {
    expect(toInputJson(null)).toBeNull();
    expect(toInputJson(undefined)).toBeUndefined();
  });
});
