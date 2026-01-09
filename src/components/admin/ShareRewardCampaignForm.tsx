"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
    Save,
    ArrowLeft,
    Calendar,
    Gift,
    Image as ImageIcon,
    Type,
    Check
} from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { MediaPicker } from "@/components/admin/MediaPicker";
import Image from "next/image";
import { Button } from "@/components/ui/Button";

interface PosterConfigItem {
    x: number;
    y: number;
    fontSize?: number;
    color?: string;
    width?: number; // for QR code
    height?: number; // for QR code
}

interface WebCampaignConfig {
    score: PosterConfigItem;
    percentile: PosterConfigItem;
    code: PosterConfigItem; // QR code
    nickname?: PosterConfigItem;
}

export interface CampaignFormData {
    id?: string;
    name: string;
    description: string;
    startDate: string;
    endDate: string;
    purchaseStartDate: string;
    purchaseEndDate: string;
    rewardType: "coupon" | "sample";
    rewardDescription: string;
    posterTemplate: string;
    posterConfig: WebCampaignConfig;
    isActive: boolean;
}

const DEFAULT_CONFIG: WebCampaignConfig = {
    score: { x: 540, y: 800, fontSize: 80, color: "#D4A574" },
    percentile: { x: 540, y: 950, fontSize: 40, color: "#333333" },
    code: { x: 540, y: 1500, width: 200, height: 200 },
    nickname: { x: 540, y: 400, fontSize: 40, color: "#333333" }
};

// 格式化日期为本地 datetime-local 格式 (YYYY-MM-DDTHH:mm)
function formatDateTimeLocal(dateStr: string): string {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${year}-${month}-${day}T${hours}:${minutes}`;
}

// 格式化日期为本地 date 格式 (YYYY-MM-DD)
function formatDateLocal(dateStr: string): string {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

interface ShareRewardCampaignFormProps {
    initialData?: CampaignFormData;
    mode: "create" | "edit";
}

export function ShareRewardCampaignForm({ initialData, mode }: ShareRewardCampaignFormProps) {
    const router = useRouter();
    const toast = useToast();
    const [loading, setLoading] = useState(false);
    const [showMediaPicker, setShowMediaPicker] = useState(false);

    const [formData, setFormData] = useState<CampaignFormData>(initialData || {
        name: "",
        description: "",
        startDate: "",
        endDate: "",
        purchaseStartDate: "",
        purchaseEndDate: "",
        rewardType: "sample",
        rewardDescription: "",
        posterTemplate: "",
        posterConfig: DEFAULT_CONFIG,
        isActive: false,
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            const url = mode === "create"
                ? "/api/admin/share-reward/campaigns"
                : `/api/admin/share-reward/campaigns/${initialData?.id}`;

            const method = mode === "create" ? "POST" : "PUT";

            const res = await fetch(url, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(formData),
            });

            if (!res.ok) throw new Error("操作失败");

            toast.success(mode === "create" ? "活动创建成功" : "活动更新成功");
            router.push("/admin/share-reward/campaigns");
            router.refresh();
        } catch (error) {
            console.error(error);
            toast.error("操作失败");
        } finally {
            setLoading(false);
        }
    };

    const updateConfig = (key: keyof WebCampaignConfig, field: string, value: string | number) => {
        setFormData(prev => ({
            ...prev,
            posterConfig: {
                ...prev.posterConfig,
                [key]: {
                    ...prev.posterConfig[key],
                    [field]: typeof value === "string" && !isNaN(Number(value)) && !field.includes("color")
                        ? Number(value)
                        : value
                }
            }
        }));
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-8 pb-12">
            {/* 头部 */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <button
                        type="button"
                        onClick={() => router.back()}
                        className="rounded-full p-2 hover:bg-gray-100"
                    >
                        <ArrowLeft className="h-6 w-6" />
                    </button>
                    <div>
                        <h1 className="text-2xl font-semibold text-gray-900">
                            {mode === "create" ? "新建分享有礼活动" : "编辑活动"}
                        </h1>
                        <p className="text-sm text-gray-500">
                            配置活动信息、奖励规则及海报模板
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <button
                        type="submit"
                        disabled={loading}
                        className="inline-flex items-center gap-2 rounded-lg bg-brand-gold px-6 py-2.5 text-sm font-medium text-white hover:bg-brand-gold/90 disabled:opacity-50"
                    >
                        {loading ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <Save className="h-4 w-4" />}
                        保存配置
                    </button>
                </div>
            </div>

            <div className="grid gap-8 lg:grid-cols-3">
                {/* 左侧：基本信息 */}
                <div className="space-y-6 lg:col-span-2">
                    {/* 1. 基本信息卡片 */}
                    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                        <h3 className="mb-4 flex items-center gap-2 text-lg font-medium text-gray-900">
                            <Gift className="h-5 w-5 text-brand-gold" />
                            基本信息
                        </h3>
                        <div className="grid gap-6">
                            <div>
                                <label className="mb-2 block text-sm font-medium text-gray-700">活动名称</label>
                                <input
                                    type="text"
                                    required
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full rounded-lg border border-gray-300 px-4 py-2 outline-none focus:border-brand-gold focus:ring-1 focus:ring-brand-gold"
                                    placeholder="例如：2026新年分享有礼"
                                />
                            </div>

                            <div>
                                <label className="mb-2 block text-sm font-medium text-gray-700">活动描述（规则）</label>
                                <textarea
                                    rows={4}
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    className="w-full rounded-lg border border-gray-300 px-4 py-2 outline-none focus:border-brand-gold focus:ring-1 focus:ring-brand-gold"
                                    placeholder="展示给用户的活动规则说明..."
                                />
                            </div>

                            <div className="grid gap-4 sm:grid-cols-2">
                                <div>
                                    <label className="mb-2 block text-sm font-medium text-gray-700">奖励类型</label>
                                    <select
                                        value={formData.rewardType}
                                        onChange={(e) => setFormData({ ...formData, rewardType: e.target.value as "coupon" | "sample" })}
                                        className="w-full rounded-lg border border-gray-300 px-4 py-2 outline-none focus:border-brand-gold focus:ring-1 focus:ring-brand-gold"
                                    >
                                        <option value="sample">实物小样</option>
                                        <option value="coupon">代金券</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="mb-2 block text-sm font-medium text-gray-700">奖励内容描述</label>
                                    <input
                                        type="text"
                                        required
                                        value={formData.rewardDescription}
                                        onChange={(e) => setFormData({ ...formData, rewardDescription: e.target.value })}
                                        className="w-full rounded-lg border border-gray-300 px-4 py-2 outline-none focus:border-brand-gold focus:ring-1 focus:ring-brand-gold"
                                        placeholder="例如：光蕴精华体验装 5ml"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* 2. 时间设置卡片 */}
                    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                        <h3 className="mb-4 flex items-center gap-2 text-lg font-medium text-gray-900">
                            <Calendar className="h-5 w-5 text-brand-gold" />
                            时间设置
                        </h3>
                        <div className="grid gap-6 sm:grid-cols-2">
                            <div>
                                <label className="mb-2 block text-sm font-medium text-gray-700">活动开始时间</label>
                                <input
                                    type="datetime-local"
                                    required
                                    value={formData.startDate ? formatDateTimeLocal(formData.startDate) : ""}
                                    onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                                    className="w-full rounded-lg border border-gray-300 px-4 py-2 outline-none focus:border-brand-gold focus:ring-1 focus:ring-brand-gold"
                                />
                            </div>
                            <div>
                                <label className="mb-2 block text-sm font-medium text-gray-700">活动结束时间</label>
                                <input
                                    type="datetime-local"
                                    required
                                    value={formData.endDate ? formatDateTimeLocal(formData.endDate) : ""}
                                    onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                                    className="w-full rounded-lg border border-gray-300 px-4 py-2 outline-none focus:border-brand-gold focus:ring-1 focus:ring-brand-gold"
                                />
                            </div>
                            <div>
                                <label className="mb-2 block text-sm font-medium text-gray-700">购买凭证起始日期</label>
                                <input
                                    type="date"
                                    required
                                    value={formData.purchaseStartDate ? formatDateLocal(formData.purchaseStartDate) : ""}
                                    onChange={(e) => setFormData({ ...formData, purchaseStartDate: e.target.value })}
                                    className="w-full rounded-lg border border-gray-300 px-4 py-2 outline-none focus:border-brand-gold focus:ring-1 focus:ring-brand-gold"
                                />
                            </div>
                            <div>
                                <label className="mb-2 block text-sm font-medium text-gray-700">购买凭证截止日期</label>
                                <input
                                    type="date"
                                    required
                                    value={formData.purchaseEndDate ? formatDateLocal(formData.purchaseEndDate) : ""}
                                    onChange={(e) => setFormData({ ...formData, purchaseEndDate: e.target.value })}
                                    className="w-full rounded-lg border border-gray-300 px-4 py-2 outline-none focus:border-brand-gold focus:ring-1 focus:ring-brand-gold"
                                />
                            </div>
                        </div>
                    </div>

                    {/* 3. 海报填充配置 */}
                    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                        <h3 className="mb-4 flex items-center gap-2 text-lg font-medium text-gray-900">
                            <Type className="h-5 w-5 text-brand-gold" />
                            海报文字/图片坐标配置
                        </h3>
                        <p className="mb-4 text-sm text-gray-500">
                            请根据海报模板尺寸（建议 1080x1920），配置各元素的左上角坐标 (X, Y) 及样式。
                        </p>

                        <div className="space-y-6">
                            {/* 肌肤评分 */}
                            <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
                                <h4 className="mb-3 font-medium text-gray-900">1. 肌肤评分 (Score)</h4>
                                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                                    <div>
                                        <label className="text-xs text-gray-500">X 坐标</label>
                                        <input type="number" value={formData.posterConfig.score.x} onChange={(e) => updateConfig("score", "x", e.target.value)} className="w-full rounded border p-1" />
                                    </div>
                                    <div>
                                        <label className="text-xs text-gray-500">Y 坐标</label>
                                        <input type="number" value={formData.posterConfig.score.y} onChange={(e) => updateConfig("score", "y", e.target.value)} className="w-full rounded border p-1" />
                                    </div>
                                    <div>
                                        <label className="text-xs text-gray-500">字号</label>
                                        <input type="number" value={formData.posterConfig.score.fontSize} onChange={(e) => updateConfig("score", "fontSize", e.target.value)} className="w-full rounded border p-1" />
                                    </div>
                                    <div>
                                        <label className="text-xs text-gray-500">颜色</label>
                                        <input type="color" value={formData.posterConfig.score.color} onChange={(e) => updateConfig("score", "color", e.target.value)} className="h-8 w-full rounded border p-0.5" />
                                    </div>
                                </div>
                            </div>

                            {/* 超越比例 */}
                            <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
                                <h4 className="mb-3 font-medium text-gray-900">2. 超越比例 (Percentile)</h4>
                                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                                    <div>
                                        <label className="text-xs text-gray-500">X 坐标</label>
                                        <input type="number" value={formData.posterConfig.percentile.x} onChange={(e) => updateConfig("percentile", "x", e.target.value)} className="w-full rounded border p-1" />
                                    </div>
                                    <div>
                                        <label className="text-xs text-gray-500">Y 坐标</label>
                                        <input type="number" value={formData.posterConfig.percentile.y} onChange={(e) => updateConfig("percentile", "y", e.target.value)} className="w-full rounded border p-1" />
                                    </div>
                                    <div>
                                        <label className="text-xs text-gray-500">字号</label>
                                        <input type="number" value={formData.posterConfig.percentile.fontSize} onChange={(e) => updateConfig("percentile", "fontSize", e.target.value)} className="w-full rounded border p-1" />
                                    </div>
                                    <div>
                                        <label className="text-xs text-gray-500">颜色</label>
                                        <input type="color" value={formData.posterConfig.percentile.color} onChange={(e) => updateConfig("percentile", "color", e.target.value)} className="h-8 w-full rounded border p-0.5" />
                                    </div>
                                </div>
                            </div>

                            {/* 二维码 */}
                            <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
                                <h4 className="mb-3 font-medium text-gray-900">3. 专属二维码/Activity Code</h4>
                                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                                    <div>
                                        <label className="text-xs text-gray-500">X 坐标</label>
                                        <input type="number" value={formData.posterConfig.code.x} onChange={(e) => updateConfig("code", "x", e.target.value)} className="w-full rounded border p-1" />
                                    </div>
                                    <div>
                                        <label className="text-xs text-gray-500">Y 坐标</label>
                                        <input type="number" value={formData.posterConfig.code.y} onChange={(e) => updateConfig("code", "y", e.target.value)} className="w-full rounded border p-1" />
                                    </div>
                                    <div>
                                        <label className="text-xs text-gray-500">宽度</label>
                                        <input type="number" value={formData.posterConfig.code.width} onChange={(e) => updateConfig("code", "width", e.target.value)} className="w-full rounded border p-1" />
                                    </div>
                                    <div>
                                        <label className="text-xs text-gray-500">高度</label>
                                        <input type="number" value={formData.posterConfig.code.height} onChange={(e) => updateConfig("code", "height", e.target.value)} className="w-full rounded border p-1" />
                                    </div>
                                </div>
                            </div>

                            {/* 昵称 */}
                            <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
                                <h4 className="mb-3 font-medium text-gray-900">4. 用户昵称 (Nickname)</h4>
                                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                                    <div>
                                        <label className="text-xs text-gray-500">X 坐标</label>
                                        <input type="number" value={formData.posterConfig.nickname?.x || 0} onChange={(e) => updateConfig("nickname", "x", e.target.value)} className="w-full rounded border p-1" />
                                    </div>
                                    <div>
                                        <label className="text-xs text-gray-500">Y 坐标</label>
                                        <input type="number" value={formData.posterConfig.nickname?.y || 0} onChange={(e) => updateConfig("nickname", "y", e.target.value)} className="w-full rounded border p-1" />
                                    </div>
                                    <div>
                                        <label className="text-xs text-gray-500">字号</label>
                                        <input type="number" value={formData.posterConfig.nickname?.fontSize || 40} onChange={(e) => updateConfig("nickname", "fontSize", e.target.value)} className="w-full rounded border p-1" />
                                    </div>
                                    <div>
                                        <label className="text-xs text-gray-500">颜色</label>
                                        <input type="color" value={formData.posterConfig.nickname?.color || "#000000"} onChange={(e) => updateConfig("nickname", "color", e.target.value)} className="h-8 w-full rounded border p-0.5" />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 右侧：海报模板 & 状态 */}
                <div className="space-y-6">
                    {/* 海报模板 */}
                    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                        <h3 className="mb-4 flex items-center gap-2 text-lg font-medium text-gray-900">
                            <ImageIcon className="h-5 w-5 text-brand-gold" />
                            海报模板
                        </h3>
                        <div className="space-y-4">
                            {formData.posterTemplate && (
                                <div className="relative aspect-[9/16] w-full overflow-hidden rounded-lg border border-gray-200">
                                    <Image
                                        src={formData.posterTemplate}
                                        alt="海报模板"
                                        fill
                                        className="object-cover"
                                    />
                                </div>
                            )}
                            <Button
                                type="button"
                                variant="outline"
                                className="w-full"
                                onClick={() => setShowMediaPicker(true)}
                            >
                                {formData.posterTemplate ? "更换图片" : "选择图片"}
                            </Button>

                            <MediaPicker
                                isOpen={showMediaPicker}
                                onClose={() => setShowMediaPicker(false)}
                                onSelect={(url) => setFormData({ ...formData, posterTemplate: url })}
                                title="选择海报背景图"
                            />

                            <p className="text-xs text-gray-500">
                                支持 PNG/JPG，建议尺寸 1080x1920px。
                                <br />
                                请预留好填充区域的空白位置。
                            </p>
                        </div>
                    </div>

                    {/* 状态控制 */}
                    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                        <h3 className="mb-4 flex items-center gap-2 text-lg font-medium text-gray-900">
                            <Check className="h-5 w-5 text-brand-gold" />
                            发布状态
                        </h3>
                        <div className="flex items-center gap-2">
                            <label className="relative inline-flex cursor-pointer items-center">
                                <input
                                    type="checkbox"
                                    className="peer sr-only"
                                    checked={formData.isActive}
                                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                                />
                                <div className="peer h-6 w-11 rounded-full bg-gray-200 after:absolute after:start-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-brand-gold peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-brand-gold/30"></div>
                                <span className="ms-3 text-sm font-medium text-gray-700">
                                    {formData.isActive ? "已启用" : "已停用"}
                                </span>
                            </label>
                        </div>
                        <p className="mt-2 text-xs text-gray-500">
                            启用后将在用户端可见。请确保当前没有其他正在进行中的活动。
                        </p>
                    </div>
                </div>
            </div>
        </form>
    );
}
