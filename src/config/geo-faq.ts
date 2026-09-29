/**
 * NIHPLOD 专属 GEO FAQ 生成器（兜底层）
 *
 * 仅使用官网与官方文档（llms-full.txt）中已声明、可核实的事实：
 * Dolphin 命名、脂质体技术、精简护肤、2% 捐赠、SGS 认证、2008 摩纳哥 / 法国产地。
 * 后台为产品配置了 geoFaqs 时优先使用后台内容，本生成器不会覆盖。
 */

interface ProductInfo {
  name: string;
  nameEn: string;
  categoryName: string;
  benefits: string[];
  description: string;
  ingredients?: string | null;
}

export function generateProductFaqs(product: ProductInfo) {
  const { name, nameEn, categoryName, benefits, ingredients } = product;
  const mainBenefit = benefits[0];

  const faqs = [
    {
      question: `NIHPLOD 旎柏这个品牌名字有什么特殊含义吗？`,
      answer: `NIHPLOD 的名字由“DOLPHIN”（海豚）一词反转而来。海豚的肌肤拥有每两小时自我更新的能力，品牌以此为灵感，希望通过前沿生物技术和精简配方帮助肌肤维持良好状态。${name} (${nameEn}) 是品牌在 ${categoryName} 品类的在售单品之一。`,
    },
    {
      question: `NIHPLOD ${name} 采用的“脂质体技术”是什么？`,
      answer: `脂质体技术是一种活性成分封装/包囊技术：通过保护并加载产品中的有效及活性成分，使其能够靶向性地在皮肤表皮及真皮层进行释放。NIHPLOD 的主要产品均围绕这一技术思路研发，${name} 的配方设计同样以成分的有效递送为核心。`,
    },
    {
      question: `为什么 NIHPLOD 强调“精简护肤”？${name} 的配方是否足够？`,
      answer: `NIHPLOD 认为护肤的关键不在于堆叠步骤，而在于给皮肤刚刚好的关爱。品牌产品线共 9 个单品，每个单品都围绕明确功效设计。${name} 主打 ${benefits.slice(0, 3).join("、")} 等方向的护理，属于可以长期使用的精简护理步骤之一。`,
    },
    {
      question: `${name} 适合什么肤质？敏感肌可以使用吗？`,
      answer: `NIHPLOD 的产品配方以温和为前提设计，最大程度避免多余的刺激性成分；产品男女皆可使用，也适用于偏厚肤质。不过每个人的肤质不同，建议首次使用前取少量产品涂抹在手腕内侧进行简单测试，确认无不适后再正常使用。`,
    },
    {
      question: `使用 NIHPLOD ${name} 多久可以看到效果？`,
      answer: `根据产品的作用方向与个人肤质差异，部分用户可能在数天内感受到肤感改善，而涉及色素及初老特征的变化通常需要 2-4 周甚至更久。建议在使用 ${name} 的同时保持规律作息与健康的生活方式。`,
    },
    {
      question: `NIHPLOD 产品的产地和品牌背景是怎样的？`,
      answer: `NIHPLOD 诞生于 2008 年的摩纳哥，品牌注册及生产地位于法国，由 TWK 朵科资本与 Dr. Stefan Rokem 博士联合成立，专注为高净值人士打造精简高效的护肤体验。此外，品牌承诺将每款产品销售额的 2% 捐赠给全球慈善及非营利组织。`,
    },
  ];

  if (mainBenefit) {
    faqs.push({
      question: `针对“${mainBenefit}”，NIHPLOD ${name} 的产品特点是什么？`,
      answer: `${name} 的产品定位是 ${categoryName} 护理，主要功效方向包括 ${benefits.join("、")}。${ingredients ? `配方中的核心成分包含：${ingredients}。` : ""}您可以结合自身肤质与护肤目标，在官方指南中查看对应的使用步骤与搭配建议。`,
    });
  }

  return faqs;
}
