"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import {
  Save,
  Globe,
  Share2,
  Mail,
  Bot,
  Eye,
  EyeOff,
  Upload,
  X,
  Home,
  Plus,
  Trash2,
  GripVertical,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import { Textarea } from "@/components/ui/Textarea";
import { useToast } from "@/components/ui/Toast";
import { MediaPicker } from "@/components/admin/MediaPicker";

// 设置类型
interface SiteSettings {
  name: string;
  description: string;
  logo: string;
  favicon: string;
}

interface SocialSettings {
  wechat_qrcode: string;
  weibo: string;
  xiaohongshu: string;
  douyin: string;
  instagram: string;
}

interface ContactSettings {
  email: string;
  phone: string;
  address: string;
  workingHours: string;
}

interface AISettings {
  enabled: boolean;
  provider: string;
  apiKey: string;
  hasApiKey?: boolean;
  model: string;
  maxTokens: number;
  temperature: number;
}

interface HomeGalleryItem {
  image: string;
  text: string;
}

interface HomeSettings {
  galleryItems: HomeGalleryItem[];
  galleryBend: number;
  galleryOpacity: number;
  maskOpacity: number;
}

interface AllSettings {
  site: SiteSettings;
  social: SocialSettings;
  contact: ContactSettings;
  ai_advisor_settings: AISettings;
  home: HomeSettings;
}

// AI 模型选项
const AI_MODELS: Record<string, { value: string; label: string }[]> = {
  openai: [
    { value: "gpt-4o", label: "GPT-4o" },
    { value: "gpt-4o-mini", label: "GPT-4o Mini" },
    { value: "gpt-4-turbo", label: "GPT-4 Turbo" },
  ],
  anthropic: [
    { value: "claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet" },
    { value: "claude-3-5-haiku-20241022", label: "Claude 3.5 Haiku" },
  ],
  deepseek: [
    { value: "deepseek-chat", label: "DeepSeek Chat" },
    { value: "deepseek-reasoner", label: "DeepSeek Reasoner" },
  ],
};

export default function AdminSettingsPage() {
  const { success, error: showError } = useToast();

  // 状态
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const [mediaPickerTarget, setMediaPickerTarget] = useState<"logo" | "wechat_qrcode" | "gallery" | null>(null);
  const [galleryEditIndex, setGalleryEditIndex] = useState<number | null>(null);

  // 设置数据
  const [site, setSite] = useState<SiteSettings>({
    name: "",
    description: "",
    logo: "",
    favicon: "",
  });

  const [social, setSocial] = useState<SocialSettings>({
    wechat_qrcode: "",
    weibo: "",
    xiaohongshu: "",
    douyin: "",
    instagram: "",
  });

  const [contact, setContact] = useState<ContactSettings>({
    email: "",
    phone: "",
    address: "",
    workingHours: "",
  });

  const [ai, setAi] = useState<AISettings>({
    enabled: false,
    provider: "openai",
    apiKey: "",
    model: "gpt-4o-mini",
    maxTokens: 500,
    temperature: 0.7,
  });

  const [home, setHome] = useState<HomeSettings>({
    galleryItems: [],
    galleryBend: 3,
    galleryOpacity: 60,
    maskOpacity: 70,
  });

  // 新的 API Key 输入
  const [newApiKey, setNewApiKey] = useState("");

  // 获取设置
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await fetch("/api/admin/settings");
        const data = await res.json();

        if (data.success) {
          const settings = data.data as AllSettings;
          if (settings.site) setSite(settings.site);
          if (settings.social) setSocial(settings.social);
          if (settings.contact) setContact(settings.contact);
          if (settings.ai_advisor_settings) setAi(settings.ai_advisor_settings);
          if (settings.home) setHome(settings.home);
        }
      } catch (error) {
        console.error("获取设置失败:", error);
        showError("获取设置失败");
      } finally {
        setLoading(false);
      }
    };

    fetchSettings();
  }, [showError]);

  // 保存设置
  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        site,
        social,
        contact,
        home,
        ai_advisor_settings: {
          ...ai,
          apiKey: newApiKey || undefined, // 只有输入新的才更新
        },
      };

      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error?.message || "保存失败");
      }

      success("设置已保存");
      setNewApiKey(""); // 清空输入

      // 刷新获取最新数据
      const refreshRes = await fetch("/api/admin/settings");
      const refreshData = await refreshRes.json();
      if (refreshData.success) {
        if (refreshData.data.ai_advisor_settings) {
          setAi(refreshData.data.ai_advisor_settings);
        }
      }
    } catch (error) {
      showError(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  // 打开媒体选择器
  const openMediaPicker = (target: "logo" | "wechat_qrcode" | "gallery", index?: number) => {
    setMediaPickerTarget(target);
    if (target === "gallery" && index !== undefined) {
      setGalleryEditIndex(index);
    }
    setMediaPickerOpen(true);
  };

  // 选择媒体
  const handleMediaSelect = (url: string) => {
    if (mediaPickerTarget === "logo") {
      setSite({ ...site, logo: url });
    } else if (mediaPickerTarget === "wechat_qrcode") {
      setSocial({ ...social, wechat_qrcode: url });
    } else if (mediaPickerTarget === "gallery" && galleryEditIndex !== null) {
      const newItems = [...home.galleryItems];
      newItems[galleryEditIndex] = { ...newItems[galleryEditIndex], image: url };
      setHome({ ...home, galleryItems: newItems });
    }
    setMediaPickerOpen(false);
    setMediaPickerTarget(null);
    setGalleryEditIndex(null);
  };

  // 添加画廊图片
  const addGalleryItem = () => {
    setHome({
      ...home,
      galleryItems: [...home.galleryItems, { image: "", text: "" }],
    });
  };

  // 删除画廊图片
  const removeGalleryItem = (index: number) => {
    const newItems = home.galleryItems.filter((_, i) => i !== index);
    setHome({ ...home, galleryItems: newItems });
  };

  // 更新画廊图片文字
  const updateGalleryItemText = (index: number, text: string) => {
    const newItems = [...home.galleryItems];
    newItems[index] = { ...newItems[index], text };
    setHome({ ...home, galleryItems: newItems });
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">系统设置</h1>
          <p className="mt-1 text-sm text-gray-500">管理网站基本配置</p>
        </div>
        <Button
          leftIcon={<Save className="h-4 w-4" />}
          onClick={handleSave}
          loading={saving}
        >
          保存设置
        </Button>
      </div>

      {/* 站点信息 */}
      <section className="rounded-xl bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-gold/10">
            <Globe className="h-5 w-5 text-brand-gold" />
          </div>
          <div>
            <h2 className="text-lg font-medium text-gray-900">站点信息</h2>
            <p className="text-sm text-gray-500">网站基本信息配置</p>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Input
            label="站点名称"
            value={site.name}
            onChange={(e) => setSite({ ...site, name: e.target.value })}
            placeholder="NIHPLOD 旎柏"
          />
          <div className="md:col-span-2">
            <Textarea
              label="站点描述"
              value={site.description}
              onChange={(e) => setSite({ ...site, description: e.target.value })}
              placeholder="源自摩纳哥的高端护肤品牌"
              rows={2}
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              网站 Logo
            </label>
            <div className="flex items-center gap-4">
              {site.logo ? (
                <div className="relative h-16 w-32 rounded-lg border border-gray-200 bg-gray-50 p-2">
                  <Image
                    src={site.logo}
                    alt="Logo"
                    fill
                    className="object-contain"
                  />
                  <button
                    onClick={() => setSite({ ...site, logo: "" })}
                    className="absolute -right-2 -top-2 rounded-full bg-red-500 p-1 text-white hover:bg-red-600"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => openMediaPicker("logo")}
                  className="flex h-16 w-32 items-center justify-center rounded-lg border-2 border-dashed border-gray-300 text-gray-400 hover:border-brand-gold hover:text-brand-gold"
                >
                  <Upload className="h-6 w-6" />
                </button>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={() => openMediaPicker("logo")}
              >
                选择图片
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* 首页画廊设置 */}
      <section className="rounded-xl bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-pink-50">
            <Home className="h-5 w-5 text-pink-500" />
          </div>
          <div>
            <h2 className="text-lg font-medium text-gray-900">首页画廊</h2>
            <p className="text-sm text-gray-500">首页圆形画廊图片和效果配置</p>
          </div>
        </div>

        <div className="space-y-6">
          {/* 画廊效果设置 */}
          <div className="grid gap-6 md:grid-cols-3">
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                画廊弯曲度
              </label>
              <input
                type="range"
                min="0"
                max="10"
                step="0.5"
                value={home.galleryBend}
                onChange={(e) => setHome({ ...home, galleryBend: Number(e.target.value) })}
                className="w-full accent-brand-gold"
              />
              <div className="mt-1 flex justify-between text-xs text-gray-500">
                <span>平直 (0)</span>
                <span className="font-medium text-brand-gold">{home.galleryBend}</span>
                <span>弯曲 (10)</span>
              </div>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                画廊透明度
              </label>
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={home.galleryOpacity}
                onChange={(e) => setHome({ ...home, galleryOpacity: Number(e.target.value) })}
                className="w-full accent-brand-gold"
              />
              <div className="mt-1 flex justify-between text-xs text-gray-500">
                <span>透明 (0)</span>
                <span className="font-medium text-brand-gold">{home.galleryOpacity}%</span>
                <span>不透明 (100)</span>
              </div>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                蒙版浓度
              </label>
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={home.maskOpacity}
                onChange={(e) => setHome({ ...home, maskOpacity: Number(e.target.value) })}
                className="w-full accent-brand-gold"
              />
              <div className="mt-1 flex justify-between text-xs text-gray-500">
                <span>淡 (0)</span>
                <span className="font-medium text-brand-gold">{home.maskOpacity}%</span>
                <span>浓 (100)</span>
              </div>
            </div>
          </div>

          {/* 画廊图片列表 */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700">
                画廊图片 ({home.galleryItems.length})
              </label>
              <Button
                size="sm"
                variant="outline"
                leftIcon={<Plus className="h-4 w-4" />}
                onClick={addGalleryItem}
              >
                添加图片
              </Button>
            </div>
            <div className="space-y-3">
              {home.galleryItems.map((item, index) => (
                <div
                  key={index}
                  className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3"
                >
                  <GripVertical className="h-5 w-5 cursor-move text-gray-400" />
                  <div className="relative h-16 w-24 flex-shrink-0 overflow-hidden rounded-lg border border-gray-200 bg-white">
                    {item.image ? (
                      <Image
                        src={item.image}
                        alt={item.text || `图片 ${index + 1}`}
                        fill
                        className="object-cover"
                      />
                    ) : (
                      <button
                        onClick={() => openMediaPicker("gallery", index)}
                        className="flex h-full w-full items-center justify-center text-gray-400 hover:text-brand-gold"
                      >
                        <Upload className="h-5 w-5" />
                      </button>
                    )}
                  </div>
                  <div className="flex-1">
                    <Input
                      placeholder="图片标题"
                      value={item.text}
                      onChange={(e) => updateGalleryItemText(index, e.target.value)}
                      className="!py-1.5"
                    />
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openMediaPicker("gallery", index)}
                  >
                    选择图片
                  </Button>
                  <button
                    onClick={() => removeGalleryItem(index)}
                    className="rounded-lg p-2 text-red-500 hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              {home.galleryItems.length === 0 && (
                <div className="rounded-lg border-2 border-dashed border-gray-200 p-8 text-center text-gray-400">
                  <p>暂无画廊图片</p>
                  <p className="mt-1 text-xs">点击上方按钮添加图片</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* 社交媒体 */}
      <section className="rounded-xl bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50">
            <Share2 className="h-5 w-5 text-blue-500" />
          </div>
          <div>
            <h2 className="text-lg font-medium text-gray-900">社交媒体</h2>
            <p className="text-sm text-gray-500">社交平台链接配置</p>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              微信公众号二维码
            </label>
            <div className="flex items-center gap-4">
              {social.wechat_qrcode ? (
                <div className="relative h-20 w-20 rounded-lg border border-gray-200 bg-gray-50">
                  <Image
                    src={social.wechat_qrcode}
                    alt="WeChat QR"
                    fill
                    className="object-contain p-1"
                  />
                  <button
                    onClick={() => setSocial({ ...social, wechat_qrcode: "" })}
                    className="absolute -right-2 -top-2 rounded-full bg-red-500 p-1 text-white hover:bg-red-600"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => openMediaPicker("wechat_qrcode")}
                  className="flex h-20 w-20 items-center justify-center rounded-lg border-2 border-dashed border-gray-300 text-gray-400 hover:border-brand-gold hover:text-brand-gold"
                >
                  <Upload className="h-6 w-6" />
                </button>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={() => openMediaPicker("wechat_qrcode")}
              >
                上传二维码
              </Button>
            </div>
          </div>
          <Input
            label="微博"
            value={social.weibo}
            onChange={(e) => setSocial({ ...social, weibo: e.target.value })}
            placeholder="https://weibo.com/..."
          />
          <Input
            label="小红书"
            value={social.xiaohongshu}
            onChange={(e) => setSocial({ ...social, xiaohongshu: e.target.value })}
            placeholder="https://xiaohongshu.com/..."
          />
          <Input
            label="抖音"
            value={social.douyin}
            onChange={(e) => setSocial({ ...social, douyin: e.target.value })}
            placeholder="https://douyin.com/..."
          />
          <Input
            label="Instagram"
            value={social.instagram}
            onChange={(e) => setSocial({ ...social, instagram: e.target.value })}
            placeholder="https://instagram.com/..."
          />
        </div>
      </section>

      {/* 联系信息 */}
      <section className="rounded-xl bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-50">
            <Mail className="h-5 w-5 text-green-500" />
          </div>
          <div>
            <h2 className="text-lg font-medium text-gray-900">联系信息</h2>
            <p className="text-sm text-gray-500">客户联系方式配置</p>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Input
            label="联系邮箱"
            type="email"
            value={contact.email}
            onChange={(e) => setContact({ ...contact, email: e.target.value })}
            placeholder="contact@nihplod.cn"
          />
          <Input
            label="联系电话"
            value={contact.phone}
            onChange={(e) => setContact({ ...contact, phone: e.target.value })}
            placeholder="+86 21 1234 5678"
          />
          <Input
            label="工作时间"
            value={contact.workingHours}
            onChange={(e) => setContact({ ...contact, workingHours: e.target.value })}
            placeholder="周一至周五 9:00-18:00"
          />
          <div className="md:col-span-2">
            <Textarea
              label="联系地址"
              value={contact.address}
              onChange={(e) => setContact({ ...contact, address: e.target.value })}
              placeholder="上海市..."
              rows={2}
            />
          </div>
        </div>
      </section>

      {/* AI 服务配置 */}
      <section className="rounded-xl bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-50">
            <Bot className="h-5 w-5 text-purple-500" />
          </div>
          <div>
            <h2 className="text-lg font-medium text-gray-900">AI 服务配置</h2>
            <p className="text-sm text-gray-500">智能推荐助手设置</p>
          </div>
        </div>

        <div className="space-y-6">
          <div className="flex items-center justify-between rounded-lg bg-gray-50 p-4">
            <div>
              <p className="font-medium text-gray-900">启用 AI 推荐</p>
              <p className="text-sm text-gray-500">开启后用户可使用智能护肤顾问</p>
            </div>
            <Switch
              checked={ai.enabled}
              onChange={(checked) => setAi({ ...ai, enabled: checked })}
            />
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <Select
              label="AI 服务商"
              options={[
                { value: "openai", label: "OpenAI" },
                { value: "anthropic", label: "Anthropic (Claude)" },
                { value: "deepseek", label: "DeepSeek" },
              ]}
              value={ai.provider}
              onChange={(e) => setAi({ ...ai, provider: e.target.value, model: AI_MODELS[e.target.value]?.[0]?.value || "" })}
            />
            <Select
              label="模型"
              options={AI_MODELS[ai.provider] || []}
              value={ai.model}
              onChange={(e) => setAi({ ...ai, model: e.target.value })}
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              API Key
            </label>
            {ai.hasApiKey && (
              <p className="mb-2 text-sm text-green-600">
                ✓ 已配置 API Key: {ai.apiKey}
              </p>
            )}
            <div className="relative">
              <input
                type={showApiKey ? "text" : "password"}
                value={newApiKey}
                onChange={(e) => setNewApiKey(e.target.value)}
                placeholder={ai.hasApiKey ? "输入新的 API Key 以更新" : "请输入 API Key"}
                className="w-full rounded-lg border border-gray-200 px-4 py-2 pr-10 text-sm focus:border-brand-gold focus:outline-none focus:ring-1 focus:ring-brand-gold"
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              API Key 仅在保存时更新，留空则保持原有配置
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                最大 Token 数
              </label>
              <input
                type="range"
                min="100"
                max="2000"
                step="100"
                value={ai.maxTokens}
                onChange={(e) => setAi({ ...ai, maxTokens: Number(e.target.value) })}
                className="w-full accent-brand-gold"
              />
              <div className="mt-1 flex justify-between text-xs text-gray-500">
                <span>100</span>
                <span className="font-medium text-brand-gold">{ai.maxTokens}</span>
                <span>2000</span>
              </div>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                温度 (Temperature)
              </label>
              <input
                type="range"
                min="0"
                max="2"
                step="0.1"
                value={ai.temperature}
                onChange={(e) => setAi({ ...ai, temperature: Number(e.target.value) })}
                className="w-full accent-brand-gold"
              />
              <div className="mt-1 flex justify-between text-xs text-gray-500">
                <span>精确 (0)</span>
                <span className="font-medium text-brand-gold">{ai.temperature}</span>
                <span>创意 (2)</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 邮件通知配置（只读） */}
      <section className="rounded-xl bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-50">
            <Mail className="h-5 w-5 text-orange-500" />
          </div>
          <div>
            <h2 className="text-lg font-medium text-gray-900">邮件通知配置</h2>
            <p className="text-sm text-gray-500">SMTP 邮件服务配置（通过环境变量配置）</p>
          </div>
        </div>

        <div className="rounded-lg bg-gray-50 p-4">
          <p className="text-sm text-gray-600">
            邮件服务通过环境变量配置，请在服务器的 <code className="rounded bg-gray-200 px-1">.env</code> 文件中设置以下变量：
          </p>
          <ul className="mt-3 space-y-1 text-sm text-gray-500">
            <li><code className="rounded bg-gray-200 px-1">SMTP_HOST</code> - SMTP 服务器地址</li>
            <li><code className="rounded bg-gray-200 px-1">SMTP_PORT</code> - SMTP 端口</li>
            <li><code className="rounded bg-gray-200 px-1">SMTP_USER</code> - SMTP 用户名</li>
            <li><code className="rounded bg-gray-200 px-1">SMTP_PASS</code> - SMTP 密码</li>
            <li><code className="rounded bg-gray-200 px-1">SMTP_FROM</code> - 发件人地址</li>
          </ul>
        </div>
      </section>

      {/* 媒体选择器 */}
      <MediaPicker
        isOpen={mediaPickerOpen}
        onClose={() => {
          setMediaPickerOpen(false);
          setMediaPickerTarget(null);
        }}
        onSelect={handleMediaSelect}
        title={mediaPickerTarget === "logo" ? "选择 Logo" : "选择二维码图片"}
      />
    </div>
  );
}
