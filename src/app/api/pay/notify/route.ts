/**
 * 微信支付回调 API
 * POST /api/pay/notify
 */
import { NextRequest, NextResponse } from "next/server";
import { handlePaymentNotify } from "@/lib/wechat-pay";

// 强制动态渲染，禁止静态预渲染
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const xmlBody = await request.text();
    
    console.log("[PayNotify] 收到回调:", xmlBody.slice(0, 200));

    const result = await handlePaymentNotify(xmlBody);

    if (result.success) {
      // 返回成功响应
      return new NextResponse(
        `<xml>
          <return_code><![CDATA[SUCCESS]]></return_code>
          <return_msg><![CDATA[OK]]></return_msg>
        </xml>`,
        {
          status: 200,
          headers: { "Content-Type": "text/xml" },
        }
      );
    } else {
      return new NextResponse(
        `<xml>
          <return_code><![CDATA[FAIL]]></return_code>
          <return_msg><![CDATA[${result.message}]]></return_msg>
        </xml>`,
        {
          status: 200,
          headers: { "Content-Type": "text/xml" },
        }
      );
    }
  } catch (error) {
    console.error("[PayNotify] 异常:", error);
    return new NextResponse(
      `<xml>
        <return_code><![CDATA[FAIL]]></return_code>
        <return_msg><![CDATA[系统错误]]></return_msg>
      </xml>`,
      {
        status: 200,
        headers: { "Content-Type": "text/xml" },
      }
    );
  }
}

