/**
 * 生成 advisor 子站调用官网内部 API v1 所需的密钥对
 *
 * 用法：
 *   npx tsx scripts/generate-internal-api-keys.ts
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
 * - advisor 子站：INTERNAL_API_KEYS
 *
 * 切换期间可以保留旧版 INTERNAL_API_SECRET 作为兼容回退，
 * 稳定后建议删除 INTERNAL_API_SECRET，只保留 INTERNAL_API_KEYS。
 */

import { randomBytes } from "crypto";

function generateKey(): { project: string; key: string; secret: string } {
  const key = `advisor-${randomBytes(8).toString("hex")}`;
  const secret = randomBytes(32).toString("base64");
  return { project: "advisor", key, secret };
}

const config = generateKey();
const jsonArray = JSON.stringify([config]);

console.log("\n=== 新生成的 advisor 子站内部 API 密钥 ===\n");
console.log(JSON.stringify(config, null, 2));
console.log("\n=== 环境变量配置（两边保持一致） ===\n");
console.log(`# 官网主站 .env.production / .env.local`);
console.log(`INTERNAL_API_KEYS='${jsonArray}'`);
console.log(`# 切换期间可保留旧版兼容`);
console.log(`INTERNAL_API_SECRET=你的旧版共享密钥`);
console.log();
console.log(`# advisor 子站 .env.production / .env.local`);
console.log(`OFFICIAL_API_URL=https://nihplod.cn`);
console.log(`INTERNAL_API_KEYS='${jsonArray}'`);
console.log(`# 切换期间可保留旧版兼容`);
console.log(`INTERNAL_API_SECRET=你的旧版共享密钥`);
console.log("\n=== 部署顺序 ===");
console.log("1. 先部署官网主站，让 /api/v1/internal/wechat/send-template 能识别新 key");
console.log("2. 再部署 advisor 子站，子站会优先使用 INTERNAL_API_KEYS 发送签名请求");
console.log("3. 观察日志确认模板消息推送成功");
console.log("4. 稳定后两边同时删除 INTERNAL_API_SECRET\n");
