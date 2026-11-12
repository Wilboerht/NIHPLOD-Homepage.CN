/**
 * 法务文档缓存失效
 *
 * 单独成文件，避免公开读取模块（含 prisma / unstable_cache）被写接口导入时
 * 产生不必要的副作用。仅可在 Route Handler 或 Server Action 内调用。
 */
import { revalidatePath, revalidateTag } from "next/cache";
import { apiConsole } from "@/lib/logger";
import { LEGAL_DOCS_TAG } from "@/lib/cache-tags";

export function revalidateLegalDocumentCache(): void {
  try {
    revalidateTag(LEGAL_DOCS_TAG, { expire: 0 });
    revalidatePath("/terms");
    revalidatePath("/terms/embed");
    revalidatePath("/privacy");
    revalidatePath("/privacy/embed");
  } catch (error) {
    // 缓存失效失败不应让客户端误以为发布失败；数据本身已提交，
    // 页面读取层还有 300 秒兜底。
    apiConsole.error("[LegalDocument] 缓存失效失败:", error);
  }
}
