/**
 * 生成多尺寸高分辨率 Favicon / PWA 图标
 *
 * 背景：搜索引擎（Google/Bing/百度）对搜索结果中的站点图标有明确要求：
 *   - 最小 48x48 像素，且大于 48 时边长必须为 48 的倍数（96/144/192...）
 *   - 图标需清晰、可抓取、URL 稳定
 * 旧 favicon.ico 最大仅 48x48、favicon.png 仅 32x32，导致搜索引擎回退为默认地球图标。
 *
 * 本脚本从 NIHPLOD-logo.svg 中提取矢量 "N" 字形，按现有 favicon 的视觉规范
 * （米色 #EFECE1 圆角底 + 深藏青 #00263E "N." 字标）渲染高分辨率 PNG：
 *   - public/images/icons/favicon-96.png   (96x96,  48 的倍数)
 *   - public/images/icons/favicon-192.png  (192x192, 48 的倍数)
 *   - public/images/icons/favicon-512.png  (512x512, PWA manifest 用)
 *   - public/images/icons/apple-touch-icon.png (180x180, iOS 主屏, 直角不透明)
 *   - public/favicon.png 覆盖为 512x512（保持 URL 稳定，提升分辨率）
 *
 * 运行：node scripts/generate-favicons.mjs
 */
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

// 品牌色（与现有 favicon.png 采样一致）
const BG = "#EFECE1"; // 米色底
const INK = "#00263E"; // 深藏青字标

// 从 public/images/NIHPLOD-logo.svg 提取的矢量 "N" 字形（viewBox 坐标）
const N_POLYGON =
  "40.31 41.556 5.723 0 0 0 0 53.67 6.781 53.67 6.781 12.114 41.368 53.67 47.091 53.67 47.091 0 40.31 0 40.31 41.556";
// "N." 的句点：与 N 保持视觉间隔，落于基线
const DOT = { x: 53.1, y: 45.67, w: 8, h: 8 };
// "N" 字形自身宽度（viewBox 坐标，不含句点）
const N_W = 47.091;
// 字形整体包围盒（N + 句点）
const GLYPH_W = DOT.x + DOT.w; // 61.1
const GLYPH_H = 53.67;

/**
 * 渲染指定尺寸的图标 SVG
 * @param size 输出边长
 * @param rounded 是否圆角（apple-touch-icon 需直角不透明）
 */
function iconSvg(size, rounded) {
  // 字标占画布宽度约 58%（与现有 32px favicon 的视觉比例一致）
  const glyphW = size * 0.58;
  const k = glyphW / GLYPH_W;
  const glyphH = GLYPH_H * k;
  // 水平方向按 "N" 自身宽度居中（句点跟随 N 平移，不参与居中）
  const x = (size - N_W * k) / 2;
  const y = (size - glyphH) / 2;
  const rx = rounded ? Math.round(size * 0.22) : 0;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${rx}" fill="${BG}"/>
  <g transform="translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${k.toFixed(4)})" fill="${INK}">
    <polygon points="${N_POLYGON}"/>
    <rect x="${DOT.x}" y="${DOT.y}" width="${DOT.w}" height="${DOT.h}"/>
  </g>
</svg>`;
  return Buffer.from(svg);
}

async function render(size, out, rounded = true) {
  await sharp(iconSvg(size, rounded), { density: 96 }).png().toFile(out);
  console.log("✓", path.relative(root, out), `${size}x${size}`);
}

const iconsDir = path.join(root, "public", "images", "icons");
fs.mkdirSync(iconsDir, { recursive: true });

await render(96, path.join(iconsDir, "favicon-96.png"));
await render(192, path.join(iconsDir, "favicon-192.png"));
await render(512, path.join(iconsDir, "favicon-512.png"));
await render(180, path.join(iconsDir, "apple-touch-icon.png"), false);
// 覆盖旧 32px favicon.png，保持 URL 稳定
await render(512, path.join(root, "public", "favicon.png"));

console.log("\n完成。请确认 layout.tsx 的 icons 与 manifest.json 已引用新图标。");
