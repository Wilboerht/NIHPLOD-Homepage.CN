"use client";

/**
 * 订单管理页面
 */
import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Search, RefreshCw, Eye } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Select, SelectOption } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
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
  const [_pagination, setPagination] = useState({ page: 1, pageSize: 20, total: 0, totalPages: 0 });

  const page = parseInt(searchParams.get("page") || "1");
  const status = searchParams.get("status") || "all";
  const search = searchParams.get("search") || "";
  const [searchInput, setSearchInput] = useState(search);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiGet<{ orders: OrderItem[]; pagination: typeof _pagination }>(
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-brand-charcoal">订单管理</h1>
          <p className="mt-1 text-sm text-brand-charcoal/50">管理所有客户订单</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchOrders}>
          <RefreshCw className="mr-1 h-4 w-4" /> 刷新
        </Button>
      </div>

      {/* 筛选栏 */}
      <div className="flex flex-wrap gap-4 rounded-xl bg-white p-4 shadow-sm">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-charcoal/50" />
          <input
            type="text"
            placeholder="搜索订单号/手机号..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && updateParams({ search: searchInput })}
            className="w-full rounded-lg border py-2 pl-10 pr-4 text-sm"
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
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-brand-charcoal/50">
            <tr>
              <th className="px-4 py-3">订单号</th>
              <th className="px-4 py-3">用户</th>
              <th className="px-4 py-3">商品</th>
              <th className="px-4 py-3">金额</th>
              <th className="px-4 py-3">状态</th>
              <th className="px-4 py-3">时间</th>
              <th className="px-4 py-3">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-brand-charcoal/50">
                  加载中...
                </td>
              </tr>
            ) : orders.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-brand-charcoal/50">
                  暂无订单
                </td>
              </tr>
            ) : (
              orders.map((order) => (
                <tr key={order.id} className="hover:bg-brand-charcoal/[0.03]">
                  <td className="px-4 py-3 font-mono text-sm">{order.orderNo}</td>
                  <td className="px-4 py-3">{order.user.nickname || order.user.phone || "-"}</td>
                  <td className="max-w-[150px] truncate px-4 py-3">
                    {order.items[0]?.productName || "-"}
                  </td>
                  <td className="px-4 py-3 font-medium text-pink-500">
                    ¥{Number(order.payAmount).toFixed(2)}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={ORDER_STATUS_MAP[order.status]?.color || "default"}>
                      {ORDER_STATUS_MAP[order.status]?.label || order.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-brand-charcoal/50">
                    {new Date(order.createdAt).toLocaleDateString("zh-CN")}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <Link href={`/admin/orders/${order.id}`}>
                        <Button variant="ghost" size="sm">
                          <Eye className="h-4 w-4" />
                        </Button>
                      </Link>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
