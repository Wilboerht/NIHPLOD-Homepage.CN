import { describe, expect, it } from "vitest";
import { planLegalSeed } from "@/lib/legal-seed-plan";

describe("planLegalSeed", () => {
  it("无文档时创建 v1", () => {
    expect(planLegalSeed({ slug: "terms", existing: null, force: false })).toMatchObject({
      action: "create",
      nextVersion: 1,
    });
  });

  it("已发布时默认跳过", () => {
    expect(
      planLegalSeed({
        slug: "privacy",
        existing: {
          publishedVersion: 3,
          hasPublishedContent: true,
          hasDraftContent: false,
        },
        force: false,
      })
    ).toMatchObject({ action: "skip", nextVersion: 3 });
  });

  it("已发布且 --force 时生成下一个版本", () => {
    expect(
      planLegalSeed({
        slug: "privacy",
        existing: {
          publishedVersion: 3,
          hasPublishedContent: true,
          hasDraftContent: true,
        },
        force: true,
      })
    ).toMatchObject({ action: "force-new-version", nextVersion: 4 });
  });

  it("尚未发布且无草稿时填充 v1", () => {
    expect(
      planLegalSeed({
        slug: "terms",
        existing: {
          publishedVersion: 0,
          hasPublishedContent: false,
          hasDraftContent: false,
        },
        force: false,
      })
    ).toMatchObject({ action: "fill-unpublished", nextVersion: 1 });
  });

  it("尚未发布但存在草稿时默认跳过，避免覆盖草稿", () => {
    expect(
      planLegalSeed({
        slug: "terms",
        existing: {
          publishedVersion: 0,
          hasPublishedContent: false,
          hasDraftContent: true,
        },
        force: false,
      })
    ).toMatchObject({ action: "skip" });
  });

  it("尚未发布且有草稿、--force 时只填充线上内容", () => {
    expect(
      planLegalSeed({
        slug: "terms",
        existing: {
          publishedVersion: 0,
          hasPublishedContent: false,
          hasDraftContent: true,
        },
        force: true,
      })
    ).toMatchObject({ action: "fill-unpublished", nextVersion: 1 });
  });
});
