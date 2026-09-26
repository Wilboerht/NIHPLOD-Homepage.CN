/**
 * 手机号脱敏工具
 *
 * 将手机号中间 4 位替换为 ****，仅在生产/输出场景使用。
 * 格式：138****1234
 *
 * @param phone - 完整手机号
 * @returns 脱敏后的手机号，长度不足 7 位时原样返回
 */
export function maskPhone(phone: string): string {
  if (phone.length < 7) return phone;
  return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
}

/**
 * 地址脱敏：保留前 6 个字符（大致为省市区），其余以 **** 代替。
 * 用于仅具备查看权限的管理端列表展示。
 */
export function maskAddress(address: string | null): string | null {
  if (!address) return address;
  return address.length <= 6 ? address : `${address.slice(0, 6)}****`;
}

/**
 * 通用标识脱敏（OpenID / UnionID / 外部身份 subject 等）
 * 保留前 3 与后 3 位，长度不足 6 位整体替换。
 */
export function maskIdentifier(value: string | null | undefined): string | null {
  if (!value) return value ?? null;
  if (value.length <= 6) return "****";
  return `${value.slice(0, 3)}****${value.slice(-3)}`;
}

/**
 * IP 地址末段脱敏
 *
 * 用户端设备列表/登录历史展示用：保留前缀便于辨识大致网络，
 * 隐藏末段避免精确到主机的 IP 暴露。
 * - IPv4：1.2.3.4 → 1.2.3.*
 * - IPv6：保留前 3 组，其余以 * 代替（含 :: 压缩形式）
 * - 无法识别的格式（如 localhost）：原样返回
 */
export function maskIp(ip: string): string {
  if (!ip) return ip;
  // IPv4（含 IPv4-mapped IPv6 如 ::ffff:1.2.3.4，末段同样是 IPv4 末段）
  const ipv4Match = ip.match(/^(.*?)(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    return `${ipv4Match[1]}${ipv4Match[2]}.${ipv4Match[3]}.${ipv4Match[4]}.*`;
  }
  // IPv6：保留前 3 组
  if (ip.includes(":")) {
    const groups = ip.split(":").filter(Boolean);
    if (groups.length >= 4) {
      return `${groups.slice(0, 3).join(":")}:*`;
    }
  }
  return ip;
}
