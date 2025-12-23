"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Plus,
  Edit,
  Trash2,
  GripVertical,
  ChevronDown,
  ChevronRight,
  Settings,
  ListChecks,
  MessageSquare,
  BarChart3,
  Activity,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Switch } from "@/components/ui/Switch";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { QuestionForm } from "@/components/admin/QuestionForm";

interface Option {
  value: string;
  label: string;
  labelEn?: string;
  description?: string;
  emoji?: string;
}

interface Question {
  id: string;
  question: string;
  fieldName: string;
  type: string;
  options: Option[];
  order: number;
  active: boolean;
  updatedAt: string;
}

export default function AdminAdvisorPage() {
  const { success, error: showError } = useToast();

  // 状态
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // 表单弹窗
  const [formOpen, setFormOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);

  // 删除确认
  const [deleteTarget, setDeleteTarget] = useState<Question | null>(null);
  const [deleting, setDeleting] = useState(false);

  // 拖拽状态
  const [draggedId, setDraggedId] = useState<string | null>(null);

  // 获取问题列表
  const fetchQuestions = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/advisor/questions");
      const data = await res.json();
      if (data.success) {
        setQuestions(data.data);
      }
    } catch (error) {
      console.error("获取问题列表失败:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchQuestions();
  }, [fetchQuestions]);

  // 切换展开
  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  // 切换启用状态
  const toggleActive = async (question: Question) => {
    try {
      const res = await fetch(`/api/admin/advisor/questions/${question.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !question.active }),
      });

      if (!res.ok) throw new Error("操作失败");

      success(question.active ? "已禁用" : "已启用");
      fetchQuestions();
    } catch {
      showError("操作失败");
    }
  };

  // 删除问题
  const handleDelete = async () => {
    if (!deleteTarget) return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/advisor/questions/${deleteTarget.id}`, {
        method: "DELETE",
      });

      if (!res.ok) throw new Error("删除失败");

      success("问题已删除");
      setDeleteTarget(null);
      fetchQuestions();
    } catch {
      showError("删除失败");
    } finally {
      setDeleting(false);
    }
  };

  // 拖拽排序
  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = async (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedId || draggedId === targetId) {
      setDraggedId(null);
      return;
    }

    const draggedIndex = questions.findIndex((q) => q.id === draggedId);
    const targetIndex = questions.findIndex((q) => q.id === targetId);

    if (draggedIndex === -1 || targetIndex === -1) {
      setDraggedId(null);
      return;
    }

    // 重新排序
    const newQuestions = [...questions];
    const [removed] = newQuestions.splice(draggedIndex, 1);
    newQuestions.splice(targetIndex, 0, removed);

    // 更新本地状态
    setQuestions(newQuestions);
    setDraggedId(null);

    // 保存到服务器
    try {
      const items = newQuestions.map((q, index) => ({
        id: q.id,
        order: index + 1,
      }));

      const res = await fetch("/api/admin/advisor/questions/order", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });

      if (!res.ok) throw new Error("保存排序失败");

      success("排序已保存");
    } catch {
      showError("保存排序失败");
      fetchQuestions(); // 恢复原始顺序
    }
  };

  // 打开编辑表单
  const openEditForm = (question: Question) => {
    setEditingQuestion(question);
    setFormOpen(true);
  };

  // 关闭表单
  const closeForm = () => {
    setFormOpen(false);
    setEditingQuestion(null);
  };

  return (
    <div className="space-y-6">
      {/* 头部 */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">AI 顾问管理</h1>
          <p className="mt-1 text-sm text-gray-500">管理护肤问卷问题和推荐规则</p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/admin/advisor/monitoring">
            <Button variant="outline" leftIcon={<Activity className="h-4 w-4" />}>
              系统监控
            </Button>
          </Link>
          <Link href="/admin/advisor/analytics" className="relative">
            <span className="absolute -right-2 -top-2 rounded-full bg-brand-gold px-1.5 py-0.5 text-[10px] font-medium text-white">
              AI分析
            </span>
            <Button variant="outline" leftIcon={<BarChart3 className="h-4 w-4" />}>
              用户统计
            </Button>
          </Link>
          <Link href="/admin/advisor/rules">
            <Button variant="outline" leftIcon={<ListChecks className="h-4 w-4" />}>
              推荐规则
            </Button>
          </Link>
          <Link href="/admin/advisor/settings">
            <Button variant="outline" leftIcon={<Settings className="h-4 w-4" />}>
              AI 设置
            </Button>
          </Link>
          <Button
            leftIcon={<Plus className="h-4 w-4" />}
            onClick={() => setFormOpen(true)}
          >
            新增问题
          </Button>
        </div>
      </div>

      {/* 问题列表 */}
      <div className="rounded-xl bg-white shadow-sm">
        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-gold border-t-transparent" />
          </div>
        ) : questions.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center text-gray-400">
            <MessageSquare className="mb-2 h-12 w-12" />
            <p className="text-lg">暂无问题</p>
            <p className="mt-1 text-sm">点击上方按钮添加第一个问题</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {questions.map((question) => (
              <div
                key={question.id}
                draggable
                onDragStart={(e) => handleDragStart(e, question.id)}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, question.id)}
                className={`transition-colors ${
                  draggedId === question.id ? "bg-gray-50 opacity-50" : ""
                }`}
              >
                {/* 问题行 */}
                <div className="flex items-center gap-4 px-6 py-4 hover:bg-gray-50">
                  <div className="cursor-move text-gray-400 hover:text-gray-600">
                    <GripVertical className="h-5 w-5" />
                  </div>

                  <button
                    onClick={() => toggleExpand(question.id)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    {expandedIds.has(question.id) ? (
                      <ChevronDown className="h-5 w-5" />
                    ) : (
                      <ChevronRight className="h-5 w-5" />
                    )}
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3">
                      <span className="font-medium text-gray-900">
                        {question.question}
                      </span>
                      <Badge variant={question.active ? "success" : "default"}>
                        {question.active ? "启用" : "禁用"}
                      </Badge>
                      <Badge variant="secondary">
                        {question.type === "single" ? "单选" : "多选"}
                      </Badge>
                    </div>
                    <div className="mt-1 flex items-center gap-4 text-sm text-gray-500">
                      <span>字段: {question.fieldName}</span>
                      <span>{question.options.length} 个选项</span>
                    </div>
                  </div>

                  <Switch
                    checked={question.active}
                    onChange={() => toggleActive(question)}
                  />

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openEditForm(question)}
                      className="rounded p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                    >
                      <Edit className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setDeleteTarget(question)}
                      className="rounded p-2 text-gray-400 hover:bg-red-50 hover:text-red-500"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* 选项列表 */}
                {expandedIds.has(question.id) && (
                  <div className="border-t border-gray-100 bg-gray-50 px-6 py-4">
                    <div className="ml-14 grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                      {question.options.map((option, index) => (
                        <div
                          key={index}
                          className="rounded-lg border border-gray-200 bg-white px-3 py-2"
                        >
                          <div className="flex items-center gap-2 font-medium text-gray-900">
                            {option.emoji && (
                              <span className="text-lg">{option.emoji}</span>
                            )}
                            <span>{option.label}</span>
                          </div>
                          {option.description && (
                            <div className="mt-1 text-sm text-gray-600">
                              {option.description}
                            </div>
                          )}
                          <div className="mt-1 text-xs text-gray-400">
                            值: {option.value}
                            {option.labelEn && ` | EN: ${option.labelEn}`}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 问题表单弹窗 */}
      <QuestionForm
        isOpen={formOpen}
        onClose={closeForm}
        onSuccess={fetchQuestions}
        questionId={editingQuestion?.id}
        initialData={
          editingQuestion
            ? {
                question: editingQuestion.question,
                fieldName: editingQuestion.fieldName,
                type: editingQuestion.type as "single" | "multiple",
                options: editingQuestion.options,
                active: editingQuestion.active,
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
        description={`确定要删除问题「${deleteTarget?.question}」吗？此操作无法撤销。`}
        confirmText="删除"
        loading={deleting}
        type="danger"
      />
    </div>
  );
}
