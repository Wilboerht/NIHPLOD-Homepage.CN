/**
 * 用户订单列表页面
 * 自然纹理风格 - 米色/亚麻质感
 */
import { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentLoginUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import OrderList from "./OrderList";

export const metadata: Metadata = {
  title: "我的订单 | NIHPLOD 旎柏",
  description: "查看您的订单记录",
};

// 订单状态标签
const STATUS_TABS = [
  { key: "all", label: "全部" },
  { key: "PENDING", label: "待付款" },
  { key: "PAID", label: "已付款" },
  { key: "SHIPPED", label: "已发货" },
  { key: "COMPLETED", label: "已完成" },
];

interface OrdersPageProps {
  searchParams: Promise<{ status?: string; page?: string }>;
}

export default async function OrdersPage({ searchParams }: OrdersPageProps) {
  const user = await getCurrentLoginUser();

  if (!user) {
    redirect("/login?redirect=/user/orders");
  }

  const params = await searchParams;
  const status = params.status || "all";
  const page = parseInt(params.page || "1");
  const pageSize = 10;

  // 构建查询条件
  const where: Record<string, unknown> = { userId: user.id };
  if (status !== "all") {
    where.status = status;
  }

  // 获取订单列表
  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        items: {
          select: {
            id: true,
            productName: true,
            productImage: true,
            price: true,
            quantity: true,
          },
        },
      },
    }),
    prisma.order.count({ where }),
  ]);

  return (
    <div
      className="min-h-screen"
      style={{
        background: `
          linear-gradient(180deg, #FAF8F5 0%, #F5F2ED 50%, #EDE9E3 100%),
          url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")
        `,
        backgroundBlendMode: 'overlay',
      }}
    >
      {/* 页面头部 */}
      <div className="relative border-b border-[#D4CFC6]/50">
        <div className="container mx-auto px-4 pt-6 pb-4 md:pt-8 md:pb-6">
          {/* 返回按钮 */}
          <Link
            href="/user"
            className="inline-flex items-center gap-2 text-[#8B8579] hover:text-[#A69374] transition-colors mb-6 group"
          >
            <svg className="w-4 h-4 transform group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
            </svg>
            <span className="text-sm">返回</span>
          </Link>

          {/* 页面标题 */}
          <div className="text-center mb-6">
            <h1 className="text-2xl md:text-3xl font-light text-[#5C5347] tracking-wide mb-1">我的订单</h1>
            <p className="text-[#A69B8C] text-xs tracking-[0.2em] uppercase">My Orders</p>
          </div>

          {/* 状态标签 */}
          <div className="flex justify-center overflow-x-auto pb-2 -mx-4 px-4">
            <div className="inline-flex gap-1 p-1 bg-white/60 backdrop-blur-sm rounded-full shadow-sm border border-[#E8E3DC]">
              {STATUS_TABS.map((tab) => (
                <Link
                  key={tab.key}
                  href={`/user/orders${tab.key === "all" ? "" : `?status=${tab.key}`}`}
                  className={`
                    px-4 py-2 rounded-full text-sm transition-all duration-300 whitespace-nowrap
                    ${status === tab.key
                      ? "bg-[#A69374] text-white shadow-sm"
                      : "text-[#8B8579] hover:text-[#5C5347] hover:bg-white/80"
                    }
                  `}
                >
                  {tab.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 订单列表 */}
      <div className="container mx-auto px-4 py-6 md:py-8">
        {orders.length === 0 ? (
          <div className="text-center py-16">
            {/* 空状态插图 */}
            <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-white/80 border border-[#E8E3DC] mb-6 shadow-sm">
              <svg className="w-12 h-12 text-[#C4BDB2]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
            <p className="text-[#5C5347] text-lg mb-2">暂无订单</p>
            <p className="text-[#A69B8C] text-sm mb-8">探索我们的产品，开启护肤之旅</p>
            <Link
              href="/products"
              className="inline-flex items-center gap-2 px-6 py-3 bg-[#A69374] text-white rounded-full text-sm hover:bg-[#917F62] transition-colors shadow-sm"
            >
              <span>浏览产品</span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
        ) : (
          <OrderList
            orders={orders}
            pagination={{
              page,
              pageSize,
              total,
              totalPages: Math.ceil(total / pageSize),
            }}
            currentStatus={status}
          />
        )}
      </div>
    </div>
  );
}

