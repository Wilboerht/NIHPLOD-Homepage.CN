import { describe, expect, it } from "vitest";
import { inspectPdfSafety } from "../pdf-safety";

function pdf(body: string): Buffer {
  return Buffer.from(`%PDF-1.7\n${body}\n%%EOF`, "latin1");
}

describe("inspectPdfSafety", () => {
  it("普通 PDF 通过", () => {
    expect(inspectPdfSafety(pdf("1 0 obj << /Type /Catalog >> endobj"))).toEqual({
      safe: true,
    });
  });

  it("拒绝 JavaScript / Launch / EmbeddedFile / OpenAction", () => {
    for (const token of ["/JavaScript", "/JS", "/Launch", "/EmbeddedFile", "/OpenAction"]) {
      const result = inspectPdfSafety(pdf(`<< ${token} 1 0 R >>`));
      expect(result.safe).toBe(false);
    }
  });

  it("拒绝加密 PDF 和非 PDF 内容", () => {
    expect(inspectPdfSafety(pdf("<< /Encrypt 1 0 R >>")).safe).toBe(false);
    expect(inspectPdfSafety(Buffer.from("not a pdf")).safe).toBe(false);
  });
});
