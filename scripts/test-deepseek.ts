/**
 * DeepSeek API 连接测试脚本
 * 运行: npx tsx scripts/test-deepseek.ts
 */

import "dotenv/config";
import prisma from "../src/lib/prisma";

async function testDeepSeekAPI() {
  console.log("=== DeepSeek API 连接测试 ===\n");

  // 1. 先从数据库读取配置
  let dbApiKey: string | undefined;
  try {
    const setting = await prisma.setting.findFirst({
      where: { key: "ai_advisor_settings" },
    });
    if (setting?.value) {
      const parsed = JSON.parse(setting.value as string);
      dbApiKey = parsed.apiKeys?.deepseek;
      console.log("数据库配置:");
      console.log(`  Provider: ${parsed.provider || "未设置"}`);
      console.log(`  Model: ${parsed.model || "未设置"}`);
      console.log(`  DeepSeek API Key: ${dbApiKey ? dbApiKey.substring(0, 8) + "..." + dbApiKey.slice(-4) : "❌ 未配置"}`);
      console.log("");
    }
  } catch (e) {
    console.log("无法读取数据库配置:", e);
  }

  // 2. 检查环境变量（作为降级）
  const envApiKey = process.env.DEEPSEEK_API_KEY;
  const apiUrl = process.env.DEEPSEEK_API_URL || "https://api.deepseek.com/v1";
  const model = process.env.DEEPSEEK_MODEL || "deepseek-chat";

  // 优先使用数据库配置
  const apiKey = dbApiKey || envApiKey;

  console.log("配置信息:");
  console.log(`  API URL: ${apiUrl}`);
  console.log(`  Model: ${model}`);
  console.log(`  API Key: ${apiKey ? apiKey.substring(0, 8) + "..." + apiKey.slice(-4) : "❌ 未配置"}`);
  console.log("");

  if (!apiKey) {
    console.error("❌ 错误: DEEPSEEK_API_KEY 未配置");
    console.log("请在 .env.local 文件中添加 DEEPSEEK_API_KEY=your-api-key");
    process.exit(1);
  }

  // 2. 测试 API 调用
  console.log("正在测试 API 连接...\n");

  try {
    const response = await fetch(`${apiUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model,
        messages: [
          {
            role: "system",
            content: "你是一个简洁的助手。",
          },
          {
            role: "user",
            content: "请用一句话回答：1+1等于几？",
          },
        ],
        max_tokens: 50,
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ API 请求失败 (${response.status}):`);
      console.error(errorText);
      
      if (response.status === 401) {
        console.log("\n💡 提示: API Key 无效或已过期，请检查配置");
      } else if (response.status === 429) {
        console.log("\n💡 提示: 请求频率过高，请稍后重试");
      } else if (response.status === 402) {
        console.log("\n💡 提示: 账户余额不足，请充值");
      }
      process.exit(1);
    }

    const data = await response.json();
    
    console.log("✅ API 连接成功!\n");
    console.log("响应详情:");
    console.log(`  模型: ${data.model}`);
    console.log(`  Token 使用:`);
    console.log(`    - 输入: ${data.usage?.prompt_tokens || "N/A"}`);
    console.log(`    - 输出: ${data.usage?.completion_tokens || "N/A"}`);
    console.log(`    - 总计: ${data.usage?.total_tokens || "N/A"}`);
    console.log("");
    console.log("AI 回复:");
    console.log(`  "${data.choices?.[0]?.message?.content || "无内容"}"`);
    console.log("");
    console.log("🎉 DeepSeek API 配置正常，可以正常使用！");

  } catch (error) {
    console.error("❌ 连接错误:", error);
    console.log("\n💡 提示: 请检查网络连接或 API URL 是否正确");
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

testDeepSeekAPI();

