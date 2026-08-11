/**
 * 生成子站调用官网内部 API v1 所需的密钥对
 *
 * 用法：
 *   npx tsx scripts/generate-internal-api-keys.ts [project]
 *   或通过环境变量指定：INTERNAL_API_PROJECT=advisor npx tsx scripts/generate-internal-api-keys.ts
 *   不传时默认 project 为 "advisor"。
 *
 * 输出示例：
 *   {
 *     "project": "advisor",
 *     "key": "advisor-xxx",
 *     "secret": "xxx"
 *   }
 *
 * 将生成的 JSON 数组分别配置到：
 * - 官网主站：INTERNAL_API_KEYS
 * - 对应子站：INTERNAL_API_KEYS
 *
 * 切换期间可以保留旧版 INTERNAL_API_SECRET 作为兼容回退，
 * 稳定后建议删除 INTERNAL_API_SECRET，只保留 INTERNAL_API_KEYS。
 */

import { randomBytes } from "crypto";

// project 从命令行参数或环境变量读取，默认 advisor
const project = process.argv[2] || process.env.INTERNAL_API_PROJECT || "advisor";

if (!/^[a-z0-9][a-z0-9-]*$/.test(project)) {
  console.error(`非法 project 名称: "${project}"（仅允许小写字母、数字、连字符）`);
  process.exit(1);
}

function generateKey(projectName: string): { project: string; key: string; secret: string } {
  const key = `${projectName}-${randomBytes(8).toString("hex")}`;
  const secret = randomBytes(32).toString("base64");
  return { project: projectName, key, secret };
}

const config = generateKey(project);
const jsonArray = JSON.stringify([config]);

console.log(`\n=== 新生成的 ${project} 子站内部 API 密钥 ===\n`);
console.log(JSON.stringify(config, null, 2));
console.log("\n=== 环境变量配置（两边保持一致） ===\n");
console.log(`# 官网主站 .env.production / .env.local`);
console.log(`INTERNAL_API_KEYS='${jsonArray}'`);
console.log(`# 切换期间可保留旧版兼容`);
console.log(`INTERNAL_API_SECRET=你的旧版共享密钥`);
console.log();
console.log(`# ${project} 子站 .env.production / .env.local`);
console.log(`OFFICIAL_API_URL=https://nihplod.cn`);
console.log(`INTERNAL_API_KEYS='${jsonArray}'`);
console.log(`# 切换期间可保留旧版兼容`);
console.log(`INTERNAL_API_SECRET=你的旧版共享密钥`);
console.log("\n=== 部署顺序 ===");
console.log("1. 先部署官网主站，让 /api/v1/internal/* 能识别新 key");
console.log(`2. 再部署 ${project} 子站，子站会优先使用 INTERNAL_API_KEYS 发送签名请求`);
console.log("3. 观察日志确认内部 API 调用成功");
console.log("4. 稳定后两边同时删除 INTERNAL_API_SECRET\n");
