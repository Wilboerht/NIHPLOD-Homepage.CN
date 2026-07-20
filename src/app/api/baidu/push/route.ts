/**
 * 百度主动推送 API
 *
 * POST /api/baidu/push
 * Body: { urls: string[] }
 *
 * 将新页面 URL 主动推送给百度，加速收录
 * 使用前：在百度站长平台 -> 数据引入 -> 链接提交 -> 找到 token
 */
import { NextRequest, NextResponse } from "next/server";

const BAIDU_PUSH_TOKEN = process.env.BAIDU_PUSH_TOKEN;
const BAIDU_PUSH_API = "http://data.zz.baidu.com/urls";

export async function POST(request: NextRequest) {
  if (!BAIDU_PUSH_TOKEN) {
    return NextResponse.json({ error: "BAIDU_PUSH_TOKEN 未配置" }, { status: 500 });
  }

  // 只允许服务端调用（Cron job 或 admin）
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }

  try {
    const { urls } = (await request.json()) as { urls: string[] };

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return NextResponse.json({ error: "urls 参数必填" }, { status: 400 });
    }

    const body = urls.join("\n");

    const response = await fetch(
      `${BAIDU_PUSH_API}?site=${process.env.NEXT_PUBLIC_SITE_URL}&token=${BAIDU_PUSH_TOKEN}`,
      {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body,
      }
    );

    const result = await response.json();

    return NextResponse.json({
      success: true,
      pushed: result.success || 0,
      remain: result.remain || 0,
      notSameSite: result.not_same_site || [],
      notValid: result.not_valid || [],
    });
  } catch (error) {
    console.error("百度推送失败:", error);
    return NextResponse.json({ error: "推送失败" }, { status: 500 });
  }
}
