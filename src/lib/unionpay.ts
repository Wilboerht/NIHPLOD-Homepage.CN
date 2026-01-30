
/**
 * 银联支付服务 (UnionPay)
 * 实现手机网页支付 (WAP/H5)
 */
import crypto from "crypto";
import { prisma } from "./prisma";
import { OrderStatus } from "@/generated/prisma/client";

// 银联配置
const UNIONPAY_CONFIG = {
    merId: process.env.UNIONPAY_MER_ID || "",
    frontUrl: process.env.UNIONPAY_FRONT_URL || process.env.NEXT_PUBLIC_APP_URL + "/pay/result",
    backUrl: process.env.UNIONPAY_BACK_URL || process.env.NEXT_PUBLIC_APP_URL + "/api/pay/notify/unionpay",
    actionUrl: "https://gateway.95516.com/gateway/api/frontTransReq.do", // 生产环境网关
    version: "5.1.0",
    encoding: "UTF-8",
    signMethod: "01", // 01 for RSA key cert, 11 for SHA256 (Simplified)
};

/**
 * 简单的 SHA256 签名 (用于测试或简化模式)
 * 真实生产环境通常使用证书 (Cert) 签名
 */
function sign(params: Record<string, string>): string {
    const keys = Object.keys(params).sort();
    const stringData = keys
        .filter(k => k !== "signature" && params[k] !== "")
        .map(k => `${k}=${params[k]}`)
        .join("&");

    // 这里应该附加证书密钥，暂用 MD5 模拟占位
    const secureKey = process.env.UNIONPAY_SECURE_KEY || "TEST_KEY";
    const stringSign = crypto.createHash("sha256").update(stringData + "&" + crypto.createHash("sha256").update(secureKey).digest("hex")).digest("hex");

    return stringSign;
}

/**
 * 创建银联支付表单数据
 */
export async function createUnionPayPayment(orderId: string): Promise<{
    success: boolean;
    html?: string; // 银联是通过 HTML Form 自动提交跳转的
    error?: string;
}> {
    try {
        const order = await prisma.order.findUnique({
            where: { id: orderId },
        });

        if (!order) {
            return { success: false, error: "订单不存在" };
        }

        if (order.status !== OrderStatus.PENDING) {
            return { success: false, error: "订单状态不正确" };
        }

        const txnTime = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14); // YYYYMMDDHHMMSS

        const params: Record<string, string> = {
            version: UNIONPAY_CONFIG.version,
            encoding: UNIONPAY_CONFIG.encoding,
            signMethod: UNIONPAY_CONFIG.signMethod,
            txnType: "01", // 消费
            txnSubType: "01", // 自助消费
            bizType: "000201", // B2C网关支付
            channelType: "07", // PC, 08 for Mobile (可以根据 UA 动态设置)
            merId: UNIONPAY_CONFIG.merId,
            accessType: "0", // 0：商户接入
            orderId: order.orderNo,
            txnTime: txnTime,
            txnAmt: Math.round(Number(order.payAmount) * 100).toString(), // 单位：分
            currencyCode: "156", // RMB
            frontUrl: UNIONPAY_CONFIG.frontUrl,
            backUrl: UNIONPAY_CONFIG.backUrl,
            payTimeout: new Date(Date.now() + 30 * 60 * 1000).toISOString().replace(/[^0-9]/g, "").slice(0, 14), // 30分钟超时
        };

        // 签名
        // 注意：真实场景这里需要加载 pfx 证书进行 RSA 签名
        params.signature = sign(params);

        // 构建自动提交的 HTML 表单
        const buildHtmlForm = (action: string, data: Record<string, string>) => {
            const inputs = Object.keys(data)
                .map(key => `<input type="hidden" name="${key}" value="${data[key]}" />`)
                .join("");

            return `
        <form id="unionpaysubmit" name="unionpaysubmit" action="${action}" method="POST">
          ${inputs}
        </form>
        <script>document.forms['unionpaysubmit'].submit();</script>
      `;
        };

        const html = buildHtmlForm(UNIONPAY_CONFIG.actionUrl, params);

        return { success: true, html };
    } catch (error) {
        console.error("[UnionPay] 创建失败:", error);
        return { success: false, error: "创建支付失败" };
    }
}

/**
 * 处理银联回调
 */
export async function handleUnionPayNotify(params: Record<string, string>): Promise<{ success: boolean; message?: string }> {
    // 1. 验签 (简化跳过)

    if (params.respCode !== "00" && params.respCode !== "A6") { // 00: 成功, A6: 部分成功
        return { success: false, message: "交易失败" };
    }

    const orderNo = params.orderId;
    const queryId = params.queryId; // 银联交易流水号

    // 更新订单
    try {
        await prisma.$transaction(async (tx) => {
            const order = await tx.order.findUnique({ where: { orderNo } });
            if (!order || order.status === OrderStatus.PAID) return;

            // ... (与微信/支付宝相同的积分发放逻辑)
            const PURCHASE_REWARD_RATIO = 1;
            const pointsEarned = Math.floor(Number(order.payAmount) * PURCHASE_REWARD_RATIO);

            await tx.order.update({
                where: { orderNo },
                data: {
                    status: OrderStatus.PAID,
                    paymentMethod: "unionpay",
                    paymentNo: queryId,
                    paymentTime: new Date(),
                    pointsEarned,
                },
            });

            // 发放积分... (省略重复代码，真实环境建议封装 updateOrderPaid 统一函数)
            if (pointsEarned > 0) {
                await tx.user.update({
                    where: { id: order.userId },
                    data: { points: { increment: pointsEarned }, totalPoints: { increment: pointsEarned } }
                });
                // ... pointRecord
            }
        });

        return { success: true };
    } catch (e) {
        console.error("[UnionPay] 更新订单失败", e);
        return { success: false, message: "数据库错误" };
    }
}
