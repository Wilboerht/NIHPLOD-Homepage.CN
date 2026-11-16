/**
 * 管理端设计 token 守卫
 *
 * 扫描 src/app/(admin)、src/components/admin、src/components/ui 中的常见视觉漂移：
 * - 原生 Tailwind 色板（red/amber/emerald/sky/gray...）
 * - text-[10px]/text-[11px] 等任意字号
 * - text-brand-charcoal 低于 /65 的正文颜色
 * - bg-brand-charcoal/[0.0x] 等任意透明度表面
 *
 * 默认只报告；`--strict` 时存在违规即以非 0 退出，可用于 CI 防回归。
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const TARGETS = [
  path.join(ROOT, "src", "app", "(admin)"),
  path.join(ROOT, "src", "components", "admin"),
  path.join(ROOT, "src", "components", "ui"),
];

const EXTENSIONS = new Set([".ts", ".tsx"]);
const strict = process.argv.includes("--strict");
const SKIP_FILES = new Set([
  "DrawerPageContainer.tsx",
  "LogoutConfirmDialog.tsx",
  "PolicyContentRenderer.tsx",
  "PolicyDocument.tsx",
  "PolicyDocumentHeader.tsx",
  "StandaloneNav.tsx",
  "TermsArticle.tsx",
]);
/** 一次性密钥/终端代码块使用深色底，是有意保留的例外 */
const IGNORED_MATCHES = new Set(["bg-gray-900", "text-green-400", "text-gray-100"]);

interface Finding {
  file: string;
  line: number;
  match: string;
  rule: string;
}

const RULES: { name: string; pattern: RegExp }[] = [
  {
    name: "raw-palette",
    pattern:
      /\b(?:bg|text|border|ring|divide|fill|stroke)-(?:red|amber|emerald|sky|green|blue|indigo|purple|gray|slate|zinc|neutral|stone)-\d{2,3}\b/g,
  },
  {
    name: "arbitrary-font-size",
    pattern: /\btext-\[\d+px\]/g,
  },
  {
    name: "low-contrast-text",
    pattern: /\btext-brand-charcoal\/(\d+)\b/g,
  },
  {
    name: "arbitrary-alpha-surface",
    pattern: /\bbg-brand-(?:charcoal|primary)\/\[0\.\d+\]/g,
  },
];

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.name === "__tests__" || entry.name === "node_modules") continue;
    if (SKIP_FILES.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    else if (EXTENSIONS.has(path.extname(entry.name))) files.push(full);
  }
  return files;
}

const files = TARGETS.flatMap(walk);
const findings: Finding[] = [];

for (const file of files) {
  const content = fs.readFileSync(file, "utf8");
  const lines = content.split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const rule of RULES) {
      rule.pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = rule.pattern.exec(line)) !== null) {
        if (IGNORED_MATCHES.has(match[0])) continue;
        if (rule.name === "low-contrast-text") {
          const opacity = Number(match[1]);
          if (!Number.isFinite(opacity) || opacity >= 65) continue;
        }
        findings.push({
          file: path.relative(ROOT, file),
          line: index + 1,
          match: match[0],
          rule: rule.name,
        });
      }
    }
  });
}

const byRule = new Map<string, number>();
for (const finding of findings) {
  byRule.set(finding.rule, (byRule.get(finding.rule) ?? 0) + 1);
}

console.log(`[admin-tokens] scanned ${files.length} files`);
for (const [rule, count] of [...byRule.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${rule}: ${count}`);
}

if (findings.length === 0) {
  console.log("[admin-tokens] no findings");
  process.exit(0);
}

const preview = findings.slice(0, 40);
for (const finding of preview) {
  console.log(`  ${finding.file}:${finding.line}  ${finding.match}  (${finding.rule})`);
}
if (findings.length > preview.length) {
  console.log(`  ... and ${findings.length - preview.length} more`);
}

if (strict) {
  console.error("[admin-tokens] strict mode: findings must be fixed");
  process.exit(1);
}
