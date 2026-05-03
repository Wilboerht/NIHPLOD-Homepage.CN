import { Prisma } from "@/generated/prisma/client";

/**
 * 将验证后的 JSON 数据转换为 Prisma InputJsonValue
 *
 * Prisma 的 Json 字段使用递归类型 `InputJsonValue`，TypeScript 有时无法
 * 直接将 Zod 推断出的对象数组赋值给它。此函数提供一处集中的类型断言，
 * 避免在业务代码中散落 `as unknown as`。
 */
export function toInputJson<T>(value: T | null | undefined): Prisma.InputJsonValue | undefined {
  return value as unknown as Prisma.InputJsonValue | undefined;
}
