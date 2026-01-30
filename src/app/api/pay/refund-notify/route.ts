
import { NextRequest, NextResponse } from "next/server";
import { handleRefundNotify } from "@/lib/wechat-pay";

/**
 * 微信退款回调接口
 */
export async function POST(request: NextRequest) {
    try {
        const xmlBody = await request.text();
        const result = await handleRefundNotify(xmlBody);

        if (result.success) {
            return new NextResponse(
                `<xml>
          <return_code><![CDATA[SUCCESS]]></return_code>
          <return_msg><![CDATA[OK]]></return_msg>
        </xml>`,
                {
                    status: 200,
                    headers: {
                        "Content-Type": "text/xml",
                    },
                }
            );
        } else {
            console.error("[Refund Notify] 失败:", result.message);
            return new NextResponse(
                `<xml>
          <return_code><![CDATA[FAIL]]></return_code>
          <return_msg><![CDATA[${result.message || "FAIL"}]]></return_msg>
        </xml>`,
                {
                    status: 200, // 微信要求返回 200
                    headers: {
                        "Content-Type": "text/xml",
                    },
                }
            );
        }
    } catch (error) {
        console.error("[Refund Notify] 异常:", error);
        return new NextResponse(
            `<xml>
        <return_code><![CDATA[FAIL]]></return_code>
        <return_msg><![CDATA[ERROR]]></return_msg>
      </xml>`,
            {
                status: 200,
                headers: {
                    "Content-Type": "text/xml",
                },
            }
        );
    }
}
