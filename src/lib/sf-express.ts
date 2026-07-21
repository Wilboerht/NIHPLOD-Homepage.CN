/**
 * 顺丰丰桥 API 封装
 * 用于查询真实物流轨迹
 * 文档：https://open.sf-express.com/
 */

import { createHash } from "crypto";
import { apiConsole } from "@/lib/logger";

const SF_API_URL = "https://sfapi.sf-express.com/routeService";

interface SFConfig {
  customerCode: string;
  checkWord: string;
}

function getConfig(): SFConfig | null {
  const customerCode = process.env.SF_EXPRESS_CUSTOMER_CODE;
  const checkWord = process.env.SF_EXPRESS_CHECK_WORD;
  if (!customerCode || !checkWord) return null;
  return { customerCode, checkWord };
}

/**
 * 生成顺丰 API 请求签名（verifyCode）
 * verifyCode = Base64(MD5(xml + checkWord))
 */
function generateVerifyCode(xmlBody: string, checkWord: string): string {
  const md5Hash = createHash("md5")
    .update(xmlBody + checkWord)
    .digest();
  return Buffer.from(md5Hash).toString("base64");
}

/**
 * 构建顺丰查询路由 XML 请求体
 */
function buildRouteRequestXml(trackingNo: string, customerCode: string): string {
  const safeTrackingNo = trackingNo
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<?xml version="1.0" encoding="UTF-8" ?>
<Request service="RouteService" lang="zh-CN">
  <Head>${customerCode}</Head>
  <Body>
    <RouteRequest tracking_number="${safeTrackingNo}"/>
  </Body>
</Request>`;
}

export interface SFTrace {
  time: string;
  status: string;
  location?: string;
}

export interface SFLogisticsResult {
  success: boolean;
  traces?: SFTrace[];
  error?: string;
}

/**
 * 通过顺丰丰桥查询物流轨迹
 */
export async function querySFExpressRoute(trackingNo: string): Promise<SFLogisticsResult> {
  const config = getConfig();
  if (!config) {
    return { success: false, error: "顺丰丰桥未配置" };
  }

  try {
    const xmlBody = buildRouteRequestXml(trackingNo, config.customerCode);
    const verifyCode = generateVerifyCode(xmlBody, config.checkWord);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const response = await fetch(SF_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        xml: xmlBody,
        verifyCode,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return { success: false, error: `顺丰API请求失败: ${response.status}` };
    }

    const xmlText = await response.text();

    // 解析顺丰返回的 XML
    // 使用宽松匹配，支持任意 attribute 顺序
    const routeMatches = Array.from(xmlText.matchAll(/<Route\s+([^>]*)\/>/g));
    const traces: SFTrace[] = [];

    for (const match of routeMatches) {
      const attrs = match[1];
      const timeMatch = attrs.match(/accept_time="([^"]+)"/);
      const remarkMatch = attrs.match(/remark="([^"]*)"/);
      if (timeMatch) {
        traces.push({
          time: timeMatch[1],
          status: remarkMatch?.[1] || "运输中",
        });
      }
    }

    // 检查是否有错误
    const errorMatch = xmlText.match(/<ERROR\s+code="([^"]+)"\s*>([^<]*)<\/ERROR>/);
    if (errorMatch) {
      return { success: false, error: errorMatch[2] || errorMatch[1] };
    }

    // 如果没有轨迹数据，可能是尚未揽收
    if (traces.length === 0) {
      return { success: true, traces: [] };
    }

    return { success: true, traces: traces.reverse() };
  } catch (error) {
    apiConsole.error("[SFExpress] 查询失败:", error);
    return { success: false, error: "物流查询异常" };
  }
}
