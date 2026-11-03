import { describe, it, expect } from "vitest";
import robots from "@/app/robots";

type Rule = {
  userAgent: string | string[];
  allow?: string | string[];
  disallow?: string | string[];
  other?: Record<string, string | number | Array<string | number>>;
};

const DISALLOW_PATHS = ["/admin", "/admin-login", "/api/"];

const AI_SEARCH_BOTS = [
  "OAI-SearchBot",
  "ChatGPT-User",
  "PerplexityBot",
  "Perplexity-User",
  "Claude-User",
  "Claude-SearchBot",
  "Google-Extended",
  "Bytespider",
  "Baiduspider",
  "Baiduspider-render",
  "KimiBot",
  "PetalBot",
];

const AI_TRAINING_BOTS = [
  "GPTBot",
  "ClaudeBot",
  "CCBot",
  "Applebot-Extended",
  "meta-externalagent",
  "Amazonbot",
];

function groups(): Rule[] {
  return robots().rules as Rule[];
}

function findGroup(rule: Rule[], agent: string): Rule | undefined {
  return rule.find((item) =>
    Array.isArray(item.userAgent) ? item.userAgent.includes(agent) : item.userAgent === agent
  );
}

function expectAllowed(agent: string) {
  const group = findGroup(groups(), agent);
  expect(group, `${agent} 应在允许分组`).toBeTruthy();
  expect(group?.allow, `${agent} 应允许抓取`).toBe("/");
  expect(group?.disallow, `${agent} 不应被 Disallow: /`).toEqual(DISALLOW_PATHS);
}

describe("robots", () => {
  it("允许 AI 搜索/引用类爬虫抓取内容", () => {
    for (const agent of AI_SEARCH_BOTS) {
      expectAllowed(agent);
    }
  });

  it("允许 AI 训练类爬虫抓取内容", () => {
    for (const agent of AI_TRAINING_BOTS) {
      expectAllowed(agent);
    }
  });

  it("没有对 AI 爬虫的 Disallow: /", () => {
    for (const agent of [...AI_SEARCH_BOTS, ...AI_TRAINING_BOTS]) {
      const group = findGroup(groups(), agent);
      expect(group?.disallow, `${agent} 不应被全站禁止`).not.toBe("/");
    }
  });

  it("仍然屏蔽后台与 API", () => {
    const group = findGroup(groups(), "*");
    expect(group?.allow).toBe("/");
    expect(group?.disallow).toEqual(DISALLOW_PATHS);
  });

  it("声明 sitemap", () => {
    expect(robots().sitemap).toMatch(/\/sitemap\.xml$/);
  });

  it("在每个 User-agent 分组声明 Content-Signal", () => {
    const expected = "ai-train=yes, search=yes, ai-input=yes";
    for (const group of groups()) {
      expect(group.other?.["Content-Signal"], `${group.userAgent} 缺少 Content-Signal`).toBe(
        expected
      );
    }
  });
});
