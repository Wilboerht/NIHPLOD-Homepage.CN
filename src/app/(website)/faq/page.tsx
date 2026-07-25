import { Metadata } from "next";
import { FAQContent } from "@/components/website/FAQContent";
import { FAQJsonLd, BreadcrumbJsonLd } from "@/components/seo/JsonLd";

// FAQ 结构化数据（纯文本版本，用于 JSON-LD）
const faqSchemaData = [
  {
    question: "什么是 NIHPLOD ?",
    answer:
      '海豚的皮肤拥有神奇的自我更新能力，每两小时就能更新一次。我们从这种 "时间逆转" 的动物本能中汲取灵感。NIHPLOD 运用最前沿的生物技术和配方，在护肤领域尽最大努力帮助人们 "逆转时光"。',
  },
  {
    question: "NIHPLOD 和其它护肤品牌有什么不一样的地方 ?",
    answer:
      "NIHPLOD 的主要产品结合了当今前沿的脂质体技术，将重要的活性成分和生长因子靶向输送到皮肤进行修复或改善，从而更有效地达到理想的护肤效果。",
  },
  {
    question: "使用 NIHPLOD 的产品多久可以看到效果 ?",
    answer:
      "根据产品的不同优势和作用，您可能最快在数天内就能看到各类肌肤修护的显著效果，而一些色素及初老特征问题可能需要2-4周甚至更久。我们强烈建议保持健康的生活方式。",
  },
  {
    question: "NIHPLOD 主张的「精简护肤」对我有什么好处 ?",
    answer:
      "过度的皮肤护理是对肌肤的一种变相伤害。真正好的护肤法则，不是堆叠步骤，而是给皮肤刚刚好的关爱。精简护肤意味着用更少但更高效的产品达到更好的效果。",
  },
  {
    question: "什么是脂质体技术 ?",
    answer:
      "脂质体是一种微小的囊泡结构，能够包裹活性成分穿透皮肤屏障，将有效成分精准递送至皮肤深层。NIHPLOD 的真脂质体 Dolphin-Skin 专利技术模拟海豚肌肤的自我更新机制。",
  },
  {
    question: "NIHPLOD 的产品适合什么肤质 ?",
    answer:
      "NIHPLOD 产品配方温和高效，适合多种肤质使用。干性肌肤可获得深度滋润修护，油性肌肤可选择清爽质地的产品，敏感肌建议使用前先做局部测试。",
  },
  {
    question: "孕期可以使用 NIHPLOD 的产品吗 ?",
    answer:
      "NIHPLOD 产品采用高标准成分配方，但孕期肌肤较为敏感，建议在使用前咨询您的产科医生，并根据个人肤质状况谨慎选择。",
  },
  {
    question: "如何正确使用修护面霜 ?",
    answer:
      "每天早晚洁面及精华后，取适量修护面霜均匀涂抹于面部及颈部，由下至上轻柔按摩至完全吸收。建议搭配 NIHPLOD 护肤仪式获得更佳效果。",
  },
  {
    question: "NIHPLOD 产品在哪里购买 ?",
    answer:
      "您可以通过 NIHPLOD 官方网站（nihplod.cn）的产品页面查看各产品的官方购买渠道链接，包括天猫、京东、小红书等授权平台。",
  },
  {
    question: "如何辨别 NIHPLOD 产品真伪 ?",
    answer:
      "您可以通过我们的授权验真系统（ba.nihplod.cn）查询产品授权信息与真伪验证。建议始终通过官方授权渠道购买以确保产品品质。",
  },
];

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "常见问题",
  description:
    "关于 NIHPLOD 旎柏，你想知道的都在这里。",
  alternates: {
    canonical: "/faq",
  },
  keywords: [
    "NIHPLOD",
    "旎柏",
    "常见问题",
    "护肤问答",
    "脂质体护肤",
    "抗衰老产品",
    "修护面霜用法",
    "焕活身体乳",
    "护肤建议",
    "高端护肤品",
  ],
  openGraph: {
    title: "常见问题 | NIHPLOD 旎柏",
    description:
      "关于 NIHPLOD 旎柏，你想知道的都在这里。",
    images: ["/images/og-image.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "常见问题 | NIHPLOD 旎柏",
    description:
      "关于 NIHPLOD 旎柏，你想知道的都在这里。",
    images: ["/images/og-image.png"],
  },
};

export default async function FAQPage() {
  const breadcrumbs = [
    { name: "首页", url: "/" },
    { name: "常见问题", url: "/faq" },
  ];

  return (
    <>
      <FAQJsonLd items={faqSchemaData} />
      <BreadcrumbJsonLd items={breadcrumbs} />
      <FAQContent />
    </>
  );
}
