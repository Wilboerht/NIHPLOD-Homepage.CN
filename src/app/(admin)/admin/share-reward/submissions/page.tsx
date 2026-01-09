"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import {
    Filter,
    CheckCircle,
    XCircle,
    Loader2,
    Phone
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import { useSearchParams } from "next/navigation";

interface Submission {
    id: string;
    contact: string;
    shareProofUrl: string;
    purchaseProofUrl: string;
    skinScore?: number;
    percentile?: number;
    status: "pending" | "approved" | "rejected";
    rejectReason?: string;
    shippingStatus: "none" | "contacted" | "shipped";
    reviewedAt?: string;
    createdAt: string;
    campaign: {
        id: string;
        name: string;
    };
}

const STATUS_LABELS: Record<string, { label: string; variant: "default" | "success" | "danger" | "warning" }> = {
    pending: { label: "待审核", variant: "warning" },
    approved: { label: "已通过", variant: "success" },
    rejected: { label: "已拒绝", variant: "danger" },
};

function SubmissionsContent() {
    const searchParams = useSearchParams();
    const initialCampaignId = searchParams.get("campaignId") || "";

    const [submissions, setSubmissions] = useState<Submission[]>([]);
    const [loading, setLoading] = useState(true);
    const [campaignId, setCampaignId] = useState(initialCampaignId);
    const [statusFilter, setStatusFilter] = useState("");
    const [campaigns, setCampaigns] = useState<{ id: string, name: string }[]>([]);

    // 预览图片
    const [previewImage, setPreviewImage] = useState<string | null>(null);

    // 审核操作
    const [processingId, setProcessingId] = useState<string | null>(null);
    const toast = useToast();

    // 获取活动列表用于筛选
    useEffect(() => {
        fetch("/api/admin/share-reward/campaigns")
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    setCampaigns(data.data);
                }
            });
    }, []);

    // 获取提交列表
    const fetchSubmissions = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (campaignId) params.append("campaignId", campaignId);
            if (statusFilter) params.append("status", statusFilter);

            const res = await fetch(`/api/admin/share-reward/submissions?${params.toString()}`);
            const data = await res.json();
            if (data.success) {
                setSubmissions(data.data);
            }
        } catch (error) {
            console.error("Failed to fetch submissions:", error);
            toast.error("获取列表失败");
        } finally {
            setLoading(false);
        }
    }, [campaignId, statusFilter, toast]);

    useEffect(() => {
        fetchSubmissions();
    }, [fetchSubmissions]);

    // 更新状态
    const handleUpdateStatus = async (id: string, newStatus: string, reason?: string) => {
        setProcessingId(id);
        try {
            const res = await fetch(`/api/admin/share-reward/submissions/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    status: newStatus,
                    rejectReason: reason
                }),
            });

            if (res.ok) {
                toast.success("操作成功");
                fetchSubmissions();
            }
        } catch (error) {
            console.error("Update failed:", error);
            toast.error("操作失败");
        } finally {
            setProcessingId(null);
        }
    };

    // 更新发货状态
    const handleUpdateShipping = async (id: string, newStatus: string) => {
        setProcessingId(id);
        try {
            const res = await fetch(`/api/admin/share-reward/submissions/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ shippingStatus: newStatus }),
            });

            if (res.ok) {
                toast.success("状态更新成功");
                fetchSubmissions();
            }
        } catch (error) {
            console.error("Update failed:", error);
            toast.error("更新失败");
        } finally {
            setProcessingId(null);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-semibold text-gray-900">审核管理</h1>
                    <p className="mt-1 text-sm text-gray-500">
                        审核用户的分享和购买凭证
                    </p>
                </div>
            </div>

            {/* 筛选栏 */}
            <div className="flex gap-4 rounded-lg border border-gray-200 bg-white p-4">
                <div className="flex items-center gap-2">
                    <Filter className="h-4 w-4 text-gray-500" />
                    <span className="text-sm font-medium text-gray-700">筛选:</span>
                </div>

                <select
                    value={campaignId}
                    onChange={(e) => setCampaignId(e.target.value)}
                    className="rounded-md border border-gray-300 px-3 py-1.5 text-sm outline-none focus:border-brand-gold"
                >
                    <option value="">所有活动</option>
                    {campaigns.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                </select>

                <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="rounded-md border border-gray-300 px-3 py-1.5 text-sm outline-none focus:border-brand-gold"
                >
                    <option value="">所有状态</option>
                    <option value="pending">待审核</option>
                    <option value="approved">已通过</option>
                    <option value="rejected">已拒绝</option>
                </select>
            </div>

            {/* 列表 */}
            <div className="rounded-lg border border-gray-200 bg-white">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-gray-50 text-gray-500">
                            <tr>
                                <th className="px-4 py-3 font-medium">活动/联系方式</th>
                                <th className="px-4 py-3 font-medium">凭证截图</th>
                                <th className="px-4 py-3 font-medium">用户信息</th>
                                <th className="px-4 py-3 font-medium">状态</th>
                                <th className="px-4 py-3 font-medium">发货状态</th>
                                <th className="px-4 py-3 font-medium">提交时间</th>
                                <th className="px-4 py-3 font-medium text-right">操作</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {loading ? (
                                <tr>
                                    <td colSpan={7} className="py-12 text-center text-gray-500">
                                        <Loader2 className="mx-auto h-6 w-6 animate-spin" />
                                        <span className="mt-2 block">加载中...</span>
                                    </td>
                                </tr>
                            ) : submissions.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="py-12 text-center text-gray-500">
                                        暂无提交记录
                                    </td>
                                </tr>
                            ) : (
                                submissions.map((item) => (
                                    <tr key={item.id} className="hover:bg-gray-50/50">
                                        <td className="px-4 py-3">
                                            <div className="font-medium text-gray-900">{item.campaign.name}</div>
                                            <div className="mt-1 flex items-center gap-1 text-gray-500">
                                                <Phone className="h-3 w-3" />
                                                {item.contact}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex gap-2">
                                                {/* 分享截图 */}
                                                <div
                                                    className="relative h-12 w-12 cursor-pointer overflow-hidden rounded border border-gray-200 bg-gray-100 ring-offset-2 hover:ring-2 hover:ring-brand-gold"
                                                    onClick={() => setPreviewImage(item.shareProofUrl)}
                                                >
                                                    <img src={item.shareProofUrl} alt="分享截图" className="h-full w-full object-cover" />
                                                </div>
                                                {/* 购买截图 */}
                                                <div
                                                    className="relative h-12 w-12 cursor-pointer overflow-hidden rounded border border-gray-200 bg-gray-100 ring-offset-2 hover:ring-2 hover:ring-brand-gold"
                                                    onClick={() => setPreviewImage(item.purchaseProofUrl)}
                                                >
                                                    <img src={item.purchaseProofUrl} alt="购买截图" className="h-full w-full object-cover" />
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="space-y-0.5 text-gray-600">
                                                <div>肌肤评分: <span className="font-medium text-gray-900">{item.skinScore || "-"}</span></div>
                                                <div>超越: <span className="font-medium text-gray-900">{item.percentile || "-"}%</span></div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <Badge variant={STATUS_LABELS[item.status].variant}>
                                                {STATUS_LABELS[item.status].label}
                                            </Badge>
                                            {item.status === "rejected" && (
                                                <div className="mt-1 max-w-[200px] truncate text-xs text-red-500" title={item.rejectReason}>
                                                    原因: {item.rejectReason}
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            {item.status === "approved" ? (
                                                <select
                                                    value={item.shippingStatus}
                                                    onChange={(e) => handleUpdateShipping(item.id, e.target.value)}
                                                    disabled={!!processingId}
                                                    className="rounded border border-gray-200 bg-white px-2 py-1 text-xs outline-none focus:border-brand-gold"
                                                >
                                                    <option value="none">未发货</option>
                                                    <option value="contacted">已联系</option>
                                                    <option value="shipped">已发货</option>
                                                </select>
                                            ) : (
                                                <span className="text-gray-400">-</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-gray-500">
                                            {new Date(item.createdAt).toLocaleString("zh-CN")}
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            {item.status === "pending" && (
                                                <div className="flex justify-end gap-2">
                                                    <button
                                                        onClick={() => handleUpdateStatus(item.id, "approved")}
                                                        disabled={!!processingId}
                                                        className="rounded p-1 text-green-600 hover:bg-green-50"
                                                        title="通过"
                                                    >
                                                        <CheckCircle className="h-5 w-5" />
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            const reason = window.prompt("请输入拒绝理由:");
                                                            if (reason) handleUpdateStatus(item.id, "rejected", reason);
                                                        }}
                                                        disabled={!!processingId}
                                                        className="rounded p-1 text-red-600 hover:bg-red-50"
                                                        title="拒绝"
                                                    >
                                                        <XCircle className="h-5 w-5" />
                                                    </button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* 图片预览弹窗 */}
            {previewImage && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
                    onClick={() => setPreviewImage(null)}
                >
                    <div className="relative max-h-[90vh] max-w-[90vw] overflow-hidden rounded-lg bg-white">
                        <button
                            onClick={() => setPreviewImage(null)}
                            className="absolute right-4 top-4 z-10 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
                        >
                            ×
                        </button>
                        <img src={previewImage} alt="预览" className="max-h-[85vh] w-auto object-contain" />
                    </div>
                </div>
            )}
        </div>
    );
}

export default function SubmissionsPage() {
    return (
        <Suspense fallback={<div className="flex h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>}>
            <SubmissionsContent />
        </Suspense>
    );
}
