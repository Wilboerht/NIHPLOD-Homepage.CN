"use client";

/**
 * 退出登录按钮（客户端组件）
 */
import { useRouter } from "next/navigation";
import { useState } from "react";

export function LogoutButton() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);

    const handleLogout = async () => {
        setLoading(true);
        try {
            await fetch("/api/auth/logout", { method: "POST" });
            router.push("/");
            router.refresh();
        } catch (error) {
            console.error("退出登录失败:", error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <button
            onClick={handleLogout}
            disabled={loading}
            className="w-full py-3 text-center text-red-500 bg-white rounded-xl shadow-sm hover:bg-red-50 transition-colors disabled:opacity-50"
        >
            {loading ? "退出中..." : "退出登录"}
        </button>
    );
}
