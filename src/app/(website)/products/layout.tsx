import { ReactNode } from "react";
import { ProductsShell } from "@/components/website/ProductsShell";
import { getVisibleCategories } from "./queries";

export const revalidate = 60;

/**
 * 产品路由共享布局
 * 抽屉容器、顶部导航在列表页与详情页之间保持挂载，
 * 详情页不再单独实现一套导航。
 */
export default async function ProductsLayout({ children }: { children: ReactNode }) {
  const categories = await getVisibleCategories();

  return <ProductsShell categories={categories}>{children}</ProductsShell>;
}
