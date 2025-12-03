"use client";

/**
 * 微信分享配置组件
 * 用于在页面中设置微信分享内容
 * 
 * @example
 * ```tsx
 * <WechatShareProvider
 *   title="NIHPLOD 旎柏"
 *   desc="源自摩纳哥的高端护肤品牌"
 *   imgUrl="/images/og-image.jpg"
 * />
 * ```
 */

import { useEffect } from "react";
import { useWechatShare, type WechatShareConfig } from "@/hooks/useWechatShare";

interface WechatShareProviderProps extends WechatShareConfig {
  /** 子组件 (可选) */
  children?: React.ReactNode;
  /** 调试模式 - 显示状态信息 */
  debug?: boolean;
}

export function WechatShareProvider({
  title,
  desc,
  link,
  imgUrl,
  children,
  debug = false,
}: WechatShareProviderProps) {
  const { isWechat, isReady, isLoading, error, updateShare } = useWechatShare({
    title,
    desc,
    link,
    imgUrl,
  });

  // 当配置变化时更新分享
  useEffect(() => {
    updateShare({ title, desc, link, imgUrl });
  }, [title, desc, link, imgUrl, updateShare]);

  // 调试信息
  if (debug && typeof window !== "undefined") {
    console.log("[WechatShare]", {
      isWechat,
      isReady,
      isLoading,
      error,
      config: { title, desc, link, imgUrl },
    });
  }

  // 渲染调试 UI (仅开发环境)
  if (debug && process.env.NODE_ENV === "development") {
    return (
      <>
        {children}
        <div className="fixed bottom-4 right-4 p-3 bg-black/80 text-white text-xs rounded-lg max-w-xs z-50">
          <div className="font-bold mb-1">微信分享状态</div>
          <div>环境: {isWechat ? "微信浏览器 ✓" : "普通浏览器"}</div>
          <div>状态: {isLoading ? "加载中..." : isReady ? "就绪 ✓" : "未就绪"}</div>
          {error && <div className="text-red-400">错误: {error}</div>}
          <div className="mt-1 opacity-70">标题: {title}</div>
        </div>
      </>
    );
  }

  return <>{children}</>;
}

/**
 * 用于 Metadata 的微信分享标签生成器
 * 返回用于 Next.js Metadata 的 Open Graph 配置
 */
export function generateWechatMetadata(config: WechatShareConfig) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "";
  
  return {
    openGraph: {
      title: config.title,
      description: config.desc,
      url: config.link,
      siteName: "NIHPLOD 旎柏",
      images: [
        {
          url: config.imgUrl?.startsWith("http")
            ? config.imgUrl
            : `${baseUrl}${config.imgUrl || "/images/og-image.jpg"}`,
          width: 1200,
          height: 630,
          alt: config.title,
        },
      ],
      locale: "zh_CN",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: config.title,
      description: config.desc,
      images: [
        config.imgUrl?.startsWith("http")
          ? config.imgUrl
          : `${baseUrl}${config.imgUrl || "/images/og-image.jpg"}`,
      ],
    },
  };
}

export default WechatShareProvider;

