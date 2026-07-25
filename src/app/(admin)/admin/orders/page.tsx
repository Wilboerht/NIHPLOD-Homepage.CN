"use client";

/**
 * 订单管理页面
 */
import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Search, RefreshCw, Eye, Package } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import type { SelectOption } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Pagination } from "@/components/ui/Pagination";
import { TableRowSkeleton } from "@/components/ui/Skeleton";
import { apiGet } from "@/lib/api-client";

interface OrderItem {
  id: string;
  orderNo: string;
  status: string;
  totalAmount: string | number;
  payAmount: string | number;
  user: { id: string; nickname: string | null; phone: string | null };
  items: { productName: string }[];
  createdAt: string;
}

const ORDER_STATUS_MAP: Record<
  string,
  { label: string; color: "default" | "warning" | "success" | "danger" | "primary" }
> = {
  PENDING: { label: "待付款", color: "warning" },
  PAID: { label: "已支付", color: "primary" },
  PROCESSING: { label: "处理中", color: "primary" },
  SHIPPED: { label: "已发货", color: "success" },
  DELIVERED: { label: "已签收", color: "success" },
  COMPLETED: { label: "已完成", color: "default" },
  CANCELLED: { label: "已取消", color: "default" },
  REFUNDING: { label: "退款中", color: "danger" },
  REFUNDED: { label: "已退款", color: "default" },
};

const STATUS_OPTIONS: SelectOption[] = [
  { value: "all", label: "全部状态" },
  { value: "PENDING", label: "待付款" },
  { value: "PAID", label: "已支付" },
  { value: "PROCESSING", label: "处理中" },
  { value: "SHIPPED", label: "已发货" },
  { value: "DELIVERED", label: "已签收" },
  { value: "COMPLETED", label: "已完成" },
  { value: "REFUNDING", label: "退款中" },
  { value: "REFUNDED", label: "已退款" },
  { value: "CANCELLED", label: "已取消" },
];

export default function AdminOrdersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 20, total: 0, totalPages: 0 });

  const page = parseInt(searchParams.get("page") || "1");
  const status = searchParams.get("status") || "all";
  const search = searchParams.get("search") || "";
  const [searchInput, setSearchInput] = useState(search);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiGet<{ orders: OrderItem[]; pagination: typeof pagination }>(
        "/api/admin/orders",
        {
          page,
          status,
          search,
        }
      );
      setOrders(data.orders);
      setPagination(data.pagination);
    } catch {
      console.error("获取订单失败");
    } finally {
      setLoading(false);
    }
  }, [page, status, search]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const updateParams = (newParams: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(newParams).forEach(([k, v]) => {
      if (v) params.set(k, v);
      else params.delete(k);
    });
    if (!newParams.page) params.set("page", "1");
    router.push(`/admin/orders?${params.toString()}`);
  };

  return (
    <div className="space-y-6">
      {/* 页面头部 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-medium text-brand-charcoal">订单管理</h1>
          <p className="mt-1 text-sm text-brand-charcoal/50">
            管理所有客户订单{!loading && pagination.total > 0 ? `，共 ${pagination.total} 条` : ""}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          leftIcon={<RefreshCw className="h-4 w-4" />}
          onClick={fetchOrders}
        >
          刷新
        </Button>
      </div>

      {/* 筛选栏 */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl bg-white p-4 shadow-sm">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-brand-charcoal/40" />
          <Input
            placeholder="搜索订单号 / 手机号..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && updateParams({ search: searchInput })}
            className="pl-10"
          />
        </div>
        <Select
          options={STATUS_OPTIONS}
          value={status}
          onChange={(e) => updateParams({ status: e.target.value })}
          className="w-40"
        />
      </div>

      {/* 订单列表 */}
      <div className="overflow-hidden rounded-xl bg-white shadow-sm">
        {loading ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-brand-charcoal/10 bg-brand-charcoal/[0.02] text-left">
                <th className="px-5 py-3.5 font-medium text-brand-charcoal/60">订单号</th>
                <th className="px-5 py-3.5 font-medium text-brand-charcoal/60">用户</th>
                <th className="px-5 py-3.5 font-medium text-brand-charcoal/60">商品</th>
                <th className="px-5 py-3.5 font-medium text-brand-charcoal/60">金额</th>
                <th className="px-5 py-3.5 font-medium text-brand-charcoal/60">状态</th>
                <th className="px-5 py-3.5 font-medium text-brand-charcoal/60">时间</th>
                <th className="px-5 py-3.5 font-medium text-brand-charcoal/60">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-charcoal/[0.06]">
              {Array.from({ length: 8 }).map((_, i) => (
                <TableRowSkeleton key={i} columns={7} />
              ))}
            </tbody>
          </table>
        ) : orders.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center text-brand-charcoal/50">
            <Package className="mb-3 h-12 w-12 text-brand-charcoal/20" />
            <p className="text-base font-medium text-brand-charcoal/60">暂无订单</p>
            <p className="mt-1 text-sm">当前筛选条件下没有匹配的订单</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-brand-charcoal/10 bg-brand-charcoal/[0.02] text-left">
                    <th className="px-5 py-3.5 font-medium text-brand-charcoal/60">订单号</th>
                    <th className="px-5 py-3.5 font-medium text-brand-charcoal/60">用户</th>
                    <th className="px-5 py-3.5 font-medium text-brand-charcoal/60">商品</th>
                    <th className="px-5 py-3.5 font-medium text-brand-charcoal/60">金额</th>
                    <th className="px-5 py-3.5 font-medium text-brand-charcoal/60">状态</th>
                    <th className="px-5 py-3.5 font-medium text-brand-charcoal/60">时间</th>
                    <th className="px-5 py-3.5 font-medium text-brand-charcoal/60">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-charcoal/[0.06]">
                  {orders.map((order) => (
                    <tr
                      key={order.id}
                      className="transition-colors hover:bg-brand-charcoal/[0.02]"
                    >
                      <td className="px-5 py-3.5">
                        <span className="font-mono text-sm text-brand-charcoal">
                          {order.orderNo}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-brand-charcoal/80">
                        {order.user.nickname || order.user.phone || "-"}
                      </td>
                      <td className="max-w-[180px] truncate px-5 py-3.5 text-brand-charcoal/80">
                        {order.items[0]?.productName || "-"}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="font-medium text-brand-primary">
                          ¥{Number(order.payAmount).toFixed(2)}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <Badge variant={ORDER_STATUS_MAP[order.status]?.color || "default"}>
                          {ORDER_STATUS_MAP[order.status]?.label || order.status}
                        </Badge>
                      </td>
                      <td className="px-5 py-3.5 text-brand-charcoal/50">
                        {new Date(order.createdAt).toLocaleDateString("zh-CN")}
                      </td>
                      <td className="px-5 py-3.5">
                        <Link href={`/admin/orders/${order.id}`}>
                          <Button variant="ghost" size="sm" leftIcon={<Eye className="h-4 w-4" />}>
                            查看
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 分页 */}
            <div className="flex justify-center border-t border-brand-charcoal/10 px-5 py-3">
              <Pagination
                page={pagination.page}
                pageSize={pagination.pageSize}
                total={pagination.total}
                onChange={(p) => updateParams({ page: String(p) })}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
