import Redis from "ioredis";

const redis = new Redis(process.env.REDIS_URL!, {
  lazyConnect: true,
  connectTimeout: 3000,
  maxRetriesPerRequest: 2,
  enableOfflineQueue: false,
});
const PREFIX = "nihplod:next:";
const TAG_PREFIX = "nihplod:next-tags:";

function encode(value: unknown): string {
  return JSON.stringify(value, (_key, item) => {
    if (item?.type === "Buffer" && Array.isArray(item.data)) {
      return { __nihplodType: "Buffer", data: Buffer.from(item.data).toString("base64") };
    }
    if (item instanceof Map) return { __nihplodType: "Map", data: [...item.entries()] };
    return item;
  });
}

function revive(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(revive);
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  if (record.__nihplodType === "Buffer") return Buffer.from(String(record.data), "base64");
  if (record.__nihplodType === "Map") return new Map(record.data as Iterable<[unknown, unknown]>);
  return Object.fromEntries(Object.entries(record).map(([key, item]) => [key, revive(item)]));
}

export default class RedisCacheHandler {
  async get(key: string) {
    const value = await redis.get(PREFIX + key);
    return value ? revive(JSON.parse(value)) : null;
  }

  async set(key: string, data: unknown, ctx: { tags?: string[] }) {
    const tags = ctx.tags ?? [];
    const record = data as { revalidate?: number } | null;
    const ttl = Math.max(60, Math.min(Number(record?.revalidate) || 3600, 86400));
    await redis.set(PREFIX + key, encode(data), "EX", ttl);
    for (const tag of tags) {
      await redis.sadd(TAG_PREFIX + tag, key);
      await redis.expire(TAG_PREFIX + tag, 86400);
    }
  }

  async revalidateTag(tag: string | string[]) {
    const tags = Array.isArray(tag) ? tag : [tag];
    for (const item of tags) {
      const keys = await redis.smembers(TAG_PREFIX + item);
      if (keys.length > 0) await redis.del(keys.map((key: string) => PREFIX + key));
      await redis.del(TAG_PREFIX + item);
    }
  }

  async refreshTags() {}

  resetRequestCache() {}
}
