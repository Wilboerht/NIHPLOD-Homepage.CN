"use client";

/**
 * 支付页面内容 - 自动打开支付模态框
 */
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";

interface PayContentProps {
  orderId: string;
}

export default function PayContent({ orderId }: PayContentProps) {
  const router = useRouter();
  const { openPay, payOpen } = useAuth();
  const hasOpened = useRef(false);
  const wasOpen = useRef(false);

  // 页面加载后自动打开支付模态框
  useEffect(() => {
    if (!hasOpened.current && orderId) {
      hasOpened.current = true;
      openPay(orderId);
    }
  }, [orderId, openPay]);

  // 跟踪模态框是否曾经打开过
  useEffect(() => {
    if (payOpen) {
      wasOpen.current = true;
    }
  }, [payOpen]);

  // 当支付模态框关闭时（从打开状态变为关闭），跳转回首页
  useEffect(() => {
    if (wasOpen.current && !payOpen) {
      router.push("/");
    }
  }, [payOpen, router]);

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6">
      <Loader2 className="w-8 h-8 text-[#A69374] animate-spin mb-4" />
      <p className="text-[#8B8579]">正在加载支付...</p>
    </div>
  );
}

