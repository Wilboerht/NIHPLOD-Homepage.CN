"use client";

/**
 * 积分记录列表组件
 */
import Link from "next/link";
import type { PointRecord } from "@/generated/prisma/client";

// 积分类型文案
const TYPE_LABELS: Record<string, string> = {
  REGISTER_BONUS: "注册奖励",
  DAILY_SIGN_IN: "每日签到",
  SHARE_BONUS: "分享奖励",
  PURCHASE_REWARD: "消费返点",
  REVIEW_BONUS: "评价奖励",
  AI_QUESTION: "AI追问",
  LUCKY_DRAW: "抽奖消耗",
  ORDER_REFUND: "订单退款",
  ADMIN_ADJUST: "管理员调整",
};

interface PointsListProps {
  records: PointRecord[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export default function PointsList({ records, pagination }: PointsListProps) {
  return (
    <div className="space-y-3">
      {records.map((record) => (
        <div 
          key={record.id}
          className="bg-white rounded-xl p-4 flex items-center justify-between"
        >
          <div>
            <p className="font-medium text-gray-900">
              {TYPE_LABELS[record.type] || record.type}
            </p>
            <p className="text-sm text-gray-500">{record.description}</p>
            <p className="text-xs text-gray-400 mt-1">
              {new Date(record.createdAt).toLocaleString("zh-CN")}
            </p>
          </div>
          <div className="text-right">
            <p className={`text-lg font-bold ${
              record.amount > 0 ? "text-green-600" : "text-red-500"
            }`}>
              {record.amount > 0 ? "+" : ""}{record.amount}
            </p>
            <p className="text-xs text-gray-400">余额 {record.balance}</p>
          </div>
        </div>
      ))}

      {/* 分页 */}
      {pagination.totalPages > 1 && (
        <div className="flex justify-center gap-2 pt-4">
          {pagination.page > 1 && (
            <Link
              href={`/user/points?page=${pagination.page - 1}`}
              className="px-4 py-2 bg-white rounded-lg text-gray-600 hover:bg-gray-50"
            >
              上一页
            </Link>
          )}
          <span className="px-4 py-2 text-gray-500">
            {pagination.page} / {pagination.totalPages}
          </span>
          {pagination.page < pagination.totalPages && (
            <Link
              href={`/user/points?page=${pagination.page + 1}`}
              className="px-4 py-2 bg-white rounded-lg text-gray-600 hover:bg-gray-50"
            >
              下一页
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

