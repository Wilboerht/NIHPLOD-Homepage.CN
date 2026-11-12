// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import {
  clearLegalLocalDraft,
  legalLocalDraftKey,
  readLegalLocalDraft,
  writeLegalLocalDraft,
} from "@/lib/legal-local-draft";
import type { LegalDocumentContent } from "@/types/legal";

const content: LegalDocumentContent = {
  title: "服务条款",
  description: "本地草稿",
  lastUpdated: "2026年11月12日",
  sections: [{ id: "terms-1", title: "1. 隐私权", body: "正文" }],
};

describe("legal-local-draft", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("写入、读取并按 slug 隔离", () => {
    writeLegalLocalDraft("terms", content);
    const stored = readLegalLocalDraft("terms");
    expect(stored?.content).toEqual(content);
    expect(stored?.savedAt).toBeGreaterThan(0);
    expect(readLegalLocalDraft("privacy")).toBeNull();
  });

  it("忽略非法 JSON / 非法内容 / 旧版本", () => {
    window.localStorage.setItem(legalLocalDraftKey("terms"), "{oops");
    expect(readLegalLocalDraft("terms")).toBeNull();

    window.localStorage.setItem(
      legalLocalDraftKey("terms"),
      JSON.stringify({ version: 1, savedAt: Date.now(), content: { title: "" } })
    );
    expect(readLegalLocalDraft("terms")).toBeNull();

    window.localStorage.setItem(
      legalLocalDraftKey("terms"),
      JSON.stringify({ version: 0, savedAt: Date.now(), content })
    );
    expect(readLegalLocalDraft("terms")).toBeNull();
  });

  it("清除本地草稿", () => {
    writeLegalLocalDraft("terms", content);
    clearLegalLocalDraft("terms");
    expect(readLegalLocalDraft("terms")).toBeNull();
  });
});
