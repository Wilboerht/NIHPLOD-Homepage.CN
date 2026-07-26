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
