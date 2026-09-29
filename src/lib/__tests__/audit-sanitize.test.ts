/**
 * 审计日志详情 PII 脱敏测试
 *
 * 覆盖：手机号/地址/外部身份标识脱敏、生日相关键（birthday/birthdayBefore/birthdayAfter）、
 *       "detail" 键不再被误当作地址脱敏、嵌套对象递归处理
 */
import { describe, it, expect } from "vitest";
import { maskAuditDetail } from "@/lib/audit-sanitize";

describe("maskAuditDetail", () => {
  it("手机号相关键脱敏", () => {
    const result = maskAuditDetail({ phone: "13800138000", newPhone: "13900139000" });
    expect(result).toEqual({ phone: "138****8000", newPhone: "139****9000" });
  });

  it("生日相关键整体脱敏（user_birthday_update 审计）", () => {
    const result = maskAuditDetail({
      birthdayBefore: "2000-01-01T00:00:00.000Z",
      birthdayAfter: "1995-05-20T00:00:00.000Z",
      birthday: "1995-05-20",
    });
    expect(result).toEqual({
      birthdayBefore: "****-**-**",
      birthdayAfter: "****-**-**",
      birthday: "****-**-**",
    });
  });

  it("空生日值原样保留", () => {
    const result = maskAuditDetail({ birthdayBefore: null, birthdayAfter: "" });
    expect(result).toEqual({ birthdayBefore: null, birthdayAfter: "" });
  });

  it("名为 detail 的字段不再被当作地址脱敏", () => {
    const result = maskAuditDetail({ detail: "订单备注：无", amount: 100 });
    expect(result).toEqual({ detail: "订单备注：无", amount: 100 });
  });

  it("address 键仍按地址脱敏", () => {
    const result = maskAuditDetail({ address: "浙江省杭州市西湖区文三路 100 号" });
    expect(result).toEqual({ address: "浙江省杭州市****" });
  });

  it("外部身份标识脱敏", () => {
    const result = maskAuditDetail({ wechatOpenId: "oABC1234567890xyz" });
    expect(result).toEqual({ wechatOpenId: "oAB****xyz" });
  });

  it("嵌套对象与数组递归处理", () => {
    const result = maskAuditDetail({
      list: [{ phone: "13800138000" }],
      nested: { birthday: "1990-01-01" },
    });
    expect(result).toEqual({
      list: [{ phone: "138****8000" }],
      nested: { birthday: "****-**-**" },
    });
  });

  it("null / undefined / 原始值原样返回", () => {
    expect(maskAuditDetail(null)).toBe(null);
    expect(maskAuditDetail(undefined)).toBe(undefined);
    expect(maskAuditDetail("text")).toBe("text");
  });
});
