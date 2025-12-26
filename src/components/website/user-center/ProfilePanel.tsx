"use client";

/**
 * 个人信息面板
 */
import { useState } from "react";
import { User, Phone, Edit3, Check, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

export function ProfilePanel() {
  const { user, refreshUser } = useAuth();
  const [editing, setEditing] = useState(false);
  const [nickname, setNickname] = useState(user?.nickname || "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!nickname.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/user/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname: nickname.trim() }),
      });
      if (res.ok) {
        await refreshUser();
        setEditing(false);
      }
    } catch (e) {
      console.error("保存失败:", e);
    } finally {
      setSaving(false);
    }
  };

  if (!user) return null;

  return (
    <div className="h-full overflow-y-auto p-6">
      {/* 标题 */}
      <div className="mb-6">
        <h2 className="text-xl text-[#5C5347] font-light">个人信息</h2>
        <p className="text-[#A69B8C] text-sm mt-1">管理您的账户信息</p>
      </div>

      {/* 头像区域 */}
      <div className="bg-white/80 rounded-xl p-6 mb-4 border border-[#E8E3DC]">
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 rounded-full bg-[#A69374]/10 flex items-center justify-center overflow-hidden border-2 border-[#E8E3DC]">
            {user.avatar ? (
              <img src={user.avatar} alt="" className="w-full h-full object-cover" />
            ) : (
              <User className="w-10 h-10 text-[#A69374]" />
            )}
          </div>
          <div>
            <p className="text-[#5C5347] font-medium text-lg">
              {user.nickname || `用户${user.phone?.slice(-4)}`}
            </p>
            <p className="text-[#A69B8C] text-sm">会员</p>
          </div>
        </div>
      </div>

      {/* 信息卡片 */}
      <div className="bg-white/80 rounded-xl border border-[#E8E3DC] divide-y divide-[#F0EBE4]">
        {/* 昵称 */}
        <div className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#F5F2ED] flex items-center justify-center">
              <User className="w-5 h-5 text-[#A69374]" />
            </div>
            <div>
              <p className="text-[#A69B8C] text-xs">昵称</p>
              {editing ? (
                <input
                  type="text"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  className="text-[#5C5347] bg-transparent border-b border-[#A69374] outline-none py-1 w-40"
                  autoFocus
                />
              ) : (
                <p className="text-[#5C5347]">{user.nickname || "未设置"}</p>
              )}
            </div>
          </div>
          {editing ? (
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="p-2 rounded-full bg-[#A69374] text-white hover:bg-[#917F62] transition-colors disabled:opacity-50"
              >
                <Check className="w-4 h-4" />
              </button>
              <button
                onClick={() => {
                  setEditing(false);
                  setNickname(user.nickname || "");
                }}
                className="p-2 rounded-full text-[#8B8579] hover:bg-[#F5F2ED] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setEditing(true)}
              className="p-2 rounded-full text-[#A69374] hover:bg-[#F5F2ED] transition-colors"
            >
              <Edit3 className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* 手机号 */}
        <div className="p-4 flex items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#F5F2ED] flex items-center justify-center">
              <Phone className="w-5 h-5 text-[#A69374]" />
            </div>
            <div>
              <p className="text-[#A69B8C] text-xs">手机号</p>
              <p className="text-[#5C5347]">
                {user.phone ? `${user.phone.slice(0, 3)}****${user.phone.slice(-4)}` : "未绑定"}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 点数卡片 */}
      <div className="mt-4 bg-gradient-to-r from-[#A69374] to-[#C4B896] rounded-xl p-6 text-white">
        <p className="text-white/80 text-sm">护肤点数</p>
        <p className="text-3xl font-light mt-1">{user.points}</p>
        <p className="text-white/60 text-xs mt-2">用于AI护肤顾问对话</p>
      </div>
    </div>
  );
}

