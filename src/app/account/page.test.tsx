/**
 * /account 兼容入口重定向测试
 * 覆盖：无 tab 参数默认 profile、合法 tab 透传、非法 tab 回退 profile
 */
import { describe, it, expect, vi } from "vitest";

const mockRedirect = vi.fn((url: string): never => {
  throw new Error(`NEXT_REDIRECT:${url}`);
});

vi.mock("next/navigation", () => ({
  redirect: (url: string) => mockRedirect(url),
}));

import AccountPage from "@/app/account/page";

async function expectRedirect(searchParams: Promise<{ tab?: string }>) {
  await expect(AccountPage({ searchParams })).rejects.toThrow(/^NEXT_REDIRECT:/);
  return mockRedirect.mock.calls[mockRedirect.mock.calls.length - 1][0];
}

describe("/account 重定向", () => {
  it("无 tab 参数时默认重定向到 profile（个人信息为弹窗默认视图）", async () => {
    const url = await expectRedirect(Promise.resolve({}));
    expect(url).toBe("/?account=profile");
  });

  it("合法 tab 参数透传", async () => {
    const url = await expectRedirect(Promise.resolve({ tab: "devices" }));
    expect(url).toBe("/?account=devices");
  });

  it("非法 tab 参数回退到 profile", async () => {
    const url = await expectRedirect(Promise.resolve({ tab: "hack" }));
    expect(url).toBe("/?account=profile");
  });
});
