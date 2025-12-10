"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { useCallback, useEffect, useState } from "react";
import {
  Bold,
  Italic,
  Strikethrough,
  List,
  ListOrdered,
  Link as LinkIcon,
  Unlink,
  Heading1,
  Heading2,
  Quote,
  Undo,
  Redo,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  error?: string;
  placeholder?: string;
  className?: string;
  minHeight?: string;
}

export function RichTextEditor({
  value,
  onChange,
  label,
  error,
  placeholder = "请输入内容...",
  className,
  minHeight = "200px",
}: RichTextEditorProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [showLinkInput, setShowLinkInput] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2],
        },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: "text-brand-gold underline",
        },
      }),
      Placeholder.configure({
        placeholder,
      }),
    ],
    content: value,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    onFocus: () => setIsFocused(true),
    onBlur: () => setIsFocused(false),
    editorProps: {
      attributes: {
        class: cn(
          "prose prose-sm max-w-none focus:outline-none",
          "prose-headings:font-semibold prose-headings:text-gray-900",
          "prose-p:text-gray-700 prose-p:leading-relaxed",
          "prose-strong:text-gray-900",
          "prose-ul:list-disc prose-ol:list-decimal",
          "prose-li:text-gray-700",
          "prose-blockquote:border-l-brand-gold prose-blockquote:text-gray-600",
          "prose-a:text-brand-gold prose-a:underline"
        ),
      },
    },
    immediatelyRender: false,
  });

  // 同步外部值
  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value);
    }
  }, [value, editor]);

  // 设置链接
  const setLink = useCallback(() => {
    if (!editor) return;

    if (linkUrl === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
    } else {
      editor
        .chain()
        .focus()
        .extendMarkRange("link")
        .setLink({ href: linkUrl })
        .run();
    }
    setShowLinkInput(false);
    setLinkUrl("");
  }, [editor, linkUrl]);

  if (!editor) {
    return (
      <div className={cn("animate-pulse", className)}>
        {label && <div className="mb-1.5 h-5 w-20 rounded bg-gray-200" />}
        <div className="h-32 rounded-lg bg-gray-100" />
      </div>
    );
  }

  // 工具栏按钮
  const ToolbarButton = ({
    onClick,
    active,
    disabled,
    children,
    title,
  }: {
    onClick: () => void;
    active?: boolean;
    disabled?: boolean;
    children: React.ReactNode;
    title: string;
  }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "rounded p-1.5 transition-colors",
        active
          ? "bg-brand-gold/20 text-brand-gold"
          : "text-gray-500 hover:bg-gray-100 hover:text-gray-700",
        disabled && "cursor-not-allowed opacity-50"
      )}
    >
      {children}
    </button>
  );

  return (
    <div className={className}>
      {label && (
        <label className="mb-1.5 block text-sm font-medium text-gray-700">
          {label}
        </label>
      )}

      <div
        className={cn(
          "overflow-hidden rounded-lg border bg-white transition-all",
          isFocused
            ? "border-brand-gold ring-2 ring-brand-gold/20"
            : "border-gray-300",
          error && "border-red-500"
        )}
      >
        {/* 工具栏 */}
        <div className="flex flex-wrap items-center gap-0.5 border-b border-gray-200 bg-gray-50 px-2 py-1.5">
          {/* 标题 */}
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            active={editor.isActive("heading", { level: 1 })}
            title="一级标题"
          >
            <Heading1 className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            active={editor.isActive("heading", { level: 2 })}
            title="二级标题"
          >
            <Heading2 className="h-4 w-4" />
          </ToolbarButton>

          <div className="mx-1 h-5 w-px bg-gray-300" />

          {/* 文字样式 */}
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBold().run()}
            active={editor.isActive("bold")}
            title="粗体"
          >
            <Bold className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleItalic().run()}
            active={editor.isActive("italic")}
            title="斜体"
          >
            <Italic className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleStrike().run()}
            active={editor.isActive("strike")}
            title="删除线"
          >
            <Strikethrough className="h-4 w-4" />
          </ToolbarButton>

          <div className="mx-1 h-5 w-px bg-gray-300" />

          {/* 列表 */}
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            active={editor.isActive("bulletList")}
            title="无序列表"
          >
            <List className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            active={editor.isActive("orderedList")}
            title="有序列表"
          >
            <ListOrdered className="h-4 w-4" />
          </ToolbarButton>

          <div className="mx-1 h-5 w-px bg-gray-300" />

          {/* 引用 */}
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            active={editor.isActive("blockquote")}
            title="引用"
          >
            <Quote className="h-4 w-4" />
          </ToolbarButton>

          {/* 链接 */}
          <div className="relative">
            <ToolbarButton
              onClick={() => {
                if (editor.isActive("link")) {
                  editor.chain().focus().unsetLink().run();
                } else {
                  setShowLinkInput(!showLinkInput);
                  const previousUrl = editor.getAttributes("link").href;
                  setLinkUrl(previousUrl || "");
                }
              }}
              active={editor.isActive("link")}
              title={editor.isActive("link") ? "取消链接" : "添加链接"}
            >
              {editor.isActive("link") ? (
                <Unlink className="h-4 w-4" />
              ) : (
                <LinkIcon className="h-4 w-4" />
              )}
            </ToolbarButton>

            {/* 链接输入框 */}
            {showLinkInput && (
              <div className="absolute left-0 top-full z-10 mt-1 flex gap-1 rounded-lg border border-gray-200 bg-white p-2 shadow-lg">
                <input
                  type="url"
                  placeholder="输入链接地址"
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      setLink();
                    }
                    if (e.key === "Escape") {
                      setShowLinkInput(false);
                    }
                  }}
                  className="w-48 rounded border border-gray-300 px-2 py-1 text-sm focus:border-brand-gold focus:outline-none"
                />
                <button
                  type="button"
                  onClick={setLink}
                  className="rounded bg-brand-gold px-2 py-1 text-xs text-white hover:bg-brand-gold/90"
                >
                  确定
                </button>
              </div>
            )}
          </div>

          <div className="mx-1 h-5 w-px bg-gray-300" />

          {/* 撤销/重做 */}
          <ToolbarButton
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().undo()}
            title="撤销"
          >
            <Undo className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().redo()}
            title="重做"
          >
            <Redo className="h-4 w-4" />
          </ToolbarButton>
        </div>

        {/* 编辑区域 */}
        <div className="relative" style={{ minHeight }}>
          <EditorContent
            editor={editor}
            className={cn(
              "h-full w-full p-4",
              "[&_.ProseMirror]:min-h-[inherit] [&_.ProseMirror]:outline-none",
              "[&_.ProseMirror_p.is-editor-empty:first-child::before]:pointer-events-none",
              "[&_.ProseMirror_p.is-editor-empty:first-child::before]:float-left",
              "[&_.ProseMirror_p.is-editor-empty:first-child::before]:h-0",
              "[&_.ProseMirror_p.is-editor-empty:first-child::before]:text-gray-400",
              "[&_.ProseMirror_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]"
            )}
          />

          {/* 浮动菜单 - 仅在编辑器获得焦点且有选中内容时显示 */}
          {editor && isFocused && (
            <BubbleMenu
              editor={editor}
              className="flex gap-0.5 rounded-lg border border-gray-200 bg-white p-1 shadow-lg"
            >
              <ToolbarButton
                onClick={() => editor.chain().focus().toggleBold().run()}
                active={editor.isActive("bold")}
                title="粗体"
              >
                <Bold className="h-3.5 w-3.5" />
              </ToolbarButton>
              <ToolbarButton
                onClick={() => editor.chain().focus().toggleItalic().run()}
                active={editor.isActive("italic")}
                title="斜体"
              >
                <Italic className="h-3.5 w-3.5" />
              </ToolbarButton>
              <ToolbarButton
                onClick={() => {
                  const previousUrl = editor.getAttributes("link").href;
                  const url = window.prompt("链接地址:", previousUrl);
                  if (url !== null) {
                    if (url === "") {
                      editor.chain().focus().unsetLink().run();
                    } else {
                      editor.chain().focus().setLink({ href: url }).run();
                    }
                  }
                }}
                active={editor.isActive("link")}
                title="链接"
              >
                <LinkIcon className="h-3.5 w-3.5" />
              </ToolbarButton>
            </BubbleMenu>
          )}
        </div>
      </div>

      {error && <p className="mt-1.5 text-sm text-red-600">{error}</p>}
    </div>
  );
}

