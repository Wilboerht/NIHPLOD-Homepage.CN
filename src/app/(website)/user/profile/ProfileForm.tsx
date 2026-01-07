/* eslint-disable @next/next/no-img-element */
"use client";

/**
 * 用户资料编辑表单
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { UserInfo } from "@/types/auth";

interface ProfileFormProps {
  user: UserInfo;
}

export default function ProfileForm({ user }: ProfileFormProps) {
  const router = useRouter();
  const [nickname, setNickname] = useState(user.nickname || "");
  const [avatar, setAvatar] = useState(user.avatar || "");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage({ type: "", text: "" });

    try {
      const res = await fetch("/api/user/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname, avatar }),
      });

      const data = await res.json();

      if (data.success) {
        setMessage({ type: "success", text: "保存成功" });
        router.refresh();
      } else {
        setMessage({ type: "error", text: data.error?.message || "保存失败" });
      }
    } catch {
      setMessage({ type: "error", text: "网络错误，请重试" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm p-6 space-y-6">
      {/* 消息提示 */}
      {message.text && (
        <div className={`p-3 rounded-lg text-sm ${message.type === "success"
            ? "bg-green-50 text-green-600"
            : "bg-red-50 text-red-600"
          }`}>
          {message.text}
        </div>
      )}

      {/* 头像 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">头像</label>
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 rounded-full bg-gray-100 overflow-hidden">
            {avatar ? (
              <img src={avatar} alt="头像" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-400">
                <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
            )}
          </div>
          <input
            type="url"
            value={avatar}
            onChange={(e) => setAvatar(e.target.value)}
            placeholder="输入头像URL"
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent text-sm"
          />
        </div>
      </div>

      {/* 昵称 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">昵称</label>
        <input
          type="text"
          value={nickname}
          onChange={(e) => setNickname(e.target.value.slice(0, 20))}
          placeholder="请输入昵称"
          maxLength={20}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
        />
        <p className="text-xs text-gray-500 mt-1">{nickname.length}/20</p>
      </div>

      {/* 手机号（只读） */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">手机号</label>
        <input
          type="text"
          value={`${user.phone.slice(0, 3)}****${user.phone.slice(-4)}`}
          disabled
          className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-500"
        />
      </div>

      {/* 提交按钮 */}
      <button
        type="submit"
        disabled={loading}
        className="w-full py-3 bg-pink-500 text-white rounded-lg font-medium disabled:opacity-50 hover:bg-pink-600 transition-colors"
      >
        {loading ? "保存中..." : "保存"}
      </button>
    </form>
  );
}

