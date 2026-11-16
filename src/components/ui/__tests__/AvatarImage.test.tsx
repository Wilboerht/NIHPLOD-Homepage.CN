// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AvatarImage } from "@/components/ui/AvatarImage";

function renderAvatar(src: string | null) {
  const { container } = render(
    <div className="relative h-16 w-16">
      <AvatarImage src={src} alt="头像" />
    </div>
  );
  return container.querySelector("img");
}

describe("AvatarImage", () => {
  it("不可信外链直接回退默认头像（不发起第三方请求）", () => {
    const img = renderAvatar("https://thirdwx.qlogo.cn/mmopen/a.png");
    expect(img?.getAttribute("src")).toMatch(/\/images\/default-avatar-warm\.svg$/);
  });

  it("自有域名/站内路径正常渲染", () => {
    expect(renderAvatar("/uploads/avatars/a.webp")?.getAttribute("src")).toMatch(
      /\/uploads\/avatars\/a\.webp$/
    );
    expect(renderAvatar("https://nihplod.cn/uploads/a.webp")?.getAttribute("src")).toBe(
      "https://nihplod.cn/uploads/a.webp"
    );
  });

  it("无头像时渲染默认头像", () => {
    expect(renderAvatar(null)?.getAttribute("src")).toMatch(/\/images\/default-avatar-warm\.svg$/);
  });
});
