/**
 * 头像常量（客户端/服务端共用，不能引入任何服务端依赖）
 *
 * 默认头像：暖米色圆底 + 棕色戴帽人物剪影（矢量描摹，任意尺寸清晰）。
 * 使用独立文件名：
 * - /images/* 为 immutable 长缓存，改版必须换文件名才能让老客户端更新
 */
export const DEFAULT_AVATAR_PATH = "/images/default-avatar-warm.svg";
