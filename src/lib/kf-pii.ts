import { createSignedInternalRequestHeaders } from "@/lib/internal-api";
import { apiConsole } from "@/lib/logger";

const KF_PII_DELETE_PATH = "/api/internal/pii/delete";

function kfBaseUrl(): string {
  return (process.env.KF_API_BASE || "https://kf.nihplod.cn").replace(/\/+$/, "");
}

/**
 * 账号注销时清理 KF 外部身份档案。
 * 失败抛错，让注销请求进入 FAILED 并在 cron 中重试；接口本身是幂等的。
 */
export async function purgeKfExternalUser(
  openKfid: string,
  externalUserId: string
): Promise<void> {
  const body = JSON.stringify({ openKfid, externalUserId });
  const signed = createSignedInternalRequestHeaders("kf", "POST", KF_PII_DELETE_PATH, body);
  if (!signed) {
    throw new Error("kf_purge_not_configured");
  }

  const response = await fetch(`${kfBaseUrl()}${KF_PII_DELETE_PATH}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...signed,
    },
    body,
    signal: AbortSignal.timeout(5000),
  }).catch((error) => {
    apiConsole.warn("[KfPii] 请求 KF 删除接口失败", { error: String(error) });
    throw error;
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    apiConsole.warn("[KfPii] KF 删除接口返回失败", {
      status: response.status,
      body: text.slice(0, 200),
    });
    throw new Error(`kf_purge_failed:${response.status}`);
  }
}
