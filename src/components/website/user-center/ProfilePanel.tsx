/* eslint-disable @next/next/no-img-element */
"use client";

/**
 * 个人信息面板
 * 支持头像上传和昵称编辑 - 品牌风格版
 */
import { useState, useRef } from "react";
import { User, Camera, Loader2, ChevronRight } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/components/ui/Toast";
import { apiPut, apiPost } from "@/lib/api-client";

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
      await apiPut("/api/user/profile", { nickname: nickname.trim() });
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

      await apiPost("/api/user/profile", formData);

      // 更新成功后刷新用户信息
      await refreshUser();
      showSuccess("头像已更新");
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
    <div className="h-full flex flex-col pt-4 md:pt-10">
      {/* 标题 - 移动端由全局 Header 管理 */}
      <div className="hidden md:flex flex-shrink-0 px-6 md:px-16 pb-6 border-b-0 md:border-b border-stone-200/60">
        <h2 className="text-xl font-medium tracking-wide text-stone-800">个人信息</h2>
      </div>

      <div className="flex-1 overflow-y-auto px-16 py-6 scrollbar-hide">
        {/* 头像区域 */}
        <div className="mb-6 md:mb-10 flex items-center gap-6">
          {/* 可点击上传头像 */}
          <div className="group relative">
            <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border border-stone-200 bg-[#FBF8F0]/20 transition-all group-hover:border-stone-300">
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

        {/* 信息卡片 - 移动端采用上下堆叠，PC 采用左右对齐 */}
        <div className="flex flex-col gap-1">
          {/* 昵称 */}
          <div className="group flex items-center justify-between py-6 px-6 -mx-6 rounded-2xl transition-all hover:bg-white/40">
            <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-6 flex-1 min-w-0 mr-4">
              <div className="md:w-20 shrink-0">
                <p className="text-[10px] md:text-sm font-bold md:font-light text-stone-400 tracking-widest uppercase md:normal-case">昵称</p>
              </div>
              <div className="flex items-center gap-2 flex-1 min-w-0 w-full">
                {editing ? (
                  <input
                    type="text"
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSave();
                      if (e.key === "Escape") {
                        e.stopPropagation();
                        setEditing(false);
                        setNickname(user.nickname || "");
                      }
                    }}
                    className="w-full md:w-56 border-b border-stone-400 bg-transparent py-1 text-sm md:text-base font-medium text-stone-800 outline-none transition-colors placeholder:text-stone-300"
                    autoFocus
                  />
                ) : (
                  <p className="text-base md:text-sm font-medium text-stone-800 truncate">
                    {user.nickname || "未设置"}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {editing ? (
                <div className="flex gap-3">
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
                  className="flex items-center gap-1.5 text-xs text-stone-500 font-light hover:text-stone-800 transition-colors group"
                >
                  <span className="opacity-100 md:opacity-0 md:group-hover:opacity-100">修改</span>
                  <ChevronRight className="w-3.5 h-3.5 md:hidden text-stone-300" />
                </button>
              )}
            </div>
          </div>

          <div className="h-px w-full bg-stone-100 md:hidden opacity-40" />

          {/* 手机号 */}
          <div className="group flex items-center justify-between py-6 px-6 -mx-6 rounded-2xl transition-all hover:bg-white/40">
            <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-6">
              <div className="md:w-20">
                <p className="text-[10px] md:text-sm font-bold md:font-light text-stone-400 tracking-widest uppercase md:normal-case">绑定手机号</p>
              </div>
              <div>
                <p className="text-base md:text-sm font-medium text-stone-800">
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
