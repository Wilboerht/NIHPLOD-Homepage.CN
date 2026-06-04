"use client";

import { useState, useRef } from "react";
import Image from "next/image";
import { m } from "framer-motion";
import { ArrowLeft, ChevronLeft } from "lucide-react";
import { Link } from "next-view-transitions";
import { cn } from "@/lib/utils";

// 隐私政策内容数据
interface SectionContent {
  title: string;
  content: string[];
}

const privacyData: Record<string, SectionContent> = {
  summary: {
    title: "摘要",
    content: [
      "《隐私政策》摘要\n\n旎柏（上海）商贸有限公司（以下简称「我们」或「旎柏」）重视您的隐私保护。本摘要旨在简洁、清晰地向您说明我们如何收集、使用和保护您的个人信息。如您希望了解更多，请查阅下方完整隐私政策内容。\n\n• 会员计划：基于履行会员服务合同的必要，我们收集您的姓名或昵称、手机号、生日、性别、头像及联络方式等，用于创建和维护您的会员账户。如会员服务中包含营销推送等超出合同必要范围的功能，我们将另行征求您的单独同意。\n\n• 交易处理：基于履行购买合同的必要，我们收集您的订单记录、发货地址、联系方式、支付信息等，以处理您的订单和售后服务。如您拒绝提供此类信息，我们可能无法向您提供相应的产品或服务。\n\n• 营销活动：仅在获得您的单独同意后，我们才会收集您的购买记录、产品偏好、联系方式等，用于向您发送营销信息、开展广告活动。\n\n• AI测肤顾问：仅在获得您对敏感个人信息的单独同意后，我们才会收集您主动上传的面部照片及肌肤状况分析结果，用于通过AI技术分析您的肌肤状况（如色斑、皱纹、毛孔、水油平衡等），并据此为您提供个性化护肤建议及产品推荐。此类信息的处理是实现该等服务功能所必需的，可能对您的个人信息权益产生影响。\n\n• 信息共享与委托处理：为实现上述服务，我们可能会向物流合作伙伴、支付服务提供商、云服务提供商等受托方委托处理您的个人信息，或在集团内部共享您的个人信息（用于统一的会员管理与客户服务）。如涉及敏感个人信息对外提供或向境外提供您的个人信息，我们将依法向您告知并取得您的单独同意。详见完整政策「共享与披露」部分。\n\n• 设备权限：相机、相册、麦克风、位置等权限，均由您在设备上自主选择开启或关闭。需要特别提示的是，精确位置信息属于您的敏感个人信息，我们仅在您单独同意后才予以收集。拒绝授权仅影响对应功能，不影响其他服务的基本使用。\n\n• 您的权利：您有权查阅、复制、更正、补充、删除您的个人信息，有权撤回同意、要求解释说明，以及在某些条件下要求我们将您的个人信息转移至您指定的其他处理者。行使上述权利的方式请见本政策完整版中「您的权利」部分。\n\n• 保存期限：我们仅在实现处理目的所必要的最短时间内保存您的个人信息，具体保存期限因场景而异。详见完整政策中的「信息保护」部分。",
    ],
  },
  ch1: {
    title: "一、个人信息处理者信息",
    content: [
      "一、个人信息处理者信息\n\n个人信息处理者是指决定个人信息处理目的和方式的实体。\n\n• 处理者名称：旎柏（上海）商贸有限公司\n\n• 注册地址：上海市普陀区信泰中心T3栋610室\n\n• 联系邮箱：service@nihplod.cn（一般咨询）；dpo@nihplod.cn（个人信息保护合规事务）\n\n• 联系页面：通过本网站「联系我们」页面提交您的问题\n\n• 邮寄地址：上海市普陀区信泰中心T3栋610室，收件人：个人信息保护负责人\n\n• 如您对本隐私政策有任何疑问，或希望行使您的个人信息权利，请通过上述方式与我们联系。我们将在收到您的权利行使请求后15个工作日内予以响应和处理。如情况复杂需要延长，我们将及时告知您并说明理由，延长期限不超过15个工作日。",
    ],
  },
  ch2: {
    title: "二、本隐私政策范围",
    content: [
      "二、本隐私政策范围\n\n本隐私政策适用于我们通过以下渠道向您提供产品、服务或活动时涉及的个人信息处理活动：\n\n• 我们的官方网站（nihplod.cn 及其子域名）\n\n• 我们的官方微信小程序\n\n• 我们在天猫、京东等第三方电商平台开设的品牌官方旗舰店\n\n• 我们的官方第三方社交媒体账号（如微信公众号、小红书、微博官方账号等）\n\n• 我们的电子邮箱及线下实体店铺（包括百货专柜、免税店、美妆集合店等授权经销商）\n\n• 其他经我们确认的线上和线下渠道\n\n本隐私政策不适用于以下情形：\n\n• 第三方向您提供的服务，该等服务适用第三方向您另行说明的个人信息处理规则；\n\n• 我们的员工、实习生或外包人员的个人信息处理，该等处理适用我们的内部人力资源管理制度和员工个人信息处理规则。\n\n若某项产品、服务或活动有单独的个人信息处理规则（包括隐私政策、告知文案、现场说明、系统弹窗等），该单独规则中未涵盖的内容，以本隐私政策为准；该单独规则对本隐私政策中内容有特殊约定的，以单独规则相关内容为准。上述适用规则以不降低法律规定的告知和同意标准为前提——若单独规则的告知内容不符合法律强制性要求，则仍以法律规定的完整告知内容为准。\n\n随着业务发展，我们可能推出新的服务或功能，或调整现有的个人信息处理活动。如处理目的、处理方式或处理的个人信息种类发生变更，我们将更新本隐私政策并在显著位置提示您阅读。对于重大变更，我们将依法重新征求您的同意。",
    ],
  },
  ch3: {
    title: "三、我们处理个人信息的法律依据",
    content: [
      "三、我们处理个人信息的法律依据\n\n根据《中华人民共和国个人信息保护法》，我们仅在具备以下一种或多种法律依据时处理您的个人信息：",
      "（一）日常业务处理活动的主要法律依据\n\n• 会员账户创建与管理：处理姓名/昵称、手机号、生日、性别、头像、联络方式，法律依据为订立或履行合同所必需，如拒绝可能无法享受会员服务\n\n• 订单处理与售后：处理订单记录、发货地址、联系方式、支付信息，法律依据为订立或履行合同所必需，如拒绝无法完成购买交易\n\n• 法定义务履行：处理交易记录、身份信息（根据法律要求），法律依据为履行法定义务，依法不得拒绝\n\n• 营销信息推送：处理购买记录、产品偏好、联系方式，法律依据为取得您的单独同意，可随时撤回同意\n\n• AI测肤顾问：处理面部照片、肌肤状况分析结果，法律依据为取得您对敏感个人信息的单独同意，如拒绝无法使用该功能\n\n• 位置服务（查找附近门店）：处理精确位置信息，法律依据为取得您对敏感个人信息的单独同意，如拒绝无法使用位置相关功能\n\n• 网站运营与安全保障：处理设备信息、日志信息，法律依据为履行合同所必需及履行法定义务，如拒绝可能影响部分功能",
      "（二）其他法律依据\n\n• 取得您的同意：例如向您发送营销信息、使用AI测肤顾问功能处理您的面部照片等敏感个人信息。您可以随时撤回同意，撤回同意不影响撤回前已进行处理的合法性。\n\n• 为订立、履行您作为一方当事人的合同所必需：例如处理您的订单、发货、付款、会员账户管理、客户服务等。如您拒绝提供此类信息，我们可能无法向您提供相应的产品或服务。\n\n• 为履行法定职责或者法定义务所必需：例如遵守税收、财务、反欺诈、网络安全等法律法规的要求。\n\n• 依照《个人信息保护法》的规定，在合理的范围内处理您自行公开或者其他已经合法公开的个人信息。\n\n• 法律、行政法规规定的其他情形。",
      "（三）法律规定的特殊豁免情形\n\n在发生公共卫生事件等法律明确规定的紧急情形下，我们可能在未事先取得您同意的情况下，为应对突发公共卫生事件或保护自然人的生命健康和财产安全所必需而处理您的个人信息。上述情形仅在国家法律法规明确授权且确有必要时适用。",
      "（四）不同意处理或撤回同意的后果\n\n• 如您拒绝提供为订立或履行合同所必需的个人信息，我们可能无法向您提供相应的产品或服务；\n\n• 如您撤回对营销推送的同意，我们将停止向您发送营销信息，但不影响您使用我们的产品或服务的基本功能；\n\n• 如您撤回对敏感个人信息处理的同意（如AI测肤顾问、位置服务），我们将停止相应的处理活动，您将无法使用该等功能，但不影响其他服务的使用；\n\n• 对于基于履行法定义务所必需的处理活动，您依法不得拒绝。\n\n撤回同意的方式：对于基于您同意而开展的个人信息处理活动，您有权随时撤回同意。您可以通过本政策中载明的联系方式向我们提交撤回申请，或在相关功能设置中自行关闭授权。请您理解，撤回同意不影响撤回前基于您的同意已进行的个人信息处理活动的效力。撤回同意后，我们将停止基于该等同意继续处理您的个人信息，并可能因此导致您无法继续使用相关功能或服务。",
    ],
  },
  ch4: {
    title: "四、我们如何收集您的个人信息",
    content: [
      "四、我们如何收集您的个人信息\n\n待补充",
    ],
  },
  ch5: {
    title: "五、按场景列示的信息收集与使用",
    content: [
      "五、按场景列示的信息收集与使用\n\n待补充",
      "（一）待补充\n\n待补充",
      "（二）待补充\n\n待补充",
      "（三）待补充\n\n待补充",
      "（四）待补充\n\n待补充",
      "（五）待补充\n\n待补充",
      "（六）待补充\n\n待补充",
      "（七）待补充\n\n待补充",
      "（八）待补充\n\n待补充",
      "（九）待补充\n\n待补充",
    ],
  },
  ch6: {
    title: "六、敏感个人信息处理规则",
    content: [
      "六、敏感个人信息处理规则\n\n待补充",
    ],
  },
  ch7: {
    title: "七、儿童个人信息保护",
    content: [
      "七、儿童个人信息保护\n\n待补充",
      "（一）待补充\n\n待补充",
      "（二）待补充\n\n待补充",
    ],
  },
  ch8: {
    title: "八、设备权限管理",
    content: [
      "八、设备权限管理\n\n待补充",
      "（一）待补充\n\n待补充",
      "（二）待补充\n\n待补充",
      "（三）待补充\n\n待补充",
      "（四）待补充\n\n待补充",
      "（五）待补充\n\n待补充",
      "（六）待补充\n\n待补充",
    ],
  },
  ch9: {
    title: "九、共享与披露",
    content: [
      "九、共享与披露\n\n待补充",
      "（一）待补充\n\n待补充",
      "（二）待补充\n\n待补充",
      "（三）待补充\n\n待补充",
      "（四）待补充\n\n待补充",
      "（五）待补充\n\n待补充",
      "（六）待补充\n\n待补充",
      "（七）待补充\n\n待补充",
      "（八）待补充\n\n待补充",
    ],
  },
  ch10: {
    title: "十、Cookies 与广告",
    content: [
      "十、Cookies 与广告\n\n待补充",
      "（一）待补充\n\n待补充",
      "（二）待补充\n\n待补充",
      "（三）待补充\n\n待补充",
      "（四）待补充\n\n待补充",
    ],
  },
  ch11: {
    title: "十一、信息保护",
    content: [
      "十一、信息保护\n\n待补充",
      "（一）待补充\n\n待补充",
      "（二）待补充\n\n待补充",
      "（三）待补充\n\n待补充",
      "（四）待补充\n\n待补充",
      "（五）待补充\n\n待补充",
    ],
  },
  ch12: {
    title: "十二、您的权利",
    content: [
      "十二、您的权利\n\n待补充",
      "（一）待补充\n\n待补充",
      "（二）待补充\n\n待补充",
      "（三）待补充\n\n待补充",
    ],
  },
  ch13: {
    title: "十三、联系我们",
    content: [
      "十三、联系我们\n\n待补充",
      "（一）待补充\n\n待补充",
      "（二）待补充\n\n待补充",
      "（三）待补充\n\n待补充",
      "（四）待补充\n\n待补充",
    ],
  },
};

export function PrivacyContent() {
  const [activeSection, setActiveSection] = useState<string>("summary");
  const mainRef = useRef<HTMLElement>(null);

  const pageTitle = { en: "PRIVACY POLICY", zh: "隐私政策" };
  const description = "我们重视并尊重您的隐私，了解我们如何收集、使用和保护您的个人信息";
  const _lastUpdated = "2026年5月31日";

  const sectionOrder = ["summary", "ch1", "ch2", "ch3", "ch4", "ch5", "ch6", "ch7", "ch8", "ch9", "ch10", "ch11", "ch12", "ch13"];
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
      className="safe-area-content !pointer-events-none max-lg:!inset-0 lg:static lg:w-full lg:h-screen lg:overflow-hidden lg:bg-[#F8F7F3]"
    >
      <div className="flex h-full flex-col items-center lg:items-stretch pointer-events-none drop-shadow-[4px_2px_1px_rgba(123,114,108,0.2)] lg:drop-shadow-none">
        {/* 主内容卡片容器 */}
        <div className="w-full flex-1 overflow-hidden rounded-none bg-[#F0EDE1] lg:bg-transparent pointer-events-auto relative">
          {/* 手机端背景水印 */}
          <div className="lg:hidden absolute inset-0 pointer-events-none z-0 overflow-hidden">
            <Image
              src="/images/watermark-mobile.png"
              alt=""
              fill
              className="object-cover opacity-75 blur-[7.5px]"
              priority
            />
          </div>

          <div className="flex h-full flex-col p-4 sm:p-6 lg:p-8">
            {/* 顶栏 / Logo 区 */}
            <header className="flex-shrink-0 text-center sm:px-4 sm:pt-2 sm:pb-6 lg:pt-4 lg:pb-8">
              {/* 手机端顶部栏 */}
              <div className="lg:hidden relative flex-shrink-0 h-[88px] w-full flex items-center justify-center pointer-events-auto">
                <button
                  onClick={() => typeof window !== "undefined" && window.history.back()}
                  className="absolute left-0 top-0 bottom-0 flex items-center justify-center px-4 py-[10px]"
                >
                  <ChevronLeft className="h-6 w-6 text-[#00263E]" />
                </button>
                <Link href="/" className="flex items-center justify-center py-[30px]">
                  <div className="relative h-[28px] w-[100px]">
                    <Image
                      src="/images/NIHPLOD-logo.svg"
                      alt="NIHPLOD Logo"
                      fill
                      className="object-contain"
                      priority
                    />
                  </div>
                </Link>
              </div>
              {/* Logo - 桌面端 */}
              <m.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="hidden lg:flex justify-center"
              >
                <div className="relative h-[32px] w-[152px] sm:h-10 sm:w-[200px]">
                  <Image
                    src="/images/NIHPLOD-logo.svg"
                    alt="公司标志"
                    fill
                    className="object-contain"
                    priority
                  />
                </div>
              </m.div>
            </header>

            {/* 分割线 - 仅桌面端 */}
            <div className="hidden lg:block mx-auto w-full max-w-7xl border-b border-brand-charcoal/10" />

            {/* 标题区 - 仅移动端显示 */}
            <div className="flex-shrink-0 px-4 pt-6 pb-4 text-center sm:pt-8 sm:pb-6 max-lg:px-0 max-lg:pt-[6px] max-lg:pb-4 lg:hidden">
              <div>
                <h1 className="font-serif text-[26px] text-brand-charcoal sm:text-[32px] lg:text-brand-charcoal max-lg:text-[24px] max-lg:font-medium max-lg:tracking-[0.2em] max-lg:text-[#00263E]">
                  {pageTitle.zh}
                </h1>
                {/* 装饰短横线 - 仅移动端 */}
                <div className="lg:hidden mx-auto w-[70px] h-[1.5px] bg-[#00263E] max-lg:mt-2" />
                <p className="mx-auto max-w-lg text-sm sm:text-base leading-relaxed text-brand-charcoal/60 lg:text-brand-charcoal/60 max-lg:text-[14px] max-lg:font-light max-lg:leading-[1.8] max-lg:tracking-wide max-lg:text-[#00263E]/90 max-lg:mt-[34px]">
                  <span className="hidden lg:inline">{description}</span>
                  <span className="lg:hidden">我们重视并尊重您的隐私，<br />了解我们如何收集、使用和保护您的个人信息</span>
                </p>
              </div>
            </div>

            {/* 布局：目录导航 + 条款内容 */}
            <div className="flex flex-1 overflow-hidden relative mx-auto w-full max-w-7xl">

              {/* 内容区域 */}
              <main
                ref={mainRef}
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto scroll-smooth [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
              >
                <div className="max-w-6xl mx-auto px-6 lg:px-12">
                  <div className="space-y-7">
                    {sections.map((section) => (
                      <section
                        key={section.id}
                        id={section.id}
                        className="scroll-mt-24 group relative"
                      >
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
                                    if (trimmed === '《隐私政策》摘要') {
                                      return (
                                        <h3 key={lIdx} className="pt-4 lg:pt-8 font-serif text-xl lg:text-2xl font-bold lg:font-normal text-gray-900 break-words">
                                          {formatText('消费者隐私政策摘要')}
                                        </h3>
                                      );
                                    }
                                    if (/^[一二三四五六七八九十0-9]+[、.]/.test(trimmed)) {
                                      return (
                                        <h3 key={lIdx} className="pt-4 font-serif text-sm font-bold text-gray-900 break-words">
                                          {formatText(trimmed)}
                                        </h3>
                                      );
                                    }

                                    // 列表项 (•)
                                    if (trimmed.startsWith('•')) {
                                      return (
                                        <div key={lIdx} className="flex gap-3 text-sm leading-relaxed text-gray-700 min-w-0">
                                          <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-brand-gold/60" />
                                          <p className="flex-1 opacity-90 break-words min-w-0">{formatText(trimmed.substring(1).trim())}</p>
                                        </div>
                                      );
                                    }

                                    // 普通段落
                                    return (
                                      <p key={lIdx} className="text-sm leading-7 text-gray-700 opacity-90 lg:text-justify break-words">
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
            <div className="mt-auto pt-4 pb-4 sm:pt-6 lg:pt-8 text-center mx-6 lg:mx-0 max-lg:pt-4">
              <p className="text-[10px] sm:text-[12px] font-light tracking-widest text-brand-charcoal/60 lg:text-brand-charcoal/60 max-lg:text-[#7B726C]/30 max-lg:tracking-[0.12em] max-lg:font-medium">
                &copy; {new Date().getFullYear()} NIHPLOD. All Rights Reserved.
              </p>
            </div>
          </div>
        </div>

        {/* 返回上页按钮 - 仅桌面端（已移除） */}
      </div>
    </m.div>
  );
}
