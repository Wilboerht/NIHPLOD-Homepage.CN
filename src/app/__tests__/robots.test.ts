import { describe, it, expect } from "vitest";
import robots from "@/app/robots";

type Rule = {
  userAgent: string | string[];
  allow?: string | string[];
  disallow?: string | string[];
};

function groups(): Rule[] {
  return robots().rules as Rule[];
}

function findGroup(rule: Rule[], agent: string): Rule | undefined {
  return rule.find((item) =>
    Array.isArray(item.userAgent) ? item.userAgent.includes(agent) : item.userAgent === agent
  );
}

describe("robots", () => {
  it("允许 AI 搜索/引用类爬虫抓取内容", () => {
    const rules = groups();
    for (const agent of [
      "OAI-SearchBot",
      "PerplexityBot",
      "Claude-SearchBot",
      "Google-Extended",
      "Bytespider",
    ]) {
      const group = findGroup(rules, agent);
      expect(group, `${agent} 应在允许分组`).toBeTruthy();
      expect(group?.disallow).toEqual(["/admin", "/admin-login", "/api/"]);
    }
  });

  it("继续禁止纯训练类爬虫", () => {
    const rules = groups();
    for (const agent of ["GPTBot", "ClaudeBot", "CCBot"]) {
      const group = findGroup(rules, agent);
      expect(group, `${agent} 应在禁止分组`).toBeTruthy();
      expect(group?.disallow).toBe("/");
    }
  });

  it("声明 sitemap", () => {
    expect(robots().sitemap).toMatch(/\/sitemap\.xml$/);
  });
});
