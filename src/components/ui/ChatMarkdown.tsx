"use client";

/**
 * 轻量级 Markdown 渲染器
 * 专为聊天对话设计，支持常用格式：
 * - 粗体 **text**
 * - 斜体 *text*
 * - 列表 - item / 1. item
 * - 链接 [text](url)
 * - 代码 `code`
 * - 换行
 */

import { memo, useMemo } from "react";
import { cn } from "@/lib/utils";

interface ChatMarkdownProps {
  content: string;
  className?: string;
}

// 渲染内联元素
function renderInline(text: string): React.ReactNode[] {
  const result: React.ReactNode[] = [];
  let remaining = text;
  let keyIndex = 0;

  // 处理所有内联格式
  while (remaining.length > 0) {
    // 链接 [text](url)
    const linkMatch = remaining.match(/^\[([^\]]+)\]\(([^)]+)\)/);
    if (linkMatch) {
      result.push(
        <a
          key={keyIndex++}
          href={linkMatch[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#A69374] underline underline-offset-2 hover:text-[#8B7A5E]"
        >
          {linkMatch[1]}
        </a>
      );
      remaining = remaining.slice(linkMatch[0].length);
      continue;
    }

    // 粗体 **text**
    const boldMatch = remaining.match(/^\*\*([^*]+)\*\*/);
    if (boldMatch) {
      result.push(<strong key={keyIndex++} className="font-semibold">{boldMatch[1]}</strong>);
      remaining = remaining.slice(boldMatch[0].length);
      continue;
    }

    // 斜体 *text* (不与粗体冲突)
    const italicMatch = remaining.match(/^\*([^*]+)\*/);
    if (italicMatch && !remaining.startsWith("**")) {
      result.push(<em key={keyIndex++}>{italicMatch[1]}</em>);
      remaining = remaining.slice(italicMatch[0].length);
      continue;
    }

    // 行内代码 `code`
    const codeMatch = remaining.match(/^`([^`]+)`/);
    if (codeMatch) {
      result.push(
        <code
          key={keyIndex++}
          className="rounded bg-[#F5F3EF] px-1.5 py-0.5 text-xs font-mono text-[#5C5347]"
        >
          {codeMatch[1]}
        </code>
      );
      remaining = remaining.slice(codeMatch[0].length);
      continue;
    }

    // 普通文本（取到下一个特殊字符前）
    const nextSpecial = remaining.search(/[\[*`]/);
    if (nextSpecial === -1) {
      result.push(remaining);
      break;
    } else if (nextSpecial === 0) {
      // 特殊字符但没有匹配，作为普通文本
      result.push(remaining[0]);
      remaining = remaining.slice(1);
    } else {
      result.push(remaining.slice(0, nextSpecial));
      remaining = remaining.slice(nextSpecial);
    }
  }

  return result;
}

export const ChatMarkdown = memo(function ChatMarkdown({ content, className }: ChatMarkdownProps) {
  const elements = useMemo(() => {
    const lines = content.split("\n");
    const result: React.ReactNode[] = [];
    let listItems: { text: string; ordered: boolean }[] = [];
    let keyIndex = 0;

    const flushList = () => {
      if (listItems.length === 0) return;
      const isOrdered = listItems[0].ordered;
      const ListTag = isOrdered ? "ol" : "ul";
      result.push(
        <ListTag
          key={keyIndex++}
          className={cn(
            "my-1.5 space-y-0.5",
            isOrdered ? "list-decimal pl-4" : "list-disc pl-4"
          )}
        >
          {listItems.map((item, i) => (
            <li key={i} className="text-inherit">{renderInline(item.text)}</li>
          ))}
        </ListTag>
      );
      listItems = [];
    };

    lines.forEach((line, index) => {
      const trimmed = line.trim();

      // 空行 - 段落分隔
      if (!trimmed) {
        flushList();
        if (result.length > 0 && index < lines.length - 1) {
          result.push(<div key={keyIndex++} className="h-2" />);
        }
        return;
      }

      // 无序列表 - 或 *
      if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
        listItems.push({ text: trimmed.slice(2), ordered: false });
        return;
      }

      // 有序列表 1. 2. 等
      if (/^\d+\.\s/.test(trimmed)) {
        listItems.push({ text: trimmed.replace(/^\d+\.\s/, ""), ordered: true });
        return;
      }

      // 普通段落
      flushList();
      result.push(
        <span key={keyIndex++} className="block">
          {renderInline(trimmed)}
        </span>
      );
    });

    flushList();
    return result;
  }, [content]);

  return <div className={cn("leading-relaxed", className)}>{elements}</div>;
});

