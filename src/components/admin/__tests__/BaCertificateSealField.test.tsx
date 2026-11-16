// @vitest-environment jsdom

import React, { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { BaCertificateSealField } from "@/components/admin/BaCertificateSealField";

const apiRequestMock = vi.fn();

vi.mock("@/lib/api-client", () => ({
  apiRequest: (...args: unknown[]) => apiRequestMock(...args),
  getApiErrorMessage: (error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback,
}));

const createObjectURLMock = vi.fn(() => "blob:seal-preview");
const revokeObjectURLMock = vi.fn();

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function ControlledSealField({
  initialValue = "",
  onChange,
  onUploadingChange,
}: {
  initialValue?: string;
  onChange?: (url: string) => void;
  onUploadingChange?: (uploading: boolean) => void;
}) {
  const [value, setValue] = useState(initialValue);
  return (
    <BaCertificateSealField
      value={value}
      onChange={(url) => {
        setValue(url);
        onChange?.(url);
      }}
      onUploadingChange={onUploadingChange}
    />
  );
}

function selectFile(file: File) {
  fireEvent.change(screen.getByLabelText("选择自定义签章图片"), {
    target: { files: [file] },
  });
}

describe("BaCertificateSealField", () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
    createObjectURLMock.mockClear();
    revokeObjectURLMock.mockClear();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectURLMock,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectURLMock,
    });
  });

  it("默认展示系统默认公章", () => {
    render(<ControlledSealField />);

    expect(screen.getByText("系统默认公章")).toBeInTheDocument();
    expect(screen.getByText("默认使用")).toBeInTheDocument();
    expect(screen.getByText("旎柏（上海）商贸有限公司")).toBeInTheDocument();
  });

  it("默认章加载失败时展示占位并可重试", () => {
    render(<ControlledSealField />);

    fireEvent.error(screen.getByAltText("系统默认公章预览"));

    expect(
      screen.getByText("默认签章预览暂不可用，签发时仍会使用系统默认章。")
    ).toBeInTheDocument();
    expect(screen.queryByAltText("系统默认公章预览")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "重试" }));

    expect(screen.getByAltText("系统默认公章预览")).toBeInTheDocument();
  });

  it("上传成功后切换为自定义签章并回传 URL", async () => {
    apiRequestMock.mockResolvedValue({ url: "/uploads/certificates/seal.png" });
    const onChange = vi.fn();
    render(<ControlledSealField onChange={onChange} />);

    selectFile(new File(["x"], "seal.png", { type: "image/png" }));

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith("/uploads/certificates/seal.png")
    );
    expect(screen.getByText("自定义签章")).toBeInTheDocument();
    expect(screen.getByText("seal.png")).toBeInTheDocument();
  });

  it("上传失败时展示内联错误且不回传 URL", async () => {
    apiRequestMock.mockRejectedValue(new Error("签章上传失败，请重试"));
    const onChange = vi.fn();
    render(<ControlledSealField onChange={onChange} />);

    selectFile(new File(["x"], "seal.png", { type: "image/png" }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("签章上传失败，请重试")
    );
    expect(onChange).not.toHaveBeenCalled();
  });

  it("客户端拦截非法类型", async () => {
    const onChange = vi.fn();
    render(<ControlledSealField onChange={onChange} />);

    selectFile(new File(["x"], "seal.txt", { type: "text/plain" }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("签章仅支持 PNG/JPEG/WebP 图片")
    );
    expect(apiRequestMock).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("恢复默认签章会回传空字符串并回到默认态", () => {
    const onChange = vi.fn();
    render(
      <ControlledSealField
        initialValue="/uploads/certificates/seal.png"
        onChange={onChange}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /恢复默认签章/ }));

    expect(onChange).toHaveBeenCalledWith("");
    expect(screen.getByText("默认使用")).toBeInTheDocument();
  });

  it("上传期间通知父组件并禁用上传按钮", async () => {
    const deferred = createDeferred<{ url: string }>();
    apiRequestMock.mockReturnValue(deferred.promise);
    const onUploadingChange = vi.fn();
    render(<ControlledSealField onUploadingChange={onUploadingChange} />);

    selectFile(new File(["x"], "seal.png", { type: "image/png" }));

    await waitFor(() => expect(onUploadingChange).toHaveBeenCalledWith(true));
    expect(screen.getByRole("button", { name: /上传自定义签章/ })).toBeDisabled();

    deferred.resolve({ url: "/uploads/certificates/seal.png" });
    await waitFor(() => expect(onUploadingChange).toHaveBeenCalledWith(false));
  });
});
