import { describe, it, expect } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { toGeoFaqsJson, toInputJson } from "@/lib/prisma-json";

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

describe("toGeoFaqsJson", () => {
  it("null、undefined 和空数组写入数据库 NULL", () => {
    expect(toGeoFaqsJson(null)).toBe(Prisma.DbNull);
    expect(toGeoFaqsJson(undefined)).toBe(Prisma.DbNull);
    expect(toGeoFaqsJson([])).toBe(Prisma.DbNull);
  });

  it("有内容时写入数组", () => {
    const faqs = [{ question: "问题", answer: "答案" }];
    expect(toGeoFaqsJson(faqs)).toBe(faqs);
  });
});
