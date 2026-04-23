"use client";

import { useState, useRef } from "react";
import Image from "next/image";
import { m } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

// 隐私政策内容数据
interface SectionContent {
  title: string;
  content: string[];
}

const privacyData: Record<string, SectionContent> = {
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

export function PrivacyContent() {
  const [activeSection, setActiveSection] = useState<string>("collect");
  const mainRef = useRef<HTMLElement>(null);

  const pageTitle = { en: "PRIVACY POLICY", zh: "隐私政策" };
  const description = "我们重视并尊重您的隐私，了解我们如何收集、使用和保护您的个人信息";
  const lastUpdated = "2026年1月1日";

  const sectionOrder = ["collect", "use", "protect", "rights"];
  const sections = sectionOrder.map((id, index) => ({
    id,
    title: privacyData[id].title,
    content: privacyData[id].content,
    index: index + 1
  }));

  // 格式化文本：在中英文/数字之间添加空格
  const formatText = (text: string) => {
    return text
      .replace(/([\u4e00-\u9fa5])([A-Za-z0-9])/g, '$1 $2')
      .replace(/([A-Za-z0-9])([\u4e00-\u9fa5])/g, '$1 $2');
  };

  // 处理滚动高亮
  const handleScroll = () => {
    if (!mainRef.current) return;

    const containerRect = mainRef.current.getBoundingClientRect();
    const triggerPoint = containerRect.top + 120; // 触发线：距离容器顶部 120px

    let currentId = sections[0].id;

    for (const section of sections) {
      const element = document.getElementById(section.id);
      if (!element) continue;

      const rect = element.getBoundingClientRect();
      if (rect.top <= triggerPoint) {
        currentId = section.id;
      } else {
        break;
      }
    }

    if (currentId !== activeSection) {
      setActiveSection(currentId);
    }
  };

  // 平滑滚动函数
  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element && mainRef.current) {
      // 计算元素相对于容器的位置
      const top = element.offsetTop;
      mainRef.current.scrollTo({
        top: top,
        behavior: "smooth"
      });
    }
  };

  return (
    <m.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6 }}
      className="safe-area-content !pointer-events-none"
    >
      <div className="flex h-full flex-col items-center pointer-events-none">
        {/* 主内容卡片容器 */}
        <div className="w-full flex-1 overflow-hidden rounded-2xl bg-[#EBE8DB] lg:rounded-3xl pointer-events-auto relative shadow-2xl shadow-black/5">

          <div className="flex h-full flex-col p-4 sm:p-6 lg:p-8">
            {/* 顶栏 / 标题区 */}
            <header className="flex-shrink-0 px-4 pb-10 text-center sm:pb-12 lg:pb-14">
              <div className="space-y-9">
                {/* Logo 保持在顶端 */}
                <m.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex justify-center"
                >
                  <div className="relative h-[28px] w-[132px] sm:h-[34px] sm:w-[170px]">
                    <Image
                      src="/images/NIHPLOD-logo.svg"
                      alt="公司标志"
                      fill
                      className="object-contain"
                      priority
                    />
                  </div>
                </m.div>

                <div className="space-y-2">
                  <m.h1
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="font-serif text-2xl text-brand-charcoal sm:text-3xl"
                  >
                    {pageTitle.zh}
                  </m.h1>
                  <m.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.2 }}
                    className="mx-auto text-sm text-brand-charcoal/60"
                  >
                    {description}
                  </m.p>
                </div>

                <m.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  className="text-sm tracking-wide text-brand-charcoal/50"
                >
                  {formatText(`最后更新：${lastUpdated}`)}
                </m.div>
              </div>
            </header>

            {/* 分割线 */}
            <div className="mx-auto mb-8 w-full max-w-7xl border-b border-brand-charcoal/10" />

            {/* 布局：目录导航 + 条款内容 */}
            <div className="flex flex-1 overflow-hidden relative mx-auto w-full max-w-7xl">

              {/* 左侧导航 - 更加精致的排版 */}
              <aside className="hidden w-48 flex-shrink-0 border-r border-brand-charcoal/5 lg:flex flex-col items-center overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                <nav className="space-y-6 w-full px-6">
                  <div className="flex items-center gap-3 px-2 opacity-80">
                    <p className="text-sm font-bold text-brand-charcoal">
                      目录
                    </p>
                  </div>

                  <div className="flex flex-col space-y-1">
                    {sections.map((section) => (
                      <button
                        key={section.id}
                        onClick={() => scrollToSection(section.id)}
                        className={cn(
                          "group relative flex w-full items-center py-3 px-2 text-left transition-all duration-300 rounded-lg hover:bg-brand-charcoal/5",
                          activeSection === section.id
                            ? "text-brand-charcoal"
                            : "text-brand-charcoal/60"
                        )}
                      >
                        <span className={cn(
                          "text-sm tabular-nums transition-all duration-300 mr-2 font-medium",
                          activeSection === section.id ? "opacity-100 font-semibold" : "opacity-60 group-hover:opacity-100"
                        )}>
                          0{section.index}
                        </span>
                        <span className={cn(
                          "text-sm font-medium transition-all duration-300",
                          activeSection === section.id ? "font-bold translate-x-1" : "group-hover:translate-x-1"
                        )}>
                          {section.title}
                        </span>

                        {/* 激活状态指示点 - 调整位置 */}
                        {activeSection === section.id && (
                          <m.div
                            layoutId="active-dot"
                            className="absolute right-2 h-1 w-1 rounded-full bg-brand-gold"
                            transition={{ type: "spring", stiffness: 300, damping: 30 }}
                          />
                        )}
                      </button>
                    ))}
                  </div>
                </nav>
              </aside>

              {/* 右侧内容区域 - 极简主义排版 */}
              <main
                ref={mainRef}
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto scroll-smooth [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
              >
                <div className="max-w-6xl px-6 lg:px-12">
                  <div className="space-y-24">
                    {sections.map((section) => (
                      <section
                        key={section.id}
                        id={section.id}
                        className="scroll-mt-24 group relative"
                      >
                        {/* 章节标题 */}
                        <div className="mb-6">
                          <h2 className="text-center font-serif text-2xl font-medium text-brand-charcoal">
                            第{['零', '一', '二', '三', '四', '五'][section.index]}章 {section.title}
                          </h2>
                        </div>

                        {/* 章节内容 */}
                        <div className="space-y-4 pl-2 lg:pl-6">
                          {(!section.content || section.content.length === 0) ? (
                            <p className="text-sm text-gray-500 italic">内容更新中...</p>
                          ) : (
                            section.content.map((paragraph, pIdx) => {
                              const lines = paragraph.split(/\r?\n/);
                              return (
                                <div key={pIdx} className="space-y-2">
                                  {lines.map((line, lIdx) => {
                                    const trimmed = line.trim();
                                    if (!trimmed) return <div key={lIdx} className="h-2" />;

                                    // 条款内标题 (一、二、...)
                                    if (/^[一二三四五六七八九十0-9]+[、.]/.test(trimmed)) {
                                      return (
                                        <h3 key={lIdx} className="pt-4 font-serif text-lg font-bold text-gray-900">
                                          {formatText(trimmed)}
                                        </h3>
                                      );
                                    }

                                    // 列表项 (•)
                                    if (trimmed.startsWith('•')) {
                                      return (
                                        <div key={lIdx} className="flex gap-3 text-sm leading-relaxed text-gray-700">
                                          <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-brand-gold/60" />
                                          <p className="flex-1 opacity-90">{formatText(trimmed.substring(1).trim())}</p>
                                        </div>
                                      );
                                    }

                                    // 普通段落
                                    return (
                                      <p key={lIdx} className="text-sm leading-7 text-gray-700 opacity-90 text-justify">
                                        {formatText(trimmed)}
                                      </p>
                                    );
                                  })}
                                </div>
                              );
                            })
                          )}
                        </div>
                      </section>
                    ))}
                  </div>


                </div>
              </main>
            </div>

            {/* 底部版权信息 - 固定在卡片底部 */}
            <div className="mt-auto pt-4 sm:pt-6 lg:pt-8 text-center border-t border-brand-charcoal/5 mx-6 lg:mx-12">
              <p className="text-[10px] sm:text-[12px] font-light tracking-widest text-brand-charcoal/60">
                &copy; {new Date().getFullYear()} NIHPLOD. All Rights Reserved.
              </p>
            </div>
          </div>
        </div>

        {/* 返回上页按钮 */}
        <button
          onClick={() => typeof window !== "undefined" && window.history.back()}
          className="group flex items-center justify-center gap-2 rounded-b-2xl bg-[#EBE8DB] px-10 py-2.5 shadow-sm lg:px-14 lg:py-3 pointer-events-auto"
        >
          <ArrowLeft className="h-5 w-5 text-brand-gold transition-all duration-200 group-hover:scale-110 group-hover:text-brand-gold/80 lg:h-6 lg:w-6" />
          <span className="text-sm font-medium text-brand-charcoal transition-colors duration-200 group-hover:text-brand-charcoal/70 lg:text-base">返回上页</span>
        </button>
      </div>
    </m.div>
  );
}
