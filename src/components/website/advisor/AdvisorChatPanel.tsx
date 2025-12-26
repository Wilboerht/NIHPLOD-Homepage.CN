"use client";

/**
 * AI护肤顾问追问对话组件
 * 支持用户与AI顾问"朵朵"进行追问对话
 *
 * 功能特性：
 * - 流式响应（打字机效果）
 * - 对话持久化（sessionStorage）
 * - 首次提问免费
 * - Markdown 渲染
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { m, AnimatePresence } from "framer-motion";
import {
  MessageCircle,
  Send,
  Loader2,
  X,
  Sparkles,
  AlertCircle,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { ChatMarkdown } from "@/components/ui/ChatMarkdown";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: Date;
  isStreaming?: boolean; // 是否正在流式输出
}

interface AdvisorChatPanelProps {
  /** 肌肤类型，用于上下文 */
  skinType?: string;
  /** 关注问题，用于上下文 */
  concerns?: string[];
  /** 关联的分析ID */
  analysisId?: string;
  /** 自定义类名 */
  className?: string;
}

// 每次追问消耗的点数
const POINTS_PER_QUESTION = 2;

// sessionStorage key
const STORAGE_KEY = "advisor_chat_session";

interface StoredSession {
  conversationId: string;
  messages: Message[];
  skinType?: string;
  concerns?: string[];
}

export function AdvisorChatPanel({
  skinType,
  concerns,
  analysisId,
  className,
}: AdvisorChatPanelProps) {
  const { user, openLoginModal, refreshUser } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [streamingContent, setStreamingContent] = useState("");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // 从 sessionStorage 恢复会话
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored) {
        const session: StoredSession = JSON.parse(stored);
        // 只恢复同一肤质/关注点的会话
        if (session.skinType === skinType &&
            JSON.stringify(session.concerns) === JSON.stringify(concerns)) {
          setConversationId(session.conversationId);
          setMessages(session.messages.map(m => ({
            ...m,
            createdAt: new Date(m.createdAt),
          })));
        }
      }
    } catch {
      // ignore storage errors
    }
  }, [skinType, concerns]);

  // 保存会话到 sessionStorage
  const saveSession = useCallback((convId: string, msgs: Message[]) => {
    try {
      const session: StoredSession = {
        conversationId: convId,
        messages: msgs,
        skinType,
        concerns,
      };
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    } catch {
      // ignore storage errors
    }
  }, [skinType, concerns]);

  // 滚动到底部
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingContent, scrollToBottom]);

  // 打开面板时聚焦输入框
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen]);

  // 组件卸载时取消请求
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  // 发送消息（流式响应）
  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    // 检查登录
    if (!user) {
      openLoginModal();
      return;
    }

    const userMessage = input.trim();
    setInput("");
    setError(null);
    setLoading(true);
    setStreamingContent("");

    // 添加用户消息到列表
    const tempUserMsg: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: userMessage,
      createdAt: new Date(),
    };
    const updatedMessages = [...messages, tempUserMsg];
    setMessages(updatedMessages);

    // 创建 AbortController 用于取消请求
    abortControllerRef.current = new AbortController();

    try {
      const res = await fetch("/api/advisor/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId,
          message: userMessage,
          context: {
            analysisId,
            skinType,
            concerns,
          },
        }),
        signal: abortControllerRef.current.signal,
      });

      // 非流式错误响应
      if (!res.ok || !res.body) {
        const data = await res.json();
        if (data.error?.code === "INSUFFICIENT_POINTS") {
          setError("护肤点数不足，无法追问。购物或分享可获得更多点数～");
        } else if (data.error?.code === "UNAUTHORIZED") {
          openLoginModal();
          setMessages(messages); // 恢复原消息
          return;
        } else {
          setError(data.error?.message || "发送失败，请重试");
        }
        setMessages(messages); // 恢复原消息
        setLoading(false);
        return;
      }

      // 读取 SSE 流
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = "";
      let newConversationId = conversationId;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            const eventType = line.slice(7);
            const dataLineIndex = lines.indexOf(line) + 1;
            const dataLine = lines[dataLineIndex];

            if (dataLine?.startsWith("data: ")) {
              try {
                const data = JSON.parse(dataLine.slice(6));

                if (eventType === "init") {
                  newConversationId = data.conversationId;
                  setConversationId(data.conversationId);
                } else if (eventType === "content") {
                  fullContent += data.text;
                  setStreamingContent(fullContent);
                } else if (eventType === "done") {
                  // 流结束，添加完整的 AI 消息
                  const aiMessage: Message = {
                    id: `ai-${Date.now()}`,
                    role: "assistant",
                    content: fullContent,
                    createdAt: new Date(),
                  };
                  const finalMessages = [...updatedMessages, aiMessage];
                  setMessages(finalMessages);
                  setStreamingContent("");

                  // 保存会话到 sessionStorage
                  if (newConversationId) {
                    saveSession(newConversationId, finalMessages);
                  }

                  // 刷新用户点数
                  refreshUser();
                } else if (eventType === "error") {
                  setError(data.message || "AI 响应失败，请重试");
                }
              } catch {
                // ignore parse errors
              }
            }
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        // 用户取消
      } else {
        setError("网络错误，请重试");
        setMessages(messages); // 恢复原消息
      }
    } finally {
      setLoading(false);
      setStreamingContent("");
      abortControllerRef.current = null;
    }
  };

  const isFirstMessage = messages.length === 0;
  const userPoints = user?.points || 0;
  const canAsk = isFirstMessage || userPoints >= POINTS_PER_QUESTION;

  return (
    <>
      {/* 悬浮按钮 */}
      <m.button
        onClick={() => setIsOpen(true)}
        className={cn(
          "fixed bottom-24 right-4 z-40 flex items-center gap-2 rounded-full",
          "bg-gradient-to-r from-[#A69374] to-[#C4B896] px-4 py-3",
          "text-white shadow-lg hover:shadow-xl transition-shadow",
          isOpen && "hidden",
          className
        )}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        <MessageCircle className="w-5 h-5" />
        <span className="text-sm font-medium">问朵朵</span>
        {isFirstMessage && (
          <span className="ml-1 px-1.5 py-0.5 bg-white/20 rounded text-xs">免费</span>
        )}
      </m.button>

      {/* 对话面板 */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* 遮罩 */}
            <m.div
              className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
            />

            {/* 面板 */}
            <m.div
              className="fixed bottom-0 left-0 right-0 z-50 max-h-[85vh] rounded-t-3xl bg-[#FAF8F5] shadow-2xl md:bottom-4 md:left-auto md:right-4 md:w-[400px] md:rounded-2xl md:max-h-[600px]"
              initial={{ y: "100%", opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: "100%", opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
            >
              {/* 头部 */}
              <div className="flex items-center justify-between border-b border-[#E8E3DC] px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#A69374] to-[#C4B896] flex items-center justify-center">
                    <Sparkles className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="font-medium text-[#5C5347]">朵朵</h3>
                    <p className="text-xs text-[#A69B8C]">AI护肤顾问</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {user && (
                    <span className="text-xs text-[#A69B8C]">
                      {userPoints} 点数
                    </span>
                  )}
                  <button
                    onClick={() => setIsOpen(false)}
                    className="p-1 rounded-full hover:bg-[#E8E3DC] transition-colors"
                  >
                    <X className="w-5 h-5 text-[#8B8579]" />
                  </button>
                </div>
              </div>

              {/* 消息区域 */}
              <div className="h-[50vh] md:h-[400px] overflow-y-auto p-4 space-y-4">
                {/* 欢迎消息 */}
                {messages.length === 0 && (
                  <div className="text-center py-8">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-[#A69374]/20 to-[#C4B896]/20 flex items-center justify-center">
                      <Sparkles className="w-8 h-8 text-[#A69374]" />
                    </div>
                    <h4 className="text-[#5C5347] font-medium mb-2">有护肤疑问？问我吧～</h4>
                    <p className="text-sm text-[#A69B8C] mb-4">
                      首次提问免费，之后每次消耗 {POINTS_PER_QUESTION} 点数
                    </p>
                    <div className="flex flex-wrap justify-center gap-2">
                      {["如何改善毛孔？", "适合我的护肤顺序？", "这款精华怎么用？"].map((q) => (
                        <button
                          key={q}
                          onClick={() => setInput(q)}
                          className="px-3 py-1.5 text-xs bg-white rounded-full text-[#5C5347] border border-[#E8E3DC] hover:border-[#A69374] transition-colors"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* 消息列表 */}
                {messages.map((msg) => (
                  <m.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={cn(
                      "flex",
                      msg.role === "user" ? "justify-end" : "justify-start"
                    )}
                  >
                    <div
                      className={cn(
                        "max-w-[80%] rounded-2xl px-4 py-2.5",
                        msg.role === "user"
                          ? "bg-gradient-to-r from-[#A69374] to-[#C4B896] text-white rounded-br-md"
                          : "bg-white text-[#5C5347] border border-[#E8E3DC] rounded-bl-md"
                      )}
                    >
                      {msg.role === "user" ? (
                        <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                      ) : (
                        <ChatMarkdown content={msg.content} className="text-sm" />
                      )}
                    </div>
                  </m.div>
                ))}

                {/* 流式响应内容（打字机效果） */}
                {loading && streamingContent && (
                  <m.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex justify-start"
                  >
                    <div className="max-w-[80%] rounded-2xl rounded-bl-md px-4 py-2.5 bg-white text-[#5C5347] border border-[#E8E3DC]">
                      <div className="text-sm">
                        <ChatMarkdown content={streamingContent} />
                        <span className="inline-block w-1 h-4 ml-0.5 bg-[#A69374] animate-pulse align-middle" />
                      </div>
                    </div>
                  </m.div>
                )}

                {/* 加载状态（等待首个 token） */}
                {loading && !streamingContent && (
                  <div className="flex justify-start">
                    <div className="bg-white border border-[#E8E3DC] rounded-2xl rounded-bl-md px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Loader2 className="w-4 h-4 text-[#A69374] animate-spin" />
                        <span className="text-sm text-[#A69B8C]">朵朵正在思考...</span>
                      </div>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* 错误提示 */}
              {error && (
                <div className="mx-4 mb-2 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-amber-700">{error}</p>
                </div>
              )}

              {/* 输入区域 */}
              <div className="border-t border-[#E8E3DC] p-4">
                {!user ? (
                  <button
                    onClick={openLoginModal}
                    className="w-full py-3 bg-gradient-to-r from-[#A69374] to-[#C4B896] text-white rounded-xl font-medium"
                  >
                    登录后开始对话
                  </button>
                ) : !canAsk ? (
                  <div className="text-center py-2">
                    <p className="text-sm text-[#A69B8C] mb-2">点数不足，获取更多点数：</p>
                    <p className="text-xs text-[#8B8579]">• 购物可获得点数 • 分享报告可获得点数</p>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <input
                      ref={inputRef}
                      type="text"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
                      placeholder="输入你的护肤问题..."
                      className="flex-1 px-4 py-2.5 bg-white border border-[#E8E3DC] rounded-xl text-sm text-[#5C5347] placeholder:text-[#C4BDB2] focus:outline-none focus:border-[#A69374] transition-colors"
                      disabled={loading}
                    />
                    <button
                      onClick={sendMessage}
                      disabled={!input.trim() || loading}
                      className={cn(
                        "p-2.5 rounded-xl transition-all",
                        input.trim() && !loading
                          ? "bg-gradient-to-r from-[#A69374] to-[#C4B896] text-white"
                          : "bg-[#E8E3DC] text-[#C4BDB2]"
                      )}
                    >
                      <Send className="w-5 h-5" />
                    </button>
                  </div>
                )}
                {user && canAsk && !isFirstMessage && (
                  <p className="text-center text-xs text-[#A69B8C] mt-2">
                    本次提问将消耗 {POINTS_PER_QUESTION} 点数
                  </p>
                )}
              </div>

              {/* 底部安全区域（移动端） */}
              <div className="h-safe-area-inset-bottom md:hidden" />
            </m.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

