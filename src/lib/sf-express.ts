
/**
 * 顺丰速运 (SF Express) 服务
 */
import crypto from "crypto";

const SF_CONFIG = {
    partnerId: process.env.SF_PARTNER_ID || "", // 顾客编码 (Client Code)
    checkword: process.env.SF_CHECKWORD || "",   // 校验码 (Check Word)
    apiUrl: "https://bsp-oisp.sf-express.com/bsp-oisp/sfexpressService",
};

export interface RouteNode {
    time: string;
    context: string;
}

/**
 * 查询顺丰物流轨迹 (使用丰桥 API)
 */
export async function getSFTrack(trackingNo: string, phoneLast4?: string): Promise<{ success: boolean; data?: RouteNode[]; error?: string; redirectUrl?: string }> {
    // 1. 如果没有配置 API，返回模拟数据 (Mock)，以便用户在无 key 情况下也能看到 UI 效果
    if (!SF_CONFIG.partnerId) {
        // 同时也返回官网链接作为备选
        const officialUrl = `https://www.sf-express.com/cn/sc/dynamic_function/waybill/#search/bill-number/${trackingNo}`;

        return {
            success: true,
            data: [
                { time: new Date().toLocaleString(), context: "【已签收】感谢使用顺丰速运，期待再次为您服务" },
                { time: new Date(Date.now() - 3600000).toLocaleString(), context: "【派送中】快递员正在为您派件，请保持电话畅通" },
                { time: new Date(Date.now() - 86400000).toLocaleString(), context: "【杭州市】快件到达 [杭州萧山集散中心]" },
                { time: new Date(Date.now() - 172800000).toLocaleString(), context: "【深圳市】快件已发车" },
                { time: new Date(Date.now() - 180000000).toLocaleString(), context: "顺丰速运 已收取快件" },
            ],
            redirectUrl: officialUrl
        };
    }

    // 2. 真实 API 调用
    try {
        const msgData = JSON.stringify({
            language: "0",
            trackingType: "1",
            trackingNumber: [trackingNo],
            methodType: "1",
            checkPhoneNo: phoneLast4 || null
        });

        const timestamp = Math.floor(Date.now() / 1000).toString();
        const toSign = decodeURIComponent(msgData) + timestamp + SF_CONFIG.checkword;
        const msgDigest = crypto.createHash("md5").update(toSign, "utf8").digest("base64");

        const params = new URLSearchParams();
        params.append("partnerID", SF_CONFIG.partnerId);
        params.append("requestID", crypto.randomUUID());
        params.append("serviceCode", "EXP_RECE_SEARCH_ROUTES");
        params.append("timestamp", timestamp);
        params.append("msgData", msgData);
        params.append("msgDigest", msgDigest);

        const res = await fetch(SF_CONFIG.apiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
            body: params
        });

        const resultText = await res.text();
        // 丰桥返回可能是 JSON 字符串
        let result;
        try {
            result = JSON.parse(resultText);
        } catch {
            // 如果返回非 JSON，可能是错误 HTML
            console.error("SF API parse error:", resultText);
            return { success: false, error: "解析顺丰响应失败" };
        }

        if (result.apiResultCode === "A1000") {
            // 解析路由
            const routeResps = JSON.parse(result.apiResultData || "{}").msgData?.routeResps?.[0];
            if (routeResps && routeResps.routes) {
                return {
                    success: true,
                    data: routeResps.routes.map((r: any) => ({
                        time: r.acceptTime,
                        context: `${r.acceptAddress ? `【${r.acceptAddress}】` : ""}${r.remark}`
                    }))
                };
            }
            return { success: true, data: [] };
        } else {
            return { success: false, error: result.apiErrorMsg || "查询失败" };
        }
    } catch (e) {
        console.error("SF API Error:", e);
        return { success: false, error: "调用顺丰接口异常" };
    }
}
