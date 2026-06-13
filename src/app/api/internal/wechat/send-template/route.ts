/**
 * 内部 API：代子站发送微信模板消息
 * POST /api/internal/wechat/send-template
 *
 * 认证：X-Internal-API-Secret Header
 *
 * Body: {
 *   userId: string;      // 官网用户 ID
 *   score: number;
 *   primaryConcern: string;
 *   reportUrl: string;
 * }
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiConsole } from "@/lib/logger";

// 内存热缓存
let cachedAccessToken: string | null = null;
let tokenExpiresAt: number = 0;
const TOKEN_SAFETY_MARGIN_MS = 5 * 60 * 1000;

async function getWechatAccessToken(): Promise<string | null> {
    const appId = process.env.WECHAT_APP_ID;
    const appSecret = process.env.WECHAT_APP_SECRET;

    if (!appId || !appSecret) {
        apiConsole.error("[WechatInternal] 缺少 WECHAT_APP_ID 或 WECHAT_APP_SECRET");
        return null;
    }

    if (cachedAccessToken && Date.now() < tokenExpiresAt) {
        return cachedAccessToken;
    }

    try {
        const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${appId}&secret=${appSecret}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        const response = await fetch(url, { cache: "no-store", signal: controller.signal });
        clearTimeout(timeout);
        const data = await response.json();

        if (data.access_token && typeof data.expires_in === "number") {
            cachedAccessToken = data.access_token;
            tokenExpiresAt = Date.now() + (data.expires_in * 1000) - TOKEN_SAFETY_MARGIN_MS;
            return cachedAccessToken;
        }
        apiConsole.error("[WechatInternal] 获取 AccessToken 失败:", data);
        return null;
    } catch (error) {
        apiConsole.error("[WechatInternal] 获取 AccessToken 异常:", error);
        return null;
    }
}

export async function POST(request: NextRequest) {
    try {
        // 1. 认证校验
        const secret = request.headers.get("x-internal-api-secret");
        const expectedSecret = process.env.INTERNAL_API_SECRET;

        if (!expectedSecret) {
            apiConsole.error("[WechatInternal] INTERNAL_API_SECRET 未配置");
            return NextResponse.json(
                { success: false, error: { code: "CONFIG_ERROR", message: "服务器配置错误" } },
                { status: 500 }
            );
        }

        if (secret !== expectedSecret) {
            apiConsole.warn("[WechatInternal] 认证失败，secret 不匹配");
            return NextResponse.json(
                { success: false, error: { code: "UNAUTHORIZED", message: "未授权的请求" } },
                { status: 401 }
            );
        }

        // 2. 参数解析与校验
        const body = await request.json();
        const { userId, score, primaryConcern, reportUrl } = body;

        if (!userId || typeof score !== "number" || !primaryConcern || !reportUrl) {
            return NextResponse.json(
                { success: false, error: { code: "INVALID_PARAMS", message: "缺少必要参数" } },
                { status: 400 }
            );
        }

        // 3. 查询用户微信 OpenID
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { wechatOpenId: true, phone: true },
        });

        if (!user?.wechatOpenId) {
            // 用户未绑定微信，静默跳过（不报错，这是正常情况）
            return NextResponse.json(
                { success: true, data: { sent: false, reason: "用户未绑定微信" } }
            );
        }

        // 4. 获取 AccessToken
        const accessToken = await getWechatAccessToken();
        if (!accessToken) {
            return NextResponse.json(
                { success: false, error: { code: "WECHAT_TOKEN_ERROR", message: "获取微信 AccessToken 失败" } },
                { status: 502 }
            );
        }

        // 5. 发送模板消息
        const templateId = process.env.WECHAT_TEMPLATE_ID;
        if (!templateId) {
            apiConsole.error("[WechatInternal] WECHAT_TEMPLATE_ID 未配置");
            return NextResponse.json(
                { success: false, error: { code: "CONFIG_ERROR", message: "模板 ID 未配置" } },
                { status: 500 }
            );
        }

        const payload = {
            touser: user.wechatOpenId,
            template_id: templateId,
            url: reportUrl,
            topcolor: "#171717",
            data: {
                result: { value: "深度面部分析已完成", color: "#171717" },
                score: { value: score.toString(), color: "#d97706" },
                concern: { value: primaryConcern, color: "#dc2626" },
                time: {
                    value: new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }),
                    color: "#6b7280",
                },
                remark: {
                    value: "👉 点击本卡片立即查看您的详细数字分析大屏及抗老护肤建议。",
                    color: "#059669",
                },
            },
        };

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        const wxResponse = await fetch(
            `https://api.weixin.qq.com/cgi-bin/message/template/send?access_token=${accessToken}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
                signal: controller.signal,
            }
        );
        clearTimeout(timeout);

        const wxData = await wxResponse.json();

        if (wxData.errcode === 0) {
            apiConsole.info(`[WechatInternal] 模板消息发送成功: ${user.phone?.slice(0, 3)}****${user.phone?.slice(-4)}`);
            return NextResponse.json(
                { success: true, data: { sent: true } }
            );
        }

        // 微信返回错误（如用户拒收、openid 失效等）
        apiConsole.error("[WechatInternal] 微信模板消息发送失败:", wxData);
        return NextResponse.json(
            { success: false, error: { code: "WECHAT_API_ERROR", message: wxData.errmsg || "发送失败" } },
            { status: 502 }
        );

    } catch (error) {
        apiConsole.error("[WechatInternal] 异常:", error);
        return NextResponse.json(
            { success: false, error: { code: "INTERNAL_ERROR", message: "服务器内部错误" } },
            { status: 500 }
        );
    }
}
