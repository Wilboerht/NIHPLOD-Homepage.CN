/* eslint-disable @next/next/no-img-element */
"use client";

/**
 * 个人信息面板
 * 支持头像上传和昵称编辑
 */
import { useState, useRef } from "react";
import { User, Phone, Edit3, Check, X, Camera, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { uploadImageToOSS } from "@/lib/oss-upload-client";

export function ProfilePanel() {
  const { user, refreshUser } = useAuth();
  const [editing, setEditing] = useState(false);
  const [nickname, setNickname] = useState(user?.nickname || "");
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 保存昵称
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

  // 处理头像文件选择
  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 重置 input 值，允许重复选同一文件
    e.target.value = "";

    // 校验文件类型
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setAvatarError("仅支持 JPG、PNG、WebP 格式");
      return;
    }

    // 校验文件大小 (最大 2MB)
    if (file.size > 2 * 1024 * 1024) {
      setAvatarError("图片大小不能超过 2MB");
      return;
    }

    setAvatarError("");
    setUploadingAvatar(true);

    try {
      // 生成唯一文件名
      const ext = file.name.split(".").pop() || "jpg";
      const filename = `avatar_${Date.now()}.${ext}`;

      // 上传到 OSS
      const avatarUrl = await uploadImageToOSS(file, filename);

      // 更新用户资料
      const res = await fetch("/api/user/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatar: avatarUrl }),
      });

      if (res.ok) {
        await refreshUser();
      } else {
        setAvatarError("更新头像失败");
      }
    } catch (err) {
      console.error("头像上传失败:", err);
      setAvatarError("上传失败，请稍后重试");
    } finally {
      setUploadingAvatar(false);
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
          {/* 可点击上传头像 */}
          <div className="relative group">
            <div className="w-20 h-20 rounded-full bg-[#A69374]/10 flex items-center justify-center overflow-hidden border-2 border-[#E8E3DC] transition-all group-hover:border-[#A69374]/40">
              {user.avatar ? (
                <img src={user.avatar} alt="" className="w-full h-full object-cover" />
              ) : (
                <User className="w-10 h-10 text-[#A69374]" />
              )}
            </div>

            {/* 上传遮罩 */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingAvatar}
              className="absolute inset-0 rounded-full bg-black/0 group-hover:bg-black/30 flex items-center justify-center transition-all cursor-pointer disabled:cursor-wait"
            >
              {uploadingAvatar ? (
                <Loader2 className="w-6 h-6 text-white animate-spin" />
              ) : (
                <Camera className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
              )}
            </button>

            {/* 隐藏的文件输入 */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleAvatarChange}
              className="hidden"
            />
          </div>

          <div>
            <p className="text-[#5C5347] font-medium text-lg">
              {user.nickname || `用户${user.phone?.slice(-4)}`}
            </p>
            <p className="text-[#A69B8C] text-sm">
              {uploadingAvatar ? "上传中..." : "点击头像更换"}
            </p>
          </div>
        </div>

        {/* 头像上传错误提示 */}
        {avatarError && (
          <p className="mt-3 text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">
            {avatarError}
          </p>
        )}
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
    </div>
  );
}
