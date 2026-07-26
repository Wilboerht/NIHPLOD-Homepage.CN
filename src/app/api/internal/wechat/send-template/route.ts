/**
 * 内部 API（旧版）：代子站发送微信模板消息
 * POST /api/internal/wechat/send-template
 *
 * 认证：X-Internal-API-Key + HMAC-SHA256 请求签名
 *
 * ⚠️ 已弃用：建议子站迁移到 /api/v1/internal/wechat/send-template。
 */
import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getClientIP } from "@/lib/ratelimit";
import { getInternalApiKeys } from "@/lib/internal-api";
import { sendWechatTemplateMessage } from "@/lib/wechat-template";
import { z } from "zod";
import { apiConsole } from "@/lib/logger";

const sendTemplateSchema = z.object({
  userId: z.string().cuid(),
  score: z.number(),
  primaryConcern: z.string().min(1).max(100),
  reportUrl: z
    .string()
    .url()
    .max(500)
    .regex(/^https?:\/\//, "报告链接必须以 http:// 或 https:// 开头"),
});

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    // 1. IP 速率限制（防止 secret 泄露后被滥用）
    const ip = getClientIP(request);
    const limitResult = await rateLimit(ip, "default", { maxRequests: 60, windowMs: 60 * 1000 });
    if (!limitResult.success) {
      return NextResponse.json(
        { success: false, error: { code: "RATE_LIMITED", message: "请求过于频繁，请稍后再试" } },
        {
          status: 429,
          headers: {
            Deprecation: "true",
            Sunset: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          },
        }
      );
    }

    // 2. 认证校验（INTERNAL_API_KEYS 多项目密钥映射）
    const secret = request.headers.get("x-internal-api-secret");
    const { secrets } = getInternalApiKeys();
    const matchedConfig = secret ? secrets.get(secret) : null;

    if (!secret || !matchedConfig) {
      apiConsole.warn("[WechatInternal] 认证失败，secret 不匹配");
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权的请求" } },
        {
          status: 401,
          headers: {
            Deprecation: "true",
            Sunset: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          },
        }
      );
    }

    // 3. 参数解析与校验
    const body = await request.json();

    const parsed = sendTemplateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "INVALID_PARAMS", message: "参数错误", details: parsed.error.issues },
        },
        { status: 400 }
      );
    }

    const { userId, score, primaryConcern, reportUrl } = parsed.data;

    // 4. 执行业务逻辑
    const result = await sendWechatTemplateMessage({ userId, score, primaryConcern, reportUrl });

    if (!result.success) {
      const statusCode =
        result.error?.code === "WECHAT_TOKEN_ERROR" || result.error?.code === "WECHAT_API_ERROR"
          ? 502
          : 500;
      return NextResponse.json({ success: false, error: result.error }, { status: statusCode });
    }

    return NextResponse.json(
      {
        success: true,
        data: { sent: result.sent, reason: result.reason },
      },
      {
        headers: {
          Deprecation: "true",
          Sunset: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        },
      }
    );
  } catch (error) {
    apiConsole.error("[WechatInternal] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器内部错误" } },
      { status: 500 }
    );
  }
}
