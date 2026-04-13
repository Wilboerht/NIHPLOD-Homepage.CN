/* eslint-disable @next/next/no-img-element */
"use client";

/**
 * 个人信息面板
 * 支持头像上传和昵称编辑 - 品牌风格版
 */
import { useState, useRef } from "react";
import { User, Camera, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/components/ui/Toast";

export function ProfilePanel() {
  const { user, refreshUser } = useAuth();
  const { success: showSuccess, error: showError } = useToast();
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
      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.success) {
        throw new Error(data?.error?.message || "保存失败");
      }

      await refreshUser();
      setEditing(false);
      showSuccess("个人信息已更新");
    } catch (e) {
      console.error("保存失败:", e);
      const message = e instanceof Error ? e.message : "保存失败，请稍后重试";
      showError(message);
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
      /**
       * 方案：统一由服务器端处理上传 (支持 OSS 或本地存储)
       * 这消除了客户端压缩的负担，并允许后端统一处理 WebP 格式化
       */
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/user/profile", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (res.ok && data.success) {
        // 更新成功后刷新用户信息
        await refreshUser();
        showSuccess("头像已更新");
      } else {
        throw new Error(data.error?.message || "上传头像失败");
      }
    } catch (err) {
      console.error("头像上传失败:", err);
      const message = err instanceof Error ? err.message : "上传失败，请稍后重试";
      setAvatarError(message);
      showError(message);
    } finally {
      setUploadingAvatar(false);
    }
  };

  if (!user) return null;

  return (
    <div className="h-full flex flex-col pt-6 md:pt-10">
      {/* 标题 */}
      <div className="flex-shrink-0 pl-6 pr-6 md:pl-16 md:pr-28 pb-6 border-b border-stone-200/60">
        <h2 className="text-xl font-medium tracking-wide text-stone-800">个人信息</h2>
      </div>

      <div className="flex-1 overflow-y-auto px-6 md:px-16 py-6 scrollbar-hide">
        {/* 头像区域 */}
        <div className="mb-10 flex items-center gap-6">
          {/* 可点击上传头像 */}
          <div className="group relative">
            <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border border-stone-200 bg-[#E5E0D8]/20 transition-all group-hover:border-stone-300">
              {user.avatar ? (
                <img src={user.avatar} alt="Avatar" className="h-full w-full object-cover transition-all" />
              ) : (
                <User className="h-8 w-8 text-stone-400" strokeWidth={1} />
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
            <p className="text-sm font-medium text-stone-800">
              {user.nickname || `用户${user.phone?.slice(-4)}`}
            </p>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingAvatar}
              className="mt-1 text-xs text-stone-400 hover:text-stone-800 transition-colors"
            >
              {uploadingAvatar ? "上传中..." : "点击更换头像"}
            </button>
          </div>
        </div>

        {/* 头像上传错误提示 */}
        {avatarError && (
          <p className="mb-6 border-l-2 border-red-200 pl-3 text-xs text-stone-500">
            {avatarError}
          </p>
        )}

        {/* 信息卡片 */}
        <div className="flex flex-col">
          {/* 昵称 */}
          <div className="group flex items-center justify-between border-b border-stone-200/60 py-6 transition-colors hover:bg-stone-100/50">
            <div className="flex items-center gap-6 px-4">
              <div className="w-[100px]">
                <p className="text-sm font-light text-stone-500">昵称</p>
              </div>
              <div>
                {editing ? (
                  <input
                    type="text"
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSave();
                      if (e.key === "Escape") {
                        e.stopPropagation(); // 防止触发上层 modal 关闭
                        setEditing(false);
                        setNickname(user.nickname || "");
                      }
                    }}
                    className="w-56 border-b border-stone-400 bg-transparent py-1 text-sm font-medium text-stone-800 outline-none transition-colors placeholder:text-stone-300"
                    autoFocus
                  />
                ) : (
                  <p className="text-sm font-medium text-stone-800">
                    {user.nickname || "未设置"}
                  </p>
                )}
              </div>
            </div>
            <div className="px-4">
              {editing ? (
                <div className="flex gap-4">
                  <button
                    onClick={() => {
                      setEditing(false);
                      setNickname(user.nickname || "");
                    }}
                    className="text-xs text-stone-500 font-light hover:text-stone-800 transition-colors"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="text-xs text-stone-800 font-medium hover:text-stone-500 transition-colors disabled:opacity-50"
                  >
                    保存
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setEditing(true)}
                  className="text-xs text-stone-500 font-light hover:text-stone-800 transition-colors opacity-100 md:opacity-0 md:group-hover:opacity-100"
                >
                  修改
                </button>
              )}
            </div>
          </div>

          {/* 手机号 */}
          <div className="group flex items-center justify-between border-b border-stone-200/60 py-6 transition-colors hover:bg-stone-100/50">
            <div className="flex items-center gap-6 px-4">
              <div className="w-[100px]">
                <p className="text-sm font-light text-stone-500">绑定手机号</p>
              </div>
              <div>
                <p className="text-sm font-medium text-stone-800">
                  {user.phone ? `${user.phone.slice(0, 3)}****${user.phone.slice(-4)}` : "未绑定"}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
