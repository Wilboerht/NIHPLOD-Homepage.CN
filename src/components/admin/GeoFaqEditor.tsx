"use client";

import { MessageSquareText, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { ProductFormSection } from "@/components/admin/ProductFormSection";
import { cn } from "@/lib/utils";
import {
  MAX_GEO_FAQS,
  MAX_GEO_FAQ_ANSWER_LENGTH,
  MAX_GEO_FAQ_QUESTION_LENGTH,
  type GeoFaq,
} from "@/schemas/product";

interface GeoFaqEditorProps {
  value: GeoFaq[] | null;
  onChange: (value: GeoFaq[] | null) => void;
  errors: Record<string, string>;
}

export function GeoFaqEditor({ value, onChange, errors }: GeoFaqEditorProps) {
  const faqs = value ?? [];
  const atLimit = faqs.length >= MAX_GEO_FAQS;

  const addFaq = () => {
    if (atLimit) return;
    onChange([...faqs, { question: "", answer: "" }]);
  };

  const updateFaq = (index: number, patch: Partial<GeoFaq>) => {
    onChange(faqs.map((faq, i) => (i === index ? { ...faq, ...patch } : faq)));
  };

  const removeFaq = (index: number) => {
    const next = faqs.filter((_, i) => i !== index);
    onChange(next.length > 0 ? next : null);
  };

  return (
    <ProductFormSection
      title="GEO FAQ 优化"
      description="手动维护产品问答；为空时前台使用规则兜底。建议 4-8 组，问题使用用户真实问法，答案先给结论再补充。"
      action={
        <div className="flex flex-wrap items-center gap-2">
          {faqs.length > 0 && <Badge variant="secondary">{faqs.length} 组</Badge>}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addFaq}
            disabled={atLimit}
            leftIcon={<Plus className="h-4 w-4" />}
          >
            添加问答
          </Button>
        </div>
      }
    >
      {errors.geoFaqs && (
        <p role="alert" className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
          {errors.geoFaqs}
        </p>
      )}

      {faqs.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-brand-charcoal/15 bg-brand-charcoal/[0.02] py-6 text-center">
          <MessageSquareText className="h-6 w-6 text-brand-charcoal/40" />
          <p className="text-sm text-brand-charcoal/65">尚未添加 GEO 问答</p>
          <p className="text-xs text-brand-charcoal/50">前台将使用规则生成的兜底问答</p>
        </div>
      ) : (
        <div className="space-y-3">
          {faqs.map((faq, index) => {
            const questionError = errors[`geoFaqs.${index}.question`];
            const answerError = errors[`geoFaqs.${index}.answer`];
            return (
              <div
                key={index}
                className="rounded-xl border border-brand-charcoal/10 bg-brand-charcoal/[0.02] p-3"
              >
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded bg-brand-primary text-xs font-bold text-white">
                    Q
                  </span>
                  <div className="min-w-0 flex-1">
                    <Input
                      aria-label={`问题 ${index + 1}`}
                      placeholder="输入问题，如：这款产品适合敏感肌吗？"
                      className={cn(
                        "bg-transparent px-1 py-0.5 text-sm font-medium focus:bg-white focus:ring-1 focus:ring-brand-primary/40",
                        questionError ? "border-red-500" : "border-none"
                      )}
                      value={faq.question}
                      maxLength={MAX_GEO_FAQ_QUESTION_LENGTH}
                      error={questionError}
                      onChange={(e) => updateFaq(index, { question: e.target.value })}
                    />
                    <p className="mt-0.5 text-right text-[11px] text-brand-charcoal/45">
                      {faq.question.length}/{MAX_GEO_FAQ_QUESTION_LENGTH}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeFaq(index)}
                    aria-label={`删除问答 ${index + 1}`}
                    className="flex-shrink-0 rounded-full p-1.5 text-brand-charcoal/65 hover:bg-red-50 hover:text-red-500"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="mt-1.5 flex items-start gap-2">
                  <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded bg-brand-charcoal text-xs font-bold text-white">
                    A
                  </span>
                  <div className="min-w-0 flex-1">
                    <Textarea
                      aria-label={`回答 ${index + 1}`}
                      placeholder="输入简洁、可被 AI 引用的回答"
                      className={cn(
                        "h-auto resize-none bg-transparent px-1 py-0.5 text-sm focus:bg-white focus:ring-1 focus:ring-brand-primary/40",
                        answerError ? "border-red-500" : "border-none"
                      )}
                      rows={2}
                      value={faq.answer}
                      maxLength={MAX_GEO_FAQ_ANSWER_LENGTH}
                      error={answerError}
                      onChange={(e) => updateFaq(index, { answer: e.target.value })}
                    />
                    <p className="mt-0.5 text-right text-[11px] text-brand-charcoal/45">
                      {faq.answer.length}/{MAX_GEO_FAQ_ANSWER_LENGTH}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {atLimit && (
        <p className="mt-3 text-xs text-brand-charcoal/65">最多添加 {MAX_GEO_FAQS} 组问答</p>
      )}
    </ProductFormSection>
  );
}
