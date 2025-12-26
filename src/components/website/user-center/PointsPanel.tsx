"use client";

import { useState, useEffect } from "react";
import { Star, TrendingUp, TrendingDown, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

interface PointRecord {
  id: string;
  type: "EARN" | "SPEND";
  amount: number;
  description: string;
  createdAt: string;
}

export function PointsPanel() {
  const { user } = useAuth();
  const [records, setRecords] = useState<PointRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRecords = async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/user/points");
        const data = await res.json();
        if (data.success) setRecords(data.data.records || []);
      } catch (e) {
        console.error("获取积分记录失败:", e);
      } finally {
        setLoading(false);
      }
    };
    fetchRecords();
  }, []);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return `${date.getMonth() + 1}月${date.getDate()}日 ${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex-shrink-0 p-6 pb-4">
        <h2 className="text-xl text-[#5C5347] font-light">护肤点数</h2>
        <p className="text-[#A69B8C] text-sm mt-1">用于AI护肤顾问对话</p>
      </div>

      {/* 点数卡片 */}
      <div className="mx-6 mb-4 bg-gradient-to-r from-[#A69374] to-[#C4B896] rounded-xl p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-white/80 text-sm">当前点数</p>
            <p className="text-4xl font-light mt-1">{user?.points || 0}</p>
          </div>
          <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center">
            <Star className="w-7 h-7 text-white" />
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-white/20">
          <p className="text-white/60 text-xs">购物和分享可获得点数，用于与AI护肤顾问对话</p>
        </div>
      </div>

      {/* 记录列表 */}
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 text-[#A69374] animate-spin" />
          </div>
        ) : records.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 mx-auto rounded-full bg-[#F5F2ED] flex items-center justify-center mb-4">
              <Star className="w-8 h-8 text-[#C4BDB2]" />
            </div>
            <p className="text-[#8B8579]">暂无点数记录</p>
          </div>
        ) : (
          <div className="space-y-2">
            {records.map((record) => (
              <div key={record.id} className="flex items-center gap-4 bg-white/80 rounded-xl p-4 border border-[#E8E3DC]">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${record.type === "EARN" ? "bg-emerald-50" : "bg-amber-50"}`}>
                  {record.type === "EARN" ? (
                    <TrendingUp className="w-5 h-5 text-emerald-500" />
                  ) : (
                    <TrendingDown className="w-5 h-5 text-amber-500" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[#5C5347] text-sm truncate">{record.description}</p>
                  <p className="text-[#A69B8C] text-xs mt-0.5">{formatDate(record.createdAt)}</p>
                </div>
                <span className={`text-lg font-medium ${record.type === "EARN" ? "text-emerald-500" : "text-amber-500"}`}>
                  {record.type === "EARN" ? "+" : "-"}{record.amount}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

