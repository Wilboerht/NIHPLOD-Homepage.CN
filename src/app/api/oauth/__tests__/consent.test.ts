import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const auth = vi.hoisted(() => ({
  authenticateOAuthUserRequest: vi.fn(),
}));
vi.mock("@/lib/oauth-user-auth", () => auth);

const consent = vi.hoisted(() => ({
  getConsentStatus: vi.fn(),
  recordConsent: vi.fn(),
}));
vi.mock("@/lib/privacy-consent", () => consent);

vi.mock("@/lib/oauth-resource-auth", () => ({
  decorateOAuthResponse: (response: Response) => response,
}));

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { POST } from "../consent/route";

function postConsent(body: unknown): NextRequest {
  return new NextRequest(new URL("http://localhost/api/oauth/consent"), {
    method: "POST",
    headers: {
      Authorization: "Bearer test-token",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/oauth/consent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.authenticateOAuthUserRequest.mockResolvedValue({
      ok: true,
      payload: {
        id: "user-1",
        client_id: "wechat-mp-points",
      },
      ip: "203.0.113.10",
      resJson: vi.fn(),
      corsHeaders: {},
    });
    consent.getConsentStatus.mockResolvedValue({
      required: false,
      missing: [],
      versions: { privacy: "2026-11-19", terms: "2026-11-19" },
    });
    consent.recordConsent.mockResolvedValue(undefined);
  });

  it("uses the OAuth client_id as the consent channel", async () => {
    const response = await POST(postConsent({ privacy: true, terms: true, marketing: true }));

    expect(response.status).toBe(200);
    expect(consent.recordConsent).toHaveBeenCalledTimes(3);

    const rows = consent.recordConsent.mock.calls.map(([input]) => input);
    expect(rows.map((row) => row.channel)).toEqual([
      "wechat-mp-points",
      "wechat-mp-points",
      "wechat-mp-points",
    ]);
    expect(rows[0].evidence).toMatchObject({
      source: "oauth_consent",
      clientId: "wechat-mp-points",
    });
  });

  it("falls back to the legacy channel when client_id is missing", async () => {
    auth.authenticateOAuthUserRequest.mockResolvedValue({
      ok: true,
      payload: { id: "user-1" },
      ip: "203.0.113.10",
      resJson: vi.fn(),
      corsHeaders: {},
    });

    const response = await POST(postConsent({ privacy: true, terms: true }));

    expect(response.status).toBe(200);
    const rows = consent.recordConsent.mock.calls.map(([input]) => input);
    expect(rows.map((row) => row.channel)).toEqual(["miniprogram", "miniprogram"]);
    expect(rows[0].evidence.clientId).toBeNull();
  });
});
