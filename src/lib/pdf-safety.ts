/**
 * PDF 结构安全校验（无 ClamAV 环境下的兜底）。
 *
 * 限制：这不是杀毒引擎，无法保证发现所有恶意 PDF；它只拒绝常见主动内容
 * （JavaScript、Launch、EmbeddedFile、OpenAction、RichMedia 等）与加密文档。
 * 管理端下载保持 attachment，避免浏览器内联执行。
 */
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

export interface PdfSafetyResult {
  safe: boolean;
  reason?: string;
}

export function inspectPdfSafety(buffer: Buffer): PdfSafetyResult {
  if (buffer.length < 8) return { safe: false, reason: "PDF 内容为空" };

  const header = buffer.subarray(0, 5).toString("latin1");
  if (header !== "%PDF-") return { safe: false, reason: "不是有效的 PDF 文件" };

  // PDF 名称对象可能跨行，统一把 latin1 内容做一次轻量扫描。
  const text = buffer.toString("latin1");

  if (/\/Encrypt\b/i.test(text)) {
    return { safe: false, reason: "不支持加密 PDF，请上传未加密文件" };
  }

  for (const item of DANGEROUS_PATTERNS) {
    if (item.pattern.test(text)) {
      return { safe: false, reason: `PDF 包含受限内容（${item.name}）` };
    }
  }

  return { safe: true };
}
