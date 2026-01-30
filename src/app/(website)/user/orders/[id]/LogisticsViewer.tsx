
"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, ExternalLink, Package, Truck, Clock } from "lucide-react";

interface RouteNode {
    time: string;
    context: string;
}

interface LogisticsViewerProps {
    trackingNo: string | null;
    phone: string;
}

export default function LogisticsViewer({ trackingNo, phone }: LogisticsViewerProps) {
    const [expanded, setExpanded] = useState(false);
    const [routes, setRoutes] = useState<RouteNode[]>([]);
    const [loading, setLoading] = useState(false);
    const [loaded, setLoaded] = useState(false);

    if (!trackingNo) return <span className="text-gray-400 font-mono">-</span>;

    const toggleExpand = async () => {
        if (!expanded && !loaded) {
            setLoading(true);
            try {
                const last4 = phone.replace(/\D/g, "").slice(-4);
                const res = await fetch(`/api/logistics/track/${trackingNo}?phone=${last4}`);
                const result = await res.json();

                if (result.success) {
                    if (Array.isArray(result.data)) {
                        setRoutes(result.data);
                        setLoaded(true);
                    } else if (result.data?.redirectUrl) {
                        // 如果返回 redirect，可能是没配置key，直接跳转
                        window.open(result.data.redirectUrl, "_blank");
                        setLoading(false);
                        return; // 不展开
                    }
                }
            } catch (e) {
                console.error("Fetch routes error", e);
            } finally {
                setLoading(false);
            }
        }
        setExpanded(!expanded);
    };

    return (
        <div className="w-full">
            <div
                onClick={toggleExpand}
                className="group flex flex-wrap items-center justify-between gap-2 cursor-pointer py-1 select-none"
            >
                <div className="flex items-center gap-2">
                    <span className="text-[#5C5347] font-mono group-hover:text-[#A69374] transition-colors">{trackingNo}</span>
                    <span className="text-xs px-1.5 py-0.5 bg-[#A69374]/10 text-[#A69374] rounded">顺丰</span>
                </div>
                <div className="flex items-center text-xs text-[#A69B8C] gap-1 group-hover:text-[#A69374]">
                    {expanded ? "收起" : "查看轨迹"}
                    {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </div>
            </div>

            {expanded && (
                <div className="mt-4 relative pl-2">
                    {loading ? (
                        <div className="flex items-center gap-2 text-sm text-[#A69B8C] py-2">
                            <div className="w-4 h-4 border-2 border-[#A69374]/30 border-t-[#A69374] rounded-full animate-spin"></div>
                            查询中...
                        </div>
                    ) : (
                        <div className="space-y-6 relative border-l border-[#E8E3DC] ml-1.5 pl-6 pb-2 pt-1">
                            {routes.length > 0 ? routes.map((route, index) => (
                                <div key={index} className="relative group">
                                    {/* Timeline Dot */}
                                    <div className={`
                         absolute -left-[31px] top-1.5 w-3 h-3 rounded-full border-2 
                         ${index === 0 ? "bg-[#A69374] border-[#A69374]" : "bg-white border-[#C4BDB2] group-hover:border-[#A69374]"}
                         transition-colors z-10
                      `}></div>

                                    <div className="flex flex-col gap-1">
                                        <p className={`text-sm ${index === 0 ? "text-[#5C5347] font-medium" : "text-[#8B8579]"}`}>
                                            {route.context}
                                        </p>
                                        <p className="text-xs text-[#A69B8C] font-mono">
                                            {route.time}
                                        </p>
                                    </div>
                                </div>
                            )) : (
                                <div className="text-sm text-[#A69B8C]">暂无轨迹信息</div>
                            )}
                        </div>
                    )}

                    <div className="mt-4 pt-3 border-t border-[#F0EBE4] flex justify-end">
                        <a
                            href={`https://www.sf-express.com/cn/sc/dynamic_function/waybill/#search/bill-number/${trackingNo}`}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-1 text-xs text-[#A69374] hover:underline"
                        >
                            官网查询 <ExternalLink className="w-3 h-3" />
                        </a>
                    </div>
                </div>
            )}
        </div>
    );
}
