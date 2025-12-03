"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Key, Bot, Save } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";

interface AISettings {
  apiKey: string;
  model: string;
  systemPrompt: string;
  maxTokens: number;
  temperature: number;
  hasApiKey: boolean;
}

const MODEL_OPTIONS = [
  { value: "gpt-4o", label: "GPT-4o" },
  { value: "gpt-4o-mini", label: "GPT-4o Mini" },
  { value: "gpt-4-turbo", label: "GPT-4 Turbo" },
  { value: "gpt-3.5-turbo", label: "GPT-3.5 Turbo" },
];

export default function AdvisorSettingsPage() {
  const { success, error: showError } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<AISettings>({
    apiKey: "",
    model: "gpt-4o-mini",
    systemPrompt: "",
    maxTokens: 500,
    temperature: 0.7,
    hasApiKey: false,
  });

  // 新 API Key 输入
  const [newApiKey, setNewApiKey] = useState("");

  // 获取设置
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await fetch("/api/admin/advisor/settings");
        const data = await res.json();
        if (data.success) {
          setSettings(data.data);
        }
      } catch (error) {
        console.error("获取设置失败:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchSettings();
  }, []);

  // 保存设置
  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/advisor/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(newApiKey && { apiKey: newApiKey }),
          model: settings.model,
          systemPrompt: settings.systemPrompt,
          maxTokens: settings.maxTokens,
          temperature: settings.temperature,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error?.message || "保存失败");
      }

      success("设置已保存");
      setNewApiKey("");
      if (data.data.hasApiKey) {
        setSettings((prev) => ({ ...prev, hasApiKey: true }));
      }
    } catch (error) {
      showError(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-gold border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 头部 */}
      <div className="flex items-center gap-4">
        <Link
          href="/admin/advisor"
          className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">AI 设置</h1>
          <p className="mt-1 text-sm text-gray-500">配置 AI 护肤顾问参数</p>
        </div>
      </div>

      {/* API Key 设置 */}
      <section className="rounded-xl bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-gold/10">
            <Key className="h-5 w-5 text-brand-gold" />
          </div>
          <div>
            <h2 className="text-lg font-medium text-gray-900">API 密钥</h2>
            <p className="text-sm text-gray-500">OpenAI API Key 用于调用 AI 服务</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600">当前状态:</span>
            {settings.hasApiKey ? (
              <Badge variant="success">已配置</Badge>
            ) : (
              <Badge variant="warning">未配置</Badge>
            )}
            {settings.hasApiKey && settings.apiKey && (
              <span className="text-sm text-gray-500">{settings.apiKey}</span>
            )}
          </div>

          <Input
            label="新 API Key"
            type="password"
            value={newApiKey}
            onChange={(e) => setNewApiKey(e.target.value)}
            placeholder="sk-..."
          />
          <p className="text-sm text-gray-500">
            留空则保留原有 API Key。输入新值将覆盖原有配置。
          </p>
        </div>
      </section>

      {/* 模型设置 */}
      <section className="rounded-xl bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-gold/10">
            <Bot className="h-5 w-5 text-brand-gold" />
          </div>
          <div>
            <h2 className="text-lg font-medium text-gray-900">模型配置</h2>
            <p className="text-sm text-gray-500">调整 AI 模型参数</p>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Select
            label="AI 模型"
            options={MODEL_OPTIONS}
            value={settings.model}
            onChange={(e) =>
              setSettings((prev) => ({ ...prev, model: e.target.value }))
            }
          />

          <Input
            label="最大 Token 数"
            type="number"
            min={100}
            max={2000}
            value={settings.maxTokens}
            onChange={(e) =>
              setSettings((prev) => ({
                ...prev,
                maxTokens: parseInt(e.target.value) || 500,
              }))
            }
          />

          <div className="md:col-span-2">
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Temperature: {settings.temperature}
            </label>
            <input
              type="range"
              min={0}
              max={2}
              step={0.1}
              value={settings.temperature}
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  temperature: parseFloat(e.target.value),
                }))
              }
              className="w-full"
            />
            <div className="mt-1 flex justify-between text-xs text-gray-500">
              <span>精确 (0)</span>
              <span>平衡 (1)</span>
              <span>创意 (2)</span>
            </div>
          </div>

          <div className="md:col-span-2">
            <Textarea
              label="系统提示词"
              value={settings.systemPrompt}
              onChange={(e) =>
                setSettings((prev) => ({ ...prev, systemPrompt: e.target.value }))
              }
              placeholder="定义 AI 的角色和行为..."
              rows={6}
            />
          </div>
        </div>
      </section>

      {/* 保存按钮 */}
      <div className="flex justify-end">
        <Button
          leftIcon={<Save className="h-4 w-4" />}
          onClick={handleSave}
          loading={saving}
        >
          保存设置
        </Button>
      </div>
    </div>
  );
}
