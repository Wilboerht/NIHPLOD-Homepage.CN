/**
 * 护肤指南（/guide）数据与类型定义
 * 供 RitualContent（客户端组件）与 page.tsx（服务端 SEO 结构化数据）共用
 */

import { Sun, Home, ShoppingBag, SoapDispenserDroplet, type LucideIcon } from "lucide-react";

export type ModuleId = "daily" | "portable" | "spa" | "professional";

/** 模块配置 */
export interface ModuleConfig {
  id: ModuleId;
  number: string;
  label: string;
  subtitle: string;
  description: string;
  image: string;
  icon: LucideIcon;
}

// 模块配置 - 4个护肤仪式模块
export const modules: ModuleConfig[] = [
  {
    id: "daily",
    number: "01",
    label: "优雅日常",
    subtitle: "告别繁琐, 轻松护理",
    description: "每日专属的精简守护",
    image: "/images/ritual-daily-cover.webp",
    icon: Sun,
  },
  {
    id: "spa",
    number: "02",
    label: "居家仪式",
    subtitle: "让生活充满仪式感",
    description: "享受DIY的美好时光",
    image: "/images/ritual-spa-home-cover.webp",
    icon: Home,
  },
  {
    id: "portable",
    number: "03",
    label: "单品好物",
    subtitle: "外出 / 通勤 / 旅行 / 多效芳疗",
    description: "随时随地按需使用",
    image: "/images/ritual-portable-cover.webp",
    icon: ShoppingBag,
  },
  {
    id: "professional",
    number: "04",
    label: "专业水疗",
    subtitle: "让身心重拾活力与平衡",
    description: "沉静式悦己体验",
    image: "/images/ritual-professional-cover.webp",
    icon: SoapDispenserDroplet,
  },
];

/** 方案关联的产品（名称 + 是否可选） */
export interface RitualProductRef {
  name: string;
  optional?: boolean;
}

// 护肤步骤类型
export interface RitualStep {
  title: string;
  description: string;
  duration?: string; // 时长，如 "1-2分钟"
  tips?: string; // 技巧提示
  dosage?: string; // 用量建议
  imageUrl?: string;
}

// 子方案类型 (用于 Tab 切换)
export interface SubPlan {
  id: string;
  name: string; // 如 "精简方案", "外出方案"
  steps: RitualStep[];
  products?: RitualProductRef[]; // 该子方案涉及的产品
  benefits?: string[];
  specialSupport?: string;
  duration?: string;
}

// 情景类型 (如 "晨间焕活", "晚间呵护")
export interface Scheme {
  id: string;
  name: string;
  tag?: string;
  desc?: string;
  steps: RitualStep[]; // 保留原有 steps，兼容没有子方案的情景
  subPlans?: SubPlan[]; // 新增：子方案列表（可选）
  totalDuration?: string;
  products?: RitualProductRef[];
  benefits?: string[];
  specialSupport?: string;
  nameEn?: string;
  icon?: React.ReactNode;
  heroImage?: string;
}

// 模块数据类型
export type ModuleData = Record<ModuleId, Scheme[]>;

export const defaultModuleData: ModuleData = {
  daily: [
    {
      id: "d1",
      name: "晨间焕活",
      // nameEn: "MORNING VITALITY RITUAL", // Removed
      // desc: "开启一天的透亮肌底", // Removed
      icon: (
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <g clipPath="url(#clip0_1328_320)">
            <path
              d="M12 18.5C15.5898 18.5 18.5 15.5898 18.5 12C18.5 8.41015 15.5898 5.5 12 5.5C8.41015 5.5 5.5 8.41015 5.5 12C5.5 15.5898 8.41015 18.5 12 18.5Z"
              fill="#C3BC9F"
              stroke="#C3BC9F"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
            <path
              d="M12 3C12.6904 3 13.25 2.44036 13.25 1.75C13.25 1.05964 12.6904 0.5 12 0.5C11.3097 0.5 10.75 1.05964 10.75 1.75C10.75 2.44036 11.3097 3 12 3Z"
              fill="#C3BC9F"
            />
            <path
              d="M19.25 6C19.9404 6 20.5 5.44035 20.5 4.75C20.5 4.05964 19.9404 3.5 19.25 3.5C18.5597 3.5 18 4.05964 18 4.75C18 5.44035 18.5597 6 19.25 6Z"
              fill="#C3BC9F"
            />
            <path
              d="M22.25 13.25C22.9404 13.25 23.5 12.6904 23.5 12C23.5 11.3097 22.9404 10.75 22.25 10.75C21.5597 10.75 21 11.3097 21 12C21 12.6904 21.5597 13.25 22.25 13.25Z"
              fill="#C3BC9F"
            />
            <path
              d="M19.25 20.5C19.9404 20.5 20.5 19.9404 20.5 19.25C20.5 18.5597 19.9404 18 19.25 18C18.5597 18 18 18.5597 18 19.25C18 19.9404 18.5597 20.5 19.25 20.5Z"
              fill="#C3BC9F"
            />
            <path
              d="M12 23.5C12.6904 23.5 13.25 22.9404 13.25 22.25C13.25 21.5597 12.6904 21 12 21C11.3097 21 10.75 21.5597 10.75 22.25C10.75 22.9404 11.3097 23.5 12 23.5Z"
              fill="#C3BC9F"
            />
            <path
              d="M4.75 20.5C5.44035 20.5 6 19.9404 6 19.25C6 18.5597 5.44035 18 4.75 18C4.05964 18 3.5 18.5597 3.5 19.25C3.5 19.9404 4.05964 20.5 4.75 20.5Z"
              fill="#C3BC9F"
            />
            <path
              d="M1.75 13.25C2.44036 13.25 3 12.6904 3 12C3 11.3097 2.44036 10.75 1.75 10.75C1.05964 10.75 0.5 11.3097 0.5 12C0.5 12.6904 1.05964 13.25 1.75 13.25Z"
              fill="#C3BC9F"
            />
            <path
              d="M4.75 6C5.44035 6 6 5.44035 6 4.75C6 4.05964 5.44035 3.5 4.75 3.5C4.05964 3.5 3.5 4.05964 3.5 4.75C3.5 5.44035 4.05964 6 4.75 6Z"
              fill="#C3BC9F"
            />
          </g>
          <defs>
            <clipPath id="clip0_1328_320">
              <rect width="24" height="24" fill="white" />
            </clipPath>
          </defs>
        </svg>
      ),
      totalDuration: "5-15分钟",
      products: [{ name: "洁面" }, { name: "面霜" }],
      benefits: ["保湿锁水", "过敏修护", "抗初老", "维稳舒缓"],
      specialSupport: "孕期、月子期、轻医美术后",
      // 原有 steps 作为默认显示
      steps: [
        {
          title: "净肤",
          description:
            "取适量洁面慕斯，温和打圈按摩全脸30秒，随后用温水洗净；通过清除夜间代谢，唤醒肌肤微循环。",
          duration: "30秒",
          tips: "温水洗净，避免过冷或过热刺激。",
          imageUrl: "/images/ritual-step-cleanse.webp",
        },
        {
          title: "焕活",
          description:
            "取适量面霜于掌心，展匀后，由内向外、由下向上在脸部及眼周涂抹并推开；有效的形成水油平衡保护，减缓并调理肌肤的临时不适。",
          duration: "1-2分钟",
          tips: "掌心温热后按压效果更佳。",
          imageUrl: "/images/ritual-step-revitalize.webp",
        },
      ],
      // 新增子方案 Tab
      subPlans: [
        {
          id: "simple",
          name: "精简方案",
          products: [{ name: "洁面" }, { name: "面霜" }],
          duration: "5-10分钟",
          steps: [
            {
              title: "净肤",
              description:
                "取适量洁面慕斯，温和打圈按摩全脸30秒，随后用温水洗净；通过清除夜间代谢，唤醒肌肤微循环。",
              duration: "30秒",
              tips: "温水洗净，避免过冷或过热刺激。",
              imageUrl: "/images/ritual-step-cleanse.webp",
            },
            {
              title: "焕活",
              description:
                "取适量面霜于掌心，展匀后，由内向外、由下向上在脸部及眼周涂抹并推开；有效的形成水油平衡保护，减缓并调理肌肤的临时不适。",
              duration: "1-2分钟",
              tips: "掌心温热后按压效果更佳。",
              imageUrl: "/images/ritual-step-revitalize.webp",
            },
          ],
        },
        {
          id: "outing",
          name: "外出方案",
          products: [{ name: "洁面" }, { name: "面霜", optional: true }, { name: "防晒" }],
          duration: "10-15分钟",
          steps: [
            {
              title: "净肤",
              description:
                "取适量洁面慕斯，温和打圈按摩全脸30秒，随后用温水洗净；通过清除夜间代谢，唤醒肌肤微循环。",
              duration: "30秒",
              imageUrl: "/images/ritual-step-cleanse.webp",
            },
            {
              title: "焕活",
              description:
                "取适量面霜于掌心，展匀后，由内向外、由下向上在脸部及眼周涂抹并推开；有效的形成水油平衡保护，减缓并调理肌肤的临时不适。",
              duration: "1-2分钟",
              imageUrl: "/images/ritual-step-revitalize.webp",
            },
            {
              title: "防护",
              description:
                "在面部完全干爽后，取足量防晒霜，点涂于面部及颈部，顺着皮肤纹理均匀涂抹。防晒剂提供即时自然提亮效果。",
              duration: "1分钟",
              imageUrl: "/images/ritual-step-protect.webp",
            },
          ],
          benefits: ["保湿锁水", "过敏修护", "抗初老", "维稳舒缓", "SPF30", "PA+++"],
          specialSupport: "",
        },
      ],
    },
    {
      id: "n1",
      name: "晚间呵护",
      // nameEn: "NIGHT REPAIR RITUAL", // Removed
      // desc: "利用黄金睡眠期修护", // Removed
      icon: (
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M13.8237 3.18488C11.3623 3.82663 9.54547 6.06477 9.54547 8.72728C9.54547 11.8904 12.1096 14.4545 15.2727 14.4545C17.9352 14.4545 20.1734 12.6377 20.8151 10.1763C20.9363 10.7652 21 11.3752 21 12C21 16.9706 16.9706 21 12 21C7.02943 21 3 16.9706 3 12C3 7.02943 7.02943 3 12 3C12.6248 3 13.2348 3.06367 13.8237 3.18488Z"
            fill="#C3BC9F"
            stroke="#C3BC9F"
            strokeWidth="1.44"
            strokeLinejoin="round"
          />
        </svg>
      ),
      totalDuration: "15-20分钟",
      products: [{ name: "洁面" }, { name: "精华露", optional: true }, { name: "面膜" }, { name: "面霜" }, { name: "身体乳", optional: true }],
      benefits: ["保湿锁水", "屏障增强", "抗初老", "维稳舒缓", "紧致提拉", "润泽提亮"],
      specialSupport: "孕期、月子期、轻医美术后",
      steps: [
        {
          title: "净肤",
          description:
            "取适量洁面，温和打圈按摩全脸30秒，随后用温水洗净；通过清除夜间代谢，唤醒肌肤微循环。",
          duration: "30秒",
          imageUrl: "/images/ritual-step-cleanse.webp",
        },
        {
          title: "渗透肌底（可选）",
          description:
            "取适量精华于指腹，请点脸颊、眼周或颈部区域后，以打圈的方式轻轻按摩；让多重营养和修复因子渗入肌肤。",
          duration: "2分钟",
          imageUrl: "/images/ritual-step-penetrate.webp",
        },
        {
          title: "膜法封存",
          description:
            "通过面膜的贴合覆盖，达到有效锁水，强化肌肤天然屏障和免疫力，帮助面部肌肤更好地应对偶尔出现的失衡状态。（若后续无涂抹身体乳的计划，本步骤建议用面霜代替。）",
          duration: "10-15分钟",
          imageUrl: "/images/ritual-step-seal.webp",
        },
        {
          title: "滋养全身（可选）",
          description:
            "取适量身体乳涂抹于周身，增强全身肌肤的天然防御机制，有效滋养和保湿；修复轻微皮肤损伤，保持肌肤健康光泽。",
          duration: "3-5分钟",
          imageUrl: "/images/ritual-step-nourish.webp",
        },
      ],
      subPlans: [],
    },
  ],
  portable: [
    {
      id: "t1",
      name: "日常外出",
      nameEn: "DAILY COMMUTE",
      tag: "通勤",
      desc: "富含多重功效的防晒，能有效抵御紫外线伤害，预防光老化；同时使用护手霜则能滋养双手，抵御干燥和外界刺激，让您的双手亦时刻保持健康与舒适。",
      totalDuration: "3-5分钟",
      products: [{ name: "护手霜" }, { name: "防晒" }],
      benefits: ["保湿锁水", "屏障增强", "SPF30", "PA+++"],
      heroImage: "/images/portable-travel-hero.webp",
      steps: [
        {
          title: "防晒防护",
          description: "出门前快速涂抹防晒，抵御紫外线。",
          duration: "1分钟",
          tips: "均匀涂抹于面部及裸露肌肤。",
          imageUrl: "/images/ritual-step-1.webp",
        },
        {
          title: "随时补水",
          description: "感觉干燥时喷洒舒缓喷雾。",
          duration: "10秒",
          tips: "按需使用。",
          imageUrl: "/images/ritual-step-2.webp",
        },
      ],
    },
    {
      id: "t2",
      name: "轻悦旅行",
      nameEn: "LIGHT TRAVEL",
      tag: "中短途",
      desc: "你的便携式“旅行护肤急救箱”- 氨基酸洁面慕斯温和清洁，防晒霜抵御光损伤，护手霜随时滋润干燥双手，莱赛尔贴片面膜为肌肤快速“充电+修护+维稳”；按需携带，让你在紧凑行程中也能时刻容光焕发。",
      totalDuration: "10分钟",
      products: [{ name: "洁面" }, { name: "面膜" }, { name: "防晒" }, { name: "护手霜" }],
      benefits: ["轻便卸妆", "保湿锁水", "维稳舒缓", "SPF30", "PA+++"],
      heroImage: "/images/portable-hero-update.webp",
      steps: [
        {
          title: "深层清洁",
          description: "彻底清洁旅途中的尘埃与油脂。",
          duration: "2分钟",
          tips: "温水洗净。",
          imageUrl: "/images/ritual-step-1.webp",
        },
        {
          title: "密集修护",
          description: "敷一片面膜，舒缓旅途疲劳。",
          duration: "15分钟",
          tips: "静享放松时刻。",
          imageUrl: "/images/ritual-step-2.webp",
        },
      ],
    },
    {
      id: "t3",
      name: "多效芳疗",
      nameEn: "MULTI-EFFECT AROMATHERAPY",
      tag: "芳疗",
      desc: "这款奢华护理油是您私人 SPA 的核心，在泡澡时滴入数滴，便可瞬间将浴室升华为芳香疗愈场，让卓越的润肤力包裹并环绕您的全身；而干燥时节，只需将其与任意面霜、精华或身体乳混合，即可定制出加倍润泽的顶级护理体验。",
      totalDuration: "自由",
      products: [{ name: "护理油" }],
      benefits: ["滋润加强", "维稳舒缓", "疗愈焕颜"],
      heroImage: "/images/portable-aroma-hero.webp",
      steps: [
        {
          title: "沐浴体验",
          description: "泡澡时滴入数滴，享受芳香疗愈。",
          duration: "15分钟",
          tips: "水温适宜。",
          imageUrl: "/images/ritual-step-1.webp",
        },
        {
          title: "加倍滋润",
          description: "混合面霜或身体乳使用。",
          duration: "1分钟",
          tips: "按需调配。",
          imageUrl: "/images/ritual-step-2.webp",
        },
      ],
    },
  ],
  spa: [
    {
      id: "s1",
      name: "面部方案",
      nameEn: "FACE RITUAL",
      desc: "仅需 4 个步骤",
      totalDuration: "20-30分钟",
      products: [{ name: "洁面" }, { name: "磨砂膏" }, { name: "护理油" }, { name: "面霜" }, { name: "面膜" }],
      benefits: ["保湿锁水", "屏障增强", "过敏修护", "抗初老", "维稳舒缓"],
      specialSupport: "孕期、月子期、轻医美术后",
      steps: [
        {
          title: "基础净肤",
          description:
            "取适量洁面慕斯，用手温和打圈按摩全脸，随后用温水洗净；清除杂质及代谢，使肌底回归自然。",
          duration: "2分钟",
          imageUrl: "/images/ritual-step-cleanse.webp",
        },
        {
          title: "深层清理",
          description:
            "取适量磨砂膏均匀涂抹于面部，轻柔按压T区、两颊并打圈，随后用温水洗净；唤醒肌肤微循环。",
          duration: "3-5分钟",
          imageUrl: "/images/ritual-step-deep-cleanse.webp",
        },
        {
          title: "混油养肤",
          description:
            "取适量护理油及面霜，于掌心混合温热，以由下而上，由内而外的手法进行脸部及眼周按摩；确保珍贵成分能有效渗入肌肤。",
          duration: "3-5分钟",
          imageUrl: "/images/ritual-step-oil-nourish.webp",
        },
        {
          title: "膜法封存",
          description:
            "承接上个步骤，无需对面部做额外清理，将面膜完整贴合面部，静享 10-15 分钟后移除膜布；通过旎柏系产品的组合效应，实现对面部的多重修护及滋养，有效提亮肤质、增强肌肤免疫力。",
          duration: "10-15分钟",
          imageUrl: "/images/ritual-step-seal.webp",
        },
      ],
    },
    {
      id: "s2",
      name: "全身方案",
      nameEn: "FULL BODY RITUAL",
      desc: "仅需 6 个步骤",
      totalDuration: "30-45分钟",
      products: [{ name: "洁面" }, { name: "磨砂膏" }, { name: "护理油" }, { name: "面霜" }, { name: "面膜" }, { name: "身体乳" }],
      benefits: ["保湿锁水", "屏障增强", "抗初老", "维稳舒缓", "紧致提拉", "润泽提亮"],
      specialSupport: "孕期、月子期、轻医美术后",
      steps: [
        {
          title: "基础净肤",
          description:
            "取适量洁面慕斯，用手温和打圈按摩全脸，随后用温水洗净；清除杂质及代谢，使肌底回归自然。",
          duration: "2分钟",
          imageUrl: "/images/ritual-step-cleanse.webp",
        },
        {
          title: "深层清理",
          description:
            "取适量磨砂膏均匀涂抹于面部，轻柔按压T区、两颊并打圈，随后用温水洗净；唤醒肌肤微循环。",
          duration: "3-5分钟",
          imageUrl: "/images/ritual-step-deep-cleanse.webp",
        },
        {
          title: "芳香浸愈 (可选)",
          description:
            "将适量美容油滴入温热的浴缸水中。泡澡时，缓慢深呼吸，并将注意力集中在呼吸上从而放松身心。",
          duration: "15-20分钟",
          imageUrl: "/images/ritual-step-aroma.webp",
        },
        {
          title: "膜法守护",
          description:
            "取一片面膜完整贴合面部，静享 10-15 分钟后移除膜布 (可与泡澡环节同时进行)；确保珍贵成分能有效被面部吸收。",
          duration: "10-15分钟",
          imageUrl: "/images/ritual-step-seal.webp",
        },
        {
          title: "全身滋养",
          description:
            "取适量身体乳，于掌心混合温热，从四肢向心脏方向进行长推式按摩，重点护理颈部、小腿、手臂及腹部；若所处的外部环境湿度/温度较低，建议额外按照 1:5 比例混合护理油加强滋润效果。",
          duration: "5分钟",
          imageUrl: "/images/ritual-step-nourish.webp",
        },
        {
          title: "面部呵护",
          description:
            "取适量面霜，以由下至上、由内而外的手法进行全脸提拉按摩，重点按压眼周、法令纹及额头区域；确保全身及面部被完全呵护，实现更全面的修护及滋养，有效提亮肤质和弹性、延缓衰老、增强肌肤免疫力。",
          duration: "5分钟",
          imageUrl: "/images/ritual-step-revitalize.webp",
        },
      ],
    },
  ],
  professional: [
    {
      id: "p1",
      name: "面部护理套餐",
      nameEn: "FACIAL CARE",
      desc: "仅需 4 个步骤",
      totalDuration: "20-30分钟",
      products: [{ name: "洁面" }, { name: "磨砂膏" }, { name: "护理油" }, { name: "精华露" }, { name: "面霜" }, { name: "面膜" }],
      benefits: ["保湿锁水", "屏障增强", "抗初老", "修护延衰", "维稳舒缓", "紧致提拉", "润泽提亮"],
      specialSupport: "",

      steps: [
        {
          title: "基础净肤",
          description:
            "取适量洁面慕斯，用手温和打圈按摩全脸，随后用温水洗净；清除杂质及代谢，使肌底回归自然。",
          duration: "2分钟",
          imageUrl: "/images/ritual-step-cleanse.webp",
        },
        {
          title: "深层清理",
          description:
            "取适量磨砂膏均匀涂抹于面部，轻柔按压T区、两颊并打圈，随后用温水洗净；唤醒肌肤微循环。",
          duration: "3-5分钟",
          imageUrl: "/images/ritual-step-deep-cleanse.webp",
        },
        {
          title: "混油养肤",
          description:
            "取适量护理油及面霜，于掌心混合温热，以由下而上，由内而外的手法进行脸部及眼周按摩；确保珍贵成分能有效渗入肌肤。",
          duration: "3-5分钟",
          imageUrl: "/images/ritual-step-oil-nourish.webp",
        },
        {
          title: "膜法封存",
          description:
            "承接上个步骤，无需对面部做额外清理，将面膜完整贴合面部，静享 10-15 分钟后移除膜布；通过旎柏系产品的组合效应，实现对面部的多重修护及滋养，有效提亮肤质、增强肌肤免疫力。",
          duration: "10-15分钟",
          imageUrl: "/images/ritual-step-seal.webp",
        },
      ],
    },
    {
      id: "p2",
      name: "全身护理套餐",
      nameEn: "FULL BODY CARE",
      desc: "仅需 6 个步骤",
      totalDuration: "30-45分钟",
      products: [{ name: "洁面" }, { name: "磨砂膏" }, { name: "护理油" }, { name: "精华露" }, { name: "面霜" }, { name: "面膜" }, { name: "身体乳" }],
      benefits: ["保湿锁水", "屏障增强", "抗初老", "修护延衰", "维稳舒缓", "紧致提拉", "润泽提亮"],
      specialSupport: "",

      steps: [
        {
          title: "基础净肤",
          description:
            "取适量洁面慕斯，用手温和打圈按摩全脸，随后用温水洗净；清除杂质及代谢，使肌底回归自然。",
          duration: "2分钟",
          imageUrl: "/images/ritual-step-cleanse.webp",
        },
        {
          title: "深层清理",
          description:
            "取适量磨砂膏均匀涂抹于面部，轻柔按压T区、两颊并打圈，随后用温水洗净；唤醒肌肤微循环。",
          duration: "3-5分钟",
          imageUrl: "/images/ritual-step-deep-cleanse.webp",
        },
        {
          title: "芳香浸愈 (可选)",
          description:
            "将适量美容油滴入温热的浴缸水中。泡澡时，缓慢深呼吸，并将注意力集中在呼吸上从而放松身心。",
          duration: "15-20分钟",
          imageUrl: "/images/ritual-step-aroma.webp",
        },
        {
          title: "膜法守护",
          description:
            "取一片面膜完整贴合面部，静享 10-15 分钟后移除膜布 (可与泡澡环节同时进行)；确保珍贵成分能有效被面部吸收。",
          duration: "10-15分钟",
          imageUrl: "/images/ritual-step-seal.webp",
        },
        {
          title: "全身滋养",
          description:
            "取适量身体乳，于掌心混合温热，从四肢向心脏方向进行长推式按摩，重点护理颈部、小腿、手臂及腹部；若所处的外部环境湿度/温度较低，建议额外按照 1:5 比例混合护理油加强滋润效果。",
          duration: "5分钟",
          imageUrl: "/images/ritual-step-nourish.webp",
        },
        {
          title: "面部呵护",
          description:
            "取适量面霜，以由下至上、由内而外的手法进行全脸提拉按摩，重点按压眼周、法令纹及额头区域；确保全身及面部被完全呵护，实现更全面的修护及滋养，有效提亮肤质和弹性、延缓衰老、增强肌肤免疫力。",
          duration: "5分钟",
          imageUrl: "/images/ritual-step-revitalize.webp",
        },
      ],
    },
  ],
};

/** 未配置产品时的兜底（与原字符串 "洁面慕斯、面霜" 等价） */
export const defaultRelatedProducts: RitualProductRef[] = [
  { name: "洁面慕斯" },
  { name: "面霜" },
];

/** 专业水疗护理卡片（移动端/桌面端共用） */
export interface ProfessionalCard {
  title: string;
  duration: string;
  tags: string;
  image: string;
}

const professionalFaceCards: ProfessionalCard[] = [
  {
    title: "基础护理",
    duration: "45 min",
    tags: "清洁舒缓 + 特色理疗 + 锁水嫩肤",
    image: "/images/spa-basic.webp",
  },
  {
    title: "高级护理",
    duration: "60 min",
    tags: "基础护理 + 特色手法提拉",
    image: "/images/spa-advanced.webp",
  },
  {
    title: "奢华护理",
    duration: "75 min",
    tags: "高级护理 + 肩颈护理",
    image: "/images/spa-luxury.webp",
  },
];

const professionalBodyCards: ProfessionalCard[] = [
  {
    title: "基础护理",
    duration: "45 min",
    tags: "清洁舒缓 + 特色理疗 + 锁水嫩肤",
    image: "/images/body-spa-1.webp",
  },
  {
    title: "高级护理",
    duration: "60 min",
    tags: "基础护理 + 特色手法提拉",
    image: "/images/body-spa-2.webp",
  },
  {
    title: "奢华护理",
    duration: "75 min",
    tags: "高级护理 + 肩颈护理",
    image: "/images/body-spa-3.webp",
  },
];

/** 面部方案为 p1，其余为全身方案 */
export function getProfessionalCards(schemeId: string | undefined): ProfessionalCard[] {
  return schemeId === "p1" ? professionalFaceCards : professionalBodyCards;
}

/** 合作酒店 Logo 编号（首尾相接滚动用） */
export const hotelLogoNumbers = [1, 2, 3, 4, 5, 6, 7, 8, 9];
