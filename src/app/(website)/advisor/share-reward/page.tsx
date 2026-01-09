"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
    ArrowLeft,
    Download,
    Upload,
    Loader2,
    CheckCircle,
    AlertCircle,
    Gift
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/Toast";

interface Campaign {
    id: string;
    name: string;
    description: string;
    startDate: string;
    endDate: string;
    purchaseStartDate: string;
    purchaseEndDate: string;
    rewardType: "coupon" | "sample";
    rewardDescription: string;
}

function ShareRewardContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const toast = useToast();

    const [campaign, setCampaign] = useState<Campaign | null>(null);
    const [loading, setLoading] = useState(true);

    // 用户数据
    const skinScore = searchParams.get("score") || "0";
    const percentile = searchParams.get("percentile") || "0";
    const nickname = "您"; // 默认昵称，实际可从 UserStore 获取

    // 表单状态
    const [contact, setContact] = useState("");
    const [shareProof, setShareProof] = useState("");
    const [purchaseProof, setPurchaseProof] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [uploadingShare, setUploadingShare] = useState(false);
    const [uploadingPurchase, setUploadingPurchase] = useState(false);

    // 提交状态查询
    const [submissionStatus, setSubmissionStatus] = useState<{
        status: string;
        rejectReason?: string;
        shippingStatus?: string;
        createdAt: string;
    } | null>(null);

    // 1. 获取活动信息
    useEffect(() => {
        fetch("/api/advisor/share-reward/active")
            .then(res => res.json())
            .then(data => {
                if (data.success && data.data) {
                    setCampaign(data.data);
                }
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    const fetchStatus = useCallback(async () => {
        if (!campaign || !contact) return;
        try {
            const res = await fetch(`/api/advisor/share-reward/status?campaignId=${campaign.id}&contact=${contact}`);
            const data = await res.json();
            if (data.success && data.data) {
                setSubmissionStatus(data.data);
            } else {
                setSubmissionStatus(null);
            }
        } catch (error) {
            console.error(error);
        }
    }, [campaign, contact]);

    // 2. 检查之前的提交状态
    useEffect(() => {
        if (campaign && contact.length >= 11) {
            fetchStatus();
        }
    }, [campaign, contact, fetchStatus]);

    // 3. 上传图片处理
    const handleUpload = async (file: File, setUrl: (url: string) => void, setStatus: (loading: boolean) => void) => {
        setStatus(true);
        const formData = new FormData();
        formData.append("file", file);

        try {
            const res = await fetch("/api/upload", {
                method: "POST",
                body: formData,
            });
            const data = await res.json();
            if (data.url) {
                setUrl(data.url);
                toast.success("上传成功");
            } else {
                throw new Error(data.error || "上传失败");
            }
        } catch (error) {
            console.error(error);
            toast.error("上传失败，请重试");
        } finally {
            setStatus(false);
        }
    };

    // 4. 提交表单
    const handleSubmit = async () => {
        if (!campaign) return;
        if (!contact || !shareProof || !purchaseProof) {
            toast.warning("请填写完整信息");
            return;
        }

        setSubmitting(true);
        try {
            const res = await fetch("/api/advisor/share-reward/submit", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    campaignId: campaign.id,
                    contact,
                    shareProofUrl: shareProof,
                    purchaseProofUrl: purchaseProof,
                    skinScore: Number(skinScore),
                    percentile: Number(percentile)
                }),
            });

            const data = await res.json();
            if (data.success) {
                toast.success("提交成功！请等待审核");
                fetchStatus(); // 刷新状态
            } else {
                toast.error(data.error || "提交失败");
            }
        } catch (error) {
            console.error(error);
            toast.error("提交失败");
        } finally {
            setSubmitting(false);
        }
    };

    // 海报 URL
    const posterUrl = campaign
        ? `/api/advisor/share-reward/poster?campaignId=${campaign.id}&skinScore=${skinScore}&percentile=${percentile}&nickname=${nickname}&contact=${contact || "guest"}`
        : "";

    const downloadPoster = () => {
        if (!posterUrl) return;
        // 创建一个隐藏的 a 标签下载
        const link = document.createElement("a");
        link.href = posterUrl;
        link.download = `my-skin-report-${Date.now()}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success("开始下载海报");
    };

    if (loading) {
        return (
            <div className="flex h-screen items-center justify-center bg-stone-50">
                <Loader2 className="h-8 w-8 animate-spin text-stone-400" />
            </div>
        );
    }

    if (!campaign) {
        return (
            <div className="flex h-screen flex-col items-center justify-center bg-stone-50 px-4 text-center">
                <Gift className="mb-4 h-12 w-12 text-stone-300" />
                <h1 className="text-xl font-medium text-stone-800">暂无进行中的活动</h1>
                <p className="mt-2 text-stone-500">感谢您的关注，请留意后续活动通知。</p>
                <button
                    onClick={() => router.back()}
                    className="mt-6 flex items-center gap-2 text-brand-gold hover:underline"
                >
                    <ArrowLeft className="h-4 w-4" />
                    返回
                </button>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-stone-50 pb-20">
            {/* 顶部导航 */}
            <div className="sticky top-0 z-10 flex items-center bg-white/80 px-4 py-3 backdrop-blur-md">
                <button onClick={() => router.back()} className="rounded-full p-2 hover:bg-stone-100">
                    <ArrowLeft className="h-6 w-6 text-stone-800" />
                </button>
                <span className="ml-2 text-lg font-medium text-stone-800">分享有礼</span>
            </div>

            <div className="mx-auto max-w-md px-4 pt-6">
                {/* 活动信息 */}
                <div className="mb-8 rounded-2xl bg-white p-6 shadow-sm">
                    <span className="mb-3 inline-block rounded-full bg-brand-gold/10 px-2.5 py-0.5 text-xs font-semibold text-brand-gold hover:bg-brand-gold/20">
                        限时活动
                    </span>
                    <h1 className="text-2xl font-serif text-stone-900">{campaign.name}</h1>
                    <p className="mt-2 text-sm text-stone-600 leading-relaxed">
                        {campaign.description || "分享您的测肤报告，上传凭证即可领取精美礼品！"}
                    </p>
                    <div className="mt-4 rounded-lg bg-stone-50 p-4">
                        <h3 className="mb-2 text-sm font-medium text-stone-900">🎁 活动奖励</h3>
                        <p className="text-stone-600">{campaign.rewardDescription}</p>
                    </div>
                </div>

                {/* 步骤 1: 保存海报 */}
                <div className="mb-8 space-y-4">
                    <div className="flex items-center gap-3">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-gold text-xs text-white">1</span>
                        <h2 className="font-medium text-stone-900">保存专属海报并分享</h2>
                    </div>

                    <div className="relative overflow-hidden rounded-xl border border-stone-200 bg-white">
                        <div className="aspect-[9/16] w-full bg-stone-100 relative">
                            {/* 海报预览 - 这里直接用 img 显示 API 生成的图 */}
                            {/* 实际生产中可能需要 loading 状态 */}
                            <img
                                src={posterUrl}
                                alt="专属海报"
                                className="h-full w-full object-cover"
                            />
                            <button
                                onClick={downloadPoster}
                                className="absolute bottom-4 right-4 flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-lg text-brand-gold hover:scale-105 active:scale-95 transition-all"
                            >
                                <Download className="h-5 w-5" />
                            </button>
                        </div>
                    </div>
                    <p className="text-xs text-stone-500 px-1">
                        * 点击右下角按钮保存海报，分享至微信朋友圈、小红书等平台。
                    </p>
                </div>

                {/* 步骤 2: 填写信息并上传 */}
                <div className="mb-8 space-y-4">
                    <div className="flex items-center gap-3">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-gold text-xs text-white">2</span>
                        <h2 className="font-medium text-stone-900">填写信息并上传凭证</h2>
                    </div>

                    <div className="space-y-4 rounded-xl bg-white p-6 shadow-sm">
                        <div>
                            <label className="mb-1.5 block text-sm font-medium text-stone-700">联系方式</label>
                            <input
                                type="text"
                                value={contact}
                                onChange={(e) => setContact(e.target.value)}
                                placeholder="请输入手机号（将用于核对并发放奖励）"
                                className="w-full rounded-lg border border-stone-200 px-4 py-2.5 outline-none focus:border-brand-gold focus:ring-1 focus:ring-brand-gold text-sm"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            {/* 分享凭证 */}
                            <div>
                                <label className="mb-2 block text-xs font-medium text-stone-600">分享截图</label>
                                <div
                                    className="relative aspect-square cursor-pointer overflow-hidden rounded-lg border-2 border-dashed border-stone-200 bg-stone-50 hover:border-brand-gold/50"
                                    onClick={() => document.getElementById("upload-share")?.click()}
                                >
                                    {shareProof ? (
                                        <img src={shareProof} alt="" className="h-full w-full object-cover" />
                                    ) : (
                                        <div className="flex h-full flex-col items-center justify-center text-stone-400">
                                            {uploadingShare ? <Loader2 className="h-6 w-6 animate-spin" /> : <Upload className="h-6 w-6" />}
                                            <span className="mt-2 text-xs">点击上传</span>
                                        </div>
                                    )}
                                    <input
                                        id="upload-share"
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (file) handleUpload(file, setShareProof, setUploadingShare);
                                        }}
                                    />
                                </div>
                            </div>

                            {/* 购买凭证 */}
                            <div>
                                <label className="mb-2 block text-xs font-medium text-stone-600">购买截图</label>
                                <div
                                    className="relative aspect-square cursor-pointer overflow-hidden rounded-lg border-2 border-dashed border-stone-200 bg-stone-50 hover:border-brand-gold/50"
                                    onClick={() => document.getElementById("upload-purchase")?.click()}
                                >
                                    {purchaseProof ? (
                                        <img src={purchaseProof} alt="" className="h-full w-full object-cover" />
                                    ) : (
                                        <div className="flex h-full flex-col items-center justify-center text-stone-400">
                                            {uploadingPurchase ? <Loader2 className="h-6 w-6 animate-spin" /> : <Upload className="h-6 w-6" />}
                                            <span className="mt-2 text-xs">点击上传</span>
                                        </div>
                                    )}
                                    <input
                                        id="upload-purchase"
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (file) handleUpload(file, setPurchaseProof, setUploadingPurchase);
                                        }}
                                    />
                                </div>
                            </div>
                        </div>

                        <p className="text-xs text-stone-400">
                            购买凭证有效日期：{new Date(campaign.purchaseStartDate).toLocaleDateString()} - {new Date(campaign.purchaseEndDate).toLocaleDateString()}
                        </p>

                        <button
                            onClick={handleSubmit}
                            disabled={submitting || !contact || !shareProof || !purchaseProof || Boolean(submissionStatus && submissionStatus.status === 'pending') || Boolean(submissionStatus && submissionStatus.status === 'approved')}
                            className="w-full rounded-lg bg-stone-900 py-3 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {submitting ? "提交中..." :
                                submissionStatus?.status === 'pending' ? "审核中" :
                                    submissionStatus?.status === 'approved' ? "审核通过" :
                                        submissionStatus?.status === 'rejected' ? "重新提交" :
                                            "提交审核"}
                        </button>
                    </div>
                </div>

                {/* 状态展示 */}
                {submissionStatus && (
                    <div className={cn(
                        "rounded-xl p-4 border",
                        submissionStatus.status === "approved" ? "bg-green-50 border-green-100" :
                            submissionStatus.status === "rejected" ? "bg-red-50 border-red-100" :
                                "bg-yellow-50 border-yellow-100"
                    )}>
                        <div className="flex items-start gap-3">
                            {submissionStatus.status === "approved" ? <CheckCircle className="h-5 w-5 text-green-600 shrink-0" /> :
                                submissionStatus.status === "rejected" ? <AlertCircle className="h-5 w-5 text-red-600 shrink-0" /> :
                                    <Loader2 className="h-5 w-5 text-yellow-600 animate-spin shrink-0" />}

                            <div>
                                <h3 className={cn(
                                    "font-medium",
                                    submissionStatus.status === "approved" ? "text-green-900" :
                                        submissionStatus.status === "rejected" ? "text-red-900" :
                                            "text-yellow-900"
                                )}>
                                    {submissionStatus.status === "approved" ? "审核已通过" :
                                        submissionStatus.status === "rejected" ? "审核未通过" :
                                            "正在审核中"}
                                </h3>

                                {submissionStatus.status === "approved" && (
                                    <p className="mt-1 text-sm text-green-700">
                                        发货状态：{
                                            submissionStatus.shippingStatus === "shipped" ? "已发货" :
                                                submissionStatus.shippingStatus === "contacted" ? "客服已联系" :
                                                    "等待发货"
                                        }
                                    </p>
                                )}

                                {submissionStatus.status === "rejected" && submissionStatus.rejectReason && (
                                    <p className="mt-1 text-sm text-red-700">
                                        原因：{submissionStatus.rejectReason}
                                    </p>
                                )}

                                <p className="mt-2 text-xs opacity-60">
                                    提交时间：{new Date(submissionStatus.createdAt).toLocaleString()}
                                </p>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default function ShareRewardPage() {
    return (
        <Suspense fallback={<div className="flex h-screen items-center justify-center bg-stone-50"><Loader2 className="h-8 w-8 animate-spin text-stone-400" /></div>}>
            <ShareRewardContent />
        </Suspense>
    );
}
