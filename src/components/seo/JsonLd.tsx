/**
 * Schema.org JSON-LD 结构化数据组件
 * 用于 SEO 优化，帮助搜索引擎理解页面内容
 */

// 基础 URL
const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://nihplod.cn";

/**
 * 通用 JSON-LD 脚本组件
 */
function JsonLdScript({ data }: { data: object }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  );
}

/**
 * Organization Schema - 品牌组织信息
 * 用于根布局，定义品牌基本信息
 */
export function OrganizationJsonLd() {
  const data = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${baseUrl}/#organization`,
    "name": "NIHPLOD 旎柏官方网站",
    "legalName": "旎柏 (NIHPLOD) 中国",
    "alternateName": [
      "旎柏", "NIHPLOD China", "尼柏", "Niphlod", "Niphold",
      "Nihplad", "Nihplood", "旎白", "旎珀", "旎泊"
    ],
    "url": baseUrl,
    "logo": {
      "@type": "ImageObject",
      "url": `${baseUrl}/images/NIHPLOD-logo.svg`,
      "width": 200,
      "height": 60,
    },
    "description": "NIHPLOD 旎柏官方网站，源自摩纳哥的高端护肤品牌。作为中国区唯一官方授权线上平台，为您提供真脂质体专利技术 (Dolphin-Skin) 驱动的奢华护肤体验。",
    "slogan": "逆转时光",
    "foundingDate": "2008",
    "foundingLocation": {
      "@type": "Place",
      "name": "摩纳哥",
    },
    "sameAs": [
      "https://weibo.com/nihplod",
      "https://www.xiaohongshu.com/user/nihplod",
      "https://nihplod.cn",
      "https://weixin.qq.com/",
      "https://www.douyin.com/",
    ],
    "contactPoint": {
      "@type": "ContactPoint",
      "contactType": "customer service",
      "email": "contact@nihplod.cn",
      "availableLanguage": ["Chinese", "English"],
    },
    "knowsAbout": [
      "高端护肤", "抗衰老科技", "真脂质体技术", "Liposome技术",
      "Dolphin-Skin", "修护面霜", "焕活身体乳", "奢华护肤品",
      "摩纳哥护肤品牌", "精准护肤方案", "贵妇级护肤"
    ],
  };

  return <JsonLdScript data={data} />;
}

/**
 * WebSite Schema - 网站信息
 * 用于根布局，定义网站搜索功能
 */
export function WebSiteJsonLd() {
  const data = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${baseUrl}/#website`,
    url: baseUrl,
    name: "NIHPLOD 旎柏",
    description: "NIHPLOD 旎柏官方网站",
    publisher: {
      "@id": `${baseUrl}/#organization`,
    },
    inLanguage: "zh-CN",
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${baseUrl}/products?search={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
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
    images: { url: string; alt?: string | null }[];
    category: { name: string };
    benefits: string[];
    purchaseUrl?: string | null;
  };
}

export function ProductJsonLd({ product }: ProductJsonLdProps) {
  const productUrl = `${baseUrl}/products/${product.slug}`;

  const data = {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": `${productUrl}#product`,
    name: product.name,
    alternateName: product.nameEn,
    description: product.description,
    url: productUrl,
    image: product.images.map((img) => img.url),
    sku: product.slug,
    brand: {
      "@type": "Brand",
      name: "NIHPLOD 旎柏",
    },
    category: product.category.name,
    // 产品功效作为关键词
    keywords: product.benefits.join(", "),
    offers: {
      "@type": "Offer",
      url: product.purchaseUrl || productUrl,
      priceCurrency: "CNY",
      price: product.price,
      priceValidUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      availability: "https://schema.org/InStock",
      seller: {
        "@id": `${baseUrl}/#organization`,
      },
      hasMerchantReturnPolicy: {
        "@type": "MerchantReturnPolicy",
        applicableCountry: "CN",
        returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
        merchantReturnDays: 7,
        returnMethod: "https://schema.org/ReturnByMail",
        returnFees: "https://schema.org/FreeReturn",
      },
    },
    // 产品规格
    ...(product.capacity && {
      additionalProperty: {
        "@type": "PropertyValue",
        name: "容量",
        value: product.capacity,
      },
    }),
  };

  return <JsonLdScript data={data} />;
}

/**
 * BreadcrumbList Schema - 面包屑导航
 */
interface BreadcrumbItem {
  name: string;
  url: string;
}

interface BreadcrumbJsonLdProps {
  items: BreadcrumbItem[];
}

export function BreadcrumbJsonLd({ items }: BreadcrumbJsonLdProps) {
  const data = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url.startsWith("http") ? item.url : `${baseUrl}${item.url}`,
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
}

export function FAQJsonLd({ items }: FAQJsonLdProps) {
  const data = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
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

export function LocalBusinessJsonLd({
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
    telephone,
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
    image: `${baseUrl}/images/store.jpg`,
  };

  return <JsonLdScript data={data} />;
}

/**
 * JobPosting Schema - 招聘信息
 */
interface JobPostingJsonLdProps {
  job: {
    title: string;
    description: string;
    location: string;
    type: string;
    salary?: string | null;
  };
}

export function JobPostingJsonLd({ job }: JobPostingJsonLdProps) {
  const data = {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: job.title,
    description: job.description,
    datePosted: new Date().toISOString().split("T")[0],
    validThrough: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    employmentType: job.type === "full-time" ? "FULL_TIME" : job.type === "part-time" ? "PART_TIME" : "OTHER",
    hiringOrganization: {
      "@type": "Organization",
      name: "NIHPLOD 旎柏",
      sameAs: baseUrl,
    },
    jobLocation: {
      "@type": "Place",
      address: {
        "@type": "PostalAddress",
        addressLocality: job.location,
        addressCountry: "CN",
      },
    },
    ...(job.salary && {
      baseSalary: {
        "@type": "MonetaryAmount",
        currency: "CNY",
        value: {
          "@type": "QuantitativeValue",
          value: job.salary,
          unitText: "MONTH",
        },
      },
    }),
  };

  return <JsonLdScript data={data} />;
}

