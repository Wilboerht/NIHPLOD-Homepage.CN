// @vitest-environment jsdom

import React from "react";
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { ClipboardCheck, MessageSquare } from "lucide-react";
import { CollapsiblePanel } from "@/components/admin/CollapsiblePanel";
import { OwnerGovernanceCard } from "@/components/admin/OwnerGovernanceCard";
import { PendingQueue, type PendingQueueItem } from "@/components/admin/PendingQueue";
import { SecurityMonitor } from "@/components/admin/SecurityMonitor";
import { StatStrip } from "@/components/admin/StatStrip";
import { SystemAlertIndicator } from "@/components/admin/SystemAlertIndicator";
import type {
  OwnerGovernanceData,
  SecurityMonitorData,
} from "@/lib/admin-dashboard-governance";

const EMPTY_OWNER_DATA: OwnerGovernanceData = {
  approvals: { pending: 0, approvedAwaiting: 0, recent: [], latestPending: [] },
  holders: [],
  ownerOnly: { total: 0, nonOwner: 0, events: [] },
  protectionRules: [],
  unenforcedActions: [],
};

const EMPTY_MONITOR_DATA: SecurityMonitorData = {
  windowHours: 24,
  sensitive: {
    total: 0,
    highRisk: 0,
    authFailures: 0,
    actors: 0,
    manual: 0,
    system: 0,
    failures: 0,
    events: [],
  },
  funds: {
    total: 0,
    highRisk: 0,
    authFailures: 0,
    actors: 0,
    manual: 0,
    system: 0,
    failures: 0,
    events: [],
  },
};

describe("管理端仪表盘组件", () => {
  it("CollapsiblePanel 默认收起，并提供一行摘要", () => {
    render(
      <CollapsiblePanel title="SSO 概览" summary="3 个 Client">
        <p>展开内容</p>
      </CollapsiblePanel>
    );

    const details = screen.getByText("SSO 概览").closest("details");
    expect(details).not.toBeNull();
    expect(details).not.toHaveAttribute("open");
    expect(screen.getByText("3 个 Client")).toBeInTheDocument();
  });

  it("CollapsiblePanel 支持 defaultOpen", () => {
    render(
      <CollapsiblePanel title="SSO 概览" defaultOpen>
        <p>展开内容</p>
      </CollapsiblePanel>
    );

    expect(screen.getByText("SSO 概览").closest("details")).toHaveAttribute("open");
  });

  it("StatStrip 渲染标签、数值与说明", () => {
    render(
      <StatStrip items={[{ label: "用户总数", value: "1,234", description: "含已注销账号" }]} />
    );

    expect(screen.getByText("用户总数")).toBeInTheDocument();
    expect(screen.getByText("1,234")).toBeInTheDocument();
    expect(screen.getByText("含已注销账号")).toBeInTheDocument();
  });

  it("SystemAlertIndicator 无告警时不渲染", () => {
    const { container } = render(<SystemAlertIndicator alerts={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("SystemAlertIndicator 在标题旁展示感叹号，展开后显示告警入口", () => {
    render(
      <SystemAlertIndicator
        alerts={[
          { key: "deletion", label: "注销执行失败", count: 1, href: "/admin/account-deletions" },
          { key: "webhook", label: "Webhook 投递失败", count: 3, href: "/admin/webhook-failures" },
        ]}
      />
    );

    const trigger = screen.getByLabelText("系统告警，共 4 项");
    expect(trigger).toBeInTheDocument();
    fireEvent.click(trigger);

    const deletionLink = screen.getByRole("link", { name: /注销执行失败/ });
    expect(deletionLink).toHaveAttribute("href", "/admin/account-deletions");
    expect(within(deletionLink).getByText("1")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Webhook 投递失败/ })).toHaveAttribute(
      "href",
      "/admin/webhook-failures"
    );
  });

  it("PendingQueue 全部为零时展示成功态", () => {
    const items: PendingQueueItem[] = [
      {
        key: "messages",
        label: "未读留言",
        count: 0,
        href: "/admin/messages?status=unread",
        icon: MessageSquare,
      },
    ];

    render(<PendingQueue items={items} />);

    expect(screen.getByText("所有队列已清零，暂无待处理事项")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /未读留言/ })).toBeNull();
  });

  it("PendingQueue 只渲染有积压的队列，并展示金额与时效", () => {
    const items: PendingQueueItem[] = [
      {
        key: "messages",
        label: "未读留言",
        count: 3,
        href: "/admin/messages?status=unread",
        icon: MessageSquare,
        oldestAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        key: "spent",
        label: "消费补录待审",
        count: 2,
        href: "/admin/spent-adjustments?status=PENDING",
        icon: ClipboardCheck,
        amountYuan: 1200,
      },
      {
        key: "applications",
        label: "简历待处理",
        count: 0,
        href: "/admin/applications?status=pending",
        icon: MessageSquare,
      },
    ];

    render(<PendingQueue items={items} />);

    expect(screen.getByRole("link", { name: "未读留言 3 项" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "消费补录待审 2 项" })).toBeInTheDocument();
    expect(screen.queryByText("简历待处理")).toBeNull();
    expect(screen.getByText(/最老 \d+ 天/)).toBeInTheDocument();
    expect(screen.getByText("申报 ¥1,200")).toBeInTheDocument();
    expect(screen.getByText("共 5 项")).toBeInTheDocument();
  });
});

describe("治理与监控面板折叠策略", () => {
  it("无待办、无风险时默认收起", () => {
    const owner = render(<OwnerGovernanceCard data={EMPTY_OWNER_DATA} />);
    expect(screen.getByText("Owner 治理").closest("details")).not.toHaveAttribute("open");
    owner.unmount();

    render(<SecurityMonitor data={EMPTY_MONITOR_DATA} />);
    expect(screen.getByText("安全与资金监控").closest("details")).not.toHaveAttribute("open");
  });

  it("有待审批或高风险时自动展开", () => {
    const owner = render(
      <OwnerGovernanceCard
        data={{
          ...EMPTY_OWNER_DATA,
          approvals: { ...EMPTY_OWNER_DATA.approvals, pending: 1 },
        }}
      />
    );
    expect(screen.getByText("Owner 治理").closest("details")).toHaveAttribute("open");
    owner.unmount();

    render(
      <SecurityMonitor
        data={{
          ...EMPTY_MONITOR_DATA,
          sensitive: { ...EMPTY_MONITOR_DATA.sensitive, highRisk: 1 },
        }}
      />
    );
    expect(screen.getByText("安全与资金监控").closest("details")).toHaveAttribute("open");
  });
});
