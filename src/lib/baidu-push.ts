/**
 * 百度主动推送核心逻辑（服务端可直接调用）
 *
 * 用途：内容更新后将 URL 主动提交给百度站长平台，加速收录。
 * 使用前：在百度站长平台 -> 数据引入 -> 链接提交 -> 找到 token，
 * 配置环境变量 BAIDU_PUSH_TOKEN。token 未配置时静默跳过，不影响主流程。
 */
import { apiConsole } from "@/lib/logger";

const BAIDU_PUSH_API = "http://data.zz.baidu.com/urls";

export interface BaiduPushResult {
  pushed: number;
  remain: number;
  notSameSite: string[];
  notValid: string[];
}

/**
 * 将站内路径批量推送给百度
 * @param paths 站内相对路径，如 ["/products/foo", "/"]
 * @returns 推送结果；token 未配置或推送失败时返回 null
 */
export async function pushUrlsToBaidu(paths: string[]): Promise<BaiduPushResult | null> {
  const token = process.env.BAIDU_PUSH_TOKEN;
  const site = process.env.NEXT_PUBLIC_SITE_URL || "https://nihplod.cn";

  if (!token || paths.length === 0) {
    return null;
  }

  const urls = paths.map((p) => `${site}${p}`);

  try {
    const response = await fetch(`${BAIDU_PUSH_API}?site=${site}&token=${token}`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: urls.join("\n"),
    });

    const result = await response.json();

    return {
      pushed: result.success || 0,
      remain: result.remain || 0,
      notSameSite: result.not_same_site || [],
      notValid: result.not_valid || [],
    };
  } catch (error) {
    apiConsole.error("百度推送失败:", error);
    return null;
  }
}
