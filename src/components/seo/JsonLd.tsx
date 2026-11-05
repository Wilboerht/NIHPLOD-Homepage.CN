/**
 * Schema.org JSON-LD 结构化数据组件
 * 用于 SEO 优化，帮助搜索引擎理解页面内容
 */

import { getNonce } from "@/lib/nonce";
import { SITE_URL as baseUrl } from "@/lib/site-url";
import { getProductNicknames } from "@/config/product-nicknames";
import { OFFICIAL_SAME_AS } from "@/config/official-channels";
import { AWARD_TITLES } from "@/config/awards";
import { addDays, parseJobSalary, toIsoDate } from "@/lib/job-salary";

const ORGANIZATION_ID = `${baseUrl}/#organization`;
const BRAND_ID = `${baseUrl}/#brand`;

function toAbsoluteUrl(url: string): string {
  if (url.startsWith("http")) return url;
  return `${baseUrl}${url.startsWith("/") ? "" : "/"}${url}`;
}

/**
 * 剥离富文本 HTML 标签，结构化数据的 description 需为纯文本
 */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 通用 JSON-LD 脚本组件
 */
async function JsonLdScript({ data }: { data: object }) {
  const nonce = await getNonce();
  return (
    <script
      type="application/ld+json"
      nonce={nonce}
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}

/**
 * Organization Schema - 品牌组织信息
 * 用于根布局，定义品牌基本信息
 */
export async function OrganizationJsonLd() {
  const data = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": ORGANIZATION_ID,
    name: "NIHPLOD 旎柏官方网站",
    legalName: "旎柏 (NIHPLOD) 中国",
    sameAs: OFFICIAL_SAME_AS,
    alternateName: [
      "旎柏",
      "NIHPLOD China",
      "尼柏",
      "Niphlod",
      "Niphold",
      "Nihplad",
      "Nihplood",
      "旎白",
      "旎珀",
      "旎泊",
    ],
    url: baseUrl,
    logo: {
      "@type": "ImageObject",
      url: `${baseUrl}/images/NIHPLOD-logo.png`,
      width: 512,
      height: 144,
    },
    description:
      "NIHPLOD 旎柏官方网站，源自摩纳哥的高端护肤品牌。作为中国区唯一官方授权线上平台，为您提供真脂质体专利技术 (Dolphin-Skin) 驱动的奢华护肤体验。",
    slogan: "逆转时光",
    foundingDate: "2008",
    foundingLocation: {
      "@type": "Place",
      name: "摩纳哥",
    },
    founder: {
      "@type": "Person",
      name: "Dr. Stefan Rokem",
      jobTitle: "创始人",
      worksFor: { "@id": ORGANIZATION_ID },
    },
    award: AWARD_TITLES,
    address: {
      "@type": "PostalAddress",
      streetAddress: "信泰中心T3栋610室",
      addressLocality: "上海市",
      addressRegion: "普陀区",
      postalCode: "200333",
      addressCountry: "CN",
    },
    areaServed: {
      "@type": "Country",
      name: "中国",
    },
    brand: { "@id": BRAND_ID },
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer service",
      email: "contact@nihplod.cn",
      availableLanguage: ["Chinese", "English"],
      areaServed: {
        "@type": "Country",
        name: "中国",
      },
    },
    knowsAbout: [
      "高端护肤",
      "抗衰老科技",
      "真脂质体技术",
      "Liposome技术",
      "Dolphin-Skin",
      "修护面霜",
      "焕活身体乳",
      "奢华护肤品",
      "摩纳哥护肤品牌",
      "精准护肤方案",
      "贵妇级护肤",
    ],
  };

  return <JsonLdScript data={data} />;
}

/**
 * Brand Schema - 品牌实体
 */
export async function BrandJsonLd() {
  const data = {
    "@context": "https://schema.org",
    "@type": "Brand",
    "@id": BRAND_ID,
    name: "NIHPLOD 旎柏",
    url: baseUrl,
    logo: {
      "@type": "ImageObject",
      url: `${baseUrl}/images/NIHPLOD-logo.png`,
      width: 512,
      height: 144,
    },
    slogan: "逆转时光",
    sameAs: OFFICIAL_SAME_AS,
  };

  return <JsonLdScript data={data} />;
}

/**
 * WebSite Schema - 网站信息
 * 用于根布局，定义网站搜索功能
 */
export async function WebSiteJsonLd() {
  const data = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${baseUrl}/#website`,
    url: baseUrl,
    name: "NIHPLOD 旎柏",
    description: "NIHPLOD 旎柏官方网站",
    publisher: {
      "@id": ORGANIZATION_ID,
    },
    inLanguage: "zh-CN",
  };

  return <JsonLdScript data={data} />;
}

/**
 * Product Schema - 产品信息
 */
interface ProductJsonLdProps {
  product: {
    name: string;
    nameEn: string;
    slug: string;
    description: string;
    price: number;
    capacity?: string | null;
    origin?: string | null;
    usage?: string | null;
    updatedAt?: Date | string | null;
    images: { url: string; alt?: string | null }[];
    category: { name: string };
    benefits: string[];
    purchaseLinks?: { url: string }[];
  };
}

export async function ProductJsonLd({ product }: ProductJsonLdProps) {
  const productUrl = `${baseUrl}/products/${product.slug}`;
  const purchaseUrls = (product.purchaseLinks ?? [])
    .map((link) => link.url)
    .filter((url): url is string => Boolean(url) && url !== "#");
  const priceValidUntil = addDays(product.updatedAt, 365);

  const additionalProperty: {
    "@type": "PropertyValue";
    name: string;
    value: string;
  }[] = [];

  if (product.capacity) {
    additionalProperty.push({ "@type": "PropertyValue", name: "容量", value: product.capacity });
  }
  if (product.origin) {
    additionalProperty.push({ "@type": "PropertyValue", name: "产地", value: product.origin });
  }
  if (product.usage) {
    const usage = stripHtml(product.usage);
    if (usage) {
      additionalProperty.push({ "@type": "PropertyValue", name: "使用方法", value: usage });
    }
  }

  const data = {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": `${productUrl}#product`,
    name: product.name,
    alternateName: [product.nameEn, ...getProductNicknames(product.slug)],
    description: stripHtml(product.description),
    url: productUrl,
    image: product.images.map((img) => toAbsoluteUrl(img.url)),
    sku: product.slug,
    brand: {
      "@type": "Brand",
      "@id": BRAND_ID,
      name: "NIHPLOD 旎柏",
    },
    ...(purchaseUrls.length > 0 && { sameAs: purchaseUrls }),
    category: product.category.name,
    // 产品功效与社媒昵称作为关键词
    keywords: [...product.benefits, ...getProductNicknames(product.slug)].join(", "),
    ...(product.updatedAt && {
      dateModified: new Date(product.updatedAt).toISOString(),
    }),
    ...(product.origin && {
      countryOfOrigin: {
        "@type": "Country",
        name: product.origin,
      },
    }),
    // 关联产品页 FAQPage，帮助搜索引擎/LLM 识别问答归属
    subjectOf: {
      "@type": "FAQPage",
      "@id": `${productUrl}#faq`,
    },
    // 站内不直接成交（购买走第三方授权平台），仅声明官方定价与在售状态
    ...(product.price > 0 && {
      offers: {
        "@type": "Offer",
        url: productUrl,
        price: product.price,
        priceCurrency: "CNY",
        ...(priceValidUntil && { priceValidUntil }),
        itemCondition: "https://schema.org/NewCondition",
        availability: "https://schema.org/InStock",
        eligibleRegion: {
          "@type": "Country",
          name: "中国",
        },
        seller: {
          "@id": ORGANIZATION_ID,
        },
      },
    }),
    // 产品规格
    ...(additionalProperty.length > 0 && { additionalProperty }),
  };

  return <JsonLdScript data={data} />;
}

/**
 * BreadcrumbList Schema - 面包屑导航
 */
interface BreadcrumbItem {
  name: string;
  url?: string;
}

interface BreadcrumbJsonLdProps {
  items: BreadcrumbItem[];
}

export async function BreadcrumbJsonLd({ items }: BreadcrumbJsonLdProps) {
  const data = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      ...(item.url
        ? { item: item.url.startsWith("http") ? item.url : `${baseUrl}${item.url}` }
        : {}),
    })),
  };

  return <JsonLdScript data={data} />;
}

/**
 * FAQPage Schema - 常见问题
 */
interface FAQItem {
  question: string;
  answer: string;
}

interface FAQJsonLdProps {
  items: FAQItem[];
  id?: string;
  inLanguage?: string;
}

export async function FAQJsonLd({ items, id, inLanguage }: FAQJsonLdProps) {
  const data = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    ...(id && { "@id": id }),
    ...(inLanguage && { inLanguage }),
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };

  return <JsonLdScript data={data} />;
}

/**
 * ItemList Schema - 产品集合
 * 帮助搜索引擎与 AI 理解产品列表页的集合结构。
 */
interface ItemListJsonLdProps {
  name: string;
  url: string;
  items: { name: string; url: string; image?: string | null }[];
}

export async function ItemListJsonLd({ name, url, items }: ItemListJsonLdProps) {
  const data = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    url: toAbsoluteUrl(url),
    numberOfItems: items.length,
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: toAbsoluteUrl(item.url),
      name: item.name,
      ...(item.image ? { image: toAbsoluteUrl(item.image) } : {}),
    })),
  };

  return <JsonLdScript data={data} />;
}

/**
 * LocalBusiness Schema - 本地商家（如有线下店铺）
 */
interface LocalBusinessJsonLdProps {
  name?: string;
  address?: {
    street: string;
    city: string;
    region: string;
    postalCode: string;
    country: string;
  };
  telephone?: string;
  openingHours?: string[];
}

export async function LocalBusinessJsonLd({
  name = "NIHPLOD 旎柏",
  address,
  telephone,
  openingHours,
}: LocalBusinessJsonLdProps) {
  const data = {
    "@context": "https://schema.org",
    "@type": "BeautySalon",
    "@id": `${baseUrl}/#localbusiness`,
    name,
    url: baseUrl,
    ...(telephone && { telephone }),
    ...(address && {
      address: {
        "@type": "PostalAddress",
        streetAddress: address.street,
        addressLocality: address.city,
        addressRegion: address.region,
        postalCode: address.postalCode,
        addressCountry: address.country,
      },
    }),
    ...(openingHours && { openingHours }),
    priceRange: "$$$$",
  };

  return <JsonLdScript data={data} />;
}

/**
 * JobPosting Schema - 招聘信息
 */
interface JobPostingJsonLdProps {
  job: {
    id: string;
    title: string;
    description: string;
    location: string;
    type: string;
    salary?: string | null;
    createdAt: Date | string;
    updatedAt?: Date | string | null;
  };
}

export async function JobPostingJsonLd({ job }: JobPostingJsonLdProps) {
  const salary = parseJobSalary(job.salary);
  const datePosted = toIsoDate(job.createdAt);
  const validThrough = addDays(job.createdAt, 90);

  const cityMatch = job.location.match(/^(北京|上海|天津|重庆)/);
  const cityExtract = cityMatch
    ? cityMatch[1]
    : job.location.match(/^(?:.*?省|.*?自治区)?(.*?市)/)?.[1]?.replace(/市$/, "") ||
      job.location.split(/[区县]/)[0]?.replace(/市$/, "") ||
      job.location;

  const data = {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: job.title,
    description: job.description.replace(/<[^>]*>/g, ""),
    ...(datePosted && { datePosted }),
    ...(validThrough && { validThrough }),
    directApply: true,
    identifier: job.id,
    employmentType:
      job.type === "fulltime" ? "FULL_TIME" : job.type === "parttime" ? "PART_TIME" : "OTHER",
    hiringOrganization: {
      "@type": "Organization",
      "@id": ORGANIZATION_ID,
    },
    jobLocation: {
      "@type": "Place",
      address: {
        "@type": "PostalAddress",
        addressLocality: cityExtract,
        addressCountry: "CN",
      },
    },
    ...salary,
  };

  return <JsonLdScript data={data} />;
}

/**
 * HowTo Schema - 护肤指南步骤
 * 让搜索引擎理解 /guide 各方案的分步指南内容（这些内容在客户端按层级渲染，不在初始 HTML 中）
 */
interface HowToGuideStep {
  title: string;
  description: string;
  imageUrl?: string;
}

interface HowToGuide {
  name: string;
  description?: string;
  steps: HowToGuideStep[];
}

export async function GuideHowToJsonLd({ guides }: { guides: HowToGuide[] }) {
  const data = {
    "@context": "https://schema.org",
    "@graph": guides.map((guide) => ({
      "@type": "HowTo",
      name: guide.name,
      ...(guide.description && { description: guide.description }),
      step: guide.steps.map((step, index) => ({
        "@type": "HowToStep",
        position: index + 1,
        name: step.title,
        text: step.description,
        ...(step.imageUrl && {
          image: step.imageUrl.startsWith("http") ? step.imageUrl : `${baseUrl}${step.imageUrl}`,
        }),
      })),
    })),
  };

  return <JsonLdScript data={data} />;
}
