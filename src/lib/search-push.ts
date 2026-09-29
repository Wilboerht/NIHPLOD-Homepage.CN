/**
 * 搜索引擎主动推送统一入口
 *
 * 内容更新后同时提交百度与 IndexNow（Bing/Yandex 等）。
 * 对应 token/key 未配置时各自静默跳过，失败不抛错、不影响主流程。
 */
import { pushUrlsToBaidu } from "@/lib/baidu-push";
import { submitToIndexNow } from "@/lib/indexnow";

export function pushSearchEngines(paths: string[]): void {
  if (paths.length === 0) {
    return;
  }

  void pushUrlsToBaidu(paths);
  void submitToIndexNow(paths);
}
