"use client";

import { useState } from "react";
import Image from "next/image";
import { m, AnimatePresence } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

// 图标颜色常量
const ICON_COLOR = "#C3BC9F";
const ICON_HOVER_COLOR = "#B8A47B"; // brand-gold

// 服务条款图标
const GeneralIcon = ({ className, isHovered }: { className?: string; isHovered?: boolean }) => {
  const color = isHovered ? ICON_HOVER_COLOR : ICON_COLOR;
  return (
    <svg viewBox="0 0 24 24" fill="none" className={cn(className, "transition-all duration-300")}>
      <path d="M17.6016 1.91602C18.5297 1.91602 19.2822 2.66859 19.2822 3.59668V21.335C19.2822 21.6147 19.1257 21.871 18.877 21.999C18.6282 22.127 18.3282 22.105 18.1006 21.9424L15.2676 19.918L12.4346 21.9424C12.1749 22.1279 11.8251 22.1279 11.5654 21.9424L8.73242 19.918L5.89941 21.9424C5.67176 22.105 5.37181 22.127 5.12305 21.999C4.87431 21.871 4.71777 21.6147 4.71777 21.335V3.59668C4.71777 2.66859 5.47032 1.91602 6.39844 1.91602H17.6016ZM9 14.1992C8.55817 14.1992 8.2002 14.5572 8.2002 14.999C8.2002 15.4409 8.55817 15.7988 9 15.7988H15C15.4418 15.7988 15.7998 15.4409 15.7998 14.999C15.7998 14.5572 15.4418 14.1992 15 14.1992H9ZM9 10.1992C8.55817 10.1992 8.2002 10.5572 8.2002 10.999C8.2002 11.4409 8.55817 11.7988 9 11.7988H15C15.4418 11.7988 15.7998 11.4409 15.7998 10.999C15.7998 10.5572 15.4418 10.1992 15 10.1992H9ZM9 6.19922C8.55817 6.19922 8.2002 6.5572 8.2002 6.99902C8.2002 7.44085 8.55817 7.79883 9 7.79883H15C15.4418 7.79883 15.7998 7.44085 15.7998 6.99902C15.7998 6.5572 15.4418 6.19922 15 6.19922H9Z" fill={color}/>
    </svg>
  );
};

const ProductIcon = ({ className, isHovered }: { className?: string; isHovered?: boolean }) => {
  const color = isHovered ? ICON_HOVER_COLOR : ICON_COLOR;
  return (
    <svg viewBox="0 0 24 24" fill="none" className={cn(className, "transition-all duration-300")}>
      <path d="M12 1.99805C14.7611 1.99816 17.2624 3.11905 19.0713 4.92773C20.8803 6.73672 22.0009 9.23861 22.001 12C22.0009 14.7614 20.8802 17.2623 19.0713 19.0713C17.2623 20.8802 14.7613 22.0009 12 22.001C9.23864 22.0009 6.73671 20.8802 4.92773 19.0713C3.11905 17.2624 1.99816 14.7611 1.99805 12C1.99814 9.23863 3.1188 6.73672 4.92773 4.92773C6.73671 3.11879 9.23864 1.99816 12 1.99805ZM11.3057 9.80566C10.864 9.80577 10.506 10.1638 10.5059 10.6055C10.5059 11.0472 10.8639 11.4052 11.3057 11.4053H11.4316V16.2881H10.6104C10.1689 16.2884 9.81068 16.6464 9.81055 17.0879C9.81066 17.5294 10.1688 17.8874 10.6104 17.8877H13.8516C14.2933 17.8876 14.6513 17.5296 14.6514 17.0879C14.6512 16.6462 14.2933 16.2881 13.8516 16.2881H13.0312V10.6055C13.0311 10.1639 12.673 9.8059 12.2314 9.80566H11.3057ZM12 5.98047C11.3609 5.98057 10.8419 6.49956 10.8418 7.13867C10.842 7.7777 11.3609 8.2958 12 8.2959C12.639 8.29577 13.157 7.77769 13.1572 7.13867C13.1571 6.49958 12.6391 5.9806 12 5.98047Z" fill={color}/>
    </svg>
  );
};

const ResponsibilityIcon = ({ className, isHovered }: { className?: string; isHovered?: boolean }) => {
  const color = isHovered ? ICON_HOVER_COLOR : ICON_COLOR;
  return (
    <svg viewBox="0 0 24 24" fill="none" className={cn(className, "transition-all duration-300")}>
      <path d="M11.7852 1.46875C11.9283 1.42705 12.0805 1.42699 12.2236 1.46875L21.0254 4.03906C21.359 4.13658 21.5889 4.44345 21.5889 4.79102V10.0635C21.5889 15.9424 17.8264 21.1619 12.249 23.0205C12.0885 23.074 11.9145 23.074 11.7539 23.0205C6.17508 21.1621 2.41125 15.9418 2.41113 10.0615V4.79102C2.41131 4.44344 2.64098 4.13657 2.97461 4.03906L11.7852 1.46875ZM16.5654 9.06445C16.253 8.75214 15.747 8.75214 15.4346 9.06445L11.2627 13.2344L9.06543 11.0381C8.75304 10.7258 8.24696 10.7258 7.93457 11.0381C7.62219 11.3505 7.62226 11.8565 7.93457 12.1689L10.6973 14.9326C11.0097 15.245 11.5167 15.245 11.8291 14.9326L16.5654 10.1953C16.8778 9.88289 16.8778 9.37685 16.5654 9.06445Z" fill={color}/>
    </svg>
  );
};

const DisputeIcon = ({ className, isHovered }: { className?: string; isHovered?: boolean }) => {
  const color = isHovered ? ICON_HOVER_COLOR : ICON_COLOR;
  return (
    <svg viewBox="0 0 24 24" fill="none" className={cn(className, "transition-all duration-300")}>
      <path d="M7 11.4609V7.46094C7 4.69951 9.2386 2.46094 12 2.46094C14.7614 2.46094 17 4.69951 17 7.46094V11.4609" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M19.5576 9.33203C20.7011 9.33217 21.5029 10.3082 21.5029 11.3506V20.5186C21.5029 21.561 20.7012 22.537 19.5576 22.5371H4.44238C3.29889 22.5369 2.49805 21.561 2.49805 20.5186V11.3506C2.4981 10.3082 3.29893 9.33223 4.44238 9.33203H19.5576ZM12 14.0654C11.5582 14.0654 11.2002 14.4234 11.2002 14.8652V18.8652C11.2002 19.3071 11.5582 19.665 12 19.665C12.4418 19.665 12.7998 19.3071 12.7998 18.8652V14.8652C12.7998 14.4234 12.4418 14.0654 12 14.0654Z" fill={color}/>
    </svg>
  );
};

// 标签页配置
type TabId = "general" | "product" | "responsibility" | "dispute";

interface TabConfig {
  id: TabId;
  label: string;
  icon: React.FC<{ className?: string; isHovered?: boolean }>;
}

const tabs: TabConfig[] = [
  { id: "general", label: "总则", icon: GeneralIcon },
  { id: "product", label: "产品服务", icon: ProductIcon },
  { id: "responsibility", label: "责任限制", icon: ResponsibilityIcon },
  { id: "dispute", label: "争议解决", icon: DisputeIcon },
];

// 各标签页内容
interface TabContent {
  title: string;
  content: string[];
}

const tabContents: Record<TabId, TabContent> = {
  general: {
    title: "总则",
    content: [
      "一、协议的接受与修改\n\n欢迎使用 NIHPLOD 旎柏（以下简称「我们」或「本公司」）提供的产品和服务。在使用我们的服务之前，请您仔细阅读并理解本服务条款（以下简称「本条款」）的全部内容。\n\n当您访问我们的网站、购买我们的产品或使用我们的服务时，即表示您已阅读、理解并同意接受本条款的约束。如果您不同意本条款的任何内容，请立即停止使用我们的服务。",
      "二、服务范围\n\n本条款适用于您通过以下渠道使用我们的服务：\n\n• 我们的官方网站（nihplod.cn 及其子域名）\n• 我们的移动应用程序\n• 我们的线下门店和专柜\n• 我们的会员系统和积分计划\n• 我们的客户服务热线和在线客服\n• 任何其他由我们提供的产品和服务",
      "三、用户资格\n\n使用我们的服务，您需要：\n\n• 具备完全民事行为能力（年满18周岁）\n• 未满18周岁的用户需在法定监护人的监护和同意下使用\n• 确保您提供的所有信息真实、准确、完整\n• 遵守中华人民共和国的法律法规",
      "四、条款的修改\n\n我们保留随时修改本条款的权利。修改后的条款将在我们的网站上公布。如果您在条款修改后继续使用我们的服务，即表示您接受修改后的条款。对于重大条款变更，我们将通过合理的方式通知您。",
    ],
  },
  product: {
    title: "产品服务",
    content: [
      "一、产品信息\n\n我们尽力确保网站上展示的产品信息（包括但不限于产品描述、图片、价格、规格等）准确完整。但由于技术原因或人为疏忽，可能存在错误或不准确之处。\n\n• 产品图片仅供参考，实际产品可能因批次、显示器设置等因素存在轻微差异\n• 产品价格可能随时调整，以下单时的价格为准\n• 产品成分和功效说明基于一般情况，个体差异可能导致效果不同",
      "二、订单与支付\n\n当您在我们的平台下单时：\n\n• 订单确认邮件的发送并不代表我们接受您的订单\n• 我们有权在发现订单存在问题时取消订单\n• 如发现价格错误，我们将通知您并提供取消或按正确价格购买的选择\n• 支付成功后，订单状态将及时更新\n• 电子发票将在订单完成后发送至您的邮箱",
      "三、配送与退换货\n\n关于配送和退换货政策：\n\n• 配送时间为预估时间，可能因不可抗力因素延迟\n• 收到商品后请当面验收，如有问题请拒收并联系客服\n• 未开封且不影响二次销售的商品，可在签收后7日内申请退换\n• 因产品质量问题退换货，运费由我们承担\n• 因个人原因退换货，运费由您承担\n• 定制产品、赠品、已开封产品不支持退换",
      "四、会员服务\n\n关于我们的会员体系：\n\n• 会员资格以实名注册信息为准\n• 会员积分有效期为36个月\n• 会员权益以当时公布的规则为准\n• 禁止会员账号的转让、借用或出售\n• 我们有权对异常账户进行限制或注销",
    ],
  },
  responsibility: {
    title: "责任限制",
    content: [
      "一、服务的提供\n\n我们致力于提供高质量的产品和服务，但在法律允许的范围内：\n\n• 我们的服务按「现状」和「可用」的基础提供\n• 我们不保证服务不会中断或完全没有错误\n• 我们可能会因维护、升级等原因暂停服务\n• 我们不对因第三方服务导致的问题承担责任",
      "二、用户责任\n\n作为用户，您同意：\n\n• 对您账户下的所有活动负责\n• 妥善保管您的账户信息和密码\n• 发现账户被盗用时立即通知我们\n• 不进行任何违法、欺诈或损害他人权益的行为\n• 不干扰或破坏我们的服务和系统\n• 尊重我们和其他用户的知识产权",
      "三、赔偿限制\n\n在法律允许的最大范围内：\n\n• 我们对任何间接的、附带的、特殊的、惩罚性的或后果性的损害不承担责任\n• 我们的赔偿责任上限不超过您支付的相关产品或服务的费用\n• 对于非我们过错导致的损失，我们不承担赔偿责任",
      "四、免责情形\n\n以下情况我们不承担责任：\n\n• 因不可抗力（如自然灾害、战争、政府行为等）导致的服务中断或损失\n• 因您自身原因（如误操作、设备故障等）导致的损失\n• 因第三方原因（如物流延误、支付平台故障等）导致的问题\n• 因您违反本条款或适用法律导致的任何后果",
    ],
  },
  dispute: {
    title: "争议解决",
    content: [
      "一、争议协商\n\n如果您与我们之间发生任何争议或纠纷，双方应首先尝试通过友好协商的方式解决。我们的客户服务团队将竭诚为您提供帮助，您可以通过以下方式联系我们：\n\n• 在线客服：通过官网或APP的在线客服功能\n• 客服热线：工作日 9:00-18:00\n• 电子邮件：service@nihplod.cn\n• 联系我们页面：提交您的问题和建议",
      "二、管辖与法律适用\n\n本条款的订立、生效、解释、执行和争议解决均适用中华人民共和国大陆地区法律（不包括港澳台地区）。\n\n若协商不成，双方同意将争议提交至我们公司注册地有管辖权的人民法院诉讼解决。",
      "三、条款的可分割性\n\n如果本条款的任何条款被认定为无效或不可执行，该条款将在最低必要的范围内进行修改或删除，其余条款将继续保持完全有效。",
      "四、完整协议\n\n本条款及我们的隐私政策共同构成您与我们之间关于服务使用的完整协议。本条款取代您与我们之间先前的所有口头或书面协议。\n\n五、权利保留\n\n我们未能行使或执行本条款的任何权利或规定，不应被视为放弃该权利或规定。我们对本条款项下的所有权利和补救措施均为累积性的，不排斥法律规定的其他权利和补救措施。",
      "六、联系我们\n\n如您对本服务条款有任何疑问或建议，欢迎通过「联系我们」页面与我们取得联系。\n\n感谢您选择 NIHPLOD 旎柏，我们将竭诚为您提供优质的产品和服务。",
    ],
  },
};

// Tab 按钮组件 - 支持 hover 状态
const TabButton = ({
  tab,
  index,
  isLast,
  onClick
}: {
  tab: TabConfig;
  index: number;
  isLast: boolean;
  onClick: () => void;
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const Icon = tab.icon;

  return (
    <m.button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={cn(
        "group relative flex flex-1 flex-col items-center justify-center gap-3 px-3 py-6 transition-all duration-300 sm:gap-4 sm:px-6 sm:py-8 md:py-10",
        !isLast && "border-r border-brand-charcoal/20"
      )}
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.15 + index * 0.06, ease: "easeOut" }}
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
    >
      <div className="flex h-12 w-12 items-center justify-center sm:h-16 sm:w-16 md:h-20 md:w-20 lg:h-24 lg:w-24">
        <Icon className="h-10 w-10 sm:h-14 sm:w-14 md:h-16 md:w-16 lg:h-20 lg:w-20" isHovered={isHovered} />
      </div>
      <span className={cn(
        "text-xs font-medium transition-colors duration-300 sm:text-sm md:text-base lg:text-lg",
        isHovered ? "text-brand-charcoal" : "text-brand-charcoal/70"
      )}>
        {tab.label}
      </span>
    </m.button>
  );
};

/**
 * 服务条款页面内容组件
 * 默认展开，无底部导航栏
 */
export function TermsContent() {
  const [activeTab, setActiveTab] = useState<TabId | null>(null);
  const lastUpdated = "2024年12月1日";

  return (
    <>
      {/* 全屏背景容器 - 始终展开到底部 */}
      <div className="fixed inset-0 bottom-0">
        {/* 背景图片 */}
        <div className="absolute inset-0 z-0">
          <Image
            src="/images/bg.png"
            alt="服务条款"
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
            <div className="w-full flex-1 overflow-hidden rounded-2xl bg-[#EBE8DB] lg:rounded-3xl">
              <div className="flex h-full flex-col justify-center overflow-y-auto px-4 py-6 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] sm:px-6 sm:py-8 lg:px-8 lg:py-10">
                {/* 页面标题 */}
                {!activeTab && (
                  <div className="mb-6 text-center sm:mb-8">
                    <p className="text-xs uppercase tracking-widest text-brand-gold sm:text-sm md:text-base">
                      TERMS OF SERVICE
                    </p>
                    <h1 className="mt-1 font-serif text-2xl text-brand-charcoal sm:text-3xl md:text-4xl">
                      服务条款
                    </h1>
                    <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-brand-charcoal/70 sm:mt-3 sm:text-base md:text-lg">
                      使用我们的服务即表示您同意以下条款
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
                        {tabs.map((tab, index) => (
                          <TabButton
                            key={tab.id}
                            tab={tab}
                            index={index}
                            isLast={index === tabs.length - 1}
                            onClick={() => setActiveTab(tab.id)}
                          />
                        ))}
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

            {/* 返回上页按钮 */}
            <button
              onClick={() => typeof window !== "undefined" && window.history.back()}
              className="group flex items-center justify-center gap-2 rounded-b-2xl bg-[#EBE8DB] px-10 py-2.5 shadow-sm lg:px-14 lg:py-3"
            >
              <ArrowLeft className="h-5 w-5 text-brand-gold transition-all duration-200 group-hover:scale-110 group-hover:text-brand-gold/80 lg:h-6 lg:w-6" />
              <span className="text-sm font-medium text-brand-charcoal transition-colors duration-200 group-hover:text-brand-charcoal/70 lg:text-base">返回上页</span>
            </button>
          </div>
        </m.div>
      </div>
    </>
  );
}

