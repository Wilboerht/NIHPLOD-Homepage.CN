"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Plus,
  Edit,
  Trash2,
  ArrowLeft,
  Package,
  Filter,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { RuleForm } from "@/components/admin/RuleForm";

interface ConditionDetail {
  fieldName: string;
  questionText: string;
  values: Array<{ value: string; label: string }>;
}

interface Product {
  id: string;
  name: string;
  nameEn: string;
}

interface Rule {
  id: string;
  conditions: Record<string, string[]>;
  productIds: string[];
  priority: number;
  message: string | null;
  createdAt: string;
  updatedAt: string;
  products: Product[];
  conditionDetails: ConditionDetail[];
}

export default function AdvisorRulesPage() {
  const { success, error: showError } = useToast();

  // 状态
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);

  // 表单弹窗
  const [formOpen, setFormOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<Rule | null>(null);

  // 删除确认
  const [deleteTarget, setDeleteTarget] = useState<Rule | null>(null);
  const [deleting, setDeleting] = useState(false);

  // 获取规则列表
  const fetchRules = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/advisor/rules");
      const data = await res.json();
      if (data.success) {
        setRules(data.data);
      }
    } catch (error) {
      console.error("获取规则列表失败:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  // 删除规则
  const handleDelete = async () => {
    if (!deleteTarget) return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/advisor/rules/${deleteTarget.id}`, {
        method: "DELETE",
      });

      if (!res.ok) throw new Error("删除失败");

      success("规则已删除");
      setDeleteTarget(null);
      fetchRules();
    } catch {
      showError("删除失败");
    } finally {
      setDeleting(false);
    }
  };

  // 打开编辑表单
  const openEditForm = (rule: Rule) => {
    setEditingRule(rule);
    setFormOpen(true);
  };

  // 关闭表单
  const closeForm = () => {
    setFormOpen(false);
    setEditingRule(null);
  };

  return (
    <div className="space-y-6">
      {/* 头部 */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link
            href="/admin/advisor"
            className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">推荐规则</h1>
            <p className="mt-1 text-sm text-gray-500">
              根据用户答案匹配推荐产品
            </p>
          </div>
        </div>
        <Button
          leftIcon={<Plus className="h-4 w-4" />}
          onClick={() => setFormOpen(true)}
        >
          新增规则
        </Button>
      </div>

      {/* 规则列表 */}
      <div className="space-y-4">
        {loading ? (
          <div className="flex h-64 items-center justify-center rounded-xl bg-white shadow-sm">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-gold border-t-transparent" />
          </div>
        ) : rules.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center rounded-xl bg-white text-gray-400 shadow-sm">
            <Filter className="mb-2 h-12 w-12" />
            <p className="text-lg">暂无推荐规则</p>
            <p className="mt-1 text-sm">点击上方按钮添加第一条规则</p>
          </div>
        ) : (
          rules.map((rule) => (
            <div
              key={rule.id}
              className="rounded-xl bg-white p-6 shadow-sm"
            >
              {/* 规则头部 */}
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <Badge variant="secondary">优先级: {rule.priority}</Badge>
                  {rule.message && (
                    <span className="text-sm text-gray-500 italic">
                      "{rule.message}"
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => openEditForm(rule)}
                    className="rounded p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                  >
                    <Edit className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setDeleteTarget(rule)}
                    className="rounded p-2 text-gray-400 hover:bg-red-50 hover:text-red-500"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* 条件 */}
              <div className="mt-4">
                <h4 className="mb-2 text-sm font-medium text-gray-700">
                  匹配条件
                </h4>
                <div className="flex flex-wrap gap-2">
                  {rule.conditionDetails.map((condition, index) => (
                    <div
                      key={index}
                      className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2"
                    >
                      <span className="text-sm text-gray-600">
                        {condition.questionText}:
                      </span>
                      <span className="ml-2 font-medium text-gray-900">
                        {condition.values.map((v) => v.label).join(", ")}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* 推荐产品 */}
              <div className="mt-4">
                <h4 className="mb-2 text-sm font-medium text-gray-700">
                  推荐产品
                </h4>
                <div className="flex flex-wrap gap-2">
                  {rule.products.map((product) => (
                    <div
                      key={product.id}
                      className="flex items-center gap-2 rounded-lg border border-brand-gold/30 bg-brand-gold/10 px-3 py-2"
                    >
                      <Package className="h-4 w-4 text-brand-gold" />
                      <span className="text-sm font-medium text-gray-900">
                        {product.name}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* 规则表单弹窗 */}
      <RuleForm
        isOpen={formOpen}
        onClose={closeForm}
        onSuccess={fetchRules}
        ruleId={editingRule?.id}
        initialData={
          editingRule
            ? {
                conditions: editingRule.conditions,
                productIds: editingRule.productIds,
                priority: editingRule.priority,
                message: editingRule.message || "",
              }
            : undefined
        }
      />

      {/* 删除确认 */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="确认删除"
        description="确定要删除这条推荐规则吗？此操作无法撤销。"
        confirmText="删除"
        loading={deleting}
        type="danger"
      />
    </div>
  );
}
