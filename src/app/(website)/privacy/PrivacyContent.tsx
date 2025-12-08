"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { m, AnimatePresence } from "framer-motion";
import { Home } from "lucide-react";
import { cn } from "@/lib/utils";



// 自定义图标组件
const CollectIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
    <polyline points="14,2 14,8 20,8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <polyline points="10,9 9,9 8,9" />
  </svg>
);

const UseIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="12" cy="12" r="10" />
    <circle cx="12" cy="12" r="4" />
    <line x1="21.17" y1="8" x2="12" y2="8" />
    <line x1="3.95" y1="6.06" x2="8.54" y2="14" />
    <line x1="10.88" y1="21.94" x2="15.46" y2="14" />
  </svg>
);

const ProtectIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <path d="M9 12l2 2 4-4" />
  </svg>
);

const RightsIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0110 0v4" />
  </svg>
);

// 标签页配置
type TabId = "collect" | "use" | "protect" | "rights";

interface TabConfig {
  id: TabId;
  label: string;
  icon: React.FC<{ className?: string }>;
}

const tabs: TabConfig[] = [
  { id: "collect", label: "信息收集", icon: CollectIcon },
  { id: "use", label: "信息使用", icon: UseIcon },
  { id: "protect", label: "信息保护", icon: ProtectIcon },
  { id: "rights", label: "您的权利", icon: RightsIcon },
];

// 各标签页内容
interface TabContent {
  title: string;
  content: string[];
}

const tabContents: Record<TabId, TabContent> = {
  collect: {
    title: "信息收集",
    content: [
      "一、您主动提供的个人信息\n\n当您使用我们的服务时，我们可能会收集您主动提供的以下信息：\n\n• 身份信息：包括您的姓名、性别、出生日期等基本身份信息\n• 联系信息：包括您的电子邮箱地址、电话号码、收货地址等\n• 账户信息：包括您设置的用户名、密码（加密存储）、头像等\n• 护肤相关信息：包括您的肤质类型、肌肤问题、过敏史、护肤习惯等您在咨询过程中自愿提供的信息\n• 交易信息：包括您的订单详情、支付记录、物流信息等与购买相关的信息\n• 反馈信息：包括您提交的产品评价、投诉建议、问卷调查回复等",
      "二、我们自动收集的信息\n\n当您访问我们的网站或使用我们的服务时，我们会自动收集以下技术信息：\n\n• 设备信息：包括设备型号、操作系统及版本、设备设置、唯一设备标识符、设备环境等软硬件特征信息\n• 网络信息：包括 IP 地址、网络类型、运营商信息、网络环境等\n• 日志信息：包括访问时间、访问时长、浏览记录、搜索记录、点击记录、错误日志等\n• 位置信息：基于 IP 地址推断的大致地理位置（城市级别）",
      "三、Cookies 和类似技术\n\n我们使用 Cookies 和类似的跟踪技术来收集和存储您的相关信息。这些技术帮助我们：\n\n• 记住您的登录状态和偏好设置\n• 分析网站流量和使用情况\n• 提供个性化的内容和推荐\n• 防范欺诈和保障账户安全\n\n您可以通过浏览器设置管理或删除 Cookies，但这可能会影响您使用我们服务的部分功能。",
    ],
  },
  use: {
    title: "信息使用",
    content: [
      "一、提供产品和服务\n\n我们使用您的个人信息来：\n\n• 处理和完成您的订单，包括发货、支付处理和售后服务\n• 提供客户支持，响应您的咨询、投诉和建议\n• 根据您的肤质和需求提供个性化的护肤建议和产品推荐\n• 验证您的身份，保障您的账户和交易安全\n• 履行我们与您之间的合同义务",
      "二、改进和优化服务\n\n我们会将收集的信息用于：\n\n• 分析用户行为和偏好，了解产品和服务的使用情况\n• 开展内部审计、数据分析和研究，改进我们的产品和服务\n• 测试和开发新的产品功能\n• 优化网站性能和用户体验\n• 进行市场调研和数据统计分析",
      "三、营销和推广\n\n在获得您明确同意的情况下，我们可能会：\n\n• 向您发送产品资讯、促销活动、新品上市等营销信息\n• 向您推送个性化的广告和推荐内容\n• 邀请您参与调查问卷、用户访谈等市场研究活动\n\n您可以随时选择退订营销信息，这不会影响您使用我们的基本服务。",
      "四、法律合规\n\n我们可能会在以下情况下使用您的信息：\n\n• 遵守适用的法律法规、法规要求或政府命令\n• 执行我们的服务条款和其他协议\n• 保护我们、用户或公众的权利、财产或安全\n• 检测、预防或解决欺诈、安全或技术问题",
    ],
  },
  protect: {
    title: "信息保护",
    content: [
      "一、技术安全措施\n\n我们采用业界标准的安全技术来保护您的个人信息：\n\n• 数据传输加密：所有数据传输均采用 SSL/TLS 加密协议，确保传输过程中的数据安全\n• 数据存储加密：敏感个人信息在存储时采用加密处理\n• 访问控制：实施严格的访问权限管理，仅授权人员可访问个人信息\n• 安全审计：定期进行安全审计、渗透测试和漏洞扫描\n• 入侵检测：部署入侵检测和防护系统，实时监控异常行为\n• 数据备份：定期进行数据备份，确保数据的可恢复性",
      "二、组织管理措施\n\n我们建立了完善的数据保护管理体系：\n\n• 设立专门的数据保护负责人，负责监督个人信息保护工作\n• 对员工进行数据保护培训，签署保密协议\n• 建立数据分类分级制度，对不同敏感程度的数据采取不同的保护措施\n• 与第三方服务提供商签订数据保护协议，确保其遵守同等的保护标准\n• 制定数据泄露应急响应预案，确保及时有效地应对安全事件",
      "三、数据保留\n\n我们仅在实现本政策所述目的所必需的期限内保留您的个人信息：\n\n• 账户信息：在您的账户有效期内保留，账户注销后将在合理期限内删除\n• 交易记录：根据适用的财务和税务法规要求保留相应期限\n• 日志信息：通常保留不超过 12 个月\n\n超出保留期限后，我们将删除或匿名化处理您的个人信息。",
      "四、第三方共享\n\n我们承诺不会出售您的个人信息。在以下情况下，我们可能会与第三方共享您的信息：\n\n• 服务提供商：与帮助我们提供服务的合作伙伴共享（如物流公司、支付服务商）\n• 法律要求：根据法律法规要求或政府机关的强制性要求\n• 业务转让：在公司合并、收购或资产转让时，您的信息可能作为交易资产的一部分被转让\n\n我们会要求所有第三方遵守适用的数据保护法规，并采取适当的安全措施。",
    ],
  },
  rights: {
    title: "您的权利",
    content: [
      "根据《中华人民共和国个人信息保护法》及其他适用的数据保护法律，您对您的个人信息享有以下权利：",
      "一、知情权和决定权\n\n您有权了解我们如何收集、使用、共享和保护您的个人信息。您有权决定是否同意我们处理您的个人信息，并可随时撤回您的同意。撤回同意不影响撤回前基于您同意所进行的处理活动的合法性。",
      "二、查阅和复制权\n\n您有权查阅我们持有的关于您的个人信息，并有权获取该信息的副本。我们将在验证您的身份后，在合理期限内响应您的请求。对于超出合理范围的请求，我们可能会收取合理的费用。",
      "三、更正和补充权\n\n当您发现我们持有的个人信息不准确或不完整时，您有权要求我们进行更正或补充。我们将在核实后及时更新相关信息。",
      "四、删除权\n\n在以下情况下，您有权要求我们删除您的个人信息：\n\n• 处理目的已实现、无法实现或者为实现处理目的不再必要\n• 我们停止提供产品或者服务，或者保存期限已届满\n• 您撤回同意，且我们无其他合法处理依据\n• 我们违反法律法规或与您的约定处理个人信息\n\n法律法规规定的保存期限未届满，或删除技术上难以实现的，我们将停止除存储和采取必要安全保护措施之外的处理。",
      "五、限制或拒绝处理权\n\n在特定情况下，您有权要求我们限制对您个人信息的处理，或拒绝我们对您个人信息的处理，包括拒绝接收营销信息。",
      "六、数据可携带权\n\n您有权以结构化、通用的机器可读格式获取您的个人信息副本，并在技术可行的情况下，要求我们将您的个人信息直接传输给其他数据控制者。",
      "七、行使权利的方式\n\n如您需要行使上述权利，可通过本网站的「联系我们」页面提交请求。我们将在验证您的身份后，在 15 个工作日内响应您的请求。对于复杂或多次请求，我们可能需要延长响应时间，届时我们会告知您。",
    ],
  },
};

/**
 * 隐私政策页面内容组件
 * 默认展开，无底部导航栏
 */
export function PrivacyContent() {
  const [activeTab, setActiveTab] = useState<TabId | null>(null);
  const lastUpdated = "2024年12月1日";

  return (
    <>
      {/* 全屏背景容器 - 始终展开到底部 */}
      <div className="fixed inset-0 bottom-0">
        {/* 背景图片 */}
        <div className="absolute inset-0 z-0">
          <Image
            src="/images/privacy-bg.jpg"
            alt="隐私政策"
            fill
            priority
            className="object-cover"
            sizes="100vw"
          />
        </div>

        {/* 主内容区域 */}
        <m.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="absolute bottom-4 left-6 right-6 top-4 z-20 sm:left-10 sm:right-10 lg:bottom-6 lg:left-16 lg:right-16 lg:top-6"
        >
          <div className="flex h-full flex-col items-center">
            {/* 主内容区域 */}
            <div className="w-full flex-1 overflow-hidden rounded-2xl bg-brand-gold/10 backdrop-blur-md lg:rounded-3xl">
              <div className="flex h-full flex-col justify-center overflow-y-auto px-4 py-6 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] sm:px-6 sm:py-8 lg:px-8 lg:py-10">
                {/* 页面标题 */}
                {!activeTab && (
                  <div className="mb-6 text-center sm:mb-8">
                    <p className="text-xs uppercase tracking-widest text-brand-gold sm:text-sm md:text-base">
                      PRIVACY POLICY
                    </p>
                    <h1 className="mt-1 font-serif text-2xl text-brand-charcoal sm:text-3xl md:text-4xl">
                      隐私政策
                    </h1>
                    <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-brand-charcoal/70 sm:mt-3 sm:text-base md:text-lg">
                      我们重视并尊重您的隐私
                    </p>
                    <p className="mt-1 text-xs text-brand-charcoal/50 sm:text-sm">
                      最后更新：{lastUpdated}
                    </p>
                  </div>
                )}

                {/* 内容区域 */}
                <AnimatePresence mode="wait">
                  {!activeTab && (
                    <m.div
                      key="tabs"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.4, ease: "easeOut" }}
                      className="flex flex-col items-center"
                    >
                      {/* Logo */}
                      <m.div
                        className="mb-8 flex justify-center sm:mb-10"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.5, delay: 0.1, ease: "easeOut" }}
                      >
                        <div className="relative h-16 w-32 sm:h-20 sm:w-40 md:h-24 md:w-48">
                          <Image src="/images/logo.png" alt="NIHPLOD Logo" fill className="object-contain" />
                        </div>
                      </m.div>

                      {/* 4个大标签按钮 */}
                      <div className="flex w-full max-w-4xl items-stretch justify-center">
                        {tabs.map((tab, index) => {
                          const Icon = tab.icon;
                          return (
                            <m.button
                              key={tab.id}
                              type="button"
                              onClick={() => setActiveTab(tab.id)}
                              className={cn(
                                "group relative flex flex-1 flex-col items-center justify-center gap-3 px-3 py-6 transition-all duration-300 sm:gap-4 sm:px-6 sm:py-8 md:py-10",
                                index < tabs.length - 1 && "border-r border-brand-charcoal/20"
                              )}
                              initial={{ opacity: 0, y: 15 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ duration: 0.4, delay: 0.15 + index * 0.06, ease: "easeOut" }}
                              whileHover={{ scale: 1.03 }}
                              whileTap={{ scale: 0.97 }}
                            >
                              <div className="flex h-12 w-12 items-center justify-center sm:h-16 sm:w-16 md:h-20 md:w-20 lg:h-24 lg:w-24">
                                <Icon className="h-10 w-10 text-brand-charcoal/70 transition-colors duration-300 group-hover:text-brand-gold sm:h-14 sm:w-14 md:h-16 md:w-16 lg:h-20 lg:w-20" />
                              </div>
                              <span className="text-xs font-medium text-brand-charcoal/70 transition-colors duration-300 group-hover:text-brand-charcoal sm:text-sm md:text-base lg:text-lg">
                                {tab.label}
                              </span>
                            </m.button>
                          );
                        })}
                      </div>
                    </m.div>
                  )}

                  {/* 选中标签后显示的内容 */}
                  {activeTab && (
                    <m.div
                      key={activeTab}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      transition={{ duration: 0.4, ease: "easeOut" }}
                      className="flex h-full flex-col"
                    >
                      {/* 返回按钮和标题 */}
                      <div className="mb-4 flex items-center justify-between sm:mb-6">
                        <m.button
                          type="button"
                          onClick={() => setActiveTab(null)}
                          className="flex items-center gap-2 text-brand-charcoal/70 transition-colors duration-300 hover:text-brand-charcoal"
                        >
                          <svg className="h-5 w-5 sm:h-6 sm:w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M15 18l-6-6 6-6" />
                          </svg>
                          <span className="text-sm sm:text-base">返回</span>
                        </m.button>
                        <m.h2 className="font-serif text-xl text-brand-gold sm:text-2xl md:text-3xl">
                          {tabContents[activeTab].title}
                        </m.h2>
                        <div className="w-16 sm:w-20" />
                      </div>

                      {/* 内容区域 */}
                      <div className="flex-1 overflow-y-auto rounded-xl border border-brand-beige bg-white/80 p-4 backdrop-blur-sm [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] sm:p-6 md:p-8">
                        <div className="space-y-6">
                          {tabContents[activeTab].content.map((paragraph, index) => {
                            // 按换行符分割段落
                            const lines = paragraph.split('\n');
                            return (
                              <m.div
                                key={index}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.3, delay: index * 0.1 }}
                                className="text-sm leading-relaxed text-brand-charcoal/70 sm:text-base"
                              >
                                {lines.map((line, lineIndex) => {
                                  const trimmedLine = line.trim();
                                  // 空行
                                  if (!trimmedLine) {
                                    return <div key={lineIndex} className="h-2" />;
                                  }
                                  // 标题行（一、二、三等开头）
                                  if (/^[一二三四五六七八九十]+、/.test(trimmedLine)) {
                                    return (
                                      <p key={lineIndex} className="mb-2 mt-4 font-medium text-brand-charcoal first:mt-0">
                                        {trimmedLine}
                                      </p>
                                    );
                                  }
                                  // 列表项（• 开头）
                                  if (trimmedLine.startsWith('•')) {
                                    return (
                                      <p key={lineIndex} className="pl-4 text-brand-charcoal/60">
                                        {trimmedLine}
                                      </p>
                                    );
                                  }
                                  // 普通段落
                                  return (
                                    <p key={lineIndex} className="text-brand-charcoal/70">
                                      {trimmedLine}
                                    </p>
                                  );
                                })}
                              </m.div>
                            );
                          })}
                        </div>
                      </div>
                    </m.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* 回到首页按钮 */}
            <Link
              href="/"
              className="group flex items-center justify-center gap-2 rounded-b-2xl bg-brand-gold/10 px-10 py-2.5 shadow-sm backdrop-blur-md lg:px-14 lg:py-3"
            >
              <Home className="h-5 w-5 text-brand-gold transition-all duration-200 group-hover:scale-110 group-hover:text-brand-gold/80 lg:h-6 lg:w-6" />
              <span className="text-sm font-medium text-brand-charcoal transition-colors duration-200 group-hover:text-brand-charcoal/70 lg:text-base">返回首页</span>
            </Link>
          </div>
        </m.div>
      </div>
    </>
  );
}

