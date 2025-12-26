/**
 * 积分记录页面
 */
import { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentLoginUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import PointsList from "./PointsList";

export const metadata: Metadata = {
  title: "积分记录 - 你好朵朵",
  description: "查看您的积分明细",
};

interface PointsPageProps {
  searchParams: Promise<{ page?: string }>;
}

export default async function PointsPage({ searchParams }: PointsPageProps) {
  const user = await getCurrentLoginUser();
  
  if (!user) {
    redirect("/login?redirect=/user/points");
  }

  const params = await searchParams;
  const page = parseInt(params.page || "1");
  const pageSize = 20;

  // 获取积分记录
  const [records, total, userInfo] = await Promise.all([
    prisma.pointRecord.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.pointRecord.count({ where: { userId: user.id } }),
    prisma.user.findUnique({
      where: { id: user.id },
      select: { points: true, totalPoints: true },
    }),
  ]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 积分概览 */}
      <div className="bg-gradient-to-r from-amber-500 to-orange-500 text-white">
        <div className="container mx-auto px-4 py-8">
          <div className="text-center">
            <p className="text-white/80 text-sm mb-1">当前积分</p>
            <p className="text-4xl font-bold">{userInfo?.points ?? 0}</p>
            <p className="text-white/60 text-sm mt-2">
              累计获得 {userInfo?.totalPoints ?? 0} 积分
            </p>
          </div>
        </div>
      </div>

      {/* 积分记录 */}
      <div className="container mx-auto px-4 py-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">积分明细</h2>
        
        {records.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl">
            <p className="text-gray-500">暂无积分记录</p>
          </div>
        ) : (
          <PointsList 
            records={records} 
            pagination={{
              page,
              pageSize,
              total,
              totalPages: Math.ceil(total / pageSize),
            }}
          />
        )}
      </div>
    </div>
  );
}

