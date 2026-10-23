import { z } from "zod";
import type { MembershipLevel, Prisma, UserStatus } from "@/generated/prisma/client";
import prisma from "@/lib/prisma";

export const userListQuerySchema = z.object({
  page: z.preprocess((val) => (val ? Number(val) : 1), z.number().min(1).max(1000)),
  pageSize: z.preprocess((val) => (val ? Number(val) : 20), z.number().min(1).max(100)),
  search: z.string().max(100).nullish(),
  status: z.enum(["ACTIVE", "SUSPENDED", "BANNED", "DELETED"]).nullish(),
  level: z.enum(["REGULAR", "SILVER", "GOLD", "DIAMOND"]).nullish(),
});

export type UserListQuery = z.infer<typeof userListQuerySchema>;

export function buildUserWhere(
  filters: Pick<UserListQuery, "search" | "status" | "level">
): Prisma.UserWhereInput {
  const where: Prisma.UserWhereInput = {};
  if (filters.search) {
    where.OR = [
      { id: { equals: filters.search } },
      { phone: { equals: filters.search } },
      { nickname: { contains: filters.search, mode: "insensitive" } },
    ];
  }
  if (filters.status) where.status = filters.status as UserStatus;
  if (filters.level) where.membershipLevel = filters.level as MembershipLevel;
  return where;
}

interface UserBatchOptions<S extends Prisma.UserSelect> {
  where: Prisma.UserWhereInput;
  select: S;
  batchSize?: number;
}

export async function* iterateUserBatches<S extends Prisma.UserSelect>(
  options: UserBatchOptions<S>
): AsyncGenerator<Prisma.UserGetPayload<{ select: S }>[]> {
  const batchSize = options.batchSize ?? 200;
  let cursor: { createdAt: Date; id: string } | null = null;

  while (true) {
    const cursorWhere: Prisma.UserWhereInput | null = cursor
      ? {
          OR: [
            { createdAt: { lt: cursor.createdAt } },
            { createdAt: cursor.createdAt, id: { gt: cursor.id } },
          ],
        }
      : null;
    const where: Prisma.UserWhereInput = cursorWhere
      ? { AND: [options.where, cursorWhere] }
      : options.where;

    const rows = await prisma.user.findMany({
      where,
      select: options.select,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: batchSize,
    });

    if (rows.length === 0) break;
    yield rows;
    if (rows.length < batchSize) break;

    const last = rows[rows.length - 1] as unknown as { createdAt: Date; id: string };
    if (!last.createdAt || !last.id) break;
    cursor = { createdAt: last.createdAt, id: last.id };
  }
}
