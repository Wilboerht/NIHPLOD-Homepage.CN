"use client";

import { useEffect, useState } from "react";
import { ShareRewardCampaignForm, CampaignFormData } from "@/components/admin/ShareRewardCampaignForm";
import { Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/Toast";

interface PageProps {
    params: { id: string };
}

export default function EditCampaignPage({ params }: PageProps) {
    const { id } = params;
    const [data, setData] = useState<CampaignFormData | null>(null);
    const [loading, setLoading] = useState(true);
    const toast = useToast();

    useEffect(() => {
        fetch(`/api/admin/share-reward/campaigns/${id}`)
            .then(res => res.json())
            .then(res => {
                if (res.success) {
                    // 处理日期格式
                    const campaign = res.data;
                    setData({
                        ...campaign,
                        // 确保 posterConfig 有默认值
                        posterConfig: campaign.posterConfig || {
                            score: { x: 540, y: 800, fontSize: 80, color: "#D4A574" },
                            percentile: { x: 540, y: 950, fontSize: 40, color: "#333333" },
                            code: { x: 540, y: 1500, width: 200, height: 200 },
                            nickname: { x: 540, y: 400, fontSize: 40, color: "#333333" }
                        }
                    });
                } else {
                    toast.error("加载失败");
                }
            })
            .catch(err => {
                console.error(err);
                toast.error("加载失败");
            })
            .finally(() => setLoading(false));
    }, [id, toast]);

    if (loading) {
        return (
            <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            </div>
        );
    }

    if (!data) return null;

    return (
        <div className="max-w-7xl mx-auto">
            <ShareRewardCampaignForm mode="edit" initialData={data} />
        </div>
    );
}
