/**
 * 金额工具函数
 * 处理货币金额的精度问题
 * 支持 number, string, Decimal (Prisma) 等类型
 */

// 允许的参数类型
type MoneyValue = number | string | { toString(): string }; // 支持 Prisma Decimal 等具有 toString 方法的类型

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
 * 严格比较两个金额是否完全相等（无容差）
 * 用于支付回调等不可容忍任何金额差异的场景
 */
export function moneyStrictEqual(amount1: MoneyValue, amount2: MoneyValue): boolean {
  const fen1 = yuanToFen(amount1);
  const fen2 = yuanToFen(amount2);
  return fen1 === fen2;
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


