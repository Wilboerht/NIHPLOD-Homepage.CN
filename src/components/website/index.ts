// 注意：UserCenterModal 不在此 barrel 导出，
// 避免任何经由 barrel 的静态引入把它拉回首屏同步 chunk；
// 统一由 GlobalModals 通过 next/dynamic 懒加载。
export { GlobalModals } from "./GlobalModals";
export { ProductCard } from "./ProductCard";
export { ProductDrawer, PlatformIcon } from "./ProductDrawer";
export { BottomNavBar } from "./BottomNavBar";
export { KineticBackground } from "./KineticBackground";
export { XiaohongshuLink } from "./XiaohongshuLink";
export { AdvisorCTA } from "./AdvisorCTA";
