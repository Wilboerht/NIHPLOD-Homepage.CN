export default function AdminDashboard() {
  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-gray-900">仪表盘</h1>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        {/* 统计卡片占位 */}
        {["作品数量", "咨询数量", "访问量", "消息数"].map((title) => (
          <div key={title} className="rounded-lg bg-white p-6 shadow">
            <p className="text-sm text-gray-500">{title}</p>
            <p className="mt-2 text-3xl font-semibold text-gray-900">--</p>
          </div>
        ))}
      </div>
    </div>
  );
}
