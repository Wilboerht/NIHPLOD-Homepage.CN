/**
 * 顺丰丰桥（SF Express FengQiao）接入模块 —— 物流轨迹查询（P1 物流可见）
 *
 * 接口：丰桥开放平台标准接口（open.sf-express.com）
 * - 轨迹查询 serviceCode：EXP_RECE_SEARCH_ROUTES
 * - 签名：msgDigest = Base64(SHA-1(msgData + timestamp + checkWord)) 后 URL 编码
 *   （签名算法以丰桥官方文档为准，联调时如与沙箱不一致请按官方文档调整此处）
 *
 * 配置（环境变量）：
 * - SF_API_URL：丰桥接口地址（默认生产 https://sfapi.sf-express.com/std/service，
 *   沙箱联调可指向 https://sfapi-sbox.sf-express.com/std/service）
 * - SF_PARTNER_ID：顾客编码（partnerID，丰桥账号申请后分配）
 * - SF_CHECK_WORD：校验码（checkWord，申请接口时分配）
 * 未配置时 sfExpressConfigured()=false，用户端降级为「仅展示运单号」。
 */
import { createHash } from "crypto";

export interface SfRouteNode {
  /** 时间（ISO 字符串） */
  time: string;
  /** 轨迹状态描述 */
  description: string;
  /** 地点 */
  location?: string;
}

export type SfRouteQueryResult =
  | { ok: true; routes: SfRouteNode[] }
  | { ok: false; reason: "NOT_CONFIGURED" | "ERROR"; message?: string };

function sfConfig(): { apiUrl: string; partnerId: string; checkWord: string } | null {
  const apiUrl = process.env.SF_API_URL || "https://sfapi.sf-express.com/std/service";
  const partnerId = process.env.SF_PARTNER_ID;
  const checkWord = process.env.SF_CHECK_WORD;
  if (!partnerId || !checkWord) return null;
  return { apiUrl, partnerId, checkWord };
}

/** 是否已配置丰桥凭据 */
export function sfExpressConfigured(): boolean {
  return sfConfig() !== null;
}

/** 丰桥签名：Base64(SHA-1(msgData + timestamp + checkWord))，URL 编码后作为 msgDigest */
function buildDigest(msgData: string, timestamp: string, checkWord: string): string {
  const sha1 = createHash("sha1").update(msgData + timestamp + checkWord, "utf8").digest("base64");
  return encodeURIComponent(sha1);
}

interface SfApiResponse {
  apiResultCode?: string;
  apiErrorMsg?: string;
  apiResultData?: string;
  apiResponseID?: string;
}

interface SfRouteResp {
  mailNo?: string;
  routes?: {
    acceptAddress?: string;
    acceptTime?: string;
    remark?: string;
    opcode?: string;
  }[];
}

interface SfRoutesData {
  routeResps?: SfRouteResp[];
}

/**
 * 查询顺丰运单轨迹。
 * 未配置凭据时返回 NOT_CONFIGURED（调用方降级展示）。
 */
export async function querySfRoutes(waybillNo: string): Promise<SfRouteQueryResult> {
  const config = sfConfig();
  if (!config) {
    return { ok: false, reason: "NOT_CONFIGURED" };
  }

  const timestamp = String(Date.now());
  const msgData = JSON.stringify({
    trackingType: "1",
    trackingNumber: [waybillNo],
    methodType: "1",
    checkPhoneNo: "",
  });

  const url = new URL(config.apiUrl);
  url.searchParams.set("partnerID", config.partnerId);
  url.searchParams.set("requestID", crypto.randomUUID());
  url.searchParams.set("serviceCode", "EXP_RECE_SEARCH_ROUTES");
  url.searchParams.set("timestamp", timestamp);
  url.searchParams.set("msgDigest", buildDigest(msgData, timestamp, config.checkWord));
  url.searchParams.set("msgData", msgData);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      return { ok: false, reason: "ERROR", message: `丰桥接口响应异常（HTTP ${res.status}）` };
    }

    const body = (await res.json()) as SfApiResponse;
    if (body.apiResultCode !== "A1000") {
      return {
        ok: false,
        reason: "ERROR",
        message: body.apiErrorMsg || body.apiResultCode || "轨迹查询失败",
      };
    }

    let data: SfRoutesData = {};
    if (body.apiResultData) {
      try {
        data = JSON.parse(body.apiResultData) as SfRoutesData;
      } catch {
        return { ok: false, reason: "ERROR", message: "轨迹数据解析失败" };
      }
    }

    const mail = data.routeResps?.find((r) => r.mailNo === waybillNo);
    const routes: SfRouteNode[] = (mail?.routes ?? [])
      .map((r) => ({
        time: r.acceptTime ?? "",
        description: r.remark ?? "",
        location: r.acceptAddress ?? undefined,
      }))
      .filter((r) => r.time);

    return { ok: true, routes };
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError" ? "轨迹查询超时" : "轨迹查询失败";
    return { ok: false, reason: "ERROR", message };
  }
}
