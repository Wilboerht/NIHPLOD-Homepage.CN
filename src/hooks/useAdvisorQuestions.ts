"use client";

import { useState, useEffect, useCallback } from "react";
import { advisorQuestions as fallbackQuestions } from "@/config/advisor-questions";

/**
 * 问题选项类型
 */
export interface QuestionOption {
  value: string;
  label: string;
  labelEn?: string;
  description?: string;
  emoji?: string;
}

/**
 * 问题类型
 */
export interface Question {
  id: string | number;
  fieldName: string;
  question: string;
  subtext?: string;
  type?: "single" | "multiple";
  options: QuestionOption[];
  order?: number;
  gender?: "male" | "female" | "all";
}

/**
 * Hook 返回类型
 */
interface UseAdvisorQuestionsResult {
  /** 问题列表 */
  questions: Question[];
  /** 问题总数 */
  totalQuestions: number;
  /** 是否正在加载 */
  loading: boolean;
  /** 错误信息 */
  error: string | null;
  /** 数据来源 */
  source: "database" | "fallback" | "loading";
  /** 重新加载问题 */
  refetch: () => Promise<void>;
}

/**
 * AI 护肤顾问问题数据 Hook
 *
 * 功能：
 * - 从 API 动态获取问卷问题
 * - 支持根据性别过滤问题
 * - API 失败时自动降级到本地配置
 * - 提供加载状态和错误处理
 *
 * @param gender - 用户性别 (male/female/unspecified)，用于过滤问题
 *
 * @example
 * ```tsx
 * const { questions, loading, error, totalQuestions } = useAdvisorQuestions('female');
 *
 * if (loading) return <Loading />;
 * if (error) return <Error message={error} />;
 *
 * return questions.map(q => <Question key={q.id} {...q} />);
 * ```
 */
export function useAdvisorQuestions(gender?: "male" | "female" | "unspecified" | null): UseAdvisorQuestionsResult {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<"database" | "fallback" | "loading">("loading");

  /**
   * 获取问题数据
   */
  const fetchQuestions = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // 构建 URL 参数
      const params = new URLSearchParams();
      if (gender && gender !== "unspecified") {
        params.set("gender", gender);
      }

      const url = `/api/advisor/questions${params.toString() ? `?${params.toString()}` : ""}`;

      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        // 添加缓存控制
        next: { revalidate: 60 }, // 60秒缓存
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      if (data.success && Array.isArray(data.data) && data.data.length > 0) {
        setQuestions(data.data);
        setSource(data.source || "database");
      } else {
        // API 返回空数据，使用本地配置
        applyFallbackQuestions();
      }
    } catch (err) {
      console.warn("从 API 获取问题失败，使用本地配置:", err);
      applyFallbackQuestions();
    } finally {
      setLoading(false);
    }
  }, [gender]);

  /**
   * 使用本地配置作为降级方案
   * 注意：此函数名不以 use 开头，因为它不是 React Hook
   */
  const applyFallbackQuestions = () => {
    const localQuestions: Question[] = fallbackQuestions.map((q) => ({
      id: q.id,
      fieldName: q.fieldName,
      question: q.question,
      subtext: q.subtext,
      type: "single" as const,
      options: q.options,
      order: q.id,
      gender: q.gender,
    }));
    setQuestions(localQuestions);
    setSource("fallback");
  };

  // 初始化时获取问题
  useEffect(() => {
    fetchQuestions();
  }, [fetchQuestions]);

  return {
    questions,
    totalQuestions: questions.length,
    loading,
    error,
    source,
    refetch: fetchQuestions,
  };
}

/**
 * 根据索引获取问题
 */
export function getQuestionByIndex(questions: Question[], index: number): Question | undefined {
  return questions[index];
}

/**
 * 根据字段名获取问题
 */
export function getQuestionByFieldName(questions: Question[], fieldName: string): Question | undefined {
  return questions.find((q) => q.fieldName === fieldName);
}

