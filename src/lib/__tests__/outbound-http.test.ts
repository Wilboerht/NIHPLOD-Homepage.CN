import { describe, it, expect, vi, beforeEach } from "vitest";
import { isPublicAddress, postPublicHttps } from "@/lib/outbound-http";

const { lookup } = vi.hoisted(() => ({ lookup: vi.fn() }));

vi.mock("node:dns", () => ({ promises: { lookup } }));

describe("isPublicAddress", () => {
  it("拒绝私网、回环、链路本地和保留地址", () => {
    for (const address of [
      "127.0.0.1",
      "10.0.0.1",
      "172.16.0.1",
      "192.168.1.1",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      "::1",
      "::",
      "fc00::1",
      "fe80::1",
      "::ffff:127.0.0.1",
    ]) {
      expect(isPublicAddress(address), address).toBe(false);
    }
  });

  it("允许公网 IPv4/IPv6", () => {
    expect(isPublicAddress("93.184.216.34")).toBe(true);
    expect(isPublicAddress("2001:4860:4860::8888")).toBe(true);
  });
});

describe("postPublicHttps", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("DNS 解析到私网地址时 fail-closed，不发起请求", async () => {
    lookup.mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(
      postPublicHttps("https://evil.example.com/hook", { method: "POST" })
    ).rejects.toThrow("OUTBOUND_PRIVATE_ADDRESS");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("仅允许 https 且拒绝 URL 内嵌凭据", async () => {
    await expect(postPublicHttps("http://example.com", {})).rejects.toThrow("OUTBOUND_HTTPS_ONLY");
    await expect(postPublicHttps("https://user:pass@example.com", {})).rejects.toThrow(
      "OUTBOUND_CREDENTIALS_FORBIDDEN"
    );
  });
});
