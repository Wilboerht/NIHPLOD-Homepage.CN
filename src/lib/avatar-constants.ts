/**
 * 头像常量（客户端/服务端共用，不能引入任何服务端依赖）
 *
 * 默认头像：暖奶白渐变圆底 + 柔和雾蓝剪影（品牌深海蓝的浅色延伸）。
 * 使用 SVG 矢量 + 独立文件名：
 * - 高分屏放大到 80px 不会模糊
 * - /images/* 为 immutable 长缓存，改版必须换文件名才能让老客户端更新
 */
export const DEFAULT_AVATAR_PATH = "/images/default-avatar-soft.svg";
