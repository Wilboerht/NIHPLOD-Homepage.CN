// @vitest-environment jsdom

import React from "react";
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { UserAvatar } from "@/components/admin/UserAvatar";

describe("UserAvatar", () => {
  it("渲染站内相对路径头像", () => {
    const { container } = render(<UserAvatar src="/uploads/avatars/a.webp" name="张三" />);
    const image = container.querySelector("img");

    expect(image).not.toBeNull();
    expect(image?.getAttribute("src")).toContain("/uploads/avatars/a.webp");
  });

  it("无头像时回退昵称首字母", () => {
    render(<UserAvatar name="张三" />);
    expect(screen.getByText("张")).toBeInTheDocument();
  });

  it("头像加载失败时回退昵称首字母", () => {
    const { container } = render(<UserAvatar src="/uploads/avatars/broken.webp" name="李四" />);
    const image = container.querySelector("img");
    expect(image).not.toBeNull();

    fireEvent.error(image as HTMLImageElement);

    expect(screen.getByText("李")).toBeInTheDocument();
  });
});
