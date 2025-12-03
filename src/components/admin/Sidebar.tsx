"use client";

/**
 * 后台侧边栏组件
 * TODO: 实现完整功能
 */
export function Sidebar() {
  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-64 border-r border-gray-200 bg-white">
      <div className="flex h-16 items-center justify-center border-b border-gray-200">
        <span className="font-serif text-xl text-brand-charcoal">NIHPLOD CMS</span>
      </div>
      <nav className="p-4">
        <p className="text-sm text-gray-500">Sidebar 组件待实现</p>
      </nav>
    </aside>
  );
}
