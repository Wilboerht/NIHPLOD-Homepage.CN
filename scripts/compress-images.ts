/**
 * 批量压缩 public/images 下的图片
 * - 原图备份到 public/images-original/
 * - 根据用途设置不同的尺寸上限
 * - WebP quality 85（肉眼几乎无损）
 */

import fs from "fs/promises";
import path from "path";
import sharp from "sharp";

const IMAGES_DIR = path.resolve(process.cwd(), "public", "images");
const BACKUP_DIR = path.resolve(process.cwd(), "public", "images-original");
const OUTPUT_DIR = path.resolve(process.cwd(), "public", "images-compressed");

interface CompressRule {
  match: (filePath: string) => boolean;
  maxWidth: number;
  quality: number;
  label: string;
}

function normalizePath(p: string) {
  return p.replace(/\\/g, "/");
}

const rules: CompressRule[] = [
  // 全屏/背景大图
  {
    match: (p) => {
      const n = normalizePath(p);
      return (
        n.includes("story/dolphin-ocean") ||
        n.includes("contact-modal-bg")
      );
    },
    maxWidth: 1920,
    quality: 85,
    label: "背景大图",
  },
  // 产品/内容图
  {
    match: (p) => {
      const n = normalizePath(p);
      return (
        /ritual-step-/.test(n) ||
        /spa-/.test(n) ||
        /portable-/.test(n) ||
        /body-spa-/.test(n) ||
        n.includes("story/mission-image") ||
        n.includes("story/lab-research")
      );
    },
    maxWidth: 1200,
    quality: 85,
    label: "产品图",
  },
  // Awards / 小图
  {
    match: (p) => {
      const n = normalizePath(p);
      return (
        n.includes("story/awards") ||
        /og-image/.test(n) ||
        n.includes("login-background")
      );
    },
    maxWidth: 800,
    quality: 85,
    label: "小图/Awards",
  },
];

function getRule(filePath: string): CompressRule | null {
  for (const rule of rules) {
    if (rule.match(filePath)) return rule;
  }
  return null;
}

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

async function getAllImageFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await getAllImageFiles(fullPath)));
    } else if (/\.(webp|png|jpe?g)$/i.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

async function compressImage(inputPath: string, rule: CompressRule) {
  const relPath = path.relative(IMAGES_DIR, inputPath);
  const backupPath = path.join(BACKUP_DIR, relPath);
  const outputRelPath = relPath.replace(/\.(png|jpe?g)$/i, ".webp");
  const outputPath = path.join(OUTPUT_DIR, outputRelPath);

  // 确保备份目录存在
  await ensureDir(path.dirname(backupPath));

  // 如果备份和输出都已存在，才跳过
  try {
    await fs.access(backupPath);
    await fs.access(outputPath);
    console.log(`  [跳过] 已压缩过: ${relPath}`);
    return null;
  } catch {
    // 继续处理
  }

  // 备份原图（如果不存在）
  try {
    await fs.access(backupPath);
  } catch {
    await fs.copyFile(inputPath, backupPath);
  }

  // 获取原图尺寸
  const metadata = await sharp(inputPath).metadata();
  const originalWidth = metadata.width ?? 0;
  const originalHeight = metadata.height ?? 0;

  // 如果原图本身就小于目标宽度，只调整质量不缩放
  const shouldResize = originalWidth > rule.maxWidth;

  const transformer = sharp(inputPath);

  if (shouldResize) {
    transformer.resize(rule.maxWidth, undefined, {
      withoutEnlargement: true,
      fit: "inside",
    });
  }

  transformer.webp({ quality: rule.quality, effort: 4 });

  // 输出到临时目录，避免 Windows 文件锁定
  await ensureDir(path.dirname(outputPath));

  const buffer = await transformer.toBuffer();
  await fs.writeFile(outputPath, buffer);

  const originalSize = (await fs.stat(backupPath)).size;
  const newSize = buffer.length;
  const savings = ((originalSize - newSize) / originalSize) * 100;

  return {
    relPath: outputRelPath,
    label: rule.label,
    originalWidth,
    originalHeight,
    newWidth: shouldResize ? rule.maxWidth : originalWidth,
    originalSize,
    newSize,
    savings,
  };
}

async function main() {
  console.log("🖼️  图片压缩工具");
  console.log("==================\n");

  // 确保备份目录存在
  await ensureDir(BACKUP_DIR);

  const imageFiles = await getAllImageFiles(IMAGES_DIR);
  console.log(`发现 ${imageFiles.length} 个图片文件\n`);

  const results: NonNullable<Awaited<ReturnType<typeof compressImage>>>[] = [];
  const skipped: string[] = [];

  for (const filePath of imageFiles) {
    const relPath = path.relative(IMAGES_DIR, filePath);
    const rule = getRule(relPath);

    if (!rule) {
      skipped.push(relPath);
      continue;
    }

    console.log(`处理 [${rule.label}] ${relPath}`);
    try {
      const result = await compressImage(filePath, rule);
      if (result) {
        results.push(result);
        console.log(
          `  ✅ ${result.originalWidth}x${result.originalHeight} → ${result.newWidth}x~ | ${formatSize(result.originalSize)} → ${formatSize(result.newSize)} (-${result.savings.toFixed(1)}%)`
        );
      }
    } catch (err: any) {
      console.log(`  ❌ 失败: ${err.message || err}`);
    }
  }

  console.log("\n==================");
  console.log("📊 压缩结果汇总");
  console.log("==================\n");

  if (results.length === 0) {
    console.log("没有需要压缩的图片。");
  } else {
    const totalOriginal = results.reduce((s, r) => s + r.originalSize, 0);
    const totalNew = results.reduce((s, r) => s + r.newSize, 0);
    const totalSavings = ((totalOriginal - totalNew) / totalOriginal) * 100;

    console.log(`压缩文件数: ${results.length}`);
    console.log(`原始总大小: ${formatSize(totalOriginal)}`);
    console.log(`压缩后大小: ${formatSize(totalNew)}`);
    console.log(`节省空间:   ${formatSize(totalOriginal - totalNew)} (${totalSavings.toFixed(1)}%)`);
  }

  if (skipped.length > 0) {
    console.log(`\n未匹配规则跳过的文件 (${skipped.length}):`);
    for (const s of skipped) {
      console.log(`  - ${s}`);
    }
  }

  console.log("\n💡 原图已备份到 public/images-original/");
  console.log("💡 压缩结果在 public/images-compressed/，即将用 PowerShell 替换到 public/images/");
}

function formatSize(bytes: number): string {
  if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  return `${(bytes / 1024).toFixed(2)} KB`;
}

main().catch((err) => {
  console.error("❌ 出错:", err);
  process.exit(1);
});
