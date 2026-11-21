import { describe, expect, it } from "vitest";
import {
  oauthRouteRequiresConsent,
  userRouteRequiresConsent,
} from "@/lib/consent-route-policy";

describe("consent route policy", () => {
  it("keeps only explicit bootstrap and account-safety user routes exempt", () => {
    expect(userRouteRequiresConsent("/api/user/consent")).toBe(false);
    expect(userRouteRequiresConsent("/api/user/profile")).toBe(false);
    expect(userRouteRequiresConsent("/api/user/password/set")).toBe(false);
    expect(userRouteRequiresConsent("/api/user/devices/device-1")).toBe(false);
    expect(userRouteRequiresConsent("/api/user/points/redeem")).toBe(true);
    expect(userRouteRequiresConsent("/api/user/points/redeem/extra")).toBe(true);
    expect(userRouteRequiresConsent("/api/user/profile/export")).toBe(true);
  });

  it("keeps OAuth consent, deletion, security and password flows exempt", () => {
    expect(oauthRouteRequiresConsent("/api/oauth/consent")).toBe(false);
    expect(oauthRouteRequiresConsent("/api/oauth/account/deletion")).toBe(false);
    expect(oauthRouteRequiresConsent("/api/oauth/security/devices/device-1")).toBe(false);
    expect(oauthRouteRequiresConsent("/api/oauth/user/password/set")).toBe(false);
    expect(oauthRouteRequiresConsent("/api/oauth/points")).toBe(true);
    expect(oauthRouteRequiresConsent("/api/oauth/userinfo")).toBe(true);
  });
});
