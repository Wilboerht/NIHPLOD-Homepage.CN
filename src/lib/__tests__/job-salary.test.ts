import { describe, it, expect } from "vitest";
import { addDays, parseJobSalary, toIsoDate } from "@/lib/job-salary";

describe("parseJobSalary", () => {
  it("解析 k 区间与 13 薪", () => {
    expect(parseJobSalary("10k—20k  13薪")).toEqual({
      baseSalary: {
        "@type": "MonetaryAmount",
        currency: "CNY",
        value: {
          "@type": "QuantitativeValue",
          minValue: 10000,
          maxValue: 20000,
          unitText: "MONTH",
        },
      },
    });
  });

  it("解析省略第一个单位的区间", () => {
    expect(parseJobSalary("15-25K·13薪")).toEqual({
      baseSalary: {
        "@type": "MonetaryAmount",
        currency: "CNY",
        value: {
          "@type": "QuantitativeValue",
          minValue: 15000,
          maxValue: 25000,
          unitText: "MONTH",
        },
      },
    });
  });

  it("解析万区间", () => {
    expect(parseJobSalary("1.5万-2万")).toEqual({
      baseSalary: {
        "@type": "MonetaryAmount",
        currency: "CNY",
        value: {
          "@type": "QuantitativeValue",
          minValue: 15000,
          maxValue: 20000,
          unitText: "MONTH",
        },
      },
    });
  });

  it("解析单值", () => {
    expect(parseJobSalary("20k")).toEqual({
      baseSalary: {
        "@type": "MonetaryAmount",
        currency: "CNY",
        value: {
          "@type": "QuantitativeValue",
          value: 20000,
          unitText: "MONTH",
        },
      },
    });
  });

  it("面议与无法解析的薪资不输出 baseSalary", () => {
    expect(parseJobSalary("面议")).toEqual({});
    expect(parseJobSalary("Negotiable")).toEqual({});
    expect(parseJobSalary("")).toEqual({});
    expect(parseJobSalary(null)).toEqual({});
  });
});

describe("job date helpers", () => {
  it("toIsoDate 输出 UTC 日期", () => {
    expect(toIsoDate("2026-10-28T11:29:33.927Z")).toBe("2026-10-28");
    expect(toIsoDate(null)).toBeUndefined();
  });

  it("addDays 基于 createdAt 计算稳定日期", () => {
    expect(addDays("2026-10-28T11:29:33.927Z", 90)).toBe("2027-01-26");
    expect(addDays(undefined, 90)).toBeUndefined();
  });
});
