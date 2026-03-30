/**
 * 金额工具函数
 * 处理货币金额的精度问题
 * 支持 number, string, Decimal (Prisma) 等类型
 */

// 允许的参数类型
type MoneyValue = number | string | any; // any 用于 Prisma Decimal 类型

/**
 * 将值转换为字符串
 */
function toStringValue(value: MoneyValue): string {
  if (value && typeof value === "object" && "toString" in value) {
    return value.toString();
  }
  return String(value);
}

/**
 * 将金额转换为分（整数）
 * @param amount 金额（元）
 * @returns 分数
 */
export function yuanToFen(amount: MoneyValue): number {
  const str = toStringValue(amount);
  const num = parseFloat(str);
  // 使用 Math.round 而不是 Math.floor 来处理浮点数误差
  return Math.round(num * 100);
}

/**
 * 将金额从分转换为元
 * @param fen 分数
 * @returns 金额（元）
 */
export function fenToYuan(fen: number): number {
  return Math.round(fen) / 100;
}

/**
 * 比较两个金额是否相等（允许一分钱的误差）
 * @param amount1 金额1
 * @param amount2 金额2
 * @param tolerance 容差（分）
 * @returns true 如果金额相等
 */
export function moneyEqual(
  amount1: MoneyValue,
  amount2: MoneyValue,
  tolerance: number = 1
): boolean {
  const fen1 = yuanToFen(amount1);
  const fen2 = yuanToFen(amount2);
  return Math.abs(fen1 - fen2) <= tolerance;
}

/**
 * 格式化金额为字符串
 * @param amount 金额
 * @returns 格式化的金额字符串（保留2位小数）
 */
export function formatMoney(amount: MoneyValue): string {
  const str = toStringValue(amount);
  const num = parseFloat(str);
  return num.toFixed(2);
}

/**
 * 确保金额精度
 * @param amount 金额
 * @returns 精确到分的金额
 */
export function ensureMoneyPrecision(amount: MoneyValue): number {
  return fenToYuan(yuanToFen(amount));
}

/**
 * 计算两个金额的差值（结果精确到分）
 * @param amount1 金额1
 * @param amount2 金额2
 * @returns 差值（元）
 */
export function moneyDiff(amount1: MoneyValue, amount2: MoneyValue): number {
  const fen1 = yuanToFen(amount1);
  const fen2 = yuanToFen(amount2);
  return fenToYuan(fen1 - fen2);
}

/**
 * 验证金额字符串格式
 * @param amount 金额字符串
 * @returns true 如果格式有效
 */
export function isValidMoneyFormat(amount: string): boolean {
  return /^\d+(\.\d{1,2})?$/.test(amount.trim());
}
