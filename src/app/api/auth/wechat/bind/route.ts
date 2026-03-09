import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { signUserToken } from "@/lib/jwt";
import { USER_COOKIE_OPTIONS, USER_COOKIE_NAME } from "@/types/auth";
import { z } from "zod";
import { hashPassword } from "@/lib/password";
import { jwtVerify } from "jose";

const secret = new TextEncoder().encode(
    process.env.JWT_SECRET || "dev-secret-key-change-in-production-32chars"
);

const bindSchema = z.object({
    phone: z.string().regex(/^1[3-9]\d{9}$/, "请输入正确的手机号"),
    code: z.string().length(6, "验证码为6位数字"),
    password: z.string().min(6, "密码至少6位").max(32, "密码最多32位"),
});

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();

        const result = bindSchema.safeParse(body);
        if (!result.success) {
            return NextResponse.json(
                { success: false, error: { code: "INVALID_PARAMS", message: result.error.issues[0]?.message } },
                { status: 400 }
            );
        }

        const { phone, code, password } = result.data;

        const bindToken = request.cookies.get("wechat_bind_token")?.value;
        if (!bindToken) {
            return NextResponse.json({ success: false, error: { message: "微信授权已过期，请重新扫码" } }, { status: 400 });
        }

        // Verify bind token
        interface WechatBindInfo {
            openid: string;
            unionid?: string;
            nickname?: string;
            avatar?: string;
        }

        let wechatInfo: WechatBindInfo;
        try {
            const { payload } = await jwtVerify(bindToken, secret);
            if (payload.type !== "wechat_bind") throw new Error("Invalid token type");
            wechatInfo = payload as unknown as WechatBindInfo;
        } catch {
            return NextResponse.json({ success: false, error: { message: "微信授权无效或已过期，请重新扫码" } }, { status: 400 });
        }

        // Verify SMS Code
        const smsCode = await prisma.smsCode.findFirst({
            where: { phone, type: "register", used: false, expiresAt: { gte: new Date() } },
            orderBy: { createdAt: "desc" }
        });

        if (!smsCode || smsCode.code !== code) {
            return NextResponse.json({ success: false, error: { message: "验证码错误或已过期" } }, { status: 400 });
        }

        await prisma.smsCode.update({ where: { id: smsCode.id }, data: { used: true } });

        // Link or create user
        let user = await prisma.user.findUnique({ where: { phone } });
        const hashedPassword = await hashPassword(password);

        // Check if there is an existing user account for this WeChat (usually a legacy wx_ phone user)
        const oldWechatUser = await prisma.user.findFirst({
            where: wechatInfo.unionid
                ? { OR: [{ wechatUnionId: wechatInfo.unionid }, { wechatOpenId: wechatInfo.openid }] }
                : { wechatOpenId: wechatInfo.openid }
        });

        // If an old placeholder user exists, we need to carefully detach it to avoid Unique Constraint violation
        if (oldWechatUser) {
            if (oldWechatUser.phone.startsWith("wx_")) {
                if (user && user.id !== oldWechatUser.id) {
                    // Scenario: Real phone user exists + Legacy wx_ user exist. 
                    // We need to move WeChat data to the real user, and detach the old one.
                    await prisma.user.update({
                        where: { id: oldWechatUser.id },
                        data: {
                            wechatOpenId: `unbound_${oldWechatUser.id}_${wechatInfo.openid}`,
                            wechatUnionId: oldWechatUser.wechatUnionId ? `unbound_${oldWechatUser.id}_${oldWechatUser.wechatUnionId}` : null
                        }
                    });
                } else if (!user) {
                    // Scenario: Legacy wx_ user exist, Real phone doesn't exist.
                    // Instead of creating a new user, UPGRADE the wx_ user to real user.
                    user = await prisma.user.update({
                        where: { id: oldWechatUser.id },
                        data: {
                            phone,
                            phoneVerified: true,
                            password: hashedPassword,
                            nickname: oldWechatUser.nickname?.startsWith("wx_") ? (wechatInfo.nickname || `用户_${phone.slice(-4)}`) : (oldWechatUser.nickname || wechatInfo.nickname || `用户_${phone.slice(-4)}`)
                        }
                    });
                }
            } else if (user && user.id !== oldWechatUser.id) {
                // Scenario: The WeChat is completely bound to ANOTHER real phone number!
                return NextResponse.json({ success: false, error: { message: "此微信已绑定其他账号，请使用原手机号登录" } }, { status: 400 });
            }
        }

        if (user && (!oldWechatUser || (oldWechatUser.phone.startsWith("wx_") && user.id !== oldWechatUser.id))) {
            // User exists, but WeChat metadata needs to be attached or updated
            user = await prisma.user.update({
                where: { id: user.id },
                data: {
                    wechatOpenId: wechatInfo.openid,
                    wechatUnionId: wechatInfo.unionid || user.wechatUnionId,
                    password: hashedPassword,
                }
            });
        } else if (!user) {
            // Completely new user across both worlds
            user = await prisma.user.create({
                data: {
                    phone,
                    password: hashedPassword,
                    phoneVerified: true,
                    nickname: wechatInfo.nickname || `用户_${phone.slice(-4)}`,
                    avatar: wechatInfo.avatar || null,
                    wechatOpenId: wechatInfo.openid,
                    wechatUnionId: wechatInfo.unionid || null,
                }
            });
        }

        const token = await signUserToken({ id: user.id, phone: user.phone });

        const response = NextResponse.json({
            success: true,
            data: { user: { id: user.id, phone: user.phone, nickname: user.nickname, avatar: user.avatar, role: (user as { role?: string }).role || "user" } }
        });

        response.cookies.set(USER_COOKIE_NAME, token, USER_COOKIE_OPTIONS);
        // Clear the bind token
        response.cookies.set("wechat_bind_token", "", { ...USER_COOKIE_OPTIONS, maxAge: 0 });

        return response;
    } catch (error) {
        console.error("[WechatBind] Error:", error);
        return NextResponse.json({ success: false, error: { message: "服务器错误" } }, { status: 500 });
    }
}
