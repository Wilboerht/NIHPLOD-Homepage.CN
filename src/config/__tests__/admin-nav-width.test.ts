import { describe, expect, it } from "vitest";
import { getAdminPageWidth } from "@/config/admin-nav";

describe("getAdminPageWidth", () => {
  it("默认使用 5xl", () => {
    expect(getAdminPageWidth("/admin")).toBe("default");
    expect(getAdminPageWidth("/admin/users")).toBe("default");
  });

  it("多列表格使用 7xl", () => {
    expect(getAdminPageWidth("/admin/oauth-clients")).toBe("wide");
    expect(getAdminPageWidth("/admin/spent-adjustments")).toBe("wide");
  });

  it("设置与向导使用 3xl", () => {
    expect(getAdminPageWidth("/admin/oauth-clients/wizard")).toBe("narrow");
    expect(getAdminPageWidth("/admin/settings/totp")).toBe("narrow");
  });

  it("忽略末尾斜杠并按路由覆盖父级宽度", () => {
    expect(getAdminPageWidth("/admin/oauth-clients/")).toBe("wide");
    expect(getAdminPageWidth("/admin/oauth-clients/wizard/")).toBe("narrow");
  });
});
