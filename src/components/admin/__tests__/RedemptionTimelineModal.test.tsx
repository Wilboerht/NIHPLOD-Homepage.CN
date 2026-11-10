// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const { apiGet } = vi.hoisted(() => ({ apiGet: vi.fn() }));
vi.mock("@/lib/api-client", () => ({ apiGet }));

import { RedemptionTimelineModal } from "../RedemptionTimelineModal";

describe("RedemptionTimelineModal", () => {
  beforeEach(() => {
    apiGet.mockReset();
    apiGet.mockResolvedValue({
      id: "rd-1",
      productName: "洁面乳",
      priceYuan: "300",
      points: 300,
      status: "PENDING",
      recipient: "张**",
      phone: "138****8000",
      address: null,
      waybillNo: null,
      afterSalesImages: [],
      createdAt: "2026-11-01T00:00:00Z",
      events: [
        {
          id: "event-1",
          fromStatus: null,
          toStatus: "PENDING",
          actorType: "USER",
          reasonCode: "redeem_created",
          reasonText: null,
          metadata: null,
          createdAt: "2026-11-01T00:00:00Z",
        },
      ],
    });
  });

  it("加载并展示兑换事件时间线", async () => {
    render(<RedemptionTimelineModal redemptionId="rd-1" onClose={vi.fn()} />);

    expect(await screen.findByText("兑换单号：rd-1")).toBeInTheDocument();
    expect(screen.getAllByText("待履约").length).toBeGreaterThan(0);
    expect(screen.getByText(/redeem_created/)).toBeInTheDocument();
    expect(apiGet).toHaveBeenCalledWith("/api/admin/point-redemptions/rd-1");
  });
});
