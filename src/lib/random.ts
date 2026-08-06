/**
 * 加密安全的随机数工具
 * 所有函数仅在服务端（Node.js）环境中使用
 */
import { randomInt as nodeRandomInt } from "crypto";

/**
 * 生成指定范围内的安全随机整数 [min, max)
 */
export function randomInt(min: number, max: number): number {
  if (!Number.isInteger(min) || !Number.isInteger(max)) {
    throw new Error(`randomInt: min 和 max 必须为整数，收到 min=${min}, max=${max}`);
  }
  if (min >= max) {
    throw new Error(`randomInt: min (${min}) 必须小于 max (${max})`);
  }
  return nodeRandomInt(min, max);
}
