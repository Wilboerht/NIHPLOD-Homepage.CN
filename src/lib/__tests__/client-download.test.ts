// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { downloadFromUrl, parseContentDispositionFilename } from "@/lib/client-download";

describe("parseContentDispositionFilename", () => {
  it("解析普通 filename", () => {
    expect(
      parseContentDispositionFilename('attachment; filename="users-2026-10-23.csv"')
    ).toBe("users-2026-10-23.csv");
  });

  it("优先解析 RFC 5987 filename* 并解码中文", () => {
    expect(
      parseContentDispositionFilename(
        "attachment; filename=fallback.csv; filename*=UTF-8''%E7%94%A8%E6%88%B7.csv"
      )
    ).toBe("用户.csv");
  });

  it("移除路径分隔符并返回 null 处理空值", () => {
    expect(parseContentDispositionFilename('attachment; filename="../etc/passwd"')).toBe(
      ".._etc_passwd"
    );
    expect(parseContentDispositionFilename(null)).toBeNull();
    expect(parseContentDispositionFilename("attachment")).toBeNull();
  });
});

describe("downloadFromUrl", () => {
  const createObjectURL = vi.fn();
  const revokeObjectURL = vi.fn();
  let clickSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    createObjectURL.mockReset().mockReturnValue("blob:test");
    revokeObjectURL.mockReset();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectURL });
    clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    document.body.innerHTML = "";
  });

  afterEach(() => {
    clickSpy.mockRestore();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("成功时使用响应头文件名并触发 blob 下载", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("a,b", {
          status: 200,
          headers: {
            "Content-Disposition": 'attachment; filename="audit-logs.csv"',
            "Content-Type": "text/csv",
          },
        })
      )
    );

    await downloadFromUrl("/api/admin/audit-logs?export=csv", "fallback.csv");

    expect(fetch).toHaveBeenCalledWith(
      "/api/admin/audit-logs?export=csv",
      expect.objectContaining({ credentials: "same-origin", cache: "no-store" })
    );
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);

    vi.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:test");
  });

  it("响应头缺失时使用 fallback 文件名", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("x", { status: 200 })));

    await downloadFromUrl("/export", "users.csv");

    const anchor = clickSpy.mock.instances[0] as HTMLAnchorElement;
    expect(anchor.download).toBe("users.csv");
  });

  it("非 2xx 时抛出服务端错误信息，不创建 blob", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ success: false, error: { message: "权限不足：导出审计日志" } }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        )
      )
    );

    await expect(downloadFromUrl("/export", "x.csv")).rejects.toThrow("权限不足：导出审计日志");
    expect(createObjectURL).not.toHaveBeenCalled();
  });
});
