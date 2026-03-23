import dotenv from 'dotenv';
import { join } from 'path';

dotenv.config({ path: join(process.cwd(), '.env.local') });

const WEBHOOK_URL = process.env.WECOM_JOBS_WEBHOOK || process.env.WECOM_BOT_WEBHOOK;

async function testNotification() {
  if (!WEBHOOK_URL) {
    console.error('❌ Webhook URL not found in .env.local');
    return;
  }

  console.log('🔗 Testing Webhook:', WEBHOOK_URL.substring(0, 50) + '...');

  const message = {
    msgtype: "markdown",
    markdown: {
      content: `### 🧪 NIHPLOD 企业微信功能测试
> **测试状态**: 正在检查连通性
> **发送时间**: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}

[测试链接](https://nihplod.cn)`,
    },
  };

  try {
    const response = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(message),
    });

    const data = await response.json();
    if (data.errcode === 0) {
      console.log('✅ 测试成功：企业微信服务器已接收到消息');
    } else {
      console.error('❌ 测试失败：企业微信返回错误 -', data.errmsg);
    }
  } catch (error) {
    console.error('💥 请求异常：无法连接到企业微信服务器');
    console.error('错误详情:', error.message);
    if (error.cause) {
      console.error('原因:', error.cause.message);
    }
  }
}

testNotification();
