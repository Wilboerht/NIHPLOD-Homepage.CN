"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
    Plus,
    Gift,
    Calendar,
    Users,
    Edit,
    Trash2,
    Eye,
    Loader2,
    ImageIcon,
    ToggleLeft,
    ToggleRight
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/Badge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";

interface Campaign {
    id: string;
    name: string;
    description?: string;
    startDate: string;
    endDate: string;
    purchaseStartDate: string;
    purchaseEndDate: string;
    rewardType: string;
    rewardDescription: string;
    posterTemplate?: string;
    isActive: boolean;
    createdAt: string;
    _count: {
        submissions: number;
    };
}

const REWARD_TYPE_LABELS: Record<string, string> = {
    coupon: "代金券",
    sample: "实物小样",
};

export default function ShareRewardCampaignsPage() {
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [loading, setLoading] = useState(true);
    const [deleteId, setDeleteId] = useState<string | null>(null);
    const [deleting, setDeleting] = useState(false);
    const toast = useToast();

    // 获取活动列表
    const fetchCampaigns = useCallback(async () => {
        try {
            const res = await fetch("/api/admin/share-reward/campaigns");
            const data = await res.json();
            if (data.success) {
                setCampaigns(data.data);
            }
        } catch (error) {
            console.error("获取活动列表失败:", error);
            toast.error("获取活动列表失败");
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        fetchCampaigns();
    }, [fetchCampaigns]);

    // 格式化日期
    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString("zh-CN", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
        });
    };

    // 切换活动状态
    const handleToggleActive = async (campaign: Campaign) => {
        try {
            const res = await fetch(`/api/admin/share-reward/campaigns/${campaign.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ isActive: !campaign.isActive }),
            });

            if (res.ok) {
                toast.success(campaign.isActive ? "活动已停用" : "活动已启用");
                fetchCampaigns();
            }
        } catch (error) {
            console.error("切换状态失败:", error);
            toast.error("操作失败");
        }
    };

    // 删除活动
    const handleDelete = async () => {
        if (!deleteId) return;

        setDeleting(true);
        try {
            const res = await fetch(`/api/admin/share-reward/campaigns/${deleteId}`, {
                method: "DELETE",
            });

            if (res.ok) {
                toast.success("活动已删除");
                fetchCampaigns();
            }
        } catch (error) {
            console.error("删除失败:", error);
            toast.error("删除失败");
        } finally {
            setDeleting(false);
            setDeleteId(null);
        }
    };

    // 判断活动状态
    const getStatus = (campaign: Campaign) => {
        const now = new Date();
        const start = new Date(campaign.startDate);
        const end = new Date(campaign.endDate);

        if (!campaign.isActive) {
            return { label: "已停用", variant: "default" as const };
        }
        if (now < start) {
            return { label: "未开始", variant: "warning" as const };
        }
        if (now > end) {
            return { label: "已结束", variant: "default" as const };
        }
        return { label: "进行中", variant: "success" as const };
    };

    return (
        <div className="space-y-6">
            {/* 页头 */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-semibold text-gray-900">分享有礼活动</h1>
                    <p className="mt-1 text-sm text-gray-500">
                        管理分享有礼活动配置
                    </p>
                </div>
                <Link
                    href="/admin/share-reward/campaigns/new"
                    className="inline-flex items-center gap-2 rounded-lg bg-brand-gold px-4 py-2 text-sm font-medium text-white hover:bg-brand-gold/90"
                >
                    <Plus className="h-4 w-4" />
                    新建活动
                </Link>
            </div>

            {/* 快捷操作 */}
            <div className="flex gap-4">
                <Link
                    href="/admin/share-reward/submissions"
                    className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                    <Users className="h-4 w-4" />
                    审核管理
                </Link>
            </div>

            {/* 活动列表 */}
            {loading ? (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                </div>
            ) : campaigns.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-200 py-12">
                    <Gift className="h-12 w-12 text-gray-400" />
                    <p className="mt-2 text-sm text-gray-500">暂无活动</p>
                    <Link
                        href="/admin/share-reward/campaigns/new"
                        className="mt-4 text-sm text-brand-gold hover:underline"
                    >
                        创建第一个活动
                    </Link>
                </div>
            ) : (
                <div className="grid gap-4">
                    {campaigns.map((campaign) => {
                        const status = getStatus(campaign);
                        return (
                            <div
                                key={campaign.id}
                                className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-4 hover:shadow-sm"
                            >
                                <div className="flex items-center gap-4">
                                    {/* 海报缩略图 */}
                                    <div className="flex h-16 w-12 items-center justify-center rounded bg-gray-100">
                                        {campaign.posterTemplate ? (
                                            <img
                                                src={campaign.posterTemplate}
                                                alt=""
                                                className="h-full w-full rounded object-cover"
                                            />
                                        ) : (
                                            <ImageIcon className="h-6 w-6 text-gray-400" />
                                        )}
                                    </div>

                                    {/* 活动信息 */}
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h3 className="font-medium text-gray-900">{campaign.name}</h3>
                                            <Badge variant={status.variant}>{status.label}</Badge>
                                            <Badge variant="default">
                                                {REWARD_TYPE_LABELS[campaign.rewardType] || campaign.rewardType}
                                            </Badge>
                                        </div>
                                        <div className="mt-1 flex items-center gap-4 text-sm text-gray-500">
                                            <span className="flex items-center gap-1">
                                                <Calendar className="h-4 w-4" />
                                                {formatDate(campaign.startDate)} - {formatDate(campaign.endDate)}
                                            </span>
                                            <span className="flex items-center gap-1">
                                                <Users className="h-4 w-4" />
                                                {campaign._count.submissions} 份提交
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* 操作按钮 */}
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => handleToggleActive(campaign)}
                                        className={cn(
                                            "rounded-lg p-2 transition-colors",
                                            campaign.isActive
                                                ? "text-green-600 hover:bg-green-50"
                                                : "text-gray-400 hover:bg-gray-100"
                                        )}
                                        title={campaign.isActive ? "停用" : "启用"}
                                    >
                                        {campaign.isActive ? (
                                            <ToggleRight className="h-5 w-5" />
                                        ) : (
                                            <ToggleLeft className="h-5 w-5" />
                                        )}
                                    </button>
                                    <Link
                                        href={`/admin/share-reward/campaigns/${campaign.id}`}
                                        className="rounded-lg p-2 text-gray-600 hover:bg-gray-100"
                                        title="编辑"
                                    >
                                        <Edit className="h-5 w-5" />
                                    </Link>
                                    <Link
                                        href={`/admin/share-reward/submissions?campaignId=${campaign.id}`}
                                        className="rounded-lg p-2 text-gray-600 hover:bg-gray-100"
                                        title="查看提交"
                                    >
                                        <Eye className="h-5 w-5" />
                                    </Link>
                                    <button
                                        onClick={() => setDeleteId(campaign.id)}
                                        className="rounded-lg p-2 text-red-600 hover:bg-red-50"
                                        title="删除"
                                    >
                                        <Trash2 className="h-5 w-5" />
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* 删除确认 */}
            <ConfirmDialog
                open={!!deleteId}
                onClose={() => setDeleteId(null)}
                onConfirm={handleDelete}
                title="删除活动"
                description="确定要删除这个活动吗？关联的提交记录也会被删除，此操作不可撤销。"
                confirmText="删除"
                loading={deleting}
                type="danger"
            />
        </div>
    );
}
