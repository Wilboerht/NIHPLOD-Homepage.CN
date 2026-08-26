/**
 * 开发环境 Mock 数据
 * 当 NODE_ENV === 'development' 且没有数据库连接时使用
 */
export interface MockCategory {
  id: string;
  name: string;
  nameEn: string;
  slug: string;
  icon?: string | null;
}

export interface MockProduct {
  id: string;
  name: string;
  nameEn: string;
  slug: string;
  description: string;
  price: number;
  capacity: string | null;
  purchaseLinks: { id: string; platform: string; url: string }[];
  categoryId: string;
  category: MockCategory;
  images: { url: string; alt: string | null }[];
  ingredients: string | null;
  usage: string | null;
  benefits: string[];
}

/**
 * 生成 SVG 图标字符串
 */
const svgIcon = (paths: string) => `<svg viewBox="0 0 24 24" fill="none">${paths}</svg>`;

/* ============================================================
 * Categories
 * ============================================================ */
const cat = (slug: string) => `mock-cat-${slug}`;

export const mockCategories: MockCategory[] = [
  {
    id: cat("cleanser"),
    name: "洁面",
    nameEn: "Cleanser",
    slug: "cleanser",
    icon: svgIcon(
      '<path d="M9.4 3C9.4 3 9.5 2.5 12 2.5C14.5 2.5 14.6 3 14.6 3L14.75 8.5C15 8.5 15 8.83333 15 9V10.5C15.25 10.5102 15.25 10.8333 15.25 11V20.5C15.25 21.0523 14.8033 21.5 14.251 21.5H12H9.74902C9.19674 21.5 8.75 21.0527 8.75 20.5004V11C8.75 10.6 8.83333 10.5 9 10.5V9C9 8.6 9.08333 8.5 9.25 8.5L9.4 3Z" fill="currentColor" stroke="currentColor" stroke-width="0.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M10.2067 8.49844C10.2067 8.49844 10.655 8.39844 12 8.39844C13.345 8.39844 13.7933 8.49844 13.7933 8.49844" stroke="currentColor" stroke-width="0.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M9.87634 10.55C9.87634 10.55 10.4073 10.5 12 10.5C13.5927 10.5 14.1237 10.55 14.1237 10.55" stroke="currentColor" stroke-width="0.6" stroke-linecap="round" stroke-linejoin="round"/>'
    ),
  },
  {
    id: cat("scrub"),
    name: "磨砂膏",
    nameEn: "Scrub",
    slug: "scrub",
    icon: svgIcon(
      '<path d="M4.00167 7.02038C5.37524 6.86902 7.84265 6.69922 12 6.69922C16.1155 6.69922 18.5749 6.84977 19.9565 6.98565C20.8698 7.07548 21.5 7.84304 21.5 8.76077V15.6992C21.5 16.5276 20.8284 17.1992 20 17.1992H4C3.17157 17.1992 2.5 16.5276 2.5 15.6992V8.77417C2.5 7.87475 3.10766 7.1189 4.00167 7.02038Z" fill="currentColor" stroke="currentColor" stroke-width="0.8"/><path d="M4 10.9492C4 10.9492 7.27778 10.6992 12 10.6992C16.7222 10.6992 20 10.9492 20 10.9492" stroke="currentColor" stroke-width="0.6" stroke-linecap="round"/>'
    ),
  },
  {
    id: cat("mask"),
    name: "面膜",
    nameEn: "Mask",
    slug: "mask",
    icon: svgIcon(
      '<path d="M5.5 3.5C5.5 2.94772 5.94772 2.5 6.5 2.5H17.5C18.0523 2.5 18.5 2.94772 18.5 3.5V4.66196C18.5 4.86063 18.3648 5.0338 18.172 5.08199C17.9971 5.12571 17.9971 5.37429 18.172 5.41801C18.3648 5.4662 18.5 5.63937 18.5 5.83804V20.5C18.5 21.0523 18.0523 21.5 17.5 21.5H6.5C5.94772 21.5 5.5 21.0523 5.5 20.5V5.79666C5.5 5.6195 5.61336 5.46221 5.78144 5.40619C5.93153 5.35616 5.93153 5.14385 5.78144 5.09381C5.61336 5.03779 5.5 4.8805 5.5 4.70334V3.5Z" fill="currentColor" stroke="currentColor" stroke-width="0.8"/><path d="M7 4.4C7 4.17909 7.17909 4 7.4 4H16.6C16.8209 4 17 4.17909 17 4.4V19.1C17 19.3209 16.8209 19.5 16.6 19.5H7.4C7.17909 19.5 7 19.3209 7 19.1V4.4Z" fill="currentColor" stroke="currentColor" stroke-width="0.6" stroke-linejoin="round"/>'
    ),
  },
  {
    id: cat("serum"),
    name: "精华",
    nameEn: "Serum",
    slug: "serum",
    icon: svgIcon(
      '<path d="M9.84189 8.38604L10.8768 8.04105C10.9584 8.01386 11.0438 8 11.1298 8H12.8702C12.9562 8 13.0416 8.01386 13.1232 8.04105L14.1581 8.38604C14.3623 8.4541 14.5 8.64516 14.5 8.86038V21.2C14.5 21.6418 14.1418 22 13.7 22H10.3C9.85817 22 9.5 21.6418 9.5 21.2V8.86038C9.5 8.64516 9.63772 8.4541 9.84189 8.38604Z" fill="currentColor" stroke="currentColor" stroke-width="0.8" stroke-linecap="round"/><path d="M10.25 2.27892C10.25 2.0789 10.3703 1.90047 10.5645 1.85252C10.8494 1.78218 11.3279 1.69922 12 1.69922C12.6721 1.69922 13.1506 1.78218 13.4355 1.85252C13.6297 1.90047 13.75 2.0789 13.75 2.27892V7.44922C13.75 7.72536 13.5263 7.94922 13.2501 7.94922C12.8821 7.94922 12.3814 7.94922 12 7.94922C11.6186 7.94922 11.1179 7.94922 10.7499 7.94922C10.4737 7.94922 10.25 7.72536 10.25 7.44922V2.27892Z" fill="currentColor" stroke="currentColor" stroke-width="0.7"/><path d="M10.5 9H13.5" stroke="currentColor" stroke-width="0.6" stroke-linecap="round"/>'
    ),
  },
  {
    id: cat("cream"),
    name: "面霜",
    nameEn: "Cream",
    slug: "cream",
    icon: svgIcon(
      '<path d="M4.71235 5.27496C5.84896 5.14222 8.00007 5 12 5C15.9999 5 18.151 5.14222 19.2876 5.27496C20.0401 5.36283 20.5 5.97852 20.5 6.73607V18C20.5 18.8284 19.8284 19.5 19 19.5H5C4.17157 19.5 3.5 18.8284 3.5 18V6.73607C3.5 5.97852 3.95992 5.36283 4.71235 5.27496Z" fill="currentColor" stroke="currentColor" stroke-width="0.8"/><path d="M5 10.25C5 10.25 6.86667 10 12 10C17.1333 10 19 10.25 19 10.25" stroke="currentColor" stroke-width="0.6" stroke-linecap="round"/>'
    ),
  },
  {
    id: cat("sunscreen"),
    name: "防晒",
    nameEn: "Sunscreen",
    slug: "sunscreen",
    icon: svgIcon(
      '<rect x="4.3999" y="2.10156" width="15.06" height="19.92" rx="7.2" fill="currentColor"/><path d="M6 9.5C6 9.5 7.6 9 12 9C16.4 9 18 9.5 18 9.5" stroke="currentColor" stroke-width="0.6" stroke-linecap="round"/><path d="M11.875 2C6.5 2 5.29578 5.31688 4.875 7C4.45422 8.68312 4.44498 15.2799 4.875 17C5.30502 18.7201 6.5 22 11.875 22" stroke="currentColor" stroke-width="0.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 2C17.375 2 18.5792 5.31688 19 7C19.4208 8.68312 19.43 15.2799 19 17C18.57 18.7201 17.375 22 12 22" stroke="currentColor" stroke-width="0.8" stroke-linecap="round" stroke-linejoin="round"/>'
    ),
  },
  {
    id: cat("hand-cream"),
    name: "护手霜",
    nameEn: "Hand Cream",
    slug: "hand-cream",
    icon: svgIcon(
      '<path d="M14.7 3.5H9.7C9.58954 3.5 9.5 3.58954 9.5 3.7V4.4L9.95 4.85C10.3754 5.27537 10.3987 17.3615 10.3999 18.6831C10.4 18.7588 10.4428 18.8214 10.5106 18.8553L11.1894 19.1947C11.2572 19.2286 11.3 19.2979 11.3 19.3736V19.95C11.3 20.0605 11.2105 20.15 11.1 20.15H11.05C10.9395 20.15 10.85 20.2395 10.85 20.35V20.85C10.85 20.9605 10.9395 21.05 11.05 21.05H13.35C13.4605 21.05 13.55 20.9605 13.55 20.85V20.35C13.55 20.2395 13.4605 20.15 13.35 20.15H13.3C13.1895 20.15 13.1 20.0605 13.1 19.95V19.3736C13.1 19.2979 13.1428 19.2286 13.2106 19.1947L13.8894 18.8553C13.9572 18.8214 14 18.7588 14.0001 18.6831C14.0013 17.3615 14.0246 5.27537 14.45 4.85L14.7331 4.56694C14.8205 4.47955 14.9 4.2875 14.9 4.16391V3.7C14.9 3.58954 14.8105 3.5 14.7 3.5Z" fill="currentColor" stroke="currentColor" stroke-width="0.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M10.5708 4.5H13.8294" stroke="currentColor" stroke-width="0.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M11.269 18.5469L13.1311 18.5469" stroke="currentColor" stroke-width="0.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M11.9673 20.1406L12.4328 20.1406" stroke="currentColor" stroke-width="0.5" stroke-linecap="round" stroke-linejoin="round"/>'
    ),
  },
  {
    id: cat("body-care"),
    name: "身体护理",
    nameEn: "Body Care",
    slug: "body-care",
    icon: svgIcon(
      '<path d="M9 1.91421C9 1.649 9.11699 1.40264 9.36653 1.31278C9.76074 1.17083 10.5387 1 12 1C13.4613 1 14.2393 1.17083 14.6335 1.31278C14.883 1.40264 15 1.649 15 1.91421V22C15 22.5523 14.5523 23 14 23H10C9.44772 23 9 22.5523 9 22V1.91421Z" fill="currentColor" stroke="currentColor" stroke-width="0.8" stroke-linejoin="round"/><path d="M10 4.9C10 4.9 10.5 4.75 12 4.75C13.5 4.75 14 4.9 14 4.9" stroke="currentColor" stroke-width="0.6" stroke-linecap="round"/><circle cx="12" cy="2.5" r="0.5" fill="currentColor" stroke="currentColor" stroke-width="0.5"/>'
    ),
  },
  {
    id: cat("treatment"),
    name: "护理油",
    nameEn: "Treatment",
    slug: "treatment",
    icon: svgIcon(
      '<path d="M7.97144 11.9934C7.97144 11.782 8.04988 11.5782 8.23354 11.4734C8.65975 11.2302 9.69906 10.8438 12 10.8438C14.3009 10.8438 15.3402 11.2302 15.7664 11.4734C15.9501 11.5782 16.0285 11.782 16.0285 11.9934V20.3331C16.0285 20.8399 15.6176 21.2508 15.1108 21.2508H8.88917C8.38232 21.2508 7.97144 20.8399 7.97144 20.3331V11.9934Z" fill="currentColor" stroke="currentColor" stroke-width="0.7998" stroke-linejoin="round"/><path d="M11.2842 4.34803C11.2842 4.34803 11.4989 4.29297 12 4.29297C12.5011 4.29297 12.7158 4.34803 12.7158 4.34803" stroke="currentColor" stroke-width="0.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M9.14062 12.139C9.14062 12.139 9.99843 12.084 12 12.084C14.0015 12.084 14.8593 12.139 14.8593 12.139" stroke="currentColor" stroke-width="0.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M10.5963 3.09543C10.8518 2.96797 11.4246 2.77734 11.9973 2.77734L12 10.8167H9.76721V10.0182L9.84981 9.85305C9.84787 8.27661 9.8452 5.26204 9.84891 4.63549C9.84929 4.57273 9.87044 4.51166 9.91704 4.46962C10.0556 4.3446 10.2531 4.26463 10.483 4.23654V3.29505C10.483 3.21142 10.5215 3.13277 10.5963 3.09543Z" fill="currentColor" stroke="currentColor" stroke-width="0.7998" stroke-linecap="round" stroke-linejoin="round"/><path d="M13.4037 3.09543C13.1482 2.96797 12.5754 2.77734 12.0027 2.77734L12 10.8167H14.2328V10.0182L14.1502 9.85305C14.1521 8.27661 14.1548 5.26204 14.1511 4.63549C14.1507 4.57273 14.1296 4.51166 14.083 4.46962C13.9444 4.3446 13.7469 4.26463 13.517 4.23654V3.29505C13.517 3.21142 13.4785 3.13277 13.4037 3.09543Z" fill="currentColor" stroke="currentColor" stroke-width="0.7998" stroke-linecap="round" stroke-linejoin="round"/>'
    ),
  },
  {
    id: cat("gift-box"),
    name: "礼盒套装",
    nameEn: "Gift Box",
    slug: "gift-box",
    icon: svgIcon(
      '<path d="M19.3931 20.6893V10.252H4.60693V20.6893H19.3931Z" fill="currentColor" stroke="currentColor" stroke-width="1.73955" stroke-linecap="round" stroke-linejoin="round"/><path d="M19.3931 20.6895H4.60693" stroke="currentColor" stroke-width="1.73955" stroke-linecap="round" stroke-linejoin="round"/><path d="M20.6978 6.77344H3.30225V10.2525H20.6978V6.77344Z" fill="currentColor" stroke="currentColor" stroke-width="1.73955" stroke-linejoin="round"/><path d="M11.737 6.13913C9.99054 5.95491 7.83731 4.17634 8.35979 3.2067C8.88227 2.23706 11.831 3.99026 11.737 6.13913Z" fill="currentColor" stroke="currentColor" stroke-width="0.62725" stroke-linecap="round"/><path d="M12.263 6.13913C14.0095 5.95491 16.1627 4.17634 15.6402 3.2067C15.1177 2.23706 12.169 3.99026 12.263 6.13913Z" fill="currentColor" stroke="currentColor" stroke-width="0.62725" stroke-linecap="round"/>'
    ),
  },
];

/* ============================================================
 * Products
 * ============================================================ */
const pid = (slug: string) => `mock-prod-${slug}`;
const plid = (idx: number) => `mock-link-${idx}`;

const defaultImages = [
  { url: "/images/ritual-step-1.webp", alt: "产品图 1" },
  { url: "/images/ritual-step-2.webp", alt: "产品图 2" },
  { url: "/images/ritual-step-3.webp", alt: "产品图 3" },
];

const purchaseLinks = [
  { id: plid(1), platform: "天猫国际", url: "https://www.tmall.com" },
  { id: plid(2), platform: "小红书", url: "https://www.xiaohongshu.com" },
  { id: plid(3), platform: "抖音", url: "https://www.douyin.com" },
  { id: plid(4), platform: "官方商城", url: "#" },
];

export const mockProducts: MockProduct[] = [
  {
    id: pid("foam-cleanser"),
    name: "净透温和洁面慕斯",
    nameEn: "Foam Cleanser",
    slug: "foam-cleanser",
    description:
      "适合所有肤质的氨基酸洁面慕斯，能够温和去除污垢和化妆品残留，同时不会剥夺皮肤的天然油脂，提供强效抗氧化保护，对抗泛红和刺激，为后续护肤步骤打开通道。",
    price: 680,
    capacity: "100 ml",
    purchaseLinks,
    categoryId: cat("cleanser"),
    category: mockCategories[0],
    images: defaultImages,
    ingredients: "椰油酰甘氨酸钾（氨基酸表活）、扁柏水、牡丹花水、泛醇、透明质酸钠。",
    usage: "取适量泡沫于湿润的面部，轻柔按摩后用温水洗净。",
    benefits: ["温和清洁", "保湿不紧绷", "深层洁净", "适合所有肤质"],
  },
  {
    id: pid("face-scrub"),
    name: "匀衡磨砂膏",
    nameEn: "Face Scrub",
    slug: "face-scrub",
    description:
      "一款可以为后续肌肤护理创造理想环境的深度清洁类产品。它可以有效排出堵塞毛孔的有害物质，恢复肌肤自然状态下的再生质感，并平衡肌肤的水油，改善肤质不均和表面脱皮，同时缩小毛孔。",
    price: 780,
    capacity: "50 ml",
    purchaseLinks,
    categoryId: cat("scrub"),
    category: mockCategories[1],
    images: defaultImages,
    ingredients: "圆形胡桃壳粉微末、乳酸、壬二酸、葡萄柚籽提取物、迷迭香叶油",
    usage:
      "清洁皮肤可加少量水或不加水直接使用本品。取适量大小的膏体于指尖，轻轻涂抹于面部。以打圈的方式轻柔按摩脸颊和额头后用清水彻底洗净。",
    benefits: ["去角质", "收缩毛孔", "提亮肤色", "平衡水油"],
  },
  {
    id: pid("face-mask"),
    name: "臻奢赋活莱赛尔面膜",
    nameEn: "Face Mask",
    slug: "face-mask",
    description:
      "这款莱赛尔纤维面膜富含滋养和修护成分，能够深入肌肤，延缓初老迹象，强化肌肤天然屏障和免疫力，帮助肌肤更好地应对偶尔出现的失衡状态；尤其适合激光治疗后作为舒缓护理使用。",
    price: 1350,
    capacity: "30g × 4",
    purchaseLinks,
    categoryId: cat("mask"),
    category: mockCategories[2],
    images: defaultImages,
    ingredients: "乙酰基六肽-8、α-熊果苷、烟酰胺、可溶性胶原、透明质酸钠",
    usage:
      "洁面后，取出面膜敷于面部，静享 10--15 分钟后取下，可适当按摩面部，将剩余精华液彻底吸收。",
    benefits: ["密集修护", "修复屏障", "深层保湿", "提亮焕肤"],
  },
  {
    id: pid("serum"),
    name: "时光涅槃臻萃精华露",
    nameEn: "Serum",
    slug: "serum",
    description:
      "一款含多种珍贵成分及天然提取物的高品质精华。让真正的营养和修复因子进入皮肤，帮助皮肤保持紧致，恢复健康；可以有效延缓皮肤的自然衰老。让皮肤看起来更年轻、更紧致。",
    price: 4500,
    capacity: "30 ml",
    purchaseLinks,
    categoryId: cat("serum"),
    category: mockCategories[3],
    images: defaultImages,
    ingredients:
      "羟丙基四氢吡喃三醇（玻色因）、富勒烯、棕榈酰三肽-5、双歧杆菌发酵溶胞物、α-熊果苷、曲克芦丁、烟酰胺",
    usage: "深层清洁皮肤后，在指尖涂抹精华液，轻轻涂抹在脸上。轻轻按摩你的脸颊、眼睛和脖子。",
    benefits: ["抗老紧致", "淡化细纹", "提升弹性", "修护肌底", "焕亮光采"],
  },
  {
    id: pid("face-cream"),
    name: "恒采修护面霜",
    nameEn: "Face Cream",
    slug: "face-cream",
    description:
      "一款珍贵的面部霜，有助于让肌肤呈现出美丽、有弹性且光滑的质感。它有多种保湿和修复成分，能有效改善与皮肤长期不当维护导致的不良状况。",
    price: 2800,
    capacity: "50 ml",
    purchaseLinks,
    categoryId: cat("cream"),
    category: mockCategories[4],
    images: defaultImages,
    ingredients: "羟丙基四氢吡喃三醇（玻色因）、神经酰胺 NP、泛醇、红没药醇、燕麦仁油",
    usage: "深层清洁皮肤后，在指尖涂抹面霜，轻轻涂抹在脸上。轻轻按摩你的脸颊和眼睛。",
    benefits: ["抗衰老", "深层滋养", "紧致提升", "保湿锁水", "修护屏障"],
  },
  {
    id: pid("hand-cream"),
    name: "抚纹紧致护手霜",
    nameEn: "Hand Cream",
    slug: "hand-cream",
    description:
      "一款将滋养与修护成分深入手部肌肤的奢华护手霜。不仅能即时滋润干燥、抚平细纹，更能持续强化手部屏障，改善松弛，促进恢复肌肤原有的弹性和质地。",
    price: 480,
    capacity: "25 ml",
    purchaseLinks,
    categoryId: cat("hand-cream"),
    category: mockCategories[6],
    images: defaultImages,
    ingredients: "羟丙基四氢吡喃三醇（玻色因）、依克多因、乳酸杆菌、细小裸藻多糖、角鲨烷",
    usage:
      "取适量乳霜于手掌或手背上，然后均匀涂抹于整个手部。对于特别干燥或严重脱水的肌肤，建议使用较多的频率和用量。",
    benefits: ["深层滋润", "淡化细纹", "柔嫩双手", "长效保湿"],
  },
  {
    id: pid("body-lotion"),
    name: "新生焕活身体乳",
    nameEn: "Body Lotion",
    slug: "body-lotion",
    description:
      "一款采用超过 20 种珍贵成分和提取物的身体乳。它能帮助你更好的增强皮肤的天然防御机制，有效滋养和保湿；并能改善皮肤密度和弹性。",
    price: 1000,
    capacity: "250 ml",
    purchaseLinks,
    categoryId: cat("body-care"),
    category: mockCategories[7],
    images: defaultImages,
    ingredients: "羟丙基四氢吡喃三醇（玻色因）、三叶鬼针草、光甘草定、烟酰胺、乳酸菌发酵产物",
    usage: "清洁全身后，取适量本产品涂抹于需要护理的部位，并以打圈的方式轻轻按摩至完全吸收。",
    benefits: ["全身滋养", "持久保湿", "柔滑细腻", "快速吸收"],
  },
  {
    id: pid("sunscreen"),
    name: "倍护清透防晒乳",
    nameEn: "Sunscreen",
    slug: "sunscreen",
    description:
      "一款清透不粘腻的防晒乳，提供广谱防护的同时滋润肌肤，适合日常使用，质地轻盈易推开，不堵塞毛孔。",
    price: 580,
    capacity: "50 ml",
    purchaseLinks,
    categoryId: cat("sunscreen"),
    category: mockCategories[5],
    images: defaultImages,
    ingredients: "二氧化钛、氧化锌、维生素E、甘油",
    usage: "出门前15分钟取适量均匀涂抹于面部及颈部，每隔2-3小时补涂一次。",
    benefits: ["广谱防护", "清透不粘腻", "滋润保湿", "适合日常"],
  },
  {
    id: pid("treatment-oil"),
    name: "修护臻养护理油",
    nameEn: "Treatment Oil",
    slug: "treatment-oil",
    description: "富含多种植物精华油的护理油，深层滋养肌肤，修护干燥损伤，令肌肤重现柔嫩光泽。",
    price: 1600,
    capacity: "30 ml",
    purchaseLinks,
    categoryId: cat("treatment"),
    category: mockCategories[8],
    images: defaultImages,
    ingredients: "摩洛哥坚果油、玫瑰果油、荷荷巴油、维生素E",
    usage: "取2-3滴于掌心温热后，均匀按压于面部及颈部，可单独使用或加入面霜中。",
    benefits: ["深层滋养", "修护干燥", "提亮肤色", "柔嫩光泽"],
  },
  {
    id: pid("gift-box"),
    name: "奢宠臻选礼盒",
    nameEn: "Luxury Gift Box",
    slug: "gift-box",
    description: "甄选NIHPLOD明星产品组合，精美礼盒包装，是馈赠亲友或犒赏自己的理想之选。",
    price: 6350,
    capacity: null,
    purchaseLinks,
    categoryId: cat("gift-box"),
    category: mockCategories[9],
    images: defaultImages,
    ingredients: null,
    usage: null,
    benefits: ["明星组合", "精美包装", "馈赠佳品", "完整护肤方案"],
  },
];
