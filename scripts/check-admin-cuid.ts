/**
 * 管理端 CUID 校验一致性检查。
 *
 * 项目同时兼容 CUID v1 与 CUID2，统一使用 src/lib/validation.ts 的 cuidSchema。
 * zod 的 z.string().cuid() 只接受 c/C 开头，会误拒 CUID2，禁止在 admin 路由中新增。
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ADMIN_API_DIR = join(process.cwd(), "src", "app", "api", "admin");
const FORBIDDEN = /z\s*\.\s*string\s*\(\s*\)\s*\.\s*cuid\s*\(\s*\)/;

function walk(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      files.push(...walk(fullPath));
    } else if (entry.endsWith(".ts")) {
      files.push(fullPath);
    }
  }
  return files;
}

const offenders: string[] = [];
for (const file of walk(ADMIN_API_DIR)) {
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  lines.forEach((line, index) => {
    if (FORBIDDEN.test(line)) {
      offenders.push(`${file}:${index + 1}`);
    }
  });
}

if (offenders.length > 0) {
  console.error("发现 admin 路由使用 z.string().cuid()，请改用 cuidSchema：");
  for (const item of offenders) console.error(` - ${item}`);
  process.exit(1);
}

console.log("管理端 CUID 校验检查通过");
