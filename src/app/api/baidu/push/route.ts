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
import { timingSafeEqual } from "crypto";
import { pushUrlsToBaidu } from "@/lib/baidu-push";

export async function POST(request: NextRequest) {
  if (!process.env.BAIDU_PUSH_TOKEN) {
    return NextResponse.json({ error: "BAIDU_PUSH_TOKEN 未配置" }, { status: 500 });
  }

  // 只允许服务端调用（Cron job 或 admin）
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  const presented = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!cronSecret || !presented) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }
  const bufA = Buffer.from(presented);
  const bufB = Buffer.from(cronSecret);
  if (bufA.length !== bufB.length || !timingSafeEqual(bufA, bufB)) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }

  const { urls } = (await request.json()) as { urls: string[] };

  if (!urls || !Array.isArray(urls) || urls.length === 0) {
    return NextResponse.json({ error: "urls 参数必填" }, { status: 400 });
  }

  // 兼容旧入参：既支持完整 URL，也支持站内相对路径
  const paths = urls.map((u) => (u.startsWith("http") ? new URL(u).pathname : u));

  const result = await pushUrlsToBaidu(paths);
  if (!result) {
    return NextResponse.json({ error: "推送失败" }, { status: 500 });
  }

  return NextResponse.json({ success: true, ...result });
}
