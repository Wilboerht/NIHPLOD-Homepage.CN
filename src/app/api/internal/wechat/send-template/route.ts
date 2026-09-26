/**
 * 内部 API（旧版）：代子站发送微信模板消息
 * POST /api/internal/wechat/send-template
 *
 * ⚠️ 已下线（410 Gone）：旧实现使用明文共享密钥（X-Internal-API-Secret）且无
 * 时间戳/nonce/项目隔离，任何项目的密钥都可冒充其它项目发送模板消息。
 * 请迁移到 /api/v1/internal/wechat/send-template（HMAC 签名 + nonce + project 白名单）。
 */
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** 固定下线日期（便于监控与整改追踪） */
const SUNSET_ISO = "2026-09-30T00:00:00.000Z";

export async function POST(_: NextRequest) {
  return NextResponse.json(
    {
      success: false,
      error: {
        code: "ENDPOINT_GONE",
        message:
          "该端点已下线（明文密钥认证存在越权风险），请迁移到 /api/v1/internal/wechat/send-template",
      },
    },
    {
      status: 410,
      headers: { Deprecation: "true", Sunset: SUNSET_ISO },
    }
  );
}
