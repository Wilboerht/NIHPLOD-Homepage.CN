"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { m, AnimatePresence, LayoutGroup } from "framer-motion";
import {
  Clock,
  Info,
  ChevronLeft,
  ChevronRight,
  Sun,
  Home,
  ShoppingBag,
  SoapDispenserDroplet,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLayout } from "@/contexts/LayoutContext";
import { DrawerPageContainer } from "@/components/ui/DrawerPageContainer";
import { ProductDrawer } from "@/components/website";
import type { ProductData } from "@/components/website/ProductDrawer";
import { getCategoryIconPath } from "@/lib/product-icons";

// 查找匹配的图标，否则使用默认图标
export const DEFAULT_ICONS = [
  // 默认瓶子1
  <svg
    key="d1"
    width="32"
    height="32"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    className="text-brand-charcoal/60"
  >
    <path d="M9 3h6v3H9V3z" />
    <path d="M8 6h8v2l2 2v8a2 2 0 01-2 2H8a2 2 0 01-2-2v-8l2-2V6z" />
  </svg>,
  // 默认瓶子2
  <svg
    key="d2"
    width="32"
    height="32"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    className="text-brand-charcoal/60"
  >
    <rect x="7" y="8" width="10" height="12" rx="2" />
    <path d="M9 4h6v4H9z" />
  </svg>,
  // 默认瓶子3
  <svg
    key="d3"
    width="32"
    height="32"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    className="text-brand-charcoal/60"
  >
    <path d="M10 4h4v2h-4z" />
    <path d="M8 6h8c1 0 2 1 2 2v10a2 2 0 01-2 2H8a2 2 0 01-2-2V8c0-1 1-2 2-2z" />
    <ellipse cx="12" cy="13" rx="3" ry="4" />
  </svg>,
];

// 模块配置 - 4个护肤仪式模块
type ModuleId = "daily" | "portable" | "spa" | "professional";

interface ModuleConfig {
  id: ModuleId;
  number: string;
  label: string;
  subtitle: string;
  description: string;
  image: string;
  icon: LucideIcon;
}

const modules: ModuleConfig[] = [
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

// 护肤步骤类型
interface RitualStep {
  title: string;
  description: string;
  duration?: string; // 时长，如 "1-2分钟"
  tips?: string; // 技巧提示
  dosage?: string; // 用量建议
  imageUrl?: string;
}

// 子方案类型 (用于 Tab 切换)
interface SubPlan {
  id: string;
  name: string; // 如 "精简方案", "外出方案"
  steps: RitualStep[];
  products?: string; // 该子方案涉及的产品
  benefits?: string[];
  specialSupport?: string;
  duration?: string;
}

// 情景类型 (如 "晨间焕活", "晚间呵护")
interface Scheme {
  id: string;
  name: string;
  tag?: string;
  desc?: string;
  steps: RitualStep[]; // 保留原有 steps，兼容没有子方案的情景
  subPlans?: SubPlan[]; // 新增：子方案列表（可选）
  totalDuration?: string;
  products?: string;
  benefits?: string[];
  specialSupport?: string;
  nameEn?: string;
  icon?: React.ReactNode;
  heroImage?: string;
}

// 模块数据类型
type ModuleData = Record<ModuleId, Scheme[]>;

// 默认模块数据
const defaultModuleData: ModuleData = {
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
      products: "洁面、面霜",
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
          products: "洁面、面霜",
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
          products: "洁面、面霜 (可选)、防晒",
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
      products: "洁面、精华露 (可选)、面膜、面霜、身体乳 (可选)",
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
      products: "护手霜、防晒",
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
      products: "洁面、面膜、防晒、护手霜",
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
      products: "护理油",
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
      products: "洁面、磨砂膏、护理油、面霜、面膜",
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
      products: "洁面、磨砂膏、护理油、面霜、面膜、身体乳",
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
      products: "洁面、磨砂膏、护理油、精华露、面霜、面膜",
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
      products: "洁面、磨砂膏、护理油、精华露、面霜、面膜、身体乳",
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

/**
 * 计算步骤总时长
 * @param steps 步骤数组
 * @returns 格式化的总时长字符串
 */
function _calculateTotalDuration(steps: RitualStep[]): string {
  let minTotal = 0;
  let maxTotal = 0;

  steps.forEach((step) => {
    if (step.duration) {
      // 解析时长字符串，如 "1-2分钟", "30秒", "10-15分钟"
      const durationStr = step.duration.replace(/分钟|秒/g, "");
      const isSeconds = step.duration.includes("秒");

      if (durationStr.includes("-")) {
        const [min, max] = durationStr.split("-").map(Number);
        if (isSeconds) {
          minTotal += min / 60;
          maxTotal += max / 60;
        } else {
          minTotal += min;
          maxTotal += max;
        }
      } else {
        const value = Number(durationStr);
        if (isSeconds) {
          minTotal += value / 60;
          maxTotal += value / 60;
        } else {
          minTotal += value;
          maxTotal += value;
        }
      }
    }
  });

  // 四舍五入
  minTotal = Math.round(minTotal);
  maxTotal = Math.round(maxTotal);

  if (minTotal === maxTotal) {
    return `约 ${minTotal} 分钟`;
  }
  return `约 ${minTotal}-${maxTotal} 分钟`;
}

/**
 * 护肤仪式页面内容组件
 * 三层级交互式布局：Level 1 模块选择 -> Level 2 方案选择 -> Level 3 详细步骤
 */
// 添加 products 到 props
interface RitualContentProps {
  products?: ProductData[];
}

export function RitualContent({ products = [] }: RitualContentProps) {
  // 当前层级: 1=模块选择, 2=方案选择, 3=步骤详情
  const [currentLevel, setCurrentLevel] = useState(1);
  // 选中的模块
  const [selectedModule, setSelectedModule] = useState<ModuleId | null>(null);
  // 选中的方案
  const [selectedScheme, setSelectedScheme] = useState<Scheme | null>(null);
  // 选中的子方案（Tab）
  const [selectedSubPlan, setSelectedSubPlan] = useState<SubPlan | null>(null);
  // 悬停的模块索引
  const { isDrawerOpen } = useLayout();
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // 轮播导航状态
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const stepsContainerRef = useRef<HTMLDivElement>(null);

  // 获取当前应该显示的步骤（优先使用子方案的步骤）
  const currentSteps = selectedSubPlan?.steps || selectedScheme?.steps || [];
  // 获取当前应该显示的产品（优先使用子方案的产品）
  const currentProducts = selectedSubPlan?.products || selectedScheme?.products || "洁面慕斯、面霜";

  // 轮播导航函数 - 滚动到指定步骤 (暂未使用，保留逻辑)
  // const scrollToStep = useCallback((index: number) => {
  //   if (!stepsContainerRef.current) return;
  //   const container = stepsContainerRef.current;
  //   const stepWidth = 260 + 52; // 卡片宽度 + 间距
  //   const scrollPosition = index * stepWidth;
  //   container.scrollTo({
  //     left: scrollPosition,
  //     behavior: "smooth"
  //   });
  //   setCurrentStepIndex(index);
  // }, []);

  // 上一步 (暂未使用，保留逻辑)
  // const goToPrevStep = useCallback(() => {
  //   if (currentStepIndex > 0) {
  //     scrollToStep(currentStepIndex - 1);
  //   }
  // }, [currentStepIndex, scrollToStep]);

  // 下一步 (暂未使用，保留逻辑)
  // const goToNextStep = useCallback((totalSteps: number) => {
  //   // 当可见区域显示约3张卡片时，最大可滚动索引为 totalSteps - 3
  //   if (currentStepIndex < totalSteps - 3) {
  //     scrollToStep(currentStepIndex + 1);
  //   }
  // }, [currentStepIndex, scrollToStep]);

  // 展开的步骤索引（用于显示技巧提示）
  const [_expandedStepIndex, _setExpandedStepIndex] = useState<number | null>(null);

  // 自动播放控制 (已禁用)
  // const [isPaused, setIsPaused] = useState(false);

  // 步骤自动轮播逻辑 (已禁用)
  // useEffect(() => {
  //   // 仅在 Level 3 的手风琴模式下运行
  //   const isAccordionMode = currentLevel === 3 && currentSteps.length > 3 && selectedModule !== "professional" && selectedModule !== "portable";

  //   if (!isAccordionMode || isPaused) return;

  //   const timer = setInterval(() => {
  //     setCurrentStepIndex((prev) => (prev + 1) % currentSteps.length);
  //   }, 3000);

  //   return () => clearInterval(timer);
  // }, [currentLevel, currentSteps.length, currentStepIndex, isPaused, selectedModule]);

  // 产品详情弹窗状态
  const [productDrawerOpen, setProductDrawerOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ProductData | null>(null);

  // 查找产品逻辑
  const findProduct = (searchTerm: string) => {
    if (!products || products.length === 0) {
      console.warn("Product list is empty.");
      return null;
    }

    // 移除空白字符并转为小写
    const term = searchTerm.trim().toLowerCase();

    // 尝试在 products 中查找匹配项
    return products.find((p) => {
      const nameMatch = p.name.toLowerCase().includes(term);
      const enNameMatch = p.nameEn?.toLowerCase().includes(term);
      const categoryMatch = p.category?.name.toLowerCase().includes(term);
      return nameMatch || enNameMatch || categoryMatch;
    });
  };

  const router = useRouter();

  // 打开产品详情弹窗
  const handleProductClick = (productName: string) => {
    const product = findProduct(productName);
    if (product) {
      // 移动端直接跳转到产品详情页，不使用抽屉
      if (typeof window !== "undefined" && window.innerWidth <= 768) {
        router.push(`/products/${product.slug}`);
        return;
      }
      setSelectedProduct(product);
      setProductDrawerOpen(true);
    } else {
      console.warn(`Product not found for: ${productName}`);
      // 如果没有找到具体产品，尝试打开一个默认的分层或提示，
      // 这里我们可以暂时设为第一个产品作为兜底（仅限开发环境调试，正式环境建议提示“暂无详情”）
      if (products && products.length > 0) {
        setSelectedProduct(products[0]);
        setProductDrawerOpen(true);
      }
    }
  };

  // 关闭产品详情弹窗
  const handleCloseProductDrawer = () => {
    setProductDrawerOpen(false);
  };

  // 使用默认数据
  const moduleData = defaultModuleData;

  // 选择模块
  const selectModule = (moduleId: ModuleId) => {
    setSelectedModule(moduleId);

    // 特殊处理：单品好物 (portable), 专业水疗 (professional) 和 居家仪式 (spa) 直接进入 Level 3
    if (moduleId === "portable" || moduleId === "professional" || moduleId === "spa") {
      const schemes = moduleData[moduleId];
      if (schemes && schemes.length > 0) {
        setSelectedScheme(schemes[0]);
        // 如果有子方案，自动选中第一个
        if (schemes[0].subPlans && schemes[0].subPlans.length > 0) {
          setSelectedSubPlan(schemes[0].subPlans[0]);
        } else {
          setSelectedSubPlan(null);
        }
        setCurrentLevel(3);
      } else {
        setCurrentLevel(2);
      }
    } else {
      setCurrentLevel(2);
    }
  };

  // 选择方案（情景）
  const selectScheme = (scheme: Scheme) => {
    setSelectedScheme(scheme);
    setCurrentStepIndex(0); // 重置轮播索引
    // 如果有子方案，自动选中第一个
    if (scheme.subPlans && scheme.subPlans.length > 0) {
      setSelectedSubPlan(scheme.subPlans[0]);
    } else {
      setSelectedSubPlan(null);
    }
    setCurrentLevel(3);
  };

  // 返回上一级
  const _goBack = () => {
    if (currentLevel === 3) {
      // 如果是单品好物、专业水疗或居家仪式，直接返回 Level 1
      if (
        selectedModule === "portable" ||
        selectedModule === "professional" ||
        selectedModule === "spa"
      ) {
        setSelectedScheme(null);
        setSelectedSubPlan(null);
        setSelectedModule(null);
        setCurrentLevel(1);
      } else {
        setSelectedScheme(null);
        setCurrentLevel(2);
      }
    } else if (currentLevel === 2) {
      setSelectedModule(null);
      setCurrentLevel(1);
    }
  };

  // 监听滚动事件，同步轮播索引 (用户手动滚动时更新)
  useEffect(() => {
    const container = stepsContainerRef.current;
    if (!container) return;

    let scrollTimeout: NodeJS.Timeout;

    const handleScroll = () => {
      // 使用防抖，避免与点击事件竞争
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        const stepWidth = 260 + 52; // 卡片宽度 + 间距
        const newIndex = Math.round(container.scrollLeft / stepWidth);
        setCurrentStepIndex(Math.max(0, newIndex));
      }, 50);
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      container.removeEventListener("scroll", handleScroll);
      clearTimeout(scrollTimeout);
    };
  }, []); // 移除 currentStepIndex 依赖，避免重复绑定

  return (
    <>
      <DrawerPageContainer wrapperClassName="!top-0 !pointer-events-none">
        {/* 矿物纹理覆盖层 */}
        <div className="texture-overlay absolute inset-0" />

        {/* 动态背景图片 */}

        <div
          className={cn(
            "flex h-full flex-col overflow-hidden transition-opacity duration-300",
            isDrawerOpen ? "opacity-100 delay-300" : "pointer-events-none opacity-0"
          )}
        >
          {/* ========== 移动端布局 - 参考 Ritual 移动端.html ========== */}
          <div className="flex h-full flex-col bg-[#FBF8F0] sm:hidden">
            {/* 移动端 Header - 完全按照 FAQ 顶部栏样式 */}
            <div className="sticky top-0 z-50 flex h-[88px] shrink-0 items-center justify-center border-b border-transparent bg-[#FBF8F0]/95 px-6 backdrop-blur-sm transition-all">
              <AnimatePresence>
                {currentLevel > 1 && (
                  <m.button
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    type="button"
                    onClick={() => {
                      if (currentLevel === 3) {
                        if (
                          selectedModule === "portable" ||
                          selectedModule === "professional" ||
                          selectedModule === "spa"
                        ) {
                          setSelectedScheme(null);
                          setSelectedSubPlan(null);
                          setSelectedModule(null);
                          setCurrentLevel(1);
                        } else {
                          setSelectedScheme(null);
                          setCurrentLevel(2);
                        }
                      } else if (currentLevel === 2) {
                        setSelectedModule(null);
                        setCurrentLevel(1);
                      }
                    }}
                    className="absolute left-6 flex h-full items-center text-[#00263E]/60 active:text-[#00263E]"
                  >
                    <ChevronLeft className="h-6 w-6" />
                  </m.button>
                )}
              </AnimatePresence>
              <Link href="/" className="mt-1 flex items-center justify-center">
                <div className="relative h-[28px] w-[100px]">
                  <Image
                    src="/images/NIHPLOD-logo.svg"
                    alt="NIHPLOD"
                    fill
                    className="object-contain"
                    priority
                  />
                </div>
              </Link>
              {/* Texture Overlay for Header to match body */}
              <div className="texture-overlay absolute inset-0 z-[-1]" />
            </div>

            {/* 移动端内容区域 - 隐藏滚动条并移除多余 padding */}
            <div
              className={cn(
                "relative z-10 flex-1 overflow-y-auto px-7 pb-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
                currentLevel === 1 && "flex flex-col"
              )}
            >
              <AnimatePresence mode="wait">
                {/* Level 1: 模块选择 - 2x2 精致网格 */}
                {currentLevel === 1 && (
                  <m.div
                    key="mobile-l1"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 1.05 }}
                    transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                    className="flex flex-1 flex-col justify-start"
                  >
                    <div className="mb-7 flex flex-col items-center pb-2 pt-2">
                      <h1
                        className="text-[24px] font-medium tracking-[0.2em] text-[#00263E]"
                        style={{ fontFamily: "'Source Han Sans SC', 'PingFang SC', sans-serif" }}
                      >
                        护肤仪式指南
                      </h1>
                      <div className="mt-2 w-[70px] border-b-[1.5px] border-[#00263E]" />
                    </div>

                    <div className="grid flex-1 grid-cols-2 grid-rows-2 gap-4">
                      {modules.map((module, index) => (
                        <m.button
                          key={module.id}
                          whileTap={{ scale: 0.96 }}
                          initial={{ opacity: 0, y: 20 }}
                          whileInView={{ opacity: 1, y: 0 }}
                          viewport={{ once: true, margin: "-20px" }}
                          transition={{ delay: index * 0.1 }}
                          onClick={() => selectModule(module.id)}
                          className="relative flex h-full flex-col justify-end overflow-hidden rounded-[2rem] border border-[#00263E]/15 bg-[#FCF9F2] p-5 pb-6 text-left shadow-[0_8px_32px_-4px_rgba(0,38,62,0.06)] transition-all active:scale-[0.98]"
                        >
                          <div className="relative z-10 flex flex-col">
                            <div className="mb-4">
                              <module.icon className="h-8 w-8 text-[#4A6272]" strokeWidth={1} />
                            </div>
                            <span className="text-lg font-medium tracking-wide text-[#00263E]">
                              {module.label}
                            </span>
                            <div className="mt-3 h-[1px] w-8 bg-[#4A6272]/30" />
                          </div>
                        </m.button>
                      ))}
                    </div>
                  </m.div>
                )}

                {/* Level 2: 方案选择 - 紧凑型精选列表 */}
                {currentLevel === 2 && selectedModule && (
                  <m.div
                    key="mobile-l2"
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 1.02 }}
                    className="flex h-full flex-col overflow-hidden py-2"
                  >
                    <div className="flex flex-1 flex-col justify-center">
                      {/* 标题部分 - 与卡片组统一居中，避免大屏幕下方空洞 */}
                      <div className="mb-6 shrink-0 text-center">
                        <h2 className="text-2xl font-medium tracking-widest text-[#00263E]">
                          {modules.find((m) => m.id === selectedModule)?.label}
                        </h2>
                        <div className="mt-2 flex justify-center">
                          <div className="h-0.5 w-8 rounded-full bg-[#4A6272]/20" />
                        </div>
                      </div>

                      {/* 模块引导文案 */}
                      <div className="mb-6 px-4 text-center">
                        <p className="text-sm font-light leading-relaxed tracking-wide text-[#00263E]/50">
                          在繁忙日常中，为肌肤预留一段专属的精简时光。告别繁琐，轻松护理。
                        </p>
                      </div>

                      <div className="flex flex-col gap-3">
                        {moduleData[selectedModule].map((scheme, idx) => (
                          <m.button
                            key={scheme.id}
                            initial={{ opacity: 0, x: -20 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            viewport={{ once: true, margin: "-10px" }}
                            transition={{ duration: 0.4, delay: idx * 0.08, ease: "easeOut" }}
                            onClick={() => selectScheme(scheme)}
                            className="group relative flex items-center overflow-hidden rounded-2xl border border-[#00263E]/5 bg-white px-5 py-5 shadow-[0_4px_20px_-4px_rgba(0,38,62,0.03)] transition-all duration-300 active:scale-[0.98]"
                          >
                            {/* 左侧装饰线 */}
                            <div className="mr-4 h-10 w-[3px] shrink-0 rounded-full bg-[#4A6272]/20 transition-colors group-active:bg-[#4A6272]/40" />

                            {/* 中间内容：标题 + 时长 */}
                            <div className="flex min-w-0 flex-1 flex-col gap-1.5 text-left">
                              <h3 className="truncate text-lg font-medium tracking-wider text-[#00263E]">
                                {scheme.name}
                              </h3>
                              <div className="flex items-center gap-1.5">
                                <Clock className="h-3 w-3 text-[#4A6272]/60" />
                                <span className="text-[11px] font-medium text-[#4A6272]/80">
                                  {scheme.totalDuration || "15分钟"}
                                </span>
                              </div>
                            </div>

                            {/* 右侧箭头 */}
                            <ChevronRight className="ml-3 h-5 w-5 shrink-0 text-[#4A6272]/30 transition-colors group-active:text-[#4A6272]" />
                          </m.button>
                        ))}
                      </div>

                      {/* AI 护肤顾问引导 */}
                      <div className="mt-6 text-center">
                        <a
                          href="https://advisor.nihplod.cn"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-sm font-light leading-relaxed tracking-wide text-[#4A6272] transition-opacity hover:underline active:opacity-70"
                        >
                          精简护肤，从了解自己的肌肤开始 <span>→</span>
                        </a>
                      </div>
                    </div>

                    {/* 底部微调留白，确保不贴底 */}
                    <div className="h-6 shrink-0" />
                  </m.div>
                )}

                {/* Level 3: 步骤详情 - 垂直精修指南 */}
                {currentLevel === 3 && selectedScheme && (
                  <m.div
                    key="mobile-l3"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="flex flex-col py-2"
                  >
                    {/* Level 3: Mobile Scheme Switcher Tabs (Only for Professional/Spa/Portable) */}
                    {((selectedScheme.subPlans && selectedScheme.subPlans.length > 1) ||
                      (selectedModule &&
                        ["portable", "professional", "spa"].includes(selectedModule) &&
                        moduleData[selectedModule].length > 1)) && (
                      <div className="relative mb-10 flex w-full max-w-[400px] flex-col items-center px-6">
                        <div className="flex w-full items-center rounded-full bg-[#00263E]/[0.05] p-1">
                          <LayoutGroup id={`mobile-tab-${selectedModule}`}>
                            {/* 1. subPlans existing condition (such as daily) */}
                            {selectedScheme.subPlans && selectedScheme.subPlans.length > 0
                              ? selectedScheme.subPlans.map((subPlan) => {
                                  const isActive = selectedSubPlan?.id === subPlan.id;
                                  return (
                                    <button
                                      key={subPlan.id}
                                      onClick={() => {
                                        setSelectedSubPlan(subPlan);
                                        setCurrentStepIndex(0);
                                      }}
                                      className={cn(
                                        "relative flex min-h-0 min-w-0 flex-1 items-center justify-center rounded-full py-2.5 transition-colors duration-300",
                                        isActive
                                          ? "font-semibold text-[#00263E]"
                                          : "text-[#00263E]/40 hover:text-[#00263E]/65"
                                      )}
                                    >
                                      <span className="relative z-10 whitespace-nowrap text-[13px] tracking-wider">
                                        {subPlan.name}
                                      </span>
                                      {isActive && (
                                        <m.div
                                          layoutId={`active-mobile-tab-${selectedModule}`}
                                          className="absolute inset-0 rounded-full bg-white shadow-sm ring-1 ring-black/5"
                                          initial={false}
                                          transition={{
                                            type: "spring",
                                            stiffness: 400,
                                            damping: 30,
                                          }}
                                        />
                                      )}
                                    </button>
                                  );
                                })
                              : /* 2. Scheme level switching (for portable, professional, spa in level 3) */
                                selectedModule &&
                                ["portable", "professional", "spa"].includes(selectedModule) &&
                                moduleData[selectedModule].map((scheme) => {
                                  const isActive = scheme.id === selectedScheme.id;
                                  return (
                                    <button
                                      key={scheme.id}
                                      onClick={() => selectScheme(scheme)}
                                      className={cn(
                                        "relative flex min-h-0 min-w-0 flex-1 items-center justify-center rounded-full py-2.5 transition-colors duration-300",
                                        isActive
                                          ? "font-semibold text-[#00263E]"
                                          : "text-[#00263E]/40 hover:text-[#00263E]/65"
                                      )}
                                    >
                                      <span className="relative z-10 whitespace-nowrap text-[13px] tracking-wider">
                                        {scheme.name}
                                      </span>
                                      {isActive && (
                                        <m.div
                                          layoutId={`active-mobile-tab-${selectedModule}`}
                                          className="absolute inset-0 rounded-full bg-white shadow-sm ring-1 ring-black/5"
                                          initial={false}
                                          transition={{
                                            type: "spring",
                                            stiffness: 400,
                                            damping: 30,
                                          }}
                                        />
                                      )}
                                    </button>
                                  );
                                })}
                          </LayoutGroup>
                        </div>
                      </div>
                    )}
                    {/* 顶部概览信息 (隐藏于 portable) */}
                    {selectedModule !== "portable" ? (
                      <div className="mb-10 flex flex-col items-center">
                        <div className="mb-6 text-center">
                          <h2 className="text-3xl font-medium tracking-widest text-[#00263E]">
                            {selectedScheme.name}
                          </h2>

                          {/* 相关产品 - 横向滑动卡片 (Moved here) */}
                          <div className="mb-2 mt-6 w-full">
                            <div className="mb-4 flex items-center justify-center gap-3">
                              <div className="h-px w-8 bg-[#00263E]/10" />
                              <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-[#00263E]/40">
                                相关产品
                              </span>
                              <div className="h-px w-8 bg-[#00263E]/10" />
                            </div>
                            <div className="w-full px-6 text-center">
                              <div className="flex flex-wrap justify-center gap-x-8 gap-y-6 pb-4">
                                {currentProducts.split("、").map((product, index) => {
                                  const isOptional = product.includes("(可选)");
                                  const cleanName = product.replace("(可选)", "").trim();

                                  return (
                                    <button
                                      key={product}
                                      type="button"
                                      onClick={() => handleProductClick(cleanName)}
                                      className="flex flex-col items-center gap-2"
                                    >
                                      <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-[#00263E]/5 bg-white shadow-[0_2px_8px_-2px_rgba(0,38,62,0.06)] transition-transform active:scale-95">
                                        <div className="flex h-10 w-10 items-center justify-center">
                                          {getCategoryIconPath(cleanName) ? (
                                            <Image
                                              src={getCategoryIconPath(cleanName)!}
                                              alt={cleanName}
                                              width={40}
                                              height={40}
                                              className="h-10 w-10"
                                            />
                                          ) : (
                                            DEFAULT_ICONS[index % DEFAULT_ICONS.length]
                                          )}
                                        </div>
                                      </div>
                                      <div className="flex flex-col items-center">
                                        <span className="whitespace-nowrap text-[11px] font-medium tracking-widest text-[#00263E]/70">
                                          {cleanName}
                                        </span>
                                        {isOptional && (
                                          <span className="text-[9px] tracking-wider text-[#00263E]/40">
                                            可选
                                          </span>
                                        )}
                                      </div>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          </div>

                          <div className="mt-8 flex items-center justify-center gap-6">
                            <div className="flex flex-col items-center">
                              <span className="mb-1 text-[10px] uppercase tracking-widest text-[#4A6272]/60">
                                预计时长
                              </span>
                              <span className="text-[14px] font-medium text-[#00263E]">
                                {selectedScheme.totalDuration?.replace("min", "分钟") ||
                                  "15-20 分钟"}
                              </span>
                            </div>
                            <div className="h-6 w-px bg-[#00263E]/5" />
                            <div className="flex flex-col items-center">
                              <span className="mb-1 text-[10px] uppercase tracking-widest text-[#4A6272]/60">
                                护理阶段
                              </span>
                              <span className="text-[14px] font-medium text-[#00263E]">
                                {currentSteps.length} 个核心步骤
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="mb-4">
                        <h2 className="text-3xl font-medium tracking-widest text-[#00263E]">
                          {selectedScheme.name}
                        </h2>
                        <span className="mt-2 inline-block font-serif text-[10px] uppercase tracking-[0.2em] text-[#4A6272]">
                          {selectedScheme.nameEn}
                        </span>
                      </div>
                    )}

                    {/* Content Rendering based on Module */}
                    {selectedModule === "portable" ? (
                      // Portable Module Layout
                      <div className="animate-in fade-in slide-in-from-bottom-4 flex flex-col duration-500">
                        {/* Hero Image */}
                        <div className="relative mb-6 aspect-[4/3] w-full overflow-hidden rounded-2xl shadow-sm">
                          <Image
                            src={selectedScheme.heroImage || "/images/portable-hero-update.webp"}
                            alt={selectedScheme.name}
                            fill
                            className="object-cover"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-[#00263E]/80 via-transparent to-transparent opacity-80" />
                          <div className="absolute bottom-4 left-4 right-4 flex flex-col gap-1.5">
                            <div className="flex items-center gap-2">
                              {selectedScheme.benefits?.slice(0, 3).map((benefit, i) => (
                                <span
                                  key={i}
                                  className="rounded-full border border-white/30 bg-white/20 px-2 py-0.5 text-[10px] font-light tracking-widest text-white backdrop-blur-md"
                                >
                                  {benefit}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* Description Content */}
                        <div className="px-2">
                          <p className="relative mb-8 text-sm font-light leading-[1.8] text-[#00263E]/80">
                            <span className="absolute -left-3 -top-2 font-serif text-3xl text-[#4A6272]/20">
                              "
                            </span>
                            {selectedScheme.desc}
                            <span className="absolute -right-1 bottom-0 translate-y-1 font-serif text-3xl text-[#4A6272]/20">
                              "
                            </span>
                          </p>

                          {/* Products Meta */}
                          <div className="flex flex-col gap-3 border-t border-[#00263E]/10 py-4">
                            <span className="text-[10px] font-medium uppercase tracking-widest text-[#4A6272]/80">
                              核心单品搭配
                            </span>
                            <div className="flex flex-wrap gap-2">
                              {selectedScheme.products?.split("、").map((prod, i) => (
                                <div
                                  key={i}
                                  className="flex items-center gap-1.5 rounded-md border border-[#00263E]/5 bg-white px-3 py-1.5 shadow-sm"
                                >
                                  <div className="h-1.5 w-1.5 rounded-full bg-[#4A6272]/40" />
                                  <span className="text-xs text-[#00263E]/90">{prod}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : selectedModule === "professional" ? (
                      <div className="animate-in fade-in flex w-full flex-col pb-6 duration-500">
                        <div className="mb-2 flex items-center gap-3 px-1">
                          <h2 className="text-[26px] font-normal tracking-wide text-[#00263E]">
                            {selectedScheme?.id === "p1" ? "面部方案" : "全身方案"}
                          </h2>
                          <span className="rounded-sm bg-[#E6DCC3] px-1.5 py-0.5 text-[10px] font-medium text-[#00263E]">
                            招牌
                          </span>
                        </div>
                        <div className="mb-8 flex flex-col px-1">
                          <h3 className="mb-3 font-sans text-xs font-light tracking-[0.1em] text-[#00263E]/60">
                            {selectedScheme?.id === "p1" ? "SKIN CARE" : "BODY CARE"}
                          </h3>
                        </div>

                        {/* 中间卡片区 - 纵向列表 */}
                        <div className="mb-12 flex flex-col gap-6">
                          {(selectedScheme?.id === "p1"
                            ? // 面部方案
                              [
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
                              ]
                            : // 全身方案
                              [
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
                              ]
                          ).map((item, idx) => (
                            <div
                              key={idx}
                              className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-[#00263E]/5 shadow-sm"
                            >
                              <Image
                                src={item.image}
                                alt={item.title}
                                fill
                                className="z-0 object-cover"
                              />
                              {/* 渐变遮罩 */}
                              <div className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
                              {/* 文字内容 */}
                              <div className="pointer-events-none absolute bottom-0 left-0 z-20 flex w-full flex-col gap-3 p-5">
                                <div className="flex items-baseline gap-2 text-white">
                                  <h4 className="text-[22px] font-normal tracking-wide text-white drop-shadow-sm">
                                    {item.title}
                                  </h4>
                                  <span className="mx-0.5 text-sm font-light text-white/80">/</span>
                                  <span className="font-sans text-[16px] font-light tracking-wide text-white/90 drop-shadow-sm">
                                    {item.duration}
                                  </span>
                                </div>
                                <div>
                                  <span className="inline-block rounded-full border border-white/60 bg-white/10 px-3 py-1.5 text-[11px] font-light tracking-wider text-white/90 shadow-sm backdrop-blur-md">
                                    {item.tags}
                                  </span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* 底部 Logo 栏 - 无限滚动 */}
                        <div className="relative -mx-5 overflow-hidden border-t border-[#00263E]/10 px-5 pb-4 pt-6">
                          {/* 左侧渐变遮罩 */}
                          <div className="pointer-events-none absolute bottom-0 left-0 top-0 z-10 w-8 bg-gradient-to-r from-[#FBF8F0] to-transparent" />
                          {/* 右侧渐变遮罩 */}
                          <div className="pointer-events-none absolute bottom-0 right-0 top-0 z-10 w-8 bg-gradient-to-l from-[#FBF8F0] to-transparent" />

                          {/* 滚动容器 */}
                          <div className="flex w-max animate-marquee items-center">
                            {/* 第一组 Logo */}
                            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                              <div
                                key={`logo-m-a-${num}`}
                                className="mx-4 flex h-[28px] flex-shrink-0 items-center justify-center"
                              >
                                <Image
                                  src={`/images/hotels/hotel${num}.svg`}
                                  alt={`Hotel Partner ${num}`}
                                  width={90}
                                  height={20}
                                  className="h-[28px] w-auto object-contain opacity-70 mix-blend-multiply"
                                  style={{ maxHeight: "28px" }}
                                />
                              </div>
                            ))}
                            {/* 第二组 Logo (无缝循环) */}
                            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                              <div
                                key={`logo-m-b-${num}`}
                                className="mx-4 flex h-[28px] flex-shrink-0 items-center justify-center"
                              >
                                <Image
                                  src={`/images/hotels/hotel${num}.svg`}
                                  alt={`Hotel Partner ${num}`}
                                  width={90}
                                  height={20}
                                  className="h-[28px] w-auto object-contain opacity-70 mix-blend-multiply"
                                  style={{ maxHeight: "28px" }}
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* Regular Steps Waterfall Layout (daily, spa) */
                      <div className="space-y-10 sm:space-y-12">
                        {currentSteps.map((step, index) => (
                          <div key={index} className="group relative flex flex-col">
                            {/* 图片展示区 + 胶囊定位容器 */}
                            <div className="relative mb-5 sm:mb-7">
                              {/* 步骤胶囊 - 挂在卡片顶部正中间 */}
                              <div className="absolute left-1/2 top-0 z-20 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center whitespace-nowrap rounded-full border border-[#00263E]/20 bg-[#FBF8F0] px-4 py-1 text-xs font-medium tracking-widest text-[#00263E] shadow-sm">
                                步骤 {String(index + 1).padStart(2, "0")}
                              </div>
                              {/* 图片展示区 - 极简白背景 */}
                              <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-white shadow-[0_4px_25px_-5px_rgba(0,38,62,0.04)] transition-transform duration-500 group-active:scale-[0.99] sm:aspect-square sm:rounded-[2rem]">
                                <Image
                                  src={step.imageUrl || "/images/ritual-step-placeholder.webp"}
                                  alt={step.title}
                                  fill
                                  className="object-contain p-4 mix-blend-multiply sm:p-8"
                                />
                              </div>
                            </div>

                            {/* 文本描述区 */}
                            <div className="px-1 sm:px-3">
                              <h4 className="mb-3 text-center text-lg font-medium tracking-wide text-[#00263E] sm:text-xl">
                                {step.title}
                              </h4>
                              <p className="text-left text-[13px] font-light leading-[1.8] text-[#00263E]/60 sm:text-[14px]">
                                {step.description}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* 底部仪式感收尾 & 认证 */}
                    <div className="mt-4 flex flex-col items-center pb-10 text-center sm:mt-12">
                      <div className="mb-5 h-px w-12 bg-[#4A6272]/20 sm:mb-10" />
                      {selectedModule !== "portable" && (
                        <div className="mb-4 flex flex-col items-center gap-7 sm:gap-14">
                          {/* 核心优势 */}
                          <div className="flex w-full flex-col items-center gap-3">
                            <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-[#00263E]/40">
                              核心优势
                            </span>
                            <div className="flex w-full flex-wrap justify-center gap-2 px-4">
                              {(
                                selectedSubPlan?.benefits ||
                                selectedScheme.benefits || ["保湿锁水", "屏障增强"]
                              ).map((tag) => (
                                <div
                                  key={tag}
                                  className="flex items-center gap-1.5 rounded-full border border-[#4A6272]/10 bg-[#4A6272]/5 px-3 py-1"
                                >
                                  <span className="text-[9px] text-[#4A6272]/60">✦</span>
                                  <span className="text-[11px] font-light tracking-widest text-[#00263E]/70">
                                    {tag}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>

                          {(() => {
                            const supportText =
                              selectedSubPlan?.specialSupport !== undefined
                                ? selectedSubPlan.specialSupport
                                : (selectedScheme.specialSupport ?? "孕期、月子期、轻医美术后");
                            if (!supportText) return null;
                            const isRestricted = supportText.includes("不支持");
                            return (
                              <div className="flex w-full flex-col items-center gap-3 px-6">
                                <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-[#00263E]/40">
                                  特殊时期支持
                                </span>
                                <div
                                  className={cn(
                                    "inline-flex items-center gap-2 rounded-lg border px-4 py-2",
                                    isRestricted
                                      ? "border-orange-900/10 bg-orange-50/30"
                                      : "border-[#4A6272]/10 bg-[#4A6272]/[0.03]"
                                  )}
                                >
                                  <Info
                                    className={cn(
                                      "h-3.5 w-3.5",
                                      isRestricted ? "text-orange-900/40" : "text-[#4A6272]/40"
                                    )}
                                  />
                                  <span
                                    className={cn(
                                      "text-[11px] font-light tracking-widest",
                                      isRestricted ? "text-orange-900/70" : "text-[#00263E]/60"
                                    )}
                                  >
                                    {supportText}
                                  </span>
                                </div>
                              </div>
                            );
                          })()}

                          {/* Certifications (Quality Endorsement) */}
                          <div className="flex flex-col items-center gap-3">
                            <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-[#00263E]/40">
                              检测认证
                            </span>
                            <div className="flex items-center gap-6 opacity-60 mix-blend-multiply">
                              <Image
                                src="/images/sgs.svg"
                                alt="SGS"
                                width={18}
                                height={18}
                                className="h-[18px] w-auto"
                              />
                              <Image
                                src="/images/intertek-logo.svg"
                                alt="Intertek"
                                width={18}
                                height={18}
                                className="h-[16px] w-auto"
                              />
                            </div>
                          </div>

                          {/* 专业门店入驻提醒 - 特殊移动端位置 */}
                          {selectedModule === "professional" && (
                            <div className="mt-2 flex items-start rounded-xl border border-[#4A6272]/10 bg-[#4A6272]/5 p-4 text-left">
                              <Info className="mr-2 mt-0.5 h-4 w-4 shrink-0 text-[#4A6272]/60" />
                              <p className="text-[12px] font-light leading-[1.6] tracking-wide text-[#00263E]/70">
                                找不到您所在城市的门店？银卡级别以上会员可
                                <span
                                  onClick={() => router.push("/contact?type=cooperation")}
                                  className="mx-1 cursor-pointer font-medium text-[#4A6272] underline decoration-[#4A6272]/40 underline-offset-2 active:opacity-70"
                                >
                                  申请入驻
                                </span>
                                您所在的城市。
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                      <button
                        onClick={() => {
                          setSelectedScheme(null);
                          setSelectedModule(null);
                          setCurrentLevel(1);
                        }}
                        className={cn(
                          "mt-6 w-full max-w-[280px] rounded-full py-3.5 text-[13px] font-medium tracking-[0.2em] transition-all duration-300 sm:mt-8 sm:py-4",
                          "border border-[#4A6272]/30 bg-brand-primary/15 text-[#4A6272] shadow-[0_4px_15px_-3px_rgba(0,38,62,0.1)] backdrop-blur-[4px]",
                          "active:scale-[0.97] active:bg-brand-primary/25"
                        )}
                      >
                        <div className="-ml-1 flex items-center justify-center gap-1.5">
                          <ChevronLeft className="h-4 w-4" strokeWidth={2.5} />
                          <span>返回</span>
                        </div>
                      </button>
                    </div>
                  </m.div>
                )}
              </AnimatePresence>
            </div>

            {/* 移动端版权信息 - 紧凑型固定底栏 */}
            <footer className="relative z-20 flex shrink-0 flex-col items-center py-4">
              <p className="text-[10px] font-light tracking-widest text-brand-charcoal/60">
                &copy; {new Date().getFullYear()} NIHPLOD. All Rights Reserved.
              </p>
            </footer>
          </div>

          {/* ========== 桌面端布局 - 保持原有样式 ========== */}
          <div className="hidden h-full flex-col sm:flex">
            {/* 顶部栏：LOGO + 面包屑/用户按钮 */}
            <div className="flex h-[88px] flex-shrink-0 items-center justify-between border-b border-brand-charcoal/[0.05] px-10 xl:px-[8%]">
              {/* 左侧：LOGO - 点击返回 Level 1 */}
              <button
                type="button"
                onClick={() => {
                  setCurrentLevel(1);
                  setSelectedModule(null);
                  setSelectedScheme(null);
                }}
                className="block opacity-90 transition-opacity hover:opacity-70"
              >
                <div className="relative h-9 w-[150px]">
                  <Image
                    src="/images/NIHPLOD-logo.svg"
                    alt="NIHPLOD"
                    fill
                    className="object-contain object-left"
                    priority
                  />
                </div>
              </button>

              {/* 右侧：Level 1 显示用户按钮，Level 2/3 显示面包屑 */}
              <AnimatePresence mode="wait">
                {currentLevel === 1 ? (
                  <m.div
                    key="user-button"
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <div className="w-24" />
                  </m.div>
                ) : currentLevel >= 2 ? (
                  <m.nav
                    key="breadcrumb"
                    className="flex items-center gap-2 text-sm text-brand-charcoal/50"
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setCurrentLevel(1);
                        setSelectedModule(null);
                        setSelectedScheme(null);
                      }}
                      className="group flex items-center gap-1.5 text-sm font-medium tracking-wide text-brand-charcoal/50 transition-colors hover:text-brand-charcoal"
                    >
                      <ChevronLeft className="h-3.5 w-3.5 transition-transform duration-300 group-hover:-translate-x-0.5" />
                      <span>返回</span>
                    </button>
                  </m.nav>
                ) : null}
              </AnimatePresence>
            </div>

            {/* 视口容器 - 三层级切换 */}
            <div className="relative flex-1 overflow-hidden">
              {/* Level 1: 垂直模块面板 - 桌面端水平排列 */}
              <AnimatePresence mode="wait">
                {currentLevel === 1 && (
                  <m.div
                    key="level1"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, x: -30 }}
                    transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                    className="absolute inset-0 flex items-center justify-center overflow-visible px-10 xl:px-[8%]"
                  >
                    <div className="flex h-full w-full flex-row gap-8 py-8 xl:py-14">
                      {modules.map((module, index) => (
                        <m.button
                          key={module.id}
                          type="button"
                          onClick={() => selectModule(module.id)}
                          onMouseEnter={() => setHoveredIndex(index)}
                          onMouseLeave={() => setHoveredIndex(null)}
                          className="group relative flex flex-1 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-2xl border border-[#00263E]/15 bg-[#FCF9F2] shadow-sm transition-all duration-500 hover:border-[#00263e]/30"
                          initial={{ opacity: 0, y: 15 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{
                            duration: 0.7,
                            delay: 0.1 + index * 0.05,
                            ease: [0.16, 1, 0.3, 1],
                          }}
                        >
                          {/* 内容区域 - 居中展示 */}
                          <div className="relative z-10 flex w-full flex-col items-center justify-center p-8 text-center text-[#00263e]">
                            {/* 模块图标 */}
                            <div className="mb-8 transition-transform duration-500 group-hover:scale-110">
                              <module.icon
                                className="h-12 w-12 text-brand-charcoal-light group-hover:text-brand-charcoal"
                                strokeWidth={1}
                              />
                            </div>

                            {/* 标题 */}
                            <h2 className="mb-4 font-sans text-2xl font-light tracking-wide text-brand-charcoal lg:text-3xl">
                              {module.label}
                            </h2>

                            {/* 描述/副标题 */}
                            <p className="max-w-[220px] text-xs font-light leading-relaxed tracking-wide text-brand-charcoal/80 transition-opacity duration-300 group-hover:opacity-100 lg:text-sm">
                              {module.description}
                            </p>

                            {/* 装饰线 - hover时变宽 */}
                            <div className="mt-8 h-[1px] w-12 bg-[#4A6272]/30 transition-all duration-700 ease-out group-hover:w-20 group-hover:bg-[#4A6272]/40" />
                          </div>
                        </m.button>
                      ))}
                    </div>
                  </m.div>
                )}

                {/* Level 2: 方案选择 - 桌面端 Bento Box 布局 */}
                {currentLevel === 2 && selectedModule && (
                  <m.div
                    key="level2"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                    className="absolute inset-0 flex items-center justify-center overflow-visible p-5"
                  >
                    <div className="flex w-full max-w-5xl items-center justify-center gap-8 lg:gap-12">
                      {moduleData[selectedModule].map((scheme, index) => (
                        <m.button
                          key={scheme.id}
                          type="button"
                          onClick={() => selectScheme(scheme)}
                          onMouseEnter={() => setHoveredIndex(index)}
                          onMouseLeave={() => setHoveredIndex(null)}
                          className={cn(
                            // Bento Box 样式：正方形卡片，宽高固定
                            "group relative flex aspect-square w-full max-w-[320px] cursor-pointer flex-col items-center justify-center overflow-hidden rounded-2xl border-0 shadow-sm transition-all duration-500 active:scale-[0.98]",
                            hoveredIndex === index
                              ? "scale-[1.03] bg-[#FCF9F2] shadow-xl ring-1 ring-brand-charcoal/10"
                              : "bg-[#FCF9F2]/70 hover:bg-[#FCF9F2]/90 hover:shadow-md"
                          )}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 20 }}
                          transition={{ duration: 0.5, delay: index * 0.1 }}
                        >
                          {/* 标签 - 仅存在时显示 */}
                          {scheme.tag && (
                            <span className="mb-6 rounded-full border border-brand-charcoal/20 px-4 py-1 text-[11px] tracking-widest text-brand-charcoal/60">
                              {scheme.tag}
                            </span>
                          )}

                          {/* 图标 - 仅存在时显示 */}
                          {scheme.icon && (
                            <div className="mb-6 text-brand-charcoal/80 [&>svg]:h-14 [&>svg]:w-14 [&>svg]:stroke-[1.2]">
                              {scheme.icon}
                            </div>
                          )}

                          {/* 标题 */}
                          <h3 className="font-display mb-6 text-center text-2xl font-light tracking-widest text-brand-charcoal">
                            {scheme.name}
                          </h3>

                          {/* 英文标题 (如果有) */}
                          {scheme.nameEn && (
                            <span className="mb-6 text-[10px] uppercase tracking-[0.2em] text-brand-charcoal/50">
                              {scheme.nameEn}
                            </span>
                          )}

                          {/* 分隔线 - 仅在有描述时显示 */}
                          {scheme.desc && <div className="mb-6 h-px w-12 bg-brand-charcoal/10" />}

                          {/* 描述文字 - 仅在有描述时显示 */}
                          {scheme.desc && (
                            <p className="mb-8 max-w-[260px] text-center text-sm leading-relaxed text-brand-charcoal/70">
                              {scheme.desc}
                            </p>
                          )}

                          {/* 预计用时 */}
                          <div className="flex items-center gap-2 rounded-full bg-brand-charcoal/5 px-4 py-1.5 text-xs text-brand-charcoal/50 transition-colors group-hover:bg-brand-charcoal/10 group-hover:text-brand-charcoal/70">
                            <Clock className="h-3.5 w-3.5" />
                            <span>预计用时 {scheme.totalDuration}</span>
                          </div>
                        </m.button>
                      ))}
                    </div>
                  </m.div>
                )}

                {/* Level 3: 详细步骤 - 桌面端左右分栏 */}
                {currentLevel === 3 && selectedScheme && selectedModule && (
                  <m.div
                    key="level3"
                    initial={{ opacity: 0, x: 50 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -30 }}
                    transition={{ duration: 0.7, ease: [0.19, 1, 0.22, 1] }}
                    className="absolute inset-0 flex flex-col overflow-hidden px-10 xl:px-[8%]"
                  >
                    <div className="flex h-full w-full flex-col justify-center">
                      {/* Level 3 Header: 标题与切换器 */}
                      <header className="mb-8 flex flex-shrink-0 items-end justify-between border-b border-brand-charcoal/10 pb-5">
                        {/* 左侧标题组 */}
                        <div className="flex flex-row items-end gap-5">
                          <h1 className="font-sans text-[48px] font-light leading-none tracking-wide text-brand-charcoal">
                            {selectedModule === "portable" || selectedModule === "professional"
                              ? modules.find((m) => m.id === selectedModule)?.label
                              : selectedScheme.name}
                          </h1>
                          {selectedModule !== "portable" && selectedModule !== "professional" && (
                            <div className="flex items-center justify-center gap-1.5 rounded-full border border-[#00263e]/25 bg-white/50 px-3 py-1">
                              <Clock className="h-3 w-3 text-brand-charcoal/60" />
                              <span className="font-sans text-xs tabular-nums tracking-widest text-brand-charcoal/70">
                                {selectedScheme.totalDuration || "5-10分钟"}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* 右侧切换器 - subPlan Tab 或 scheme 切换（优雅日常无subPlans时隐藏） */}
                        {/* Tab navigation */}
                        {selectedScheme.subPlans && selectedScheme.subPlans.length > 0 ? (
                          <nav className="flex items-center gap-1 rounded-full bg-brand-charcoal/5 p-1">
                            <LayoutGroup id={`tab-${selectedModule}`}>
                              {/* 显示子方案 Tab */}
                              {selectedScheme.subPlans.map((subPlan) => {
                                const isActive = selectedSubPlan?.id === subPlan.id;
                                return (
                                  <button
                                    key={subPlan.id}
                                    type="button"
                                    onClick={() => {
                                      setSelectedSubPlan(subPlan);
                                      setCurrentStepIndex(0);
                                    }}
                                    className={cn(
                                      "relative rounded-full px-6 py-1.5 text-[13px] tracking-widest transition-colors duration-300",
                                      isActive
                                        ? "font-medium text-brand-charcoal"
                                        : "text-brand-charcoal/50 hover:text-brand-charcoal/80"
                                    )}
                                  >
                                    <span className="relative z-10">{subPlan.name}</span>
                                    {isActive && (
                                      <m.div
                                        layoutId={`activeTabBackground-${selectedModule}`}
                                        className="absolute inset-0 rounded-full bg-white shadow-sm ring-1 ring-black/5"
                                        initial={false}
                                        transition={{ type: "spring", stiffness: 400, damping: 30 }}
                                      />
                                    )}
                                  </button>
                                );
                              })}
                            </LayoutGroup>
                          </nav>
                        ) : (
                          selectedModule !== "daily" && (
                            /* 非"优雅日常"模块：显示情景切换 Tab */
                            <nav className="flex items-center gap-1 rounded-full bg-brand-charcoal/5 p-1">
                              <LayoutGroup id={`tab-${selectedModule}`}>
                                {moduleData[selectedModule].map((scheme) => {
                                  const isActive = scheme.id === selectedScheme.id;
                                  return (
                                    <button
                                      key={scheme.id}
                                      type="button"
                                      onClick={() => selectScheme(scheme)}
                                      className={cn(
                                        "relative rounded-full px-6 py-1.5 text-[13px] tracking-widest transition-colors duration-300",
                                        isActive
                                          ? "font-medium text-brand-charcoal"
                                          : "text-brand-charcoal/50 hover:text-brand-charcoal/80"
                                      )}
                                    >
                                      <span className="relative z-10">{scheme.name}</span>
                                      {isActive && (
                                        <m.div
                                          layoutId={`activeTabBackground-${selectedModule}`}
                                          className="absolute inset-0 rounded-full bg-white shadow-sm ring-1 ring-black/5"
                                          initial={false}
                                          transition={{
                                            type: "spring",
                                            stiffness: 400,
                                            damping: 30,
                                          }}
                                        />
                                      )}
                                    </button>
                                  );
                                })}
                              </LayoutGroup>
                            </nav>
                          )
                        )}
                      </header>

                      {/* 内容主体：左侧边栏 + 右侧网格 */}
                      {/* 内容主体：左侧边栏 + 右侧网格 */}
                      <div className="flex max-h-[75vh] w-full flex-row items-start gap-12">
                        {/* 左侧：信息侧边栏 (Info Sidebar) */}
                        <m.aside
                          className="scrollbar-thin flex w-[25%] flex-shrink-0 flex-col gap-8 overflow-y-auto pr-4 pt-2"
                          initial={{ opacity: 0, x: -30 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ duration: 0.8, delay: 0.1, ease: [0.19, 1, 0.22, 1] }}
                        >
                          {/* Meta Item: Products */}
                          <div className="relative isolate flex flex-col">
                            <h3 className="font-display z-10 mb-3 text-[15px] font-medium uppercase tracking-wide text-brand-charcoal">
                              相关产品
                            </h3>

                            <div className="flex flex-wrap gap-x-6 gap-y-8">
                              {currentProducts.split("、").map((product, index) => {
                                // 产品图标占位符映射 - 根据产品名匹配或按索引循环

                                const isOptional = product.includes("(可选)");
                                const cleanName = product.replace("(可选)", "").trim();
                                const iconPath = getCategoryIconPath(cleanName);

                                return (
                                  <button
                                    key={product}
                                    type="button"
                                    onClick={() => handleProductClick(cleanName)}
                                    className="group flex flex-col items-center gap-3 transition-transform hover:-translate-y-1"
                                  >
                                    <div className="relative flex items-center justify-center drop-shadow-sm transition-all group-hover:drop-shadow-md">
                                      <div className="scale-110">
                                        {iconPath ? (
                                          <Image
                                            src={iconPath}
                                            alt={cleanName}
                                            width={48}
                                            height={48}
                                            className="h-12 w-12"
                                          />
                                        ) : (
                                          DEFAULT_ICONS[index % DEFAULT_ICONS.length]
                                        )}
                                      </div>
                                    </div>
                                    {/* 产品名称 */}
                                    <div className="flex flex-col items-center gap-0.5">
                                      <span className="text-sm font-normal text-brand-charcoal/85 transition-colors group-hover:text-brand-charcoal">
                                        {cleanName}
                                      </span>
                                      {isOptional && (
                                        <span className="text-[10px] font-light tracking-wide text-brand-charcoal/50">
                                          (可选)
                                        </span>
                                      )}
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          {/* Meta Item: Benefits (Tags) */}
                          <div className="flex flex-col">
                            <h3 className="font-display mb-3 text-[15px] font-medium uppercase tracking-wide text-brand-charcoal">
                              核心优势
                            </h3>
                            <div className="flex flex-wrap gap-2">
                              <div className="flex flex-wrap gap-x-6 gap-y-3">
                                {(
                                  selectedSubPlan?.benefits ||
                                  selectedScheme.benefits || ["保湿锁水", "屏障增强"]
                                ).map((tag) => (
                                  <div key={tag} className="group flex items-center gap-2">
                                    <span className="text-[10px] text-brand-charcoal-light transition-colors group-hover:text-brand-charcoal">
                                      ✦
                                    </span>
                                    <span className="text-sm font-normal tracking-wide text-brand-charcoal/80 transition-colors group-hover:text-brand-charcoal">
                                      {tag}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>

                          {/* Meta Item: Certifications */}
                          <div className="flex flex-col">
                            <h3 className="font-display mb-3 text-[15px] font-medium uppercase tracking-wide text-brand-charcoal">
                              检测认证
                            </h3>
                            <div className="flex items-center gap-5">
                              <Image
                                src="/images/sgs.svg"
                                alt="SGS"
                                title="SGS 权威认证"
                                width={28}
                                height={28}
                                className="h-7 w-auto"
                              />
                              <Image
                                src="/images/intertek-logo.svg"
                                alt="Intertek"
                                title="Intertek 质量认证"
                                width={28}
                                height={28}
                                className="h-6 w-auto"
                              />
                            </div>
                          </div>

                          {/* Meta Item: Special Support */}
                          {(() => {
                            const supportText =
                              selectedSubPlan?.specialSupport !== undefined
                                ? selectedSubPlan.specialSupport
                                : (selectedScheme.specialSupport ?? "孕期、月子期、轻医美术后");
                            if (!supportText) return null;
                            const isRestricted = supportText.includes("不支持");

                            return (
                              <div className="flex flex-col">
                                <h3 className="font-display mb-3 text-[15px] font-medium uppercase tracking-wide text-brand-charcoal">
                                  特殊时期支持
                                </h3>
                                <div
                                  className={cn(
                                    "border-l-2 py-0.5 pl-3 transition-colors duration-300",
                                    isRestricted
                                      ? "border-orange-900/30"
                                      : "border-brand-primary/30"
                                  )}
                                >
                                  <p
                                    className={cn(
                                      "text-sm font-light tracking-wider",
                                      isRestricted ? "text-orange-900/70" : "text-brand-charcoal/70"
                                    )}
                                  >
                                    {supportText}
                                  </p>
                                </div>
                              </div>
                            );
                          })()}
                        </m.aside>

                        {/* 右侧：步骤网格 (Steps Grid) - 使用 AnimatePresence 实现交叉淡入淡出 */}
                        <AnimatePresence mode="wait">
                          {selectedModule === "professional" ? (
                            <m.section
                              key={`${selectedModule}-content`}
                              className="flex w-full flex-col pb-8 pt-0"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              transition={{ duration: 0.3, ease: "easeInOut" }}
                            >
                              {/* 顶部标题区 */}
                              <header className="mb-8">
                                <div className="mb-1 flex items-center gap-3">
                                  <h2 className="text-3xl font-normal tracking-wide text-brand-charcoal">
                                    {selectedScheme?.id === "p1" ? "面部方案" : "全身方案"}
                                  </h2>
                                  <span className="rounded-sm bg-[#E6DCC3] px-1.5 py-0.5 text-xs font-medium text-brand-charcoal">
                                    招牌
                                  </span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <h3 className="font-sans text-sm font-light tracking-[0.1em] text-brand-charcoal/60">
                                    {selectedScheme?.id === "p1" ? "SKIN CARE" : "BODY CARE"}
                                  </h3>
                                  <p className="flex items-center text-[12px] font-normal tracking-wide text-brand-charcoal/70">
                                    <Info className="mr-1.5 h-3.5 w-3.5 text-brand-charcoal/40" />
                                    找不到您所在城市的门店？银卡级别以上会员可
                                    <span
                                      onClick={() => router.push("/contact?type=cooperation")}
                                      className="group relative mx-1.5 cursor-pointer overflow-hidden px-2 py-0.5"
                                    >
                                      <span className="relative z-10 font-semibold transition-colors duration-500 group-hover:text-brand-charcoal">
                                        申请入驻
                                      </span>
                                      <span className="absolute inset-0 z-0 w-0 bg-[#C3BC9F]/40 transition-all duration-500 ease-out group-hover:w-full" />
                                      <span className="absolute bottom-0 left-0 h-[1px] w-full bg-brand-charcoal/20" />
                                    </span>
                                    您所在的城市。
                                  </p>
                                </div>
                              </header>

                              {/* 中间卡片区 - Grid Layout */}
                              <div className="mb-8 grid grid-cols-3 gap-x-6 gap-y-10">
                                {(selectedScheme?.id === "p1"
                                  ? // 面部方案
                                    [
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
                                    ]
                                  : // 全身方案
                                    [
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
                                    ]
                                ).map((item, idx) => (
                                  <div
                                    key={idx}
                                    className="group relative flex h-full w-full cursor-pointer flex-col"
                                  >
                                    {/* 图片区域 - 包含所有内容 */}
                                    <div className="relative isolation-auto aspect-[1/1] w-full overflow-hidden rounded-md bg-brand-charcoal/5">
                                      <Image
                                        src={item.image}
                                        alt={item.title}
                                        fill
                                        className="z-0 object-cover transition-transform duration-700 group-hover:scale-105"
                                      />

                                      {/* 渐变遮罩 - 底部黑色渐变 - 加强 */}
                                      <div className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-t from-black/70 via-black/30 to-transparent opacity-100" />

                                      {/* 文字内容 - 覆盖在图片上 */}
                                      <div className="absolute bottom-0 left-0 z-20 flex w-full flex-col gap-3 p-6">
                                        {/* 标题与时长 */}
                                        <div className="flex items-baseline gap-2 text-white">
                                          <h4 className="text-2xl font-normal tracking-wide text-white drop-shadow-md">
                                            {item.title}
                                          </h4>
                                          <span className="mx-1 text-lg font-light text-white">
                                            /
                                          </span>
                                          <span className="font-sans text-xl font-light tracking-wide text-white drop-shadow-md">
                                            {item.duration}
                                          </span>
                                        </div>

                                        {/* 标签 - 胶囊样式 */}
                                        <div>
                                          <span className="inline-block rounded-full border border-white bg-white/10 px-3 py-1 text-xs font-normal tracking-wide text-white shadow-sm backdrop-blur-sm">
                                            {item.tags}
                                          </span>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>

                              {/* 底部 Logo 栏 - 无限滚动 */}
                              <div className="relative mb-6 overflow-hidden border-t border-brand-charcoal/10 pt-8">
                                {/* 左侧渐变遮罩 */}
                                <div className="pointer-events-none absolute bottom-0 left-0 top-0 z-10 w-16 bg-gradient-to-r from-[#FBF8F0] to-transparent" />
                                {/* 右侧渐变遮罩 */}
                                <div className="pointer-events-none absolute bottom-0 right-0 top-0 z-10 w-16 bg-gradient-to-l from-[#FBF8F0] to-transparent" />

                                {/* 滚动容器 */}
                                <div className="flex animate-marquee items-center hover:[animation-play-state:paused]">
                                  {/* 第一组 Logo */}
                                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                                    <div
                                      key={`logo-a-${num}`}
                                      className="mx-6 flex h-[36px] flex-shrink-0 items-center justify-center"
                                    >
                                      <Image
                                        src={`/images/hotels/hotel${num}.svg`}
                                        alt={`Hotel Partner ${num}`}
                                        width={120}
                                        height={24}
                                        className="h-[36px] w-auto object-contain"
                                        style={{ maxHeight: "36px" }}
                                      />
                                    </div>
                                  ))}
                                  {/* 第二组 Logo (用于无缝循环) */}
                                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                                    <div
                                      key={`logo-b-${num}`}
                                      className="mx-6 flex h-[36px] flex-shrink-0 items-center justify-center"
                                    >
                                      <Image
                                        src={`/images/hotels/hotel${num}.svg`}
                                        alt={`Hotel Partner ${num}`}
                                        width={120}
                                        height={24}
                                        className="h-[36px] w-auto object-contain"
                                        style={{ maxHeight: "36px" }}
                                      />
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </m.section>
                          ) : selectedModule === "portable" ? (
                            <m.section
                              key={`${selectedModule}-content`}
                              className="scrollbar-thin flex h-full w-full flex-col overflow-y-auto pr-4"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              transition={{ duration: 0.3 }}
                            >
                              {/* Full width image container */}
                              <div className="relative mb-8 aspect-[21/10] w-full flex-shrink-0 overflow-hidden rounded-xl bg-brand-charcoal/5">
                                <Image
                                  src={
                                    selectedScheme.heroImage || "/images/portable-hero-update.webp"
                                  }
                                  alt="Portable Ritual"
                                  fill
                                  className="object-cover"
                                />
                                {/* Fallback color/pattern if image missing */}
                                <div className="absolute inset-0 -z-10 bg-gradient-to-br from-brand-beige/20 to-brand-charcoal/5" />
                              </div>

                              {/* Text Content */}
                              {/* Text Content */}
                              <div className="relative mt-2 h-[48px] w-full overflow-y-auto pr-2">
                                <p className="text-sm font-light leading-relaxed tracking-wide text-brand-charcoal/80">
                                  {selectedScheme.desc}
                                </p>
                              </div>
                            </m.section>
                          ) : currentSteps.length <= 3 ? (
                            /* <= 3 步骤：直接展示卡片 (无折叠逻辑) */
                            <m.section
                              key={`${selectedModule}-simple`}
                              className="relative flex h-[530px] w-full items-start justify-center"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              transition={{ duration: 0.5 }}
                            >
                              <div className="flex h-[480px] w-full max-w-[1000px] items-stretch justify-center gap-3">
                                {currentSteps.map((step, index) => (
                                  <div
                                    key={`${step.title}-${index}`}
                                    className="group relative w-[280px] flex-none"
                                  >
                                    {/* 步骤序号 */}
                                    <div className="absolute left-1/2 top-0 z-20 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center whitespace-nowrap rounded-full border border-brand-charcoal/20 bg-[#FBF8F0] px-4 py-1 text-[10px] font-medium tracking-widest text-brand-charcoal shadow-sm">
                                      步骤 {String(index + 1).padStart(2, "0")}
                                    </div>

                                    {/* 内容卡片 */}
                                    <div className="relative h-full w-full overflow-hidden rounded-2xl border border-brand-charcoal/20 bg-[#FCF9F2]">
                                      <div className="absolute inset-0 flex flex-col p-6 pt-10">
                                        {/* 图片区域 */}
                                        <div className="relative mb-6 flex h-[240px] w-full flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-brand-beige/20">
                                          <Image
                                            src={
                                              step.imageUrl ||
                                              "https://wp-cdn.4ce.cn/v2/sSNhrfD.png"
                                            }
                                            alt={step.title}
                                            fill
                                            className="object-contain mix-blend-multiply"
                                          />
                                        </div>

                                        {/* 文字区域 */}
                                        <div className="flex flex-1 flex-col items-center">
                                          <h2 className="mb-4 whitespace-nowrap text-center font-sans text-2xl font-medium text-brand-charcoal">
                                            {step.title}
                                          </h2>
                                          <p className="text-left text-sm leading-relaxed text-brand-charcoal/80">
                                            {step.description}
                                          </p>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </m.section>
                          ) : (
                            <m.section
                              key={`${selectedModule}-paginated`}
                              className="relative flex w-full flex-col items-center justify-start"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              transition={{ duration: 0.5 }}
                            >
                              <div className="flex h-[520px] w-full max-w-[1000px] items-stretch justify-center gap-3 overflow-hidden pt-5">
                                <AnimatePresence mode="wait" initial={false}>
                                  <m.div
                                    key={currentStepIndex}
                                    className="flex w-full justify-center gap-3"
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -20 }}
                                    transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                                  >
                                    {currentSteps
                                      .slice(currentStepIndex * 3, (currentStepIndex + 1) * 3)
                                      .map((step, index) => {
                                        // Calculate actual index in the full array for the step number
                                        const actualIndex = currentStepIndex * 3 + index;

                                        return (
                                          <m.div
                                            key={`${step.title}-${actualIndex}`}
                                            className="group relative w-[280px] flex-none"
                                            initial={{ opacity: 0, y: 20 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{
                                              duration: 0.5,
                                              delay: index * 0.1,
                                              ease: [0.22, 1, 0.36, 1],
                                            }}
                                          >
                                            {/* 步骤序号 */}
                                            <div className="absolute left-1/2 top-0 z-20 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center whitespace-nowrap rounded-full border border-brand-charcoal/20 bg-[#FBF8F0] px-4 py-1 text-xs font-medium tracking-widest text-brand-charcoal shadow-sm">
                                              步骤 {String(actualIndex + 1).padStart(2, "0")}
                                            </div>

                                            {/* 内容卡片 */}
                                            <div className="relative h-full w-full overflow-hidden rounded-2xl border border-brand-charcoal/20 bg-[#FCF9F2] transition-all duration-300 hover:border-brand-charcoal/40">
                                              <div className="absolute inset-0 flex flex-col p-6 pt-10">
                                                {/* 图片区域 */}
                                                <div className="relative mb-6 flex h-[240px] w-full flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-brand-beige/20 transition-colors group-hover:bg-brand-beige/30">
                                                  <Image
                                                    src={
                                                      step.imageUrl ||
                                                      "https://wp-cdn.4ce.cn/v2/sSNhrfD.png"
                                                    }
                                                    alt={step.title}
                                                    fill
                                                    className="object-contain mix-blend-multiply transition-transform duration-700 group-hover:scale-105"
                                                  />
                                                </div>

                                                {/* 文字区域 */}
                                                <div className="flex flex-1 flex-col items-center">
                                                  <h2 className="mb-4 whitespace-nowrap text-center font-sans text-2xl font-medium text-brand-charcoal">
                                                    {step.title}
                                                  </h2>
                                                  <p className="text-left text-sm leading-relaxed text-brand-charcoal/80">
                                                    {step.description}
                                                  </p>

                                                  {/* Tips */}
                                                  {step.tips && (
                                                    <div className="mt-6 flex items-start gap-2 rounded-lg bg-brand-charcoal/5 px-3 py-2 text-xs font-light text-brand-charcoal/60">
                                                      <span className="shrink-0 pt-0.5 text-[10px] font-medium uppercase tracking-wider">
                                                        Tip:
                                                      </span>
                                                      <span className="text-left">{step.tips}</span>
                                                    </div>
                                                  )}
                                                </div>
                                              </div>
                                            </div>
                                          </m.div>
                                        );
                                      })}
                                  </m.div>
                                </AnimatePresence>
                              </div>

                              {/* 左右浮动翻页箭头 */}
                              {currentSteps.length > 3 && (
                                <>
                                  <button
                                    onClick={() => setCurrentStepIndex((p) => Math.max(0, p - 1))}
                                    disabled={currentStepIndex === 0}
                                    className="absolute -left-4 top-1/2 z-20 -translate-y-1/2 rounded-full bg-white/80 p-2 shadow-[0_2px_8px_-2px_rgba(0,38,62,0.08)] backdrop-blur transition-all hover:bg-white hover:shadow-[0_4px_12px_-4px_rgba(0,38,62,0.12)] disabled:pointer-events-none disabled:opacity-0"
                                  >
                                    <ChevronLeft className="h-5 w-5 text-[#00263e]" />
                                  </button>
                                  <button
                                    onClick={() =>
                                      setCurrentStepIndex((p) =>
                                        Math.min(Math.ceil(currentSteps.length / 3) - 1, p + 1)
                                      )
                                    }
                                    disabled={
                                      currentStepIndex >= Math.ceil(currentSteps.length / 3) - 1
                                    }
                                    className="absolute -right-4 top-1/2 z-20 -translate-y-1/2 rounded-full bg-white/80 p-2 shadow-[0_2px_8px_-2px_rgba(0,38,62,0.08)] backdrop-blur transition-all hover:bg-white hover:shadow-[0_4px_12px_-4px_rgba(0,38,62,0.12)] disabled:pointer-events-none disabled:opacity-0"
                                  >
                                    <ChevronRight className="h-5 w-5 text-[#00263e]" />
                                  </button>
                                </>
                              )}
                            </m.section>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                  </m.div>
                )}
              </AnimatePresence>
            </div>

            {/* Desktop Footer Copyright */}
            <div className="flex shrink-0 flex-col items-center justify-center gap-2 pb-4 pt-4">
              <p className="text-center text-xs font-light leading-relaxed tracking-widest text-brand-charcoal/70 sm:text-sm">
                &copy; {new Date().getFullYear()} NIHPLOD. All Rights Reserved.
              </p>
            </div>
          </div>
        </div>
      </DrawerPageContainer>

      {/* 动态背景图片 - 移至最底层，位于 safe-area-content 之外 */}

      {/* 底部导航栏 - 全局 Layout 中已包含，此处移除 */}

      {/* 产品详情弹窗 */}
      <ProductDrawer
        isOpen={productDrawerOpen}
        onClose={handleCloseProductDrawer}
        product={selectedProduct}
      />
    </>
  );
}
