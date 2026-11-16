import { describe, expect, it } from "vitest";
import {
  checkNicknameContent,
  defaultNicknameForPhone,
  getNicknameBannedWordCount,
  normalizeNicknameForMatching,
  sanitizeProviderNickname,
} from "@/lib/nickname-policy";

describe("nickname-policy 归一化与词表匹配", () => {
  it("正常中英文/emoji 昵称放行", () => {
    for (const name of [
      "小N",
      "Alice",
      "护肤达人🌸",
      "大麻烦",
      "SUSSEX",
      "Miss Q",
      "👨‍👩‍👧",
    ]) {
      expect(checkNicknameContent(name), name).toEqual({ ok: true });
    }
  });

  it("空串/纯空白视为清除昵称，放行", () => {
    expect(checkNicknameContent("")).toEqual({ ok: true });
    expect(checkNicknameContent("   ")).toEqual({ ok: true });
  });

  it("命中违规词时拒绝，并返回分类", () => {
    expect(checkNicknameContent("色情")).toMatchObject({
      ok: false,
      reason: "banned",
      category: "porn",
    });
    expect(checkNicknameContent("我要赌博")).toMatchObject({
      ok: false,
      reason: "banned",
      category: "gambling",
    });
    expect(checkNicknameContent("卖毒品")).toMatchObject({
      ok: false,
      reason: "banned",
      category: "drugs",
    });
    expect(checkNicknameContent("专业诈骗")).toMatchObject({
      ok: false,
      reason: "banned",
      category: "illegal",
    });
  });

  it("空格/标点/零宽字符/全角/大小写等变体仍可命中", () => {
    expect(checkNicknameContent("色 情").ok).toBe(false);
    expect(checkNicknameContent("色*情").ok).toBe(false);
    expect(checkNicknameContent("色\u200b情").ok).toBe(false);
    expect(checkNicknameContent("色\u200d情").ok).toBe(false);
    expect(checkNicknameContent("ｐｏｒｎ").ok).toBe(false);
    expect(checkNicknameContent("PORN").ok).toBe(false);
    expect(checkNicknameContent("賭博").ok).toBe(false);
    expect(checkNicknameContent("詐騙").ok).toBe(false);
  });

  it("拒绝控制字符/双向覆盖符/换行等不可用字符", () => {
    for (const name of ["abc\nxyz", "abc\txyz", "abc\u202edef", "abc\u0000def"]) {
      expect(checkNicknameContent(name), JSON.stringify(name)).toMatchObject({
        ok: false,
        reason: "invalid_chars",
      });
    }
  });

  it("归一化仅保留字母与数字", () => {
    expect(normalizeNicknameForMatching(" Ａ-B_c 1😀 ")).toBe("abc1");
  });
});

describe("sanitizeProviderNickname 第三方昵称兜底", () => {
  it("正常昵称 trim 后保留", () => {
    expect(sanitizeProviderNickname("  微信用户  ")).toEqual({
      nickname: "微信用户",
      blocked: false,
    });
  });

  it("违规昵称置空并标记 blocked", () => {
    expect(sanitizeProviderNickname("色情")).toMatchObject({
      nickname: null,
      blocked: true,
      reason: "banned",
      category: "porn",
    });
  });

  it("不可用字符置空并标记 blocked", () => {
    expect(sanitizeProviderNickname("a\nb")).toMatchObject({
      nickname: null,
      blocked: true,
      reason: "invalid_chars",
    });
  });

  it("空值返回空昵称且不视为拦截", () => {
    expect(sanitizeProviderNickname(null)).toEqual({ nickname: null, blocked: false });
    expect(sanitizeProviderNickname("   ")).toEqual({ nickname: null, blocked: false });
  });
});

describe("辅助函数", () => {
  it("默认昵称使用手机号后四位", () => {
    expect(defaultNicknameForPhone("13800138000")).toBe("用户_8000");
  });

  it("词表非空", () => {
    expect(getNicknameBannedWordCount()).toBeGreaterThan(0);
  });
});
