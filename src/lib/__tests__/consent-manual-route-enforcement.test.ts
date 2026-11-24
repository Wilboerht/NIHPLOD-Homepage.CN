import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const MANUAL_AUTH_ROUTES = [
  "src/app/api/user/addresses/[id]/route.ts",
  "src/app/api/user/points/redemptions/[id]/route.ts",
  "src/app/api/user/points/redemptions/[id]/after-sales/route.ts",
  "src/app/api/user/points/redemptions/[id]/after-sales/return/route.ts",
  "src/app/api/user/points/redemptions/[id]/confirm/route.ts",
  "src/app/api/user/points/redemptions/[id]/tracking/route.ts",
  "src/app/api/user/spent-adjustments/image/route.ts",
];

describe("manual-auth user routes enforce legal consent", () => {
  it.each(MANUAL_AUTH_ROUTES)("%s calls the consent guard", (relativePath) => {
    const source = fs.readFileSync(path.resolve(process.cwd(), relativePath), "utf8");
    expect(source).toContain("verifyUserAuth");
    expect(source).toContain("userLegalConsentRequiredResponse");
  });
});
