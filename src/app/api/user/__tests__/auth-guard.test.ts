/**
 * /api/user/** 路由鉴权守卫（CI 守卫测试）
 *
 * 背景：middleware 将 /api/user/ 整体作为公开前缀放行（src/middleware.ts
 * PUBLIC_API_PREFIXES），鉴权完全依赖各 route 文件自身的 withUserAuth（包裹式）
 * 或 verifyUserAuth（手工校验）。新增路由若忘记鉴权将成为公开端点，因此用本测试
 * 在 CI（npm test）中兜底。
 *
 * 判定规则（对 src/app/api/user 目录下的每个 route.ts）：
 * 1. 文件必须引用 withUserAuth 或 verifyUserAuth；
 * 2. 每个 `export const METHOD = ...` 必须直接以 withUserAuth( 包裹，
 *    或文件内存在 verifyUserAuth( 调用（手工校验模式）；
 * 3. 每个 `export async function METHOD(...)` 要求文件内存在 verifyUserAuth( 调用；
 * 4. 每个文件至少导出一个 HTTP handler（防止文件被搬空后守卫空转）。
 *
 * 手工校验模式为文件级启发式：无法逐 handler 精确归因，但足以拦截"新文件完全
 * 忘记鉴权"与"新 handler 裸导出"两类主要风险；withUserAuth 包裹式则逐 handler 校验。
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const USER_API_DIR = path.resolve(process.cwd(), "src/app/api/user");
const HTTP_METHODS = "GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS";

function walkRouteFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (entry.name === "__tests__") continue;
      files.push(...walkRouteFiles(path.join(dir, entry.name)));
    } else if (entry.name === "route.ts") {
      files.push(path.join(dir, entry.name));
    }
  }
  return files;
}

const routeFiles = walkRouteFiles(USER_API_DIR);
const rel = (file: string) => path.relative(process.cwd(), file);

describe("/api/user/** 路由鉴权守卫", () => {
  it("必须存在用户路由（防止目录迁移后守卫空转）", () => {
    expect(routeFiles.length).toBeGreaterThan(0);
  });

  it("每个路由文件都必须引用 withUserAuth 或 verifyUserAuth", () => {
    const offenders = routeFiles
      .filter((file) => {
        const code = fs.readFileSync(file, "utf8");
        return !/withUserAuth/.test(code) && !/verifyUserAuth/.test(code);
      })
      .map(rel);

    expect(offenders).toEqual([]);
  });

  it("每个导出的 HTTP handler 都必须鉴权（withUserAuth 包裹或 verifyUserAuth 手工校验）", () => {
    const offenders: string[] = [];

    for (const file of routeFiles) {
      const code = fs.readFileSync(file, "utf8");
      const hasManualVerify = /verifyUserAuth\s*\(/.test(code);
      let handlerCount = 0;
      let match: RegExpExecArray | null;

      const constRe = new RegExp(`export\\s+const\\s+(${HTTP_METHODS})\\b`, "g");
      while ((match = constRe.exec(code)) !== null) {
        handlerCount += 1;
        const rest = code.slice(match.index + match[0].length);
        const wrapped = /^\s*=\s*withUserAuth\s*\(/.test(rest);
        if (!wrapped && !hasManualVerify) {
          offenders.push(`${rel(file)} (${match[1]} 未以 withUserAuth 包裹)`);
        }
      }

      const fnRe = new RegExp(`export\\s+async\\s+function\\s+(${HTTP_METHODS})\\s*\\(`, "g");
      while ((match = fnRe.exec(code)) !== null) {
        handlerCount += 1;
        if (!hasManualVerify) {
          offenders.push(`${rel(file)} (${match[1]} 未调用 verifyUserAuth)`);
        }
      }

      if (handlerCount === 0) {
        offenders.push(`${rel(file)} (未导出任何 HTTP handler)`);
      }
    }

    expect(offenders).toEqual([]);
  });
});
