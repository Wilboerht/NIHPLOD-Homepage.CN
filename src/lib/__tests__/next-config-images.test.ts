import { describe, expect, it } from "vitest";
import nextConfig from "../../../next.config.mjs";

describe("next image config", () => {
  it("允许商品主图使用的 quality=90", () => {
    expect(nextConfig.images?.qualities).toContain(75);
    expect(nextConfig.images?.qualities).toContain(90);
  });
});
