import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({
  unstable_cache: (fn: unknown) => fn,
}));

vi.mock("@/lib/prisma", () => {
  const prisma = {
    product: {
      findMany: vi.fn(),
    },
  };
  return { prisma, default: prisma };
});

import { getLlmsDocs } from "../llms-docs-server";
import prisma from "@/lib/prisma";

const product = {
  name: "恒采修护面霜",
  nameEn: "Face Cream",
  slug: "face-cream",
  description: "<p>面霜描述</p>",
  price: 1880,
  benefits: ["抗衰老"],
  ingredients: "玻色因",
  usage: "早晚使用",
  capacity: "50g",
  origin: "摩纳哥",
  category: { name: "面霜" },
  geoFaqs: null,
  purchaseLinks: [{ platform: "天猫" }],
};

describe("getLlmsDocs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("从已发布产品生成 full 与 summary，并包含规则兜底 FAQ", async () => {
    (prisma.product.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([product]);

    const docs = await getLlmsDocs();

    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { published: true, category: { visible: true } },
      })
    );
    expect(docs.full).toContain("恒采修护面霜");
    expect(docs.full).toContain("NIHPLOD 恒采修护面霜的核心功效是什么？");
    expect(docs.full).not.toContain("<p>");
    expect(docs.summary).toContain("恒采修护面霜");
  });
});
