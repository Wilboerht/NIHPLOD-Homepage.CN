/**
 * 生成子站调用官网内部 API v1 所需的密钥对
 *
 * 用法：
 *   npm run generate:internal-api-keys [project]
 *   或通过环境变量指定：INTERNAL_API_PROJECT=advisor npm run generate:internal-api-keys
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
 * 密钥轮换（零停机）：官网条目支持可选的 previousSecrets 字段（上一代 secret 数组）。
 * 1. 生成新 key/secret，在官网 INTERNAL_API_KEYS 中用新值替换 secret，
 *    并把旧 secret 放入 previousSecrets，重启官网；
 * 2. 更新子站 INTERNAL_API_KEYS 为新 key/secret，部署子站；
 * 3. 全部子站切换完成后，从官网条目中移除 previousSecrets。
 * 宽限期内官网同时接受新旧 secret 签名的请求；子站只保存当前 key/secret，无需 previousSecrets。
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
console.log();
console.log(`# ${project} 子站 .env.production / .env.local`);
console.log(`OFFICIAL_API_URL=https://nihplod.cn`);
console.log(`INTERNAL_API_KEYS='${jsonArray}'`);
console.log("\n=== 部署顺序 ===");
console.log("1. 先部署官网主站，让 /api/v1/internal/* 能识别新 key");
console.log(`2. 再部署 ${project} 子站，子站会使用 INTERNAL_API_KEYS 发送签名请求`);
console.log("3. 观察日志确认内部 API 调用成功");
console.log("\n=== 轮换已有密钥（零停机） ===");
console.log("官网条目支持可选 previousSecrets 字段（上一代 secret 数组），宽限期内新旧 secret 均可验签：");
console.log(
  `INTERNAL_API_KEYS='[{"project":"${project}","key":"${config.key}","secret":"<新secret>","previousSecrets":["<旧secret>"]}]'`
);
console.log("步骤：1) 官网更新为新 secret + previousSecrets 并重启；2) 子站切换为新 key/secret；");
console.log("3) 子站全部切换后从官网条目移除 previousSecrets。子站侧无需配置 previousSecrets。\n");
