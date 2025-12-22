"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Key, Bot, Save, MessageSquare, RotateCcw, ChevronDown, ChevronUp, Eye } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";

// 默认提示词接口
interface DefaultPrompts {
  textSystemPrompt: string;
  visionSystemPrompt: string;
  providerPrompts: {
    openai: string;
    anthropic: string;
    qwen: string;
  };
}

// 各服务商 API Keys 状态
interface ApiKeys {
  openai: string;
  deepseek: string;
  qwen: string;
  anthropic: string;
  gemini: string;
}

interface HasApiKeys {
  openai: boolean;
  deepseek: boolean;
  qwen: boolean;
  anthropic: boolean;
  gemini: boolean;
}

interface AISettings {
  provider: string;
  visionProvider: string;
  apiKey: string;
  model: string;
  visionModel: string;
  systemPrompt: string; // 废弃，保留兼容
  textSystemPrompt: string;
  visionSystemPrompt: string;
  maxTokens: number;
  temperature: number;
  hasApiKey: boolean;
  apiKeys: ApiKeys;
  hasApiKeys: HasApiKeys;
}

// AI 文本服务商选项
const PROVIDER_OPTIONS = [
  { value: "deepseek", label: "DeepSeek (性价比最高)" },
  { value: "qwen", label: "通义千问 (国内推荐)" },
  { value: "gemini", label: "Google Gemini (免费额度)" },
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic Claude" },
];

// AI 视觉服务商选项（用于面部分析）
const VISION_PROVIDER_OPTIONS = [
  { value: "openai", label: "OpenAI GPT-4 Vision" },
  { value: "qwen", label: "通义千问 VL (国内推荐)" },
  { value: "anthropic", label: "Anthropic Claude Vision" },
];

// 各服务商的文本模型选项
const MODEL_OPTIONS_BY_PROVIDER: Record<string, { value: string; label: string }[]> = {
  openai: [
    { value: "gpt-4o", label: "GPT-4o (推荐)" },
    { value: "gpt-4o-mini", label: "GPT-4o Mini (经济)" },
    { value: "gpt-4-turbo", label: "GPT-4 Turbo" },
    { value: "gpt-3.5-turbo", label: "GPT-3.5 Turbo" },
  ],
  deepseek: [
    { value: "deepseek-chat", label: "DeepSeek Chat (推荐)" },
    { value: "deepseek-coder", label: "DeepSeek Coder" },
  ],
  qwen: [
    { value: "qwen-plus", label: "Qwen Plus (推荐，均衡)" },
    { value: "qwen-turbo", label: "Qwen Turbo (最快)" },
    { value: "qwen-max", label: "Qwen Max (最强)" },
    { value: "qwen-long", label: "Qwen Long (长文本)" },
  ],
  anthropic: [
    { value: "claude-sonnet-4-20250514", label: "Claude Sonnet 4 (推荐)" },
    { value: "claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet" },
    { value: "claude-3-haiku-20240307", label: "Claude 3 Haiku (经济)" },
  ],
  gemini: [
    { value: "gemini-2.0-flash", label: "Gemini 2.0 Flash (推荐)" },
    { value: "gemini-2.0-flash-lite", label: "Gemini 2.0 Flash Lite (经济)" },
    { value: "gemini-1.5-pro", label: "Gemini 1.5 Pro" },
    { value: "gemini-1.5-flash", label: "Gemini 1.5 Flash" },
  ],
};

// 各服务商的视觉模型选项
const VISION_MODEL_OPTIONS_BY_PROVIDER: Record<string, { value: string; label: string }[]> = {
  openai: [
    { value: "gpt-4o", label: "GPT-4o (推荐)" },
    { value: "gpt-4o-mini", label: "GPT-4o Mini (经济)" },
  ],
  qwen: [
    { value: "qwen-vl-max", label: "Qwen VL Max (推荐，最强)" },
    { value: "qwen-vl-plus", label: "Qwen VL Plus (均衡)" },
  ],
  anthropic: [
    { value: "claude-sonnet-4-20250514", label: "Claude Sonnet 4 (推荐)" },
    { value: "claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet" },
  ],
};

// 默认兼容选项
const MODEL_OPTIONS = MODEL_OPTIONS_BY_PROVIDER.openai;

export default function AdvisorSettingsPage() {
  const { success, error: showError } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<AISettings>({
    provider: "deepseek",
    visionProvider: "openai",
    apiKey: "",
    model: "deepseek-chat",
    visionModel: "gpt-4o",
    systemPrompt: "",
    textSystemPrompt: "",
    visionSystemPrompt: "",
    maxTokens: 1200, // 文本分析需要较长输出
    temperature: 0.3, // 保持输出一致性
    hasApiKey: false,
    apiKeys: {
      openai: "",
      deepseek: "",
      qwen: "",
      anthropic: "",
      gemini: "",
    },
    hasApiKeys: {
      openai: false,
      deepseek: false,
      qwen: false,
      anthropic: false,
      gemini: false,
    },
  });

  // 新 API Key 输入（各服务商独立）
  const [newApiKeys, setNewApiKeys] = useState<ApiKeys>({
    openai: "",
    deepseek: "",
    qwen: "",
    anthropic: "",
    gemini: "",
  });

  // 保留旧的 newApiKey 用于兼容（不再使用）
  const [newApiKey, setNewApiKey] = useState("");

  // 默认提示词
  const [defaultPrompts, setDefaultPrompts] = useState<DefaultPrompts | null>(null);
  // 展开/收起默认提示词预览
  const [showDefaultTextPrompt, setShowDefaultTextPrompt] = useState(false);
  const [showDefaultVisionPrompt, setShowDefaultVisionPrompt] = useState(false);

  // 获取设置和默认提示词
  useEffect(() => {
    const fetchData = async () => {
      try {
        // 并行获取设置和默认提示词
        const [settingsRes, promptsRes] = await Promise.all([
          fetch("/api/admin/advisor/settings"),
          fetch("/api/admin/advisor/prompts"),
        ]);

        const settingsData = await settingsRes.json();
        const promptsData = await promptsRes.json();

        if (settingsData.success) {
          setSettings(settingsData.data);
        }

        if (promptsData.success) {
          setDefaultPrompts(promptsData.data);
        }
      } catch (error) {
        console.error("获取设置失败:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // 保存设置
  const handleSave = async () => {
    setSaving(true);
    try {
      // 构建 apiKeys 对象（只包含有值的 Key）
      const apiKeysToSave: Partial<ApiKeys> = {};
      if (newApiKeys.openai) apiKeysToSave.openai = newApiKeys.openai;
      if (newApiKeys.deepseek) apiKeysToSave.deepseek = newApiKeys.deepseek;
      if (newApiKeys.qwen) apiKeysToSave.qwen = newApiKeys.qwen;
      if (newApiKeys.anthropic) apiKeysToSave.anthropic = newApiKeys.anthropic;
      if (newApiKeys.gemini) apiKeysToSave.gemini = newApiKeys.gemini;

      const res = await fetch("/api/admin/advisor/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(newApiKey && { apiKey: newApiKey }),
          ...(Object.keys(apiKeysToSave).length > 0 && { apiKeys: apiKeysToSave }),
          provider: settings.provider,
          visionProvider: settings.visionProvider,
          model: settings.model,
          visionModel: settings.visionModel,
          textSystemPrompt: settings.textSystemPrompt,
          visionSystemPrompt: settings.visionSystemPrompt,
          maxTokens: settings.maxTokens,
          temperature: settings.temperature,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error?.message || "保存失败");
      }

      success("设置已保存");
      // 清空输入框
      setNewApiKey("");
      setNewApiKeys({
        openai: "",
        deepseek: "",
        qwen: "",
        anthropic: "",
        gemini: "",
      });

      // 更新 hasApiKeys 状态
      if (data.data.hasApiKeys) {
        setSettings((prev) => ({
          ...prev,
          hasApiKey: data.data.hasApiKey,
          hasApiKeys: data.data.hasApiKeys,
        }));
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

      {/* 服务商选择 */}
      <section className="rounded-xl bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-gold/10">
            <Bot className="h-5 w-5 text-brand-gold" />
          </div>
          <div>
            <h2 className="text-lg font-medium text-gray-900">AI 服务商</h2>
            <p className="text-sm text-gray-500">选择 AI 服务提供商和模型</p>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Select
            label="服务商"
            options={PROVIDER_OPTIONS}
            value={settings.provider}
            onChange={(e) => {
              const newProvider = e.target.value;
              const defaultModel = MODEL_OPTIONS_BY_PROVIDER[newProvider]?.[0]?.value || "";
              setSettings((prev) => ({ ...prev, provider: newProvider, model: defaultModel }));
            }}
          />

          <Select
            label="AI 模型"
            options={MODEL_OPTIONS_BY_PROVIDER[settings.provider] || MODEL_OPTIONS}
            value={settings.model}
            onChange={(e) =>
              setSettings((prev) => ({ ...prev, model: e.target.value }))
            }
          />
        </div>

        {/* 服务商说明 */}
        <div className="mt-4 rounded-lg bg-gray-50 p-4 text-sm text-gray-600">
          {settings.provider === "deepseek" && (
            <p>💰 <strong>DeepSeek</strong>：性价比最高，国内可直接访问，中文能力强。<a href="https://platform.deepseek.com/" target="_blank" rel="noopener" className="text-brand-gold hover:underline">获取 API Key →</a></p>
          )}
          {settings.provider === "qwen" && (
            <p>🇨🇳 <strong>通义千问</strong>：阿里云服务，国内访问稳定，中文理解优秀。<a href="https://dashscope.console.aliyun.com/" target="_blank" rel="noopener" className="text-brand-gold hover:underline">获取 API Key →</a></p>
          )}
          {settings.provider === "openai" && (
            <p>🌐 <strong>OpenAI</strong>：效果最佳，需要海外访问或代理。<a href="https://platform.openai.com/" target="_blank" rel="noopener" className="text-brand-gold hover:underline">获取 API Key →</a></p>
          )}
          {settings.provider === "anthropic" && (
            <p>🤖 <strong>Anthropic Claude</strong>：回复质量高，擅长复杂推理。<a href="https://console.anthropic.com/" target="_blank" rel="noopener" className="text-brand-gold hover:underline">获取 API Key →</a></p>
          )}
          {settings.provider === "gemini" && (
            <p>✨ <strong>Google Gemini</strong>：有免费额度，多模态能力强，全球可用。<a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener" className="text-brand-gold hover:underline">获取 API Key →</a></p>
          )}
        </div>
      </section>

      {/* 视觉分析服务商（面部识别） */}
      <section className="rounded-xl bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100">
            <svg className="h-5 w-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-medium text-gray-900">视觉分析 (面部识别)</h2>
            <p className="text-sm text-gray-500">用于分析用户上传的面部照片</p>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Select
            label="视觉服务商"
            options={VISION_PROVIDER_OPTIONS}
            value={settings.visionProvider}
            onChange={(e) => {
              const newProvider = e.target.value;
              const defaultModel = VISION_MODEL_OPTIONS_BY_PROVIDER[newProvider]?.[0]?.value || "";
              setSettings((prev) => ({ ...prev, visionProvider: newProvider, visionModel: defaultModel }));
            }}
          />

          <Select
            label="视觉模型"
            options={VISION_MODEL_OPTIONS_BY_PROVIDER[settings.visionProvider] || VISION_MODEL_OPTIONS_BY_PROVIDER.openai}
            value={settings.visionModel}
            onChange={(e) =>
              setSettings((prev) => ({ ...prev, visionModel: e.target.value }))
            }
          />
        </div>

        {/* 视觉服务商说明 */}
        <div className="mt-4 rounded-lg bg-purple-50 p-4 text-sm text-gray-600">
          {settings.visionProvider === "openai" && (
            <p>👁️ <strong>OpenAI GPT-4 Vision</strong>：图像理解能力最强，适合精确分析。需要海外访问。</p>
          )}
          {settings.visionProvider === "qwen" && (
            <p>👁️ <strong>通义千问 VL</strong>：国内访问稳定，视觉理解能力优秀，推荐国内用户使用。</p>
          )}
          {settings.visionProvider === "anthropic" && (
            <p>👁️ <strong>Claude Vision</strong>：多模态能力强，分析细致。需要海外访问。</p>
          )}
        </div>

        {/* 提示信息 */}
        <div className="mt-4 rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
          <p>⚠️ <strong>注意</strong>：视觉分析需要对应服务商的 API Key。如果文本服务商和视觉服务商不同，请确保两个服务商的 API Key 都已配置。</p>
        </div>
      </section>

      {/* API Key 设置 */}
      <section className="rounded-xl bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-gold/10">
            <Key className="h-5 w-5 text-brand-gold" />
          </div>
          <div>
            <h2 className="text-lg font-medium text-gray-900">API 密钥管理</h2>
            <p className="text-sm text-gray-500">为各 AI 服务商配置独立的 API Key</p>
          </div>
        </div>

        <div className="space-y-6">
          {/* DeepSeek API Key */}
          <div className="rounded-lg border border-gray-200 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-900">DeepSeek</span>
                <span className="text-xs text-gray-500">(文本分析)</span>
              </div>
              {settings.hasApiKeys?.deepseek ? (
                <Badge variant="success">已配置</Badge>
              ) : (
                <Badge variant="warning">未配置</Badge>
              )}
            </div>
            {settings.hasApiKeys?.deepseek && settings.apiKeys?.deepseek && (
              <p className="mb-2 text-xs text-gray-500">当前: {settings.apiKeys.deepseek}</p>
            )}
            <Input
              type="password"
              value={newApiKeys.deepseek}
              onChange={(e) => setNewApiKeys((prev) => ({ ...prev, deepseek: e.target.value }))}
              placeholder="sk-..."
            />
            <p className="mt-1 text-xs text-gray-500">
              <a href="https://platform.deepseek.com/" target="_blank" rel="noopener" className="text-brand-gold hover:underline">获取 API Key →</a>
            </p>
          </div>

          {/* 通义千问 API Key */}
          <div className="rounded-lg border border-gray-200 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-900">通义千问</span>
                <span className="text-xs text-gray-500">(文本/视觉)</span>
              </div>
              {settings.hasApiKeys?.qwen ? (
                <Badge variant="success">已配置</Badge>
              ) : (
                <Badge variant="warning">未配置</Badge>
              )}
            </div>
            {settings.hasApiKeys?.qwen && settings.apiKeys?.qwen && (
              <p className="mb-2 text-xs text-gray-500">当前: {settings.apiKeys.qwen}</p>
            )}
            <Input
              type="password"
              value={newApiKeys.qwen}
              onChange={(e) => setNewApiKeys((prev) => ({ ...prev, qwen: e.target.value }))}
              placeholder="sk-..."
            />
            <p className="mt-1 text-xs text-gray-500">
              <a href="https://dashscope.console.aliyun.com/" target="_blank" rel="noopener" className="text-brand-gold hover:underline">获取 API Key →</a>
            </p>
          </div>

          {/* OpenAI API Key */}
          <div className="rounded-lg border border-gray-200 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-900">OpenAI</span>
                <span className="text-xs text-gray-500">(文本/视觉)</span>
              </div>
              {settings.hasApiKeys?.openai ? (
                <Badge variant="success">已配置</Badge>
              ) : (
                <Badge variant="warning">未配置</Badge>
              )}
            </div>
            {settings.hasApiKeys?.openai && settings.apiKeys?.openai && (
              <p className="mb-2 text-xs text-gray-500">当前: {settings.apiKeys.openai}</p>
            )}
            <Input
              type="password"
              value={newApiKeys.openai}
              onChange={(e) => setNewApiKeys((prev) => ({ ...prev, openai: e.target.value }))}
              placeholder="sk-..."
            />
            <p className="mt-1 text-xs text-gray-500">
              <a href="https://platform.openai.com/" target="_blank" rel="noopener" className="text-brand-gold hover:underline">获取 API Key →</a>
            </p>
          </div>

          {/* Anthropic API Key */}
          <div className="rounded-lg border border-gray-200 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-900">Anthropic</span>
                <span className="text-xs text-gray-500">(文本/视觉)</span>
              </div>
              {settings.hasApiKeys?.anthropic ? (
                <Badge variant="success">已配置</Badge>
              ) : (
                <Badge variant="warning">未配置</Badge>
              )}
            </div>
            {settings.hasApiKeys?.anthropic && settings.apiKeys?.anthropic && (
              <p className="mb-2 text-xs text-gray-500">当前: {settings.apiKeys.anthropic}</p>
            )}
            <Input
              type="password"
              value={newApiKeys.anthropic}
              onChange={(e) => setNewApiKeys((prev) => ({ ...prev, anthropic: e.target.value }))}
              placeholder="sk-ant-..."
            />
            <p className="mt-1 text-xs text-gray-500">
              <a href="https://console.anthropic.com/" target="_blank" rel="noopener" className="text-brand-gold hover:underline">获取 API Key →</a>
            </p>
          </div>

          {/* Gemini API Key */}
          <div className="rounded-lg border border-gray-200 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-900">Google Gemini</span>
                <span className="text-xs text-gray-500">(文本分析)</span>
              </div>
              {settings.hasApiKeys?.gemini ? (
                <Badge variant="success">已配置</Badge>
              ) : (
                <Badge variant="warning">未配置</Badge>
              )}
            </div>
            {settings.hasApiKeys?.gemini && settings.apiKeys?.gemini && (
              <p className="mb-2 text-xs text-gray-500">当前: {settings.apiKeys.gemini}</p>
            )}
            <Input
              type="password"
              value={newApiKeys.gemini}
              onChange={(e) => setNewApiKeys((prev) => ({ ...prev, gemini: e.target.value }))}
              placeholder="AIza..."
            />
            <p className="mt-1 text-xs text-gray-500">
              <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener" className="text-brand-gold hover:underline">获取 API Key →</a>
            </p>
          </div>

          <p className="text-sm text-gray-500">
            💡 留空则保留原有 API Key。输入新值将覆盖原有配置。环境变量中的 API Key 会作为后备使用。
          </p>
        </div>
      </section>

      {/* 高级设置 */}
      <section className="rounded-xl bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-gold/10">
            <Bot className="h-5 w-5 text-brand-gold" />
          </div>
          <div>
            <h2 className="text-lg font-medium text-gray-900">高级配置</h2>
            <p className="text-sm text-gray-500">调整 AI 模型参数</p>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">

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

        </div>
      </section>

      {/* 系统提示词配置 */}
      <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-purple-600" />
            <h2 className="text-lg font-semibold text-gray-900">系统提示词</h2>
          </div>
        </div>
        <p className="mb-4 text-sm text-gray-600">
          自定义 AI 的角色和行为指导。留空则使用系统默认提示词。文本分析用于问卷分析，视觉分析用于面部拍照分析。
        </p>

        <div className="space-y-6">
          {/* 文本分析提示词 */}
          <div className="rounded-lg border border-gray-200 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-900">文本分析系统提示词</span>
                <span className="rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
                  问卷分析
                </span>
                {settings.textSystemPrompt ? (
                  <Badge variant="success">已自定义</Badge>
                ) : (
                  <Badge variant="default">使用默认</Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                {defaultPrompts && (
                  <>
                    <button
                      type="button"
                      onClick={() => setShowDefaultTextPrompt(!showDefaultTextPrompt)}
                      className="flex items-center gap-1 rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-100"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      {showDefaultTextPrompt ? "隐藏默认" : "查看默认"}
                      {showDefaultTextPrompt ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </button>
                    {settings.textSystemPrompt && (
                      <button
                        type="button"
                        onClick={() => setSettings((prev) => ({ ...prev, textSystemPrompt: "" }))}
                        className="flex items-center gap-1 rounded px-2 py-1 text-xs text-orange-600 hover:bg-orange-50"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        恢复默认
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* 默认提示词预览 */}
            {showDefaultTextPrompt && defaultPrompts && (
              <div className="mb-3 rounded-lg bg-gray-50 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-500">默认提示词预览</span>
                  <button
                    type="button"
                    onClick={() => {
                      setSettings((prev) => ({ ...prev, textSystemPrompt: defaultPrompts.textSystemPrompt }));
                      success("已复制默认提示词，您可以在此基础上修改");
                    }}
                    className="text-xs text-brand-gold hover:underline"
                  >
                    复制到编辑区
                  </button>
                </div>
                <pre className="max-h-48 overflow-auto whitespace-pre-wrap text-xs text-gray-600">
                  {defaultPrompts.textSystemPrompt}
                </pre>
              </div>
            )}

            <Textarea
              value={settings.textSystemPrompt}
              onChange={(e) =>
                setSettings((prev) => ({ ...prev, textSystemPrompt: e.target.value }))
              }
              placeholder="留空使用默认提示词，或输入自定义提示词..."
              rows={6}
            />
            <p className="mt-2 text-xs text-gray-500">
              💡 提示：留空将使用系统内置的专业护肤顾问提示词
            </p>
          </div>

          {/* 视觉分析提示词 */}
          <div className="rounded-lg border border-gray-200 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-900">视觉分析系统提示词</span>
                <span className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-700">
                  面部分析
                </span>
                {settings.visionSystemPrompt ? (
                  <Badge variant="success">已自定义</Badge>
                ) : (
                  <Badge variant="default">使用默认</Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                {defaultPrompts && (
                  <>
                    <button
                      type="button"
                      onClick={() => setShowDefaultVisionPrompt(!showDefaultVisionPrompt)}
                      className="flex items-center gap-1 rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-100"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      {showDefaultVisionPrompt ? "隐藏默认" : "查看默认"}
                      {showDefaultVisionPrompt ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </button>
                    {settings.visionSystemPrompt && (
                      <button
                        type="button"
                        onClick={() => setSettings((prev) => ({ ...prev, visionSystemPrompt: "" }))}
                        className="flex items-center gap-1 rounded px-2 py-1 text-xs text-orange-600 hover:bg-orange-50"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        恢复默认
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* 默认提示词预览 - 根据选择的视觉服务商显示对应版本 */}
            {showDefaultVisionPrompt && defaultPrompts && (
              <div className="mb-3 rounded-lg bg-gray-50 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-500">
                    默认提示词预览 ({settings.visionProvider === "anthropic" ? "Claude 专用" : settings.visionProvider === "qwen" ? "通义千问专用" : "通用版"})
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const prompt = settings.visionProvider === "anthropic"
                        ? defaultPrompts.providerPrompts.anthropic
                        : settings.visionProvider === "qwen"
                          ? defaultPrompts.providerPrompts.qwen
                          : defaultPrompts.visionSystemPrompt;
                      setSettings((prev) => ({ ...prev, visionSystemPrompt: prompt }));
                      success("已复制默认提示词，您可以在此基础上修改");
                    }}
                    className="text-xs text-brand-gold hover:underline"
                  >
                    复制到编辑区
                  </button>
                </div>
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap text-xs text-gray-600">
                  {settings.visionProvider === "anthropic"
                    ? defaultPrompts.providerPrompts.anthropic
                    : settings.visionProvider === "qwen"
                      ? defaultPrompts.providerPrompts.qwen
                      : defaultPrompts.visionSystemPrompt}
                </pre>
              </div>
            )}

            <Textarea
              value={settings.visionSystemPrompt}
              onChange={(e) =>
                setSettings((prev) => ({ ...prev, visionSystemPrompt: e.target.value }))
              }
              placeholder="留空使用默认提示词，或输入自定义提示词..."
              rows={8}
            />
            <p className="mt-2 text-xs text-gray-500">
              💡 提示：不同视觉服务商有专门优化的默认提示词。留空将自动使用对应服务商的最佳提示词
            </p>
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
