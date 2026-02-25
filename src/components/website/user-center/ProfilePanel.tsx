/* eslint-disable @next/next/no-img-element */
"use client";

/**
 * 个人信息面板
 * 支持头像上传和昵称编辑 - 品牌风格版
 */
import { useState, useRef } from "react";
import { User, Phone, Edit3, Check, X, Camera, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import imageCompression from "browser-image-compression";

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

  /**
   * 头像上传 - 智能降级方案：
   * 1. 首选请求服务端 /api/upload/avatar 获取 OSS 签名并直传。
   * 2. 如果服务端返回 "NO_OSS" 标志，则触发前端降级：
   *    将图片压缩至 200x200 以内的 Base64，直接存入数据库。
   */
  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 重置 input 值，允许重复选同一文件
    e.target.value = "";

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setAvatarError("仅支持 JPG、PNG、WebP 格式");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setAvatarError("图片大小不能超过 5MB");
      return;
    }

    setAvatarError("");
    setUploadingAvatar(true);

    try {
      // 1. 尝试获取 OSS 签名
      const signRes = await fetch("/api/oss/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, type: file.type }),
      });

      let avatarUrl = "";

      if (signRes.ok) {
        // --- 方案 A: OSS 存在，走 OSS 直传 ---
        const signData = await signRes.json();
        if (signData.success) {
          const { uploadUrl, publicUrl } = signData.data;

          const uploadRes = await fetch(uploadUrl, {
            method: "PUT",
            headers: { "Content-Type": file.type },
            body: file,
          });

          if (!uploadRes.ok) throw new Error("OSS 上传失败");
          avatarUrl = publicUrl;
        } else {
          throw new Error("OSS 签名失败");
        }
      } else {
        // --- 方案 B: OSS 不存在或报错，走本地压缩降级 (Base64) ---
        console.warn("OSS 签名失败，启用端侧压缩降级方案 (Base64)");

        const options = {
          maxSizeMB: 0.05, // 目标大小 50KB
          maxWidthOrHeight: 200, // 头像不需要太大，200x200 足够
          useWebWorker: true,
          fileType: "image/webp" as string, // 强转 WebP，体积更小
        };

        const compressedFile = await imageCompression(file, options);

        // 转换为 Base64
        avatarUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.readAsDataURL(compressedFile);
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = reject;
        });
      }

      // 3. 更新用户资料 (提交 URL 或 Base64)
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
      console.error("头像上传彻底失败:", err);
      setAvatarError(err instanceof Error ? err.message : "上传失败，请稍后重试");
    } finally {
      setUploadingAvatar(false);
    }
  };

  if (!user) return null;

  return (
    <div className="scrollbar-hide h-full overflow-y-auto p-6 md:p-10">
      {/* 标题 */}
      <div className="mb-8">
        <h2 className="text-2xl font-semibold tracking-[0.05em] text-brand-charcoal">个人信息</h2>
        <p className="mt-1.5 text-sm tracking-wide text-brand-charcoal/50">
          管理您的账户信息与资料
        </p>
      </div>

      {/* 头像区域 */}
      <div className="mb-6 rounded-2xl border border-black/5 bg-black/[0.02] p-6 backdrop-blur-md transition-all md:border-white/30 md:bg-white/20">
        <div className="flex items-center gap-5">
          {/* 可点击上传头像 */}
          <div className="group relative">
            <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border border-brand-gold/30 bg-brand-gold/10 shadow-inner transition-all group-hover:border-brand-gold/60">
              {user.avatar ? (
                <img src={user.avatar} alt="Avatar" className="h-full w-full object-cover" />
              ) : (
                <User className="h-10 w-10 text-brand-gold" />
              )}
            </div>

            {/* 上传遮罩 */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingAvatar}
              className="absolute inset-0 flex cursor-pointer items-center justify-center rounded-full bg-black/0 transition-all disabled:cursor-wait group-hover:bg-black/30"
            >
              {uploadingAvatar ? (
                <Loader2 className="h-6 w-6 animate-spin text-white" />
              ) : (
                <Camera className="h-6 w-6 text-white opacity-0 transition-opacity group-hover:opacity-100" />
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
            <p className="text-lg font-semibold tracking-wide text-brand-charcoal">
              {user.nickname || `用户${user.phone?.slice(-4)}`}
            </p>
            <p className="mt-1 text-sm font-medium text-brand-charcoal/50">
              {uploadingAvatar ? "上传中..." : "点击头像更换"}
            </p>
          </div>
        </div>

        {/* 头像上传错误提示 */}
        {avatarError && (
          <p className="mt-4 rounded-xl border border-red-100/50 bg-red-50/80 px-4 py-3 text-xs text-red-600">
            {avatarError}
          </p>
        )}
      </div>

      {/* 信息卡片 */}
      <div className="flex flex-col divide-y divide-black/5 overflow-hidden rounded-2xl border border-black/5 bg-black/[0.02] backdrop-blur-md md:divide-white/20 md:border-white/30 md:bg-white/20">
        {/* 昵称 */}
        <div className="group flex items-center justify-between p-5 transition-colors hover:bg-black/[0.01] md:hover:bg-white/40">
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-full border border-black/5 bg-white/50 text-brand-charcoal/60 md:border-white/20 md:bg-white/20">
              <User className="h-[18px] w-[18px]" />
            </div>
            <div>
              <p className="text-[13px] font-medium tracking-wide text-brand-charcoal/50">昵称</p>
              {editing ? (
                <input
                  type="text"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  className="mt-0.5 w-48 border-b border-brand-gold/50 bg-transparent py-0.5 text-base font-medium text-brand-charcoal outline-none transition-colors placeholder:text-brand-charcoal/30 focus:border-brand-gold"
                  autoFocus
                />
              ) : (
                <p className="mt-0.5 text-base font-medium tracking-wide text-brand-charcoal">
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
                className="rounded-full bg-brand-gold p-2.5 text-white shadow-md shadow-brand-gold/30 transition-colors hover:bg-brand-gold-dark disabled:opacity-50"
              >
                <Check className="h-[18px] w-[18px]" />
              </button>
              <button
                onClick={() => {
                  setEditing(false);
                  setNickname(user.nickname || "");
                }}
                className="rounded-full border border-black/5 bg-black/5 p-2.5 text-brand-charcoal/60 transition-colors hover:bg-black/10 hover:text-brand-charcoal md:border-white/20 md:bg-white/20 md:hover:bg-white/40"
              >
                <X className="h-[18px] w-[18px]" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setEditing(true)}
              className="rounded-full p-2.5 text-brand-charcoal/40 opacity-100 transition-all hover:bg-black/5 hover:text-brand-gold group-hover:opacity-100 md:opacity-0 md:hover:bg-white/40"
            >
              <Edit3 className="h-[18px] w-[18px]" />
            </button>
          )}
        </div>

        {/* 手机号 */}
        <div className="group flex items-center justify-between p-5 transition-colors hover:bg-black/[0.01] md:hover:bg-white/40">
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-full border border-black/5 bg-white/50 text-brand-charcoal/60 md:border-white/20 md:bg-white/20">
              <Phone className="h-[18px] w-[18px]" />
            </div>
            <div>
              <p className="text-[13px] font-medium tracking-wide text-brand-charcoal/50">
                绑定手机号
              </p>
              <p className="mt-0.5 text-base font-medium tracking-wide text-brand-charcoal">
                {user.phone ? `${user.phone.slice(0, 3)}****${user.phone.slice(-4)}` : "未绑定"}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
