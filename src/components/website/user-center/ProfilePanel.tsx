/* eslint-disable @next/next/no-img-element */
"use client";

/**
 * 个人信息面板
 * 支持头像上传和昵称编辑 - 品牌风格版
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
    <div className="h-full overflow-y-auto p-6 md:p-10 scrollbar-hide">
      {/* 标题 */}
      <div className="mb-8">
        <h2 className="text-2xl font-semibold tracking-[0.05em] text-brand-charcoal">
          个人信息
        </h2>
        <p className="text-brand-charcoal/50 text-sm mt-1.5 tracking-wide">管理您的账户信息与资料</p>
      </div>

      {/* 头像区域 */}
      <div className="bg-black/[0.02] md:bg-white/20 rounded-2xl p-6 mb-6 border border-black/5 md:border-white/30 backdrop-blur-md transition-all">
        <div className="flex items-center gap-5">
          {/* 可点击上传头像 */}
          <div className="relative group">
            <div className="w-20 h-20 rounded-full bg-brand-gold/10 flex items-center justify-center overflow-hidden border border-brand-gold/30 shadow-inner transition-all group-hover:border-brand-gold/60">
              {user.avatar ? (
                <img src={user.avatar} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <User className="w-10 h-10 text-brand-gold" />
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
                <Camera className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
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
            <p className="text-brand-charcoal font-semibold text-lg tracking-wide">
              {user.nickname || `用户${user.phone?.slice(-4)}`}
            </p>
            <p className="text-brand-charcoal/50 text-[13px] font-medium mt-1">
              {uploadingAvatar ? "上传中..." : "点击头像更换"}
            </p>
          </div>
        </div>

        {/* 头像上传错误提示 */}
        {avatarError && (
          <p className="mt-4 text-xs text-red-600 bg-red-50/80 rounded-xl px-4 py-3 border border-red-100/50">
            {avatarError}
          </p>
        )}
      </div>

      {/* 信息卡片 */}
      <div className="bg-black/[0.02] md:bg-white/20 rounded-2xl border border-black/5 md:border-white/30 backdrop-blur-md overflow-hidden flex flex-col divide-y divide-black/5 md:divide-white/20">

        {/* 昵称 */}
        <div className="p-5 flex items-center justify-between group transition-colors hover:bg-black/[0.01] md:hover:bg-white/40">
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 rounded-full bg-white/50 md:bg-white/20 flex items-center justify-center border border-black/5 md:border-white/20 text-brand-charcoal/60">
              <User className="w-[18px] h-[18px]" />
            </div>
            <div>
              <p className="text-brand-charcoal/50 text-xs font-medium tracking-wide">昵称</p>
              {editing ? (
                <input
                  type="text"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  className="mt-0.5 text-brand-charcoal text-[15px] font-medium bg-transparent border-b border-brand-gold/50 focus:border-brand-gold outline-none py-0.5 w-48 transition-colors placeholder:text-brand-charcoal/30"
                  autoFocus
                />
              ) : (
                <p className="text-brand-charcoal text-[15px] font-medium mt-0.5 tracking-wide">
                  {user.nickname || "未设置"}
                </p>
              )}
            </div>
          </div>
          {editing ? (
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="p-2.5 rounded-full bg-brand-gold text-white hover:bg-brand-gold-dark transition-colors shadow-md shadow-brand-gold/30 disabled:opacity-50"
              >
                <Check className="w-[18px] h-[18px]" />
              </button>
              <button
                onClick={() => {
                  setEditing(false);
                  setNickname(user.nickname || "");
                }}
                className="p-2.5 rounded-full bg-black/5 md:bg-white/20 text-brand-charcoal/60 hover:text-brand-charcoal hover:bg-black/10 md:hover:bg-white/40 border border-black/5 md:border-white/20 transition-colors"
              >
                <X className="w-[18px] h-[18px]" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setEditing(true)}
              className="p-2.5 rounded-full text-brand-charcoal/40 hover:text-brand-gold hover:bg-black/5 md:hover:bg-white/40 transition-all opacity-100 md:opacity-0 group-hover:opacity-100"
            >
              <Edit3 className="w-[18px] h-[18px]" />
            </button>
          )}
        </div>

        {/* 手机号 */}
        <div className="p-5 flex items-center justify-between group transition-colors hover:bg-black/[0.01] md:hover:bg-white/40">
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 rounded-full bg-white/50 md:bg-white/20 flex items-center justify-center border border-black/5 md:border-white/20 text-brand-charcoal/60">
              <Phone className="w-[18px] h-[18px]" />
            </div>
            <div>
              <p className="text-brand-charcoal/50 text-xs font-medium tracking-wide">绑定手机号</p>
              <p className="text-brand-charcoal text-[15px] font-medium mt-0.5 tracking-wide">
                {user.phone ? `${user.phone.slice(0, 3)}****${user.phone.slice(-4)}` : "未绑定"}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
