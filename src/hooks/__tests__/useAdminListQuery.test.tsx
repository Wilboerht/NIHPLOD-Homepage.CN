// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useAdminListQuery } from "../useAdminListQuery";

const apiGetMock = vi.fn();
vi.mock("@/lib/api-client", () => ({
  apiGet: (...args: unknown[]) => apiGetMock(...args),
  getApiErrorMessage: (error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback,
}));

describe("useAdminListQuery", () => {
  beforeEach(() => {
    apiGetMock.mockReset();
  });

  it("加载成功后返回 data 并结束 loading", async () => {
    apiGetMock.mockResolvedValue({ items: [1] });

    const { result } = renderHook(() =>
      useAdminListQuery<{ items: number[] }>({
        path: "/api/admin/example",
        params: { page: 1 },
      })
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual({ items: [1] });
    expect(result.current.error).toBeNull();
  });

  it("加载失败时返回错误文案并触发 onError", async () => {
    apiGetMock.mockRejectedValue(new Error("boom"));
    const onError = vi.fn();

    const { result } = renderHook(() =>
      useAdminListQuery({
        path: "/api/admin/example",
        params: { page: 1 },
        onError,
      })
    );

    await waitFor(() => expect(result.current.error).toBe("boom"));
    expect(result.current.loading).toBe(false);
    expect(onError).toHaveBeenCalledWith("boom");
  });

  it("enabled=false 时不发起请求", async () => {
    const { result } = renderHook(() =>
      useAdminListQuery({
        path: "/api/admin/example",
        params: { page: 1 },
        enabled: false,
      })
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(apiGetMock).not.toHaveBeenCalled();
  });
});
