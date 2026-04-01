/**
 * 银联商务 (UMS) 聚合支付服务
 * 实现真正的聚合支付：生成聚合码，支持微信、支付宝、云闪付扫码
 */
import crypto from "crypto";
import { prisma } from "./prisma";
import { OrderStatus } from "@/generated/prisma/client";

// 银联商务 (UMS) 全民付聚合支付配置
const UMS_CONFIG = {
    // 生产环境聚合支付网关 (若为测试环境，可填测试 URL)
    apiUrl: process.env.UNIONPAY_API_URL || "https://qr.chinaums.com/netpay-route-server/api/",
    msgSrc: process.env.UNIONPAY_MSG_SRC || "",      // 来源编号 (如：WWW.xxx.COM)
    mid: process.env.UNIONPAY_MID || "",             // 银联商务商户号 (开头通常是 898)
    tid: process.env.UNIONPAY_TID || "",             // 终端号 (8位数字)
    instMid: process.env.UNIONPAY_INST_MID || "MINIDEFAULT", // 机构商户号
    appKey: process.env.UNIONPAY_APP_KEY || "",      // 通讯密钥 (MD5/SHA256 Key)
    notifyUrl: process.env.UNIONPAY_NOTIFY_URL || process.env.NEXT_PUBLIC_APP_URL + "/api/pay/notify/unionpay",
};

/**
 * UMS 签名算法 (SHA256)
 * 提取所有非空参数，按字典序排序，拼接为 key=value&key=value，最后加上 appKey
 */
function sign(params: Record<string, string | number | boolean | null | undefined>, appKey: string): string {
    const keys = Object.keys(params).sort();
    const stringData = keys
        .filter(k => k !== "sign" && params[k] !== "" && params[k] !== null && params[k] !== undefined)
        .map(k => `${k}=${typeof params[k] === 'object' ? JSON.stringify(params[k]) : params[k]}`)
        .join("&");

    return crypto.createHash("sha256").update(stringData + appKey).digest("hex").toUpperCase();
}

/**
 * 生成 UUID 作为 MSG_ID
 */
function generateMsgId(): string {
    return crypto.randomUUID().replace(/-/g, "");
}

/**
 * 格式化时间为北京时间 (YYYY-MM-DD HH:mm:ss)
 * 银联商务服务器使用北京时间，需确保时区一致
 */
function formatTime(date: Date): string {
    const pad = (n: number) => n.toString().padStart(2, "0");
    // 转为北京时间 (UTC+8)
    const offset = 8 * 60; // 北京时区偏移 (分钟)
    const local = new Date(date.getTime() + (offset + date.getTimezoneOffset()) * 60000);
    return `${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(local.getDate())} ${pad(local.getHours())}:${pad(local.getMinutes())}:${pad(local.getSeconds())}`;
}

/**
 * 创建银联聚合支付
 */
export async function createUnionPayPayment(orderId: string): Promise<{
    success: boolean;
    payUrl?: string; // 银联商务将返回一个聚合码 / 收银台链接
    error?: string;
}> {
    try {
        const order = await prisma.order.findUnique({
            where: { id: orderId },
            include: { items: true }
        });

        if (!order) return { success: false, error: "订单不存在" };
        if (order.status !== OrderStatus.PENDING) return { success: false, error: "订单状态不可支付" };

        const requestTimestamp = formatTime(new Date());
        const billDate = new Date().toISOString().slice(0, 10);

        const amount = Math.round(Number(order.payAmount) * 100);

        const params: Record<string, string | number | boolean | null | undefined> = {
            msgId: generateMsgId(),
            msgSrc: UMS_CONFIG.msgSrc,
            msgType: "bills.getQRCode", // 关键：获取聚合支付码接口
            requestTimestamp,
            mid: UMS_CONFIG.mid,
            tid: UMS_CONFIG.tid,
            instMid: UMS_CONFIG.instMid,
            billNo: order.orderNo,
            billDate: billDate,
            totalAmount: amount, // 单位：分
            notifyUrl: UMS_CONFIG.notifyUrl,
            billDesc: `NIHPLOD-${order.items[0]?.productName || "订单"}`
        };

        // 附加签名
        params.sign = sign(params, UMS_CONFIG.appKey);

        const response = await fetch(UMS_CONFIG.apiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(params)
        });

        const data = await response.json();

        // UMS 接口返回 errCode = "SUCCESS" 代表请求成功
        if (data.errCode === "SUCCESS" && data.billQRCode) {
            // 前端直接利用 payUrl 跳转或显示二维码
            return { success: true, payUrl: data.billQRCode };
        } else {
            console.error("[UnionPay] 请求聚合码失败:", data);
            return { success: false, error: data.errMsg || "获取聚合支付码失败" };
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : "未知错误";
        console.error("[UnionPay] API 请求异常:", message);
        return { success: false, error: "银联聚合支付请求异常" };
    }
}

/**
 * 处理银联聚合支付异步通知
 */
export async function handleUnionPayNotify(body: Record<string, string>): Promise<{ success: boolean; message?: string }> {
    try {
        const { sign: reqSign, ...params } = body;

        // 1. SHA256 验签
        const computedSign = sign(params, UMS_CONFIG.appKey);

        // 忽略大小写进行匹配
        if (!reqSign || computedSign !== reqSign.toUpperCase()) {
            console.error("[UnionPay] 异步通知验签失败");
            return { success: false, message: "验签失败" };
        }

        // 2. 状态判断 (SUCCESS 或者 PAID 代表付款成功)
        if (params.billStatus !== "PAID" && params.billStatus !== "SUCCESS") {
            return { success: false, message: "交易暂未支付" };
        }

        const orderNo = params.billNo;
        const seqId = params.seqId; // 银联侧的全局流水号

        // 3. 业务状态机更新
        await prisma.$transaction(async (tx) => {
            const order = await tx.order.findUnique({ where: { orderNo } });
            if (!order || order.status === OrderStatus.PAID) return;

            // UMS 通知中的 totalAmount 单位也是分
            if (Math.round(Number(order.payAmount) * 100) !== parseInt(params.totalAmount || "0")) {
                throw new Error("AMOUNT_MISMATCH");
            }

            await tx.order.update({
                where: { orderNo },
                data: {
                    status: OrderStatus.PAID,
                    paymentMethod: "unionpay",
                    paymentNo: seqId,
                    paymentTime: new Date(),
                },
            });
        });

        return { success: true };
    } catch (error) {
        console.error("[UnionPay] 异步通知处理异常:", error);
        return { success: false, message: "系统错误" };
    }
}

/**
 * 发起银联退款
 * @param billNo 原账单号（订单号）
 * @param refundAmount 退款金额（元）
 */
export async function refundUnionPayOrder(
    billNo: string,
    refundAmount: number
): Promise<{ success: boolean; error?: string }> {
    try {
        // 验证金额
        if (refundAmount <= 0) {
            console.warn("[UnionPay] 退款金额必须大于0");
            return { success: false, error: "退款金额必须大于0" };
        }

        // 创建新的交易流水号作为退款单号
        const refundOrderId = "R" + Date.now() + Math.floor(Math.random() * 1000);
        const amount = Math.round(refundAmount * 100);

        const params: Record<string, string | number | boolean | null | undefined> = {
            msgId: generateMsgId(),
            msgSrc: UMS_CONFIG.msgSrc,
            msgType: "bills.refund",
            requestTimestamp: formatTime(new Date()),
            mid: UMS_CONFIG.mid,
            tid: UMS_CONFIG.tid,
            instMid: UMS_CONFIG.instMid,
            billNo: billNo, // 原账单号
            refundOrderId: refundOrderId, // 本次退款新单号
            refundAmount: amount, // 退款金额（分）
        };

        params.sign = sign(params, UMS_CONFIG.appKey);

        const response = await fetch(UMS_CONFIG.apiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(params)
        });

        const data = await response.json();

        // UMS 的退款状态：SUCCESS 代表申请成功
        if (data.errCode === "SUCCESS" && (data.refundStatus === "SUCCESS" || data.refundStatus === "PROCESSING")) {
            return { success: true };
        } else {
            console.error("[UnionPay] 退款被拒绝:", data);
            return { success: false, error: data.errMsg || "退款被拒绝" };
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : "未知错误";
        console.error("[UnionPay] 退款接口异常:", message);
        return { success: false, error: "退款系统异常" };
    }
}
