"use client";

import { ShareRewardCampaignForm } from "@/components/admin/ShareRewardCampaignForm";

export default function NewCampaignPage() {
    return (
        <div className="max-w-7xl mx-auto">
            <ShareRewardCampaignForm mode="create" />
        </div>
    );
}
