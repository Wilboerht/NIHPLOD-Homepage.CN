import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const DANGEROUS_PATTERNS: ReadonlyArray<{ name: string; pattern: RegExp }> = [
  { name: "JavaScript", pattern: /\/JavaScript\b/i },
  { name: "JS", pattern: /\/JS\b/i },
  { name: "Launch", pattern: /\/Launch\b/i },
  { name: "EmbeddedFile", pattern: /\/EmbeddedFile\b/i },
  { name: "OpenAction", pattern: /\/OpenAction\b/i },
  { name: "AdditionalAction", pattern: /\/AA\b/i },
  { name: "RichMedia", pattern: /\/RichMedia\b/i },
  { name: "XFA", pattern: /\/XFA\b/i },
];
const DANGEROUS_KEY = /^(?:JavaScript|JS|Launch|EmbeddedFile|OpenAction|AA|RichMedia|XFA)$/i;

export interface PdfSafetyResult {
  safe: boolean;
  reason?: string;
}

function containsDangerousObject(value: unknown, depth = 0): boolean {
  if (depth > 20 || value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.some((item) => containsDangerousObject(item, depth + 1));
  if (typeof value !== "object") return false;
  return Object.entries(value).some(
    ([key, nested]) => DANGEROUS_KEY.test(key) || containsDangerousObject(nested, depth + 1)
  );
}

export async function inspectPdfSafety(buffer: Buffer): Promise<PdfSafetyResult> {
  if (buffer.length < 8) return { safe: false, reason: "PDF 内容为空" };
  if (buffer.subarray(0, 5).toString("latin1") !== "%PDF-") {
    return { safe: false, reason: "不是有效的 PDF 文件" };
  }

  const text = buffer.toString("latin1");
  if (/\/Encrypt\b/i.test(text)) {
    return { safe: false, reason: "不支持加密 PDF，请上传未加密文件" };
  }
  for (const item of DANGEROUS_PATTERNS) {
    if (item.pattern.test(text)) {
      return { safe: false, reason: `PDF 包含受限内容（${item.name}）` };
    }
  }

  const loadingTask = getDocument({
    data: new Uint8Array(buffer),
  });
  try {
    const document = await loadingTask.promise;
    const [javaScriptActions, attachments, openAction, fieldObjects] = await Promise.all([
      document.getJSActions(),
      document.getAttachments(),
      document.getOpenAction(),
      document.getFieldObjects(),
    ]);
    if (javaScriptActions || attachments || openAction || containsDangerousObject(fieldObjects)) {
      return { safe: false, reason: "PDF 包含主动内容、启动动作或嵌入文件" };
    }
    return { safe: true };
  } catch {
    return { safe: false, reason: "PDF 结构无效、加密或包含无法安全解析的内容" };
  } finally {
    await loadingTask.destroy();
  }
}
