import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  advisorRequest: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock("next/server", () => ({
  after: (fn: () => void) => fn(),
}));
vi.mock("@/lib/prisma", () => ({
  default: { product: { findMany: mocks.findMany } },
}));
vi.mock("@/lib/advisor-internal", () => ({
  advisorRequest: mocks.advisorRequest,
}));
vi.mock("@/lib/logger", () => ({
  apiConsole: {
    info: mocks.info,
    warn: mocks.warn,
    error: mocks.error,
    debug: vi.fn(),
  },
}));

import {
  buildAdvisorProductSnapshot,
  pushAdvisorProductSnapshot,
} from "../advisor-product-sync";

function productRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "p1",
    name: "测试产品",
    price: 2800,
    capacity: "50ml",
    description: "<p>主站描述</p>",
    usage: "<p>每晚使用</p>",
    origin: "法国",
    benefits: ["保湿", "修护"],
    published: true,
    updatedAt: new Date("2026-10-27T00:00:00.000Z"),
    category: { name: "面霜" },
    images: [
      { url: "/uploads/products/a.webp", order: 0 },
      { url: "https://nihplod.cn/uploads/products/b.webp", order: 1 },
    ],
    purchaseLinks: [
      {
        platform: "天猫国际",
        platformKey: "tmall",
        url: "https://tmall.example/1",
        miniProgramShortLink: null,
        miniProgramPath: null,
        order: 0,
      },
      {
        platform: "官方商城",
        platformKey: null,
        url: "https://official.example",
        miniProgramShortLink: null,
        miniProgramPath: null,
        order: 1,
      },
      {
        platform: "小红书",
        platformKey: "xiaohongshu",
        url: "https://xhs.example",
        miniProgramShortLink: null,
        miniProgramPath: null,
        order: 2,
      },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.ADVISOR_PRODUCT_SYNC_ENABLED;
  process.env.NEXT_PUBLIC_APP_URL = "https://nihplod.cn";
  mocks.findMany.mockResolvedValue([productRow()]);
});

describe("buildAdvisorProductSnapshot", () => {
  it("构建共享字段快照：绝对图片、纯文本、纯数字价格、过滤不支持平台", async () => {
    const snapshot = await buildAdvisorProductSnapshot();
    expect(snapshot.schemaVersion).toBe(1);
    expect(snapshot.products).toHaveLength(1);
    const item = snapshot.products[0];
    expect(item.sourceProductId).toBe("p1");
    expect(item.price).toBe("2800");
    expect(item.description).toBe("主站描述");
    expect(item.howToUse).toBe("每晚使用");
    expect(item.images).toEqual([
      "https://nihplod.cn/uploads/products/a.webp",
      "https://nihplod.cn/uploads/products/b.webp",
    ]);
    expect(item.purchaseLinks.map((link) => link.platformKey)).toEqual([
      "tmall",
      "xiaohongshu",
    ]);
    expect(item.purchaseLinksTotal).toBe(3);
    expect(item.benefits).toEqual(["保湿", "修护"]);
  });

  it("图片最多 5 张，超过部分截断", async () => {
    mocks.findMany.mockResolvedValue([
      productRow({
        images: Array.from({ length: 7 }, (_, index) => ({
          url: `https://nihplod.cn/uploads/products/${index}.webp`,
          order: index,
        })),
      }),
    ]);
    const snapshot = await buildAdvisorProductSnapshot();
    expect(snapshot.products[0].images).toHaveLength(5);
    expect(mocks.warn).toHaveBeenCalled();
  });

  it("www 域名收敛到裸域", async () => {
    mocks.findMany.mockResolvedValue([
      productRow({
        images: [
          {
            url: "https://www.nihplod.cn/uploads/products/a.webp",
            order: 0,
          },
        ],
      }),
    ]);
    const snapshot = await buildAdvisorProductSnapshot();
    expect(snapshot.products[0].images[0]).toBe(
      "https://nihplod.cn/uploads/products/a.webp"
    );
  });
});

describe("pushAdvisorProductSnapshot", () => {
  it("成功后返回子站统计", async () => {
    mocks.advisorRequest.mockResolvedValue({
      ok: true,
      status: 200,
      data: { success: true, data: { updated: 1, created: 0 } },
    });

    const result = await pushAdvisorProductSnapshot({ trigger: "manual" });
    expect(result.ok).toBe(true);
    expect(result.productCount).toBe(1);
    expect(result.data).toEqual({ updated: 1, created: 0 });
    expect(mocks.advisorRequest).toHaveBeenCalledWith(
      "/api/internal/admin/products/sync",
      expect.objectContaining({
        method: "POST",
        body: expect.objectContaining({
          schemaVersion: 1,
          products: expect.any(Array),
          options: expect.objectContaining({ trigger: "manual" }),
        }),
      })
    );
  });

  it("停用开关生效时不请求子站", async () => {
    process.env.ADVISOR_PRODUCT_SYNC_ENABLED = "false";
    const result = await pushAdvisorProductSnapshot({ trigger: "manual" });
    expect(result).toMatchObject({ ok: true, skipped: true, reason: "disabled" });
    expect(mocks.advisorRequest).not.toHaveBeenCalled();
  });

  it("子站 4xx 错误直接返回，不重试", async () => {
    mocks.advisorRequest.mockResolvedValue({
      ok: false,
      status: 400,
      code: "INVALID_SNAPSHOT",
      message: "bad snapshot",
    });
    const result = await pushAdvisorProductSnapshot({ trigger: "manual" });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("INVALID_SNAPSHOT");
    expect(mocks.advisorRequest).toHaveBeenCalledTimes(1);
  });

  it("快照构建失败时返回错误", async () => {
    mocks.findMany.mockRejectedValue(new Error("db down"));
    const result = await pushAdvisorProductSnapshot({ trigger: "manual" });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("SNAPSHOT_BUILD_FAILED");
  });
});
