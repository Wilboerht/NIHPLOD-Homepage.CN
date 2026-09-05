/**
 * 收货地址 API 测试
 * 覆盖：列表、新增（首条自动默认/显式默认取消其他/校验/上限）、
 *      编辑（字段更新/设默认/取消默认自动补默认/越权 404）、删除（默认删除自动补默认）
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const ADDR_ID = "c" + "a".repeat(24);

const { tx } = vi.hoisted(() => {
  const userAddress = {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    delete: vi.fn(),
  };
  return { tx: userAddress };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    userAddress: tx,
    $transaction: vi.fn(async (fn: (t: { userAddress: typeof tx }) => Promise<unknown>) =>
      fn({ userAddress: tx })
    ),
  },
}));

vi.mock("@/lib/auth", () => ({
  withUserAuth:
    (handler: (req: NextRequest, payload: { id: string }) => unknown) => (req: NextRequest) =>
      handler(req, { id: "user-1" }),
  verifyUserAuth: vi.fn(() => Promise.resolve({ id: "user-1" })),
}));

vi.mock("@/lib/csrf", () => ({
  validateCSRFToken: vi.fn(() => true),
  csrfForbiddenResponse: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), log: vi.fn(), debug: vi.fn() },
}));

import { GET, POST } from "@/app/api/user/addresses/route";
import { PATCH, DELETE } from "@/app/api/user/addresses/[id]/route";

const mockTx = tx as { [K in keyof typeof tx]: ReturnType<typeof vi.fn> };

function request(method: string, path: string, body?: unknown): NextRequest {
  return new NextRequest(new URL(path, "http://localhost:3000"), {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  } as never);
}

const VALID_FIELDS = {
  recipient: "张三",
  phone: "13800138000",
  region: "上海市 浦东新区",
  detail: "世纪大道 100 号",
};

const ADDRESS_VIEW = { id: ADDR_ID, ...VALID_FIELDS, isDefault: false };

describe("GET /api/user/addresses", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("返回地址列表（默认优先排序由 DB 负责）", async () => {
    mockTx.findMany.mockResolvedValue([{ ...ADDRESS_VIEW, isDefault: true }, ADDRESS_VIEW]);

    const res = await GET(request("GET", "/api/user/addresses"));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.addresses).toHaveLength(2);
    expect(data.data.addresses[0].isDefault).toBe(true);
    expect(mockTx.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-1" },
        orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
      })
    );
  });
});

describe("POST /api/user/addresses", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTx.count.mockResolvedValue(0);
    mockTx.create.mockResolvedValue({ ...ADDRESS_VIEW, isDefault: true });
  });

  it("参数校验失败应返回 400 INVALID_PARAMS", async () => {
    const res = await POST(request("POST", "/api/user/addresses", { ...VALID_FIELDS, phone: "123" }));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error.code).toBe("INVALID_PARAMS");
  });

  it("第一条地址自动设为默认（同时取消其他默认，防御性）", async () => {
    const res = await POST(request("POST", "/api/user/addresses", VALID_FIELDS));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.address.isDefault).toBe(true);
    expect(mockTx.updateMany).toHaveBeenCalledWith({
      where: { userId: "user-1", isDefault: true },
      data: { isDefault: false },
    });
    expect(mockTx.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: "user-1", ...VALID_FIELDS, isDefault: true }),
    });
  });

  it("已有地址且显式指定默认：取消其他默认", async () => {
    mockTx.count.mockResolvedValue(2);
    mockTx.create.mockResolvedValue({ ...ADDRESS_VIEW, isDefault: true });

    const res = await POST(request("POST", "/api/user/addresses", { ...VALID_FIELDS, isDefault: true }));

    expect(res.status).toBe(200);
    expect(mockTx.updateMany).toHaveBeenCalled();
  });

  it("已有地址且未指定默认：新地址非默认", async () => {
    mockTx.count.mockResolvedValue(2);
    mockTx.create.mockResolvedValue(ADDRESS_VIEW);

    const res = await POST(request("POST", "/api/user/addresses", VALID_FIELDS));

    expect(res.status).toBe(200);
    expect(mockTx.updateMany).not.toHaveBeenCalled();
    expect(mockTx.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ isDefault: false }),
    });
  });

  it("达到上限应返回 400 ADDRESS_LIMIT", async () => {
    mockTx.count.mockResolvedValue(20);

    const res = await POST(request("POST", "/api/user/addresses", VALID_FIELDS));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error.code).toBe("ADDRESS_LIMIT");
  });
});

describe("PATCH /api/user/addresses/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTx.findUnique.mockResolvedValue({ userId: "user-1", isDefault: false });
    mockTx.update.mockResolvedValue(ADDRESS_VIEW);
  });

  it("更新地址字段", async () => {
    const res = await PATCH(
      request("PATCH", `/api/user/addresses/${ADDR_ID}`, { ...VALID_FIELDS, recipient: "李四" }),
      { params: Promise.resolve({ id: ADDR_ID }) }
    );

    expect(res.status).toBe(200);
    expect(mockTx.update).toHaveBeenCalledWith({
      where: { id: ADDR_ID },
      data: expect.objectContaining({ recipient: "李四", isDefault: undefined }),
    });
  });

  it("设为默认：取消其他默认", async () => {
    const res = await PATCH(
      request("PATCH", `/api/user/addresses/${ADDR_ID}`, { ...VALID_FIELDS, isDefault: true }),
      { params: Promise.resolve({ id: ADDR_ID }) }
    );

    expect(res.status).toBe(200);
    expect(mockTx.updateMany).toHaveBeenCalledWith({
      where: { userId: "user-1", isDefault: true, id: { not: ADDR_ID } },
      data: { isDefault: false },
    });
  });

  it("原默认地址被取消默认：自动提升最早一条", async () => {
    mockTx.findUnique.mockResolvedValue({ userId: "user-1", isDefault: true });
    mockTx.findFirst.mockResolvedValue({ id: "other-addr" });

    const res = await PATCH(
      request("PATCH", `/api/user/addresses/${ADDR_ID}`, { ...VALID_FIELDS, isDefault: false }),
      { params: Promise.resolve({ id: ADDR_ID }) }
    );

    expect(res.status).toBe(200);
    expect(mockTx.findFirst).toHaveBeenCalledWith({
      where: { userId: "user-1", id: { not: ADDR_ID } },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    expect(mockTx.update).toHaveBeenCalledWith({
      where: { id: "other-addr" },
      data: { isDefault: true },
    });
  });

  it("地址不存在或不属于当前用户：404", async () => {
    mockTx.findUnique.mockResolvedValue({ userId: "other-user", isDefault: false });

    const res = await PATCH(
      request("PATCH", `/api/user/addresses/${ADDR_ID}`, VALID_FIELDS),
      { params: Promise.resolve({ id: ADDR_ID }) }
    );
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data.error.code).toBe("NOT_FOUND");
  });
});

describe("DELETE /api/user/addresses/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTx.findUnique.mockResolvedValue({ userId: "user-1", isDefault: false });
  });

  it("删除地址", async () => {
    const res = await DELETE(request("DELETE", `/api/user/addresses/${ADDR_ID}`), {
      params: Promise.resolve({ id: ADDR_ID }),
    });

    expect(res.status).toBe(200);
    expect(mockTx.delete).toHaveBeenCalledWith({ where: { id: ADDR_ID } });
    expect(mockTx.findFirst).not.toHaveBeenCalled();
  });

  it("删除默认地址：自动提升最早一条", async () => {
    mockTx.findUnique.mockResolvedValue({ userId: "user-1", isDefault: true });
    mockTx.findFirst.mockResolvedValue({ id: "other-addr" });

    const res = await DELETE(request("DELETE", `/api/user/addresses/${ADDR_ID}`), {
      params: Promise.resolve({ id: ADDR_ID }),
    });

    expect(res.status).toBe(200);
    expect(mockTx.update).toHaveBeenCalledWith({
      where: { id: "other-addr" },
      data: { isDefault: true },
    });
  });

  it("地址不存在或不属于当前用户：404", async () => {
    mockTx.findUnique.mockResolvedValue({ userId: "other-user", isDefault: false });

    const res = await DELETE(request("DELETE", `/api/user/addresses/${ADDR_ID}`), {
      params: Promise.resolve({ id: ADDR_ID }),
    });
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data.error.code).toBe("NOT_FOUND");
  });
});
