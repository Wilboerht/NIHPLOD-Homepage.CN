import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";

vi.mock("@/lib/prisma", () => {
  const prisma = {
    product: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    category: {
      findUnique: vi.fn(),
    },
    image: {
      findMany: vi.fn(),
    },
    purchaseLink: {
      findMany: vi.fn(),
    },
    $transaction: vi.fn(),
  };
  return { prisma, default: prisma };
});

vi.mock("@/lib/auth", () => ({
  verifyAuth: vi.fn(),
  checkAdminRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/csrf", () => ({
  validateCSRFToken: vi.fn().mockReturnValue(true),
  csrfForbiddenResponse: () =>
    NextResponse.json({ success: false, error: { code: "CSRF_INVALID" } }, { status: 403 }),
}));

vi.mock("@/lib/audit", () => ({
  createAuditLog: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), log: vi.fn() },
}));

vi.mock("@/lib/search-push", () => ({
  pushSearchEngines: vi.fn(),
}));

vi.mock("@/lib/admin-permissions", () => ({
  hasAdminPermission: vi.fn().mockReturnValue(true),
}));

vi.mock("@/lib/admin-totp", () => ({
  requireAdminStepUp: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/html-sanitize", () => ({
  sanitizeHtml: vi.fn((html: string | null | undefined) => html ?? ""),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

import { POST } from "../route";
import { PUT } from "../[id]/route";
import { prisma } from "@/lib/prisma";
import { verifyAuth } from "@/lib/auth";

const OWNER = { id: "admin-1", email: "owner@test.com", name: "Owner", role: "owner" };
const PRODUCT_ID = "cjld2cjxh0000qzrmn831i7rn";

const basePayload = {
  name: "测试产品",
  nameEn: "Test Product",
  slug: "test-product",
  categoryId: "category-1",
  price: 100,
  capacity: null,
  origin: null,
  description: "<p>产品描述</p>",
  ingredients: null,
  usage: null,
  benefits: ["保湿"],
  images: [{ url: "/images/test.jpg", order: 0 }],
  purchaseLinks: [],
  order: 0,
  published: false,
};

const faqs = [{ question: "问题一", answer: "答案一" }];

function createRequest(url: string, body: unknown) {
  return new NextRequest(url, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  } as never);
}

const existingProduct = {
  id: PRODUCT_ID,
  slug: "test-product",
  published: false,
  price: 100,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("产品 GEO FAQ 持久化", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyAuth).mockResolvedValue(OWNER as never);
    (prisma.product.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.product.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.category.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "category-1",
    });
    (prisma.image.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.purchaseLink.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.product.create as ReturnType<typeof vi.fn>).mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({
        ...existingProduct,
        ...data,
      })
    );
  });

  it("POST 无 FAQ 时使用 Prisma.DbNull", async () => {
    const res = await POST(createRequest("http://localhost/api/admin/products", basePayload));

    expect(res.status).toBe(200);
    const data = (prisma.product.create as ReturnType<typeof vi.fn>).mock.calls[0][0].data;
    expect(data.geoFaqs).toBe(Prisma.DbNull);
  });

  it("POST 有 FAQ 时写入数组", async () => {
    const res = await POST(
      createRequest("http://localhost/api/admin/products", { ...basePayload, geoFaqs: faqs })
    );

    expect(res.status).toBe(200);
    const data = (prisma.product.create as ReturnType<typeof vi.fn>).mock.calls[0][0].data;
    expect(data.geoFaqs).toEqual(faqs);
  });

  it("PUT 清空 FAQ 时使用 Prisma.DbNull", async () => {
    const tx = {
      product: { update: vi.fn().mockResolvedValue(existingProduct) },
      image: { deleteMany: vi.fn(), create: vi.fn(), update: vi.fn() },
      purchaseLink: { deleteMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    };
    (prisma.product.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(existingProduct);
    (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)
    );

    const res = await PUT(
      createRequest(`http://localhost/api/admin/products/${PRODUCT_ID}`, {
        ...basePayload,
        geoFaqs: null,
      }),
      { params: Promise.resolve({ id: PRODUCT_ID }) }
    );

    expect(res.status).toBe(200);
    expect(tx.product.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ geoFaqs: Prisma.DbNull }),
      })
    );
  });
});
