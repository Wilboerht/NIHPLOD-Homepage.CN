import { deflateSync } from "zlib";
import { describe, expect, it } from "vitest";
import { inspectPdfSafety } from "../pdf-safety";

function buildPdf(objects: Buffer[]): Buffer {
  const chunks: Buffer[] = [Buffer.from("%PDF-1.7\n", "latin1")];
  const offsets = [0];
  let position = chunks[0].length;
  objects.forEach((object, index) => {
    offsets.push(position);
    const chunk = Buffer.from(`${index + 1} 0 obj\n`, "latin1");
    chunks.push(chunk, object, Buffer.from("\nendobj\n", "latin1"));
    position += chunk.length + object.length + 8;
  });
  const xrefAt = position;
  const xref = [
    `xref\n0 ${objects.length + 1}\n`,
    "0000000000 65535 f \n",
    ...offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`),
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF`,
  ].join("");
  chunks.push(Buffer.from(xref, "latin1"));
  return Buffer.concat(chunks);
}

function regularPdf(): Buffer {
  return buildPdf([
    Buffer.from("<< /Type /Catalog /Pages 2 0 R >>", "latin1"),
    Buffer.from("<< /Type /Pages /Kids [] /Count 0 >>", "latin1"),
  ]);
}

function compressedJavaScriptPdf(): Buffer {
  const first = "<< /Type /Catalog /OpenAction 3 0 R >>";
  const second = "<< /S /JavaScript /JS (app.alert('compressed')) >>";
  const pairHeader = `2 0 3 ${first.length} `;
  const stream = deflateSync(Buffer.from(`${pairHeader}${first}${second}`, "latin1"));
  return buildPdf([
    Buffer.from(
      `<< /Type /ObjStm /N 2 /First ${pairHeader.length} /Filter /FlateDecode /Length ${stream.length} >>\nstream\n${stream.toString("latin1")}\nendstream`,
      "latin1"
    ),
  ]);
}

describe("inspectPdfSafety", () => {
  it("有效普通 PDF 通过", async () => {
    await expect(inspectPdfSafety(regularPdf())).resolves.toEqual({ safe: true });
  });

  it("拒绝 JavaScript / Launch / EmbeddedFile / OpenAction", async () => {
    for (const token of ["/JavaScript", "/JS", "/Launch", "/EmbeddedFile", "/OpenAction"]) {
      const result = await inspectPdfSafety(Buffer.from(`%PDF-1.7\n<< ${token} 1 0 R >>\n%%EOF`));
      expect(result.safe).toBe(false);
    }
  });

  it("拒绝加密 PDF 和非 PDF 内容", async () => {
    await expect(
      inspectPdfSafety(Buffer.from("%PDF-1.7\n<< /Encrypt 1 0 R >>")).then((r) => r.safe)
    ).resolves.toBe(false);
    await expect(inspectPdfSafety(Buffer.from("not a pdf")).then((r) => r.safe)).resolves.toBe(
      false
    );
  });

  it("拒绝隐藏在压缩 ObjStm 中的 OpenAction 和 JavaScript", async () => {
    const result = await inspectPdfSafety(compressedJavaScriptPdf());
    expect(result.safe).toBe(false);
  });
});
