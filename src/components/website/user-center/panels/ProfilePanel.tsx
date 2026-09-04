"use client";

/**
 * 个人信息面板
 * 支持头像上传和昵称编辑 - 品牌风格版
 */
import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import { User, Camera, Loader2, ChevronRight, ChevronDown, Lock } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/components/ui/Toast";
import { apiPut, apiPost } from "@/lib/api-client";
import { fetchWithAuth, UnauthorizedError } from "@/lib/fetch-with-auth";
import { SecurityPanel } from "./SecurityPanel";

const phoneInputClass =
  "w-full rounded-xl border border-stone-200 bg-white/60 px-4 py-3 text-sm text-stone-800 outline-none transition-colors placeholder:text-stone-300 focus:border-stone-400";

export function ProfilePanel() {
  const { user, refreshUser } = useAuth();
  const { success: showSuccess, error: showError } = useToast();
  const [editingField, setEditingField] = useState<"nickname" | "birthday" | null>(null);
  const [nickname, setNickname] = useState(user?.nickname || "");
  const [birthday, setBirthday] = useState(user?.birthday?.slice(0, 10) || "");
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState("");
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 换绑手机号表单状态
  const [showPhoneForm, setShowPhoneForm] = useState(false);
  const [newPhone, setNewPhone] = useState("");
  const [currentCode, setCurrentCode] = useState("");
  const [newCode, setNewCode] = useState("");
  const [phoneSending, setPhoneSending] = useState<"current" | "new" | null>(null);
  const [phoneSaving, setPhoneSaving] = useState(false);
  const [phoneCountdown, setPhoneCountdown] = useState(0);

  // 短信倒计时
  useEffect(() => {
    if (phoneCountdown > 0) {
      const t = setTimeout(() => setPhoneCountdown((c) => c - 1), 1000);
      return () => clearTimeout(t);
    }
  }, [phoneCountdown]);

  // 生日输入上限：今天（本地时区）
  const now = new Date();
  const maxBirthday = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate()
  ).padStart(2, "0")}`;

  /** 单独保存昵称或生日（只提交当前字段） */
  const saveField = async (field: "nickname" | "birthday") => {
    setSaving(true);
    try {
      // 昵称允许清空：服务端约定空字符串即清除（PUT /api/user/profile 中 "" → null）
      const payload =
        field === "nickname" ? { nickname: nickname.trim() } : { birthday };
      await apiPut("/api/user/profile", payload);
      await refreshUser();
      setEditingField(null);
      showSuccess(field === "nickname" ? "昵称已更新" : "生日已更新");
    } catch (e) {
      console.error("保存失败:", e);
      const message = e instanceof Error ? e.message : "保存失败，请稍后重试";
      showError(message);
    } finally {
      setSaving(false);
    }
  };

  const cancelEdit = () => {
    setEditingField(null);
    setNickname(user?.nickname || "");
    setBirthday(user?.birthday?.slice(0, 10) || "");
  };

  /** 进入编辑态前从最新用户资料同步草稿，避免上次未保存的残留值串场 */
  const startEdit = (field: "nickname" | "birthday") => {
    setNickname(user?.nickname || "");
    setBirthday(user?.birthday?.slice(0, 10) || "");
    setEditingField(field);
  };

  /** 发送换绑验证码：target=current 发到当前手机（验证身份），target=new 发到新手机 */
  const sendPhoneCode = async (target: "current" | "new") => {
    if (phoneCountdown > 0) return;
    if (target === "current" && isPlaceholderPhone) return;
    if (target === "new" && !/^1[3-9]\d{9}$/.test(newPhone)) {
      showError("请输入正确的新手机号");
      return;
    }
    setPhoneSending(target);
    try {
      const res = await fetchWithAuth("/api/user/phone/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(target === "new" ? { target, newPhone } : { target }),
      });
      const data = await res.json();
      if (data.success) {
        setPhoneCountdown(60);
        showSuccess("验证码已发送");
      } else {
        showError(data.error?.message || "验证码发送失败");
      }
    } catch (e) {
      if (e instanceof UnauthorizedError) return;
      showError("网络错误");
    } finally {
      setPhoneSending(null);
    }
  };

  /** 确认换绑：核销验证码后更新手机号 */
  const handlePhoneChange = async () => {
    if (!/^1[3-9]\d{9}$/.test(newPhone)) {
      showError("请输入正确的新手机号");
      return;
    }
    if (!isPlaceholderPhone && !/^\d{6}$/.test(currentCode)) {
      showError("请输入 6 位数字验证码");
      return;
    }
    if (!/^\d{6}$/.test(newCode)) {
      showError("请输入 6 位数字验证码");
      return;
    }
    setPhoneSaving(true);
    try {
      const res = await fetchWithAuth("/api/user/phone", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isPlaceholderPhone
            ? { newPhone, newCode }
            : { newPhone, currentCode, newCode }
        ),
      });
      const data = await res.json();
      if (data.success) {
        setNewPhone("");
        setCurrentCode("");
        setNewCode("");
        setShowPhoneForm(false);
        await refreshUser();
        showSuccess("手机号已更新");
      } else {
        showError(data.error?.message || "换绑失败");
      }
    } catch (e) {
      if (e instanceof UnauthorizedError) return;
      showError("网络错误");
    } finally {
      setPhoneSaving(false);
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

  // 微信占位手机号（wx_ 前缀）账号：无可用短信通道，换绑仅需新手机验证
  const isPlaceholderPhone = !user.phone || !/^1[3-9]\d{9}$/.test(user.phone);

  return (
    <div className="flex h-full flex-col pt-4 md:pt-10">
      {/* 标题 - 移动端由全局 Header 管理 */}
      <div className="hidden flex-shrink-0 border-b-0 border-stone-200/60 px-6 pb-6 md:flex md:border-b md:px-16">
        <h2 className="text-xl font-medium tracking-wide text-stone-800">个人信息</h2>
      </div>

      <div className="scrollbar-hide flex-1 overflow-y-auto px-16 py-6">
        {/* 头像区域 */}
        <div className="mb-6 flex items-center gap-6 md:mb-10">
          {/* 可点击上传头像 */}
          <div className="group relative">
            <div className="relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border border-stone-200 bg-[#FBF8F0]/20 transition-all group-hover:border-stone-300">
              {user.avatar ? (
                <Image
                  src={user.avatar}
                  alt="Avatar"
                  fill
                  unoptimized
                  className="h-full w-full object-cover transition-all"
                />
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
              className="mt-1 text-xs text-stone-400 transition-colors hover:text-stone-800"
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
          <div className="group -mx-6 flex items-center justify-between rounded-2xl px-6 py-6 transition-all hover:bg-white/40">
            <div className="mr-4 flex min-w-0 flex-1 flex-col gap-2 md:flex-row md:items-center md:gap-6">
              <div className="shrink-0 md:w-20">
                <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400 md:text-sm md:font-light md:normal-case">
                  昵称
                </p>
              </div>
              <div className="flex w-full min-w-0 flex-1 items-center gap-2">
                {editingField === "nickname" ? (
                  <input
                    type="text"
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveField("nickname");
                      if (e.key === "Escape") {
                        e.stopPropagation();
                        cancelEdit();
                      }
                    }}
                    className="w-full border-b border-stone-400 bg-transparent py-1 text-sm font-medium text-stone-800 outline-none transition-colors placeholder:text-stone-300 md:w-56 md:text-base"
                    autoFocus
                  />
                ) : (
                  <p className="truncate text-base font-medium text-stone-800 md:text-sm">
                    {user.nickname || "未设置"}
                  </p>
                )}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {editingField === "nickname" ? (
                <div className="flex gap-3">
                  <button
                    onClick={cancelEdit}
                    className="text-xs font-light text-stone-500 transition-colors hover:text-stone-800"
                  >
                    取消
                  </button>
                  <button
                    onClick={() => saveField("nickname")}
                    disabled={saving}
                    className="text-xs font-medium text-stone-800 transition-colors hover:text-stone-500 disabled:opacity-50"
                  >
                    保存
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => startEdit("nickname")}
                  className="group flex items-center gap-1.5 text-xs font-light text-stone-500 transition-colors hover:text-stone-800"
                >
                  <span className="opacity-100 md:opacity-0 md:group-hover:opacity-100">修改</span>
                  <ChevronRight className="h-3.5 w-3.5 text-stone-300 md:hidden" />
                </button>
              )}
            </div>
          </div>

          <div className="h-px w-full bg-stone-100 opacity-40 md:hidden" />

          {/* 生日 */}
          <div className="group -mx-6 flex items-center justify-between rounded-2xl px-6 py-6 transition-all hover:bg-white/40">
            <div className="mr-4 flex min-w-0 flex-1 flex-col gap-2 md:flex-row md:items-center md:gap-6">
              <div className="shrink-0 md:w-20">
                <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400 md:text-sm md:font-light md:normal-case">
                  生日
                </p>
              </div>
              <div className="flex w-full min-w-0 flex-1 items-center gap-2">
                {editingField === "birthday" ? (
                  <input
                    type="date"
                    value={birthday}
                    max={maxBirthday}
                    onChange={(e) => setBirthday(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        e.stopPropagation();
                        cancelEdit();
                      }
                    }}
                    className="w-full border-b border-stone-400 bg-transparent py-1 text-sm font-medium text-stone-800 outline-none transition-colors md:w-56 md:text-base"
                  />
                ) : (
                  <p className="truncate text-base font-medium text-stone-800 md:text-sm">
                    {user.birthday ? user.birthday.slice(0, 10) : "未设置"}
                  </p>
                )}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {editingField === "birthday" ? (
                <div className="flex gap-3">
                  <button
                    onClick={cancelEdit}
                    className="text-xs font-light text-stone-500 transition-colors hover:text-stone-800"
                  >
                    取消
                  </button>
                  <button
                    onClick={() => saveField("birthday")}
                    disabled={saving}
                    className="text-xs font-medium text-stone-800 transition-colors hover:text-stone-500 disabled:opacity-50"
                  >
                    保存
                  </button>
                </div>
              ) : user.birthday ? (
                <span className="flex items-center gap-1.5 text-xs font-light text-stone-400">
                  <Lock className="h-3.5 w-3.5" />
                  已锁定
                </span>
              ) : (
                <button
                  onClick={() => startEdit("birthday")}
                  className="group flex items-center gap-1.5 text-xs font-light text-stone-500 transition-colors hover:text-stone-800"
                >
                  <span className="opacity-100 md:opacity-0 md:group-hover:opacity-100">设置</span>
                  <ChevronRight className="h-3.5 w-3.5 text-stone-300 md:hidden" />
                </button>
              )}
            </div>
          </div>

          <div className="h-px w-full bg-stone-100 opacity-40 md:hidden" />

          {/* 绑定手机号 - 换绑需双向短信验证 */}
          <div className="group -mx-6 rounded-2xl px-6 transition-all hover:bg-white/40">
            <div className="flex items-center justify-between py-6">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-6">
                <div className="md:w-20">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400 md:text-sm md:font-light md:normal-case">
                    绑定手机号
                  </p>
                </div>
                <div>
                  <p className="text-base font-medium text-stone-800 md:text-sm">
                    {isPlaceholderPhone
                      ? "未绑定"
                      : `${user.phone?.slice(0, 3)}****${user.phone?.slice(-4)}`}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowPhoneForm((v) => !v)}
                aria-expanded={showPhoneForm}
                className="flex items-center gap-1.5 text-xs font-light text-stone-500 transition-colors hover:text-stone-800"
              >
                <span className="opacity-100 md:opacity-0 md:group-hover:opacity-100">修改</span>
                <ChevronRight
                  className={`h-3.5 w-3.5 text-stone-300 transition-transform duration-200 md:hidden ${
                    showPhoneForm ? "rotate-90" : ""
                  }`}
                />
              </button>
            </div>

            {/* 换绑表单 */}
            {showPhoneForm && (
              <div className="max-w-md space-y-4 border-t border-stone-200/60 pb-6 pt-5">
                <h3 className="text-sm font-medium text-stone-700">换绑手机号</h3>
                <p className="text-xs text-stone-400">
                  {isPlaceholderPhone
                    ? "当前账号未绑定手机号，验证新手机号后即可完成换绑。"
                    : "为保障账户安全，需验证当前手机号和新手机号各一次。"}
                </p>
                <div>
                  <label htmlFor="new-phone" className="mb-1 block text-xs text-stone-400">
                    新手机号
                  </label>
                  <input
                    id="new-phone"
                    type="text"
                    inputMode="numeric"
                    maxLength={11}
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value.replace(/\D/g, ""))}
                    placeholder="输入新手机号"
                    className={phoneInputClass}
                  />
                </div>
                {!isPlaceholderPhone && (
                  <div>
                    <label htmlFor="current-code" className="mb-1 block text-xs text-stone-400">
                      当前手机验证码
                    </label>
                    <div className="flex gap-2">
                      <input
                        id="current-code"
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        value={currentCode}
                        onChange={(e) => setCurrentCode(e.target.value.replace(/\D/g, ""))}
                        placeholder="6位验证码"
                        className={phoneInputClass}
                      />
                      <button
                        onClick={() => sendPhoneCode("current")}
                        disabled={phoneCountdown > 0 || phoneSending === "current"}
                        className="shrink-0 rounded-xl border border-stone-200 px-4 py-2 text-sm text-stone-600 transition-colors hover:bg-white/60 disabled:opacity-50"
                      >
                        {phoneCountdown > 0 ? `${phoneCountdown}s 后重发` : "发送验证码"}
                      </button>
                    </div>
                  </div>
                )}
                <div>
                  <label htmlFor="new-code" className="mb-1 block text-xs text-stone-400">
                    新手机验证码
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="new-code"
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      value={newCode}
                      onChange={(e) => setNewCode(e.target.value.replace(/\D/g, ""))}
                      placeholder="6位验证码"
                      className={phoneInputClass}
                    />
                    <button
                      onClick={() => sendPhoneCode("new")}
                      disabled={phoneCountdown > 0 || phoneSending === "new"}
                      className="shrink-0 rounded-xl border border-stone-200 px-4 py-2 text-sm text-stone-600 transition-colors hover:bg-white/60 disabled:opacity-50"
                    >
                      {phoneCountdown > 0 ? `${phoneCountdown}s 后重发` : "发送验证码"}
                    </button>
                  </div>
                </div>
                <div className="flex gap-3 pt-1">
                  <button
                    onClick={handlePhoneChange}
                    disabled={phoneSaving}
                    className="rounded-full bg-[#00263e] px-6 py-2.5 text-sm text-white transition-colors hover:bg-[#0d3b5c] disabled:opacity-50"
                  >
                    {phoneSaving ? "换绑中..." : "确认换绑"}
                  </button>
                  <button
                    onClick={() => setShowPhoneForm(false)}
                    disabled={phoneSaving}
                    className="rounded-full border border-stone-200 px-6 py-2.5 text-sm text-stone-600 transition-colors hover:bg-white/60 disabled:opacity-50"
                  >
                    取消
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="h-px w-full bg-stone-100 opacity-40 md:hidden" />

          {/* 密码（原安全设置入口，合并至个人信息） */}
          <div className="-mx-6 rounded-2xl px-6 transition-all hover:bg-white/40">
            <button
              type="button"
              onClick={() => setShowPasswordForm((v) => !v)}
              aria-expanded={showPasswordForm}
              className="flex w-full items-center justify-between py-6"
            >
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-6">
                <div className="md:w-20">
                  <p className="text-left text-[10px] font-bold uppercase tracking-widest text-stone-400 md:text-sm md:font-light md:normal-case">
                    密码
                  </p>
                </div>
                <div>
                  <p className="text-base font-medium text-stone-800 md:text-sm">
                    {user.hasPassword ? "已设置" : "未设置"}
                  </p>
                </div>
              </div>
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-stone-400 transition-transform duration-200 ${
                  showPasswordForm ? "rotate-180" : ""
                }`}
              />
            </button>
            {showPasswordForm && (
              <div className="border-t border-stone-200/60 pb-6 pt-5">
                <SecurityPanel initialMode={user.hasPassword ? "change" : "set"} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
