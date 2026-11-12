/**
 * 仪表盘计数缓存失效 helper。
 *
 * 独立于 admin-stats.ts，避免 API 路由导入时把 unstable_cache 查询模块一并加载，
 * 也便于单元测试只 mock revalidateTag。
 */
import { revalidateTag } from "next/cache";

export function invalidateAdminStats(): void {
  try {
    revalidateTag("admin-stats", "max");
  } catch (error) {
    // 单元测试、CLI 脚本等非 Next 请求上下文调用时 revalidateTag 会抛错；
    // 这不影响业务写入，生产请求上下文内正常失效。
    if (process.env.NODE_ENV !== "test") {
      console.warn("[AdminStats] 失效缓存失败:", error);
    }
  }
}
