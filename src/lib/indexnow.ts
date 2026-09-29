/**
 * IndexNow 主动推送核心逻辑（服务端可直接调用）
 *
 * 用途：内容更新后将 URL 提交给 IndexNow（Bing / Yandex 等共享），加速收录。
 * 使用前：在环境变量配置 INDEXNOW_KEY，且 public/<key>.txt 内容与该 key 一致
 * （仓库已内置 key 文件，部署时保持 INDEXNOW_KEY 一致即可）。
 * key 未配置时静默跳过，不影响主流程。
 */
import { apiConsole } from "@/lib/logger";
import { SITE_URL } from "@/lib/site-url";

const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";

/**
 * 将站内路径批量提交给 IndexNow
 * @param paths 站内相对路径，如 ["/products/foo", "/"]
 * @returns 提交成功返回 true；key 未配置或提交失败返回 false
 */
export async function submitToIndexNow(paths: string[]): Promise<boolean> {
  const key = process.env.INDEXNOW_KEY;

  if (!key || paths.length === 0) {
    return false;
  }

  const urlList = paths.map((p) => `${SITE_URL}${p.startsWith("/") ? "" : "/"}${p}`);

  try {
    const response = await fetch(INDEXNOW_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        host: new URL(SITE_URL).host,
        key,
        keyLocation: `${SITE_URL}/${key}.txt`,
        urlList,
      }),
    });

    return response.ok;
  } catch (error) {
    apiConsole.error("IndexNow 推送失败:", error);
    return false;
  }
}
