import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { signUserToken, signRefreshToken } from "@/lib/jwt";
import { USER_COOKIE_OPTIONS, USER_COOKIE_NAME } from "@/types/auth";
import { z } from "zod";
import { hashPassword, generateSecurePassword } from "@/lib/password";
import { jwtVerify } from "jose";

const secret = new TextEncoder().encode(
    process.env.JWT_SECRET || "dev-secret-key-change-in-production-32chars"
);

/**
 * 微信绑定表单
 * 密码现在是可选的（如果不提供，会自动生成）
 */
const bindSchema = z.object({
    phone: z.string().regex(/^1[3-9]\d{9}$/, "请输入正确的手机号"),
    code: z.string().length(6, "验证码为6位数字"),
    password: z.string().min(6, "密码至少6位").max(32, "密码最多32位").optional(),
    allowAutoPassword: z.boolean().default(true),
});

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();

        const result = bindSchema.safeParse(body);
        if (!result.success) {
            return NextResponse.json(
                { 
                    success: false, 
                    error: { 
                        code: "INVALID_PARAMS", 
                        message: result.error.issues[0]?.message 
                    } 
                },
                { status: 400 }
            );
        }

        const { phone, code, allowAutoPassword } = result.data;
        let { password } = result.data;

        const bindToken = request.cookies.get("wechat_bind_token")?.value;
        if (!bindToken) {
            return NextResponse.json(
                { 
                    success: false, 
                    error: { 
                        code: "BIND_TOKEN_EXPIRED",
                        message: "微信授权已过期，请重新扫码" 
                    } 
                }, 
                { status: 400 }
            );
        }

        // 验证绑定 token
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
            return NextResponse.json(
                { 
                    success: false, 
                    error: { 
                        code: "INVALID_BIND_TOKEN",
                        message: "微信授权无效或已过期，请重新扫码" 
                    } 
                }, 
                { status: 400 }
            );
        }

        // 验证短信验证码
        const smsCode = await prisma.smsCode.findFirst({
            where: { 
                phone, 
                type: "register", 
                used: false, 
                expiresAt: { gte: new Date() } 
            },
            orderBy: { createdAt: "desc" }
        });

        if (!smsCode || smsCode.code !== code) {
            return NextResponse.json(
                { 
                    success: false, 
                    error: { 
                        code: "INVALID_CODE",
                        message: "验证码错误或已过期" 
                    } 
                }, 
                { status: 400 }
            );
        }

        // 标记验证码为已使用
        await prisma.smsCode.update({ 
            where: { id: smsCode.id }, 
            data: { used: true } 
        });

        // 如果未提供密码，自动生成强密码
        if (!password && allowAutoPassword) {
            password = generateSecurePassword(24);
            console.log(`[WechatBind] 为用户 ${phone} 自动生成密码`);
        } else if (!password) {
            return NextResponse.json(
                { 
                    success: false, 
                    error: { 
                        code: "PASSWORD_REQUIRED",
                        message: "请提供密码或允许自动生成密码" 
                    } 
                }, 
                { status: 400 }
            );
        }

        const hashedPassword = await hashPassword(password);

        // 检查是否有现有的微信用户账户
        const oldWechatUser = await prisma.user.findFirst({
            where: wechatInfo.unionid
                ? { OR: [{ wechatUnionId: wechatInfo.unionid }, { wechatOpenId: wechatInfo.openid }] }
                : { wechatOpenId: wechatInfo.openid }
        });

        // 检查该手机号是否已注册
        let user = await prisma.user.findUnique({ where: { phone } });

        // 处理账户冲突的情况
        if (oldWechatUser) {
            if (oldWechatUser.phone.startsWith("wx_")) {
                if (user && user.id !== oldWechatUser.id) {
                    // 旧的临时账户存在，且新手机号也有账户
                    // 清理旧的临时账户，防止重复
                    await prisma.user.update({
                        where: { id: oldWechatUser.id },
                        data: {
                            wechatOpenId: `unbound_${oldWechatUser.id}_${wechatInfo.openid}`,
                            wechatUnionId: oldWechatUser.wechatUnionId 
                                ? `unbound_${oldWechatUser.id}_${oldWechatUser.wechatUnionId}` 
                                : null
                        }
                    });
                } else if (!user) {
                    // 旧的临时账户存在，升级为真实账户
                    user = await prisma.user.update({
                        where: { id: oldWechatUser.id },
                        data: {
                            phone,
                            phoneVerified: true,
                            password: hashedPassword,
                            nickname: oldWechatUser.nickname?.startsWith("wx_") 
                                ? (wechatInfo.nickname || `用户_${phone.slice(-4)}`) 
                                : (oldWechatUser.nickname || wechatInfo.nickname || `用户_${phone.slice(-4)}`),
                            avatar: oldWechatUser.avatar || wechatInfo.avatar || null,
                        }
                    });
                }
            } else if (user && user.id !== oldWechatUser.id) {
                // 微信已绑定到另一个账户！
                return NextResponse.json(
                    { 
                        success: false, 
                        error: { 
                            code: "WECHAT_ALREADY_BOUND",
                            message: "此微信已绑定其他账号，请使用绑定的手机号登录" 
                        } 
                    }, 
                    { status: 400 }
                );
            }
        }

        if (user && (!oldWechatUser || (oldWechatUser.phone.startsWith("wx_") && user.id !== oldWechatUser.id))) {
            // 更新现有用户，添加微信信息
            user = await prisma.user.update({
                where: { id: user.id },
                data: {
                    wechatOpenId: wechatInfo.openid,
                    wechatUnionId: wechatInfo.unionid || user.wechatUnionId,
                    password: hashedPassword,
                    nickname: user.nickname || wechatInfo.nickname || `用户_${phone.slice(-4)}`,
                    avatar: user.avatar || wechatInfo.avatar || null,
                }
            });
        } else if (!user) {
            // 完全新用户
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

        // 签发新的 Token（使用双 Token 机制）
        const accessToken = await signUserToken({ 
            id: user.id, 
            phone: user.phone 
        });
        const refreshToken = await signRefreshToken({ 
            id: user.id, 
            phone: user.phone 
        });

        // 保存 Refresh Token 到数据库
        await prisma.refreshToken.create({
            data: {
                userId: user.id,
                token: refreshToken,
                expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30天后过期
            },
        });

        const response = NextResponse.json({
            success: true,
            data: { 
                user: { 
                    id: user.id, 
                    phone: user.phone, 
                    nickname: user.nickname, 
                    avatar: user.avatar,
                },
                accessToken,
                accessTokenExpiresAt: new Date(Date.now() + 15 * 60 * 1000).getTime() / 1000,
                message: "绑定成功，已自动登录"
            }
        });

        // 设置 Cookie
        response.cookies.set(USER_COOKIE_NAME, accessToken, USER_COOKIE_OPTIONS);
        // 清除临时绑定 token
        response.cookies.set("wechat_bind_token", "", { ...USER_COOKIE_OPTIONS, maxAge: 0 });

        return response;
    } catch (error) {
        console.error("[WechatBind] Error:", error);
        return NextResponse.json(
            { 
                success: false, 
                error: { 
                    code: "INTERNAL_ERROR",
                    message: error instanceof Error ? error.message : "服务器错误" 
                } 
            }, 
            { status: 500 }
        );
    }
}
