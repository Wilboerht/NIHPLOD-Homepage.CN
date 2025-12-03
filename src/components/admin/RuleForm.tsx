"use client";

import { useState, useEffect } from "react";
import { z } from "zod";
import { Plus, X } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";

interface Option {
  value: string;
  label: string;
}

interface Question {
  id: string;
  question: string;
  fieldName: string;
  options: Option[];
}

interface Product {
  id: string;
  name: string;
  nameEn: string;
}

// 表单 Schema
const RuleFormSchema = z.object({
  conditions: z.record(z.string(), z.array(z.string())).refine(
    (val) => Object.keys(val).length > 0,
    "请添加至少一个条件"
  ),
  productIds: z.array(z.string()).min(1, "请选择至少一个产品"),
  priority: z.number().min(0),
  message: z.string().max(500).optional(),
});

type RuleFormData = z.infer<typeof RuleFormSchema>;

interface RuleFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  ruleId?: string;
  initialData?: Partial<RuleFormData>;
}

export function RuleForm({
  isOpen,
  onClose,
  onSuccess,
  ruleId,
  initialData,
}: RuleFormProps) {
  const { success, error: showError } = useToast();
  const isEdit = !!ruleId;

  const [loading, setLoading] = useState(false);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [formData, setFormData] = useState<RuleFormData>({
    conditions: {},
    productIds: [],
    priority: 0,
    message: "",
    ...initialData,
  });

  // 条件编辑状态
  const [selectedField, setSelectedField] = useState("");
  const [selectedValues, setSelectedValues] = useState<string[]>([]);

  // 获取问题和产品列表
  useEffect(() => {
    if (isOpen) {
      fetchQuestions();
      fetchProducts();
    }
  }, [isOpen]);

  const fetchQuestions = async () => {
    try {
      const res = await fetch("/api/admin/advisor/questions");
      const data = await res.json();
      if (data.success) {
        setQuestions(data.data.filter((q: Question & { active: boolean }) => q.active));
      }
    } catch (error) {
      console.error("获取问题列表失败:", error);
    }
  };

  const fetchProducts = async () => {
    try {
      const res = await fetch("/api/admin/products?pageSize=100&status=published");
      const data = await res.json();
      if (data.success) {
        setProducts(data.data.items);
      }
    } catch (error) {
      console.error("获取产品列表失败:", error);
    }
  };

  // 添加条件
  const addCondition = () => {
    if (!selectedField || selectedValues.length === 0) return;

    setFormData((prev) => ({
      ...prev,
      conditions: {
        ...prev.conditions,
        [selectedField]: selectedValues,
      },
    }));

    setSelectedField("");
    setSelectedValues([]);
  };

  // 删除条件
  const removeCondition = (fieldName: string) => {
    setFormData((prev) => {
      const newConditions = { ...prev.conditions };
      delete newConditions[fieldName];
      return { ...prev, conditions: newConditions };
    });
  };

  // 切换产品选择
  const toggleProduct = (productId: string) => {
    setFormData((prev) => ({
      ...prev,
      productIds: prev.productIds.includes(productId)
        ? prev.productIds.filter((id) => id !== productId)
        : [...prev.productIds, productId],
    }));
  };

  // 验证表单
  const validateForm = (): boolean => {
    try {
      RuleFormSchema.parse(formData);
      setErrors({});
      return true;
    } catch (err) {
      if (err instanceof z.ZodError) {
        const newErrors: Record<string, string> = {};
        err.issues.forEach((issue) => {
          const key = issue.path[0] as string;
          if (!newErrors[key]) {
            newErrors[key] = issue.message;
          }
        });
        setErrors(newErrors);
      }
      return false;
    }
  };

  // 提交表单
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      showError("请检查表单填写");
      return;
    }

    setLoading(true);

    try {
      const url = isEdit
        ? `/api/admin/advisor/rules/${ruleId}`
        : "/api/admin/advisor/rules";
      const method = isEdit ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error?.message || "保存失败");
      }

      success(isEdit ? "规则已更新" : "规则已创建");
      onSuccess();
      handleClose();
    } catch (err) {
      showError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setLoading(false);
    }
  };

  // 关闭并重置
  const handleClose = () => {
    setFormData({
      conditions: {},
      productIds: [],
      priority: 0,
      message: "",
      ...initialData,
    });
    setSelectedField("");
    setSelectedValues([]);
    setErrors({});
    onClose();
  };

  // 获取问题的选项
  const getQuestionOptions = (fieldName: string): Option[] => {
    const question = questions.find((q) => q.fieldName === fieldName);
    return question?.options || [];
  };

  // 获取问题名称
  const getQuestionName = (fieldName: string): string => {
    const question = questions.find((q) => q.fieldName === fieldName);
    return question?.question || fieldName;
  };

  return (
    <Modal
      open={isOpen}
      onClose={handleClose}
      title={isEdit ? "编辑规则" : "新增规则"}
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* 条件设置 */}
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">
            匹配条件
          </label>
          {errors.conditions && (
            <p className="mb-2 text-sm text-red-500">{errors.conditions}</p>
          )}

          {/* 已添加的条件 */}
          <div className="mb-3 space-y-2">
            {Object.entries(formData.conditions).map(([fieldName, values]) => (
              <div
                key={fieldName}
                className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-2"
              >
                <div>
                  <span className="text-sm text-gray-600">
                    {getQuestionName(fieldName)}:
                  </span>
                  <span className="ml-2 font-medium text-gray-900">
                    {values
                      .map((v) => {
                        const opt = getQuestionOptions(fieldName).find(
                          (o) => o.value === v
                        );
                        return opt?.label || v;
                      })
                      .join(", ")}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => removeCondition(fieldName)}
                  className="rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-red-500"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>

          {/* 添加条件 */}
          <div className="flex gap-3">
            <Select
              options={[
                { value: "", label: "选择问题" },
                ...questions
                  .filter((q) => !formData.conditions[q.fieldName])
                  .map((q) => ({ value: q.fieldName, label: q.question })),
              ]}
              value={selectedField}
              onChange={(e) => {
                setSelectedField(e.target.value);
                setSelectedValues([]);
              }}
              className="flex-1"
            />
            {selectedField && (
              <>
                <Select
                  options={[
                    { value: "", label: "选择选项" },
                    ...getQuestionOptions(selectedField),
                  ]}
                  value=""
                  onChange={(e) => {
                    if (e.target.value && !selectedValues.includes(e.target.value)) {
                      setSelectedValues([...selectedValues, e.target.value]);
                    }
                  }}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={addCondition}
                  disabled={selectedValues.length === 0}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
          {selectedValues.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {selectedValues.map((v) => {
                const opt = getQuestionOptions(selectedField).find(
                  (o) => o.value === v
                );
                return (
                  <span
                    key={v}
                    className="inline-flex items-center gap-1 rounded-full bg-brand-gold/20 px-2 py-1 text-sm"
                  >
                    {opt?.label || v}
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedValues(selectedValues.filter((sv) => sv !== v))
                      }
                      className="text-gray-500 hover:text-gray-700"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                );
              })}
            </div>
          )}
        </div>

        {/* 推荐产品 */}
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">
            推荐产品
          </label>
          {errors.productIds && (
            <p className="mb-2 text-sm text-red-500">{errors.productIds}</p>
          )}
          <div className="max-h-48 overflow-y-auto rounded-lg border border-gray-200">
            {products.map((product) => (
              <label
                key={product.id}
                className="flex cursor-pointer items-center gap-3 border-b border-gray-100 px-3 py-2 last:border-b-0 hover:bg-gray-50"
              >
                <input
                  type="checkbox"
                  checked={formData.productIds.includes(product.id)}
                  onChange={() => toggleProduct(product.id)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <span className="text-sm text-gray-900">{product.name}</span>
              </label>
            ))}
          </div>
        </div>

        {/* 优先级和推荐语 */}
        <div className="grid gap-4 md:grid-cols-2">
          <Input
            label="优先级"
            type="number"
            min={0}
            value={formData.priority}
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                priority: parseInt(e.target.value) || 0,
              }))
            }
          />
          <div className="md:col-span-2">
            <Textarea
              label="推荐语（可选）"
              value={formData.message || ""}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, message: e.target.value }))
              }
              placeholder="如：根据您的肤质，我们推荐以下产品..."
              rows={2}
            />
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="flex justify-end gap-3 border-t border-gray-200 pt-4">
          <Button type="button" variant="outline" onClick={handleClose}>
            取消
          </Button>
          <Button type="submit" loading={loading}>
            {isEdit ? "保存更改" : "创建规则"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
