"use client";

/**
 * 安全中心面板（共享）
 * 合并原三个安全类一级菜单（设备管理 / 授权管理 / 登录历史）为单一入口，
 * 内部以分段标签切换，复用原三个共享面板（embedded 模式：隐藏内置标题）。
 *
 * 分段状态保存在 AuthContext（securitySection），
 * 旧链接（/?account=devices 等）经 openUserCenter 归一化后直达对应分段。
 */
import { useAuth } from "@/contexts/AuthContext";
import { SECURITY_SECTIONS, type SecuritySection } from "@/lib/user-center-tab";
import { DevicesPanel } from "./DevicesPanel";
import { AuthorizationsPanel } from "./AuthorizationsPanel";
import { LoginHistoryPanel } from "./LoginHistoryPanel";

const SECTION_LABELS: Record<SecuritySection, string> = {
  devices: "设备管理",
  authorizations: "授权管理",
  history: "登录历史",
};

export function SecurityCenterPanel() {
  const { securitySection, setSecuritySection } = useAuth();

  return (
    <div className="flex h-full flex-col pt-4 md:pt-10" data-testid="panel-security">
      {/* 标题 - 移动端由弹窗全局 Header 管理 */}
      <div className="hidden flex-shrink-0 border-b border-stone-200/60 px-6 pb-6 md:flex md:px-16">
        <h2 className="text-xl font-medium tracking-wide text-stone-800">安全中心</h2>
      </div>

      {/* 分段标签 */}
      <div className="flex-shrink-0 px-6 pt-4 md:px-16">
        <div
          role="tablist"
          aria-label="安全中心分段"
          className="inline-flex rounded-full border border-stone-200 bg-white/40 p-1"
        >
          {SECURITY_SECTIONS.map((section) => (
            <button
              key={section}
              type="button"
              role="tab"
              aria-selected={securitySection === section}
              onClick={() => setSecuritySection(section)}
              className={`rounded-full px-4 py-1.5 text-xs transition-colors ${
                securitySection === section
                  ? "bg-[#00263e] text-white"
                  : "text-stone-500 hover:text-stone-800"
              }`}
            >
              {SECTION_LABELS[section]}
            </button>
          ))}
        </div>
      </div>

      {/* 分段内容：滚动与内边距由各子面板自带（embedded 模式去标题去顶部留白） */}
      <div className="min-h-0 flex-1">
        {securitySection === "devices" && <DevicesPanel embedded />}
        {securitySection === "authorizations" && <AuthorizationsPanel embedded />}
        {securitySection === "history" && <LoginHistoryPanel embedded />}
      </div>
    </div>
  );
}
