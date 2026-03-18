import HomeClient from "@/components/website/HomeClient";
// ISR: 首页每小时重新验证一次
export const revalidate = 3600;

/**
 * 首页 - 简洁品牌布局
 * 双入口：AI 护肤顾问 + 产品浏览
 */
export default async function Home() {
  return <HomeClient />;
}

