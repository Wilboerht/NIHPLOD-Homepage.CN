"use client";

import { m } from "framer-motion";
import { Shield, Lock, Eye, FileText, Mail } from "lucide-react";
import { FloatingCardLayout } from "@/components/website";
import { fadeInUp, defaultTransition } from "@/lib/animations";

// 隐私政策内容
const privacySections = [
  {
    icon: FileText,
    title: "信息收集",
    content: `我们可能收集以下类型的信息：

**个人信息**
• 姓名、电子邮箱地址（当您联系我们或订阅时）
• 护肤咨询中您主动提供的肤质信息

**自动收集的信息**
• 设备信息（设备类型、操作系统、浏览器类型）
• 访问日志（IP地址、访问时间、浏览页面）
• Cookies 和类似技术收集的信息`,
  },
  {
    icon: Eye,
    title: "信息使用",
    content: `我们使用收集的信息用于以下目的：

• 提供和改进我们的服务
• 响应您的咨询和请求
• 发送产品更新和营销信息（需您授权）
• 提供个性化的护肤建议
• 分析网站使用情况以优化用户体验
• 遵守法律法规要求`,
  },
  {
    icon: Shield,
    title: "信息保护",
    content: `我们采取多种安全措施保护您的个人信息：

• 使用 SSL/TLS 加密传输数据
• 限制员工访问个人信息的权限
• 定期进行安全审计和漏洞检测
• 与第三方服务商签订数据保护协议
• 数据存储于安全的云服务器

我们承诺不会出售、出租或以其他方式向第三方披露您的个人信息，除非获得您的明确同意或法律要求。`,
  },
  {
    icon: Lock,
    title: "您的权利",
    content: `根据适用的数据保护法律，您享有以下权利：

• **访问权**：您可以请求获取我们持有的您的个人信息副本
• **更正权**：您可以请求更正不准确的个人信息
• **删除权**：您可以请求删除您的个人信息
• **反对权**：您可以反对我们处理您的个人信息
• **可携带权**：您可以请求以机器可读格式获取您的数据

如需行使上述权利，请通过本页底部的联系方式与我们联系。`,
  },
];

// Cookies 说明
const cookiesInfo = {
  title: "Cookies 使用说明",
  content: `我们的网站使用 Cookies 和类似技术来提升您的浏览体验。

**必要性 Cookies**
用于网站基本功能运行，无法禁用。

**分析性 Cookies**
帮助我们了解访客如何使用网站，以便改进服务。您可以在浏览器设置中选择禁用。

**功能性 Cookies**
记住您的偏好设置，提供个性化体验。

您可以通过浏览器设置管理或删除 Cookies。请注意，禁用某些 Cookies 可能影响网站功能。`,
};

/**
 * 隐私政策页面内容组件
 */
export function PrivacyContent() {
  const lastUpdated = "2024年12月1日";

  return (
    <FloatingCardLayout
      backgroundImage="/images/privacy-bg.jpg"
      backgroundAlt="隐私政策"
      initialState="expanded"
      pageTitle="隐私政策"
    >
      {/* 页面标题 */}
      <m.div
        className="mb-6 text-center"
        variants={fadeInUp}
        initial="initial"
        animate="animate"
        transition={defaultTransition}
      >
        <p className="text-xs uppercase tracking-widest text-brand-gold">
          PRIVACY POLICY
        </p>
        <h1 className="mt-1 font-serif text-2xl text-brand-charcoal md:text-3xl">
          隐私政策
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-brand-charcoal/70">
          我们重视并尊重您的隐私。本政策说明我们如何收集、使用和保护您的个人信息。
        </p>
        <p className="mt-2 text-xs text-brand-charcoal/50">
          最后更新：{lastUpdated}
        </p>
      </m.div>

      {/* 政策内容 */}
      <div className="space-y-6">
        {privacySections.map((section, index) => (
          <m.div
            key={section.title}
            className="rounded-xl border border-brand-beige bg-white p-5"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: index * 0.1 }}
          >
            <div className="mb-3 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-gold/10">
                <section.icon className="h-5 w-5 text-brand-gold" />
              </div>
              <h2 className="font-serif text-lg text-brand-charcoal">
                {section.title}
              </h2>
            </div>
            <div className="prose prose-sm max-w-none text-brand-charcoal/70">
              <p className="whitespace-pre-line leading-relaxed">
                {section.content}
              </p>
            </div>
          </m.div>
        ))}

        {/* Cookies 说明 */}
        <m.div
          className="rounded-xl border border-brand-beige bg-white p-5"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.4 }}
        >
          <h2 className="mb-3 font-serif text-lg text-brand-charcoal">
            🍪 {cookiesInfo.title}
          </h2>
          <p className="whitespace-pre-line text-sm leading-relaxed text-brand-charcoal/70">
            {cookiesInfo.content}
          </p>
        </m.div>

        {/* 联系方式 */}
        <m.div
          className="rounded-xl bg-brand-gold/10 p-5"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.5 }}
        >
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-brand-gold">
              <Mail className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="font-serif text-base text-brand-charcoal">
                联系我们
              </h3>
              <p className="mt-1 text-sm text-brand-charcoal/70">
                如果您对本隐私政策有任何疑问，或需要行使您的数据权利，请联系：
                <br />
                <a
                  href="mailto:privacy@nihplod.com"
                  className="font-medium text-brand-gold hover:underline"
                >
                  privacy@nihplod.com
                </a>
              </p>
            </div>
          </div>
        </m.div>

        {/* 政策更新说明 */}
        <m.div
          className="text-center text-xs text-brand-charcoal/50"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.6 }}
        >
          <p>
            我们可能会不时更新本隐私政策。更新后的政策将在本页面发布，
            <br />
            重大变更时我们会通过适当方式通知您。
          </p>
        </m.div>
      </div>

      {/* 底部间距 */}
      <div className="h-20" />
    </FloatingCardLayout>
  );
}

