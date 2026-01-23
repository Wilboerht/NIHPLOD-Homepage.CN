"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import { m, AnimatePresence, LayoutGroup } from "framer-motion";
import { ChevronDown, ChevronLeft, ChevronRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLayout } from "@/contexts/LayoutContext";
import { ProductDrawer } from "@/components/website";
import type { ProductData } from "@/components/website/ProductDrawer";

// 模块配置 - 4个护肤仪式模块
type ModuleId = "daily" | "portable" | "spa" | "professional";

interface ModuleConfig {
  id: ModuleId;
  number: string;
  label: string;
  subtitle: string;
  description: string;
}

const modules: ModuleConfig[] = [
  {
    id: "daily",
    number: "01",
    label: "优雅日常",
    subtitle: "告别繁琐, 轻松护理",
    description: "每日专属的精简守护"
  },
  {
    id: "spa",
    number: "02",
    label: "居家仪式",
    subtitle: "让生活充满仪式感",
    description: "享受DIY的美好时光"
  },
  {
    id: "portable",
    number: "03",
    label: "随身好物",
    subtitle: "外出 / 通勤 / 旅行",
    description: "随时随地按需使用"
  },
  {
    id: "professional",
    number: "04",
    label: "专业水疗",
    subtitle: "让身心重拾活力与平衡",
    description: "沉静式悦己体验"
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
  name: string;  // 如 "精简方案", "外出方案"
  steps: RitualStep[];
  products?: string; // 该子方案涉及的产品
}

// 情景类型 (如 "晨间焕活", "晚间呵护")
interface Scheme {
  id: string;
  name: string;
  tag?: string;
  desc: string;
  steps: RitualStep[];  // 保留原有 steps，兼容没有子方案的情景
  subPlans?: SubPlan[]; // 新增：子方案列表（可选）
  totalDuration?: string;
  products?: string;
  benefits?: string[];
  specialSupport?: string;
  nameEn?: string;
}

// 模块数据类型
type ModuleData = Record<ModuleId, Scheme[]>;

// 默认模块数据
const defaultModuleData: ModuleData = {
  daily: [
    {
      id: "d1",
      name: "晨间焕活",
      nameEn: "MORNING VITALITY RITUAL",
      desc: "开启一天的透亮肌底",
      totalDuration: "5-10分钟",
      products: "洁面慕斯、面霜",
      benefits: ["保湿锁水", "屏障增强", "过敏修护", "抗初老", "维稳舒缓"],
      specialSupport: "孕期、月子期、轻医美术后",
      // 原有 steps 作为默认显示
      steps: [
        {
          title: "净肤",
          description: "取适量洁面慕斯，温和打圈按摩全脸30秒，随后用温水洗净；通过清除夜间代谢，唤醒肌肤微循环。",
          duration: "30秒",
          tips: "温水洗净，避免过冷或过热刺激。",
          imageUrl: "/images/ritual-step-1.png"
        },
        {
          title: "焕活",
          description: "取适量面霜于掌心，展匀后，由内向外、由下向上在脸部及眼周涂抹并推开；有效的形成水油平衡保护，减缓并调理肌肤的临时不适。",
          duration: "1-2分钟",
          tips: "掌心温热后按压效果更佳。",
          imageUrl: "/images/ritual-step-2.png"
        },
        {
          title: "防护",
          description: "在面部完全干爽后，取足量防晒霜，点涂于面部及颈部，顺着皮肤纹理均匀涂抹。防晒剂提供即时自然提亮效果。",
          duration: "1分钟",
          tips: "出门前15分钟涂抹。",
          imageUrl: "/images/ritual-step-3.png"
        },
      ],
      // 新增子方案 Tab
      subPlans: [
        {
          id: "simple",
          name: "精简方案",
          products: "洁面慕斯、面霜",
          steps: [
            {
              title: "净肤",
              description: "取适量洁面慕斯，温和打圈按摩全脸30秒，随后用温水洗净；通过清除夜间代谢，唤醒肌肤微循环。",
              duration: "30秒",
              tips: "温水洗净，避免过冷或过热刺激。",
              imageUrl: "/images/ritual-step-1.png"
            },
            {
              title: "焕活",
              description: "取适量面霜于掌心，展匀后，由内向外、由下向上在脸部及眼周涂抹并推开；有效的形成水油平衡保护，减缓并调理肌肤的临时不适。",
              duration: "1-2分钟",
              tips: "掌心温热后按压效果更佳。",
              imageUrl: "/images/ritual-step-2.png"
            },
          ]
        },
        {
          id: "outing",
          name: "外出方案",
          products: "洁面慕斯、面霜、防晒乳",
          steps: [
            {
              title: "净肤",
              description: "取适量洁面慕斯，温和打圈按摩全脸30秒，随后用温水洗净；通过清除夜间代谢，唤醒肌肤微循环。",
              duration: "30秒",
              tips: "温水洗净，避免过冷或过热刺激。",
              imageUrl: "/images/ritual-step-1.png"
            },
            {
              title: "焕活",
              description: "取适量面霜于掌心，展匀后，由内向外、由下向上在脸部及眼周涂抹并推开；有效的形成水油平衡保护，减缓并调理肌肤的临时不适。",
              duration: "1-2分钟",
              tips: "掌心温热后按压效果更佳。",
              imageUrl: "/images/ritual-step-2.png"
            },
            {
              title: "防护",
              description: "在面部完全干爽后，取足量防晒霜，点涂于面部及颈部，顺着皮肤纹理均匀涂抹。防晒剂提供即时自然提亮效果。",
              duration: "1分钟",
              tips: "出门前15分钟涂抹。",
              imageUrl: "/images/ritual-step-3.png"
            },
          ]
        }
      ]
    },
    {
      id: "n1",
      name: "晚间呵护",
      nameEn: "NIGHT REPAIR RITUAL",
      desc: "利用黄金睡眠期修护",
      totalDuration: "10-15分钟",
      products: "洁面慕斯、面霜",
      benefits: ["深层清洁", "夜间修护", "滋养再生"],
      steps: [
        { title: "深度卸妆", description: "彻底溶解彩妆与防晒残留。", duration: "2分钟", tips: "干手干脸按摩，充分乳化后洗净。", dosage: "3泵", imageUrl: "/images/ritual-step-1.png" },
        { title: "温和洁面", description: "洗去多余油脂，不伤皮脂膜。", duration: "1分钟", tips: "重点清洁T区，两颊轻柔带过。", dosage: "1泵", imageUrl: "/images/ritual-step-1.png" },
        { title: "紧致晚霜", description: "包裹式滋养，锁住营养成分。", duration: "1-2分钟", tips: "用掌心温热后按压于面部，让肌肤充分吸收。", dosage: "蚕豆大小", imageUrl: "/images/ritual-step-2.png" },
      ],
      subPlans: [
        {
          id: "basic",
          name: "基础方案",
          products: "洁面慕斯、面霜",
          steps: [
            { title: "温和洁面", description: "洗去多余油脂，不伤皮脂膜。", duration: "1分钟", tips: "重点清洁T区，两颊轻柔带过。", dosage: "1泵", imageUrl: "/images/ritual-step-1.png" },
            { title: "紧致晚霜", description: "包裹式滋养，锁住营养成分。", duration: "1-2分钟", tips: "用掌心温热后按压于面部，让肌肤充分吸收。", dosage: "蚕豆大小", imageUrl: "/images/ritual-step-2.png" },
          ]
        },
        {
          id: "deep",
          name: "深度方案",
          products: "洁面慕斯、面霜、面膜",
          steps: [
            { title: "深度卸妆", description: "彻底溶解彩妆与防晒残留。", duration: "2分钟", tips: "干手干脸按摩，充分乳化后洗净。", dosage: "3泵", imageUrl: "/images/ritual-step-1.png" },
            { title: "温和洁面", description: "洗去多余油脂，不伤皮脂膜。", duration: "1分钟", tips: "重点清洁T区，两颊轻柔带过。", dosage: "1泵", imageUrl: "/images/ritual-step-1.png" },
            { title: "精华导入", description: "配合精华液进行轻柔按摩，促进吸收。", duration: "2分钟", tips: "从下往上提拉按摩，促进精华渗透。", dosage: "2-3滴", imageUrl: "/images/ritual-step-2.png" },
            { title: "紧致晚霜", description: "包裹式滋养，锁住营养成分。", duration: "1-2分钟", tips: "用掌心温热后按压于面部，让肌肤充分吸收。", dosage: "蚕豆大小", imageUrl: "/images/ritual-step-2.png" },
          ]
        }
      ]
    },
  ],
  portable: [
    {
      id: "t1",
      name: "高空补水",
      nameEn: "IN-FLIGHT HYDRATION",
      tag: "极速",
      desc: "应对机舱干燥环境",
      totalDuration: "5分钟",
      products: "护手霜、防晒乳、洁面慕斯、面膜",
      benefits: ["即时补水", "舒缓干燥", "抗氧化防护", "便携应急", "维稳修护"],
      steps: [
        { title: "舒缓喷雾", description: "即刻缓解肌肤紧绷感。", duration: "10秒", tips: "距离面部20cm处呈Z字形喷洒。", imageUrl: "/images/ritual-step-1.png" },
        { title: "维稳修护", description: "平复换季或地域带来的不适。", duration: "2分钟", tips: "选择舒缓成分，轻柔按压于敏感部位。", dosage: "2-3泵", imageUrl: "/images/ritual-step-2.png" },
      ],
    },
  ],
  spa: [
    {
      id: "s1",
      name: "面部方案",
      nameEn: "FACE RITUAL",
      desc: "仅需 4 个步骤",
      totalDuration: "30分钟",
      products: "洁面慕斯、磨砂膏、护理油、面霜、面膜",
      benefits: ["深层清洁", "多重修护", "提亮肤质", "增强免疫"],
      steps: [
        { title: "基础净肤", description: "取适量洁面慕斯，用手温和打圈按摩全脸，随后用温水洗净；清除杂质及代谢，使肌底回归自然。", duration: "2分钟", tips: "温水洗净，避免过冷或过热刺激。", dosage: "2泵", imageUrl: "/images/ritual-step-1.png" },
        { title: "深层清理", description: "取适量磨砂膏均匀涂抹于面部，轻柔按压T区、两颊并打圈，随后用温水洗净；唤醒肌肤微循环。", duration: "3-5分钟", tips: "避开眼唇周围，轻柔按摩。", dosage: "适量", imageUrl: "/images/ritual-step-1.png" },
        { title: "混油养肤", description: "取适量护理油及面霜，于掌心混合温热，以由下而上，由内而外的手法进行脸部及眼周按摩；确保珍贵成分能有效渗入肌肤。", duration: "3-5分钟", tips: "掌心温热混合后效果更佳。", dosage: "适量混合", imageUrl: "/images/ritual-step-2.png" },
        { title: "膜法封存", description: "承接上个步骤，无需对面部做额外清理，将面膜完整贴合面部，静享 10-15 分钟后移除膜布；通过旎柏系产品的组合效应，实现对面部的多重修护及滋养，有效提亮肤质、增强肌肤免疫力。", duration: "15分钟", tips: "无需清洗，剩余精华按摩至吸收。", imageUrl: "/images/ritual-step-2.png" },
      ],
    },
    {
      id: "s2",
      name: "全身方案",
      nameEn: "FULL BODY RITUAL",
      desc: "仅需 6 个步骤",
      totalDuration: "45分钟",
      products: "洁面慕斯、磨砂膏、护理油、面霜、面膜、身体乳",
      benefits: ["全身放松", "柔嫩肌肤", "滋养修护", "延缓衰老"],
      steps: [
        { title: "基础净肤", description: "取适量洁面慕斯，用手温和打圈按摩全脸，随后用温水洗净；清除杂质及代谢，使肌底回归自然。", duration: "2分钟", tips: "温水洗净，避免过冷或过热刺激。", dosage: "2泵", imageUrl: "/images/ritual-step-1.png" },
        { title: "深层清理", description: "取适量磨砂膏均匀涂抹于面部，轻柔按压T区、两颊并打圈，随后用温水洗净；唤醒肌肤微循环。", duration: "3-5分钟", tips: "打圈按摩，力度适中。", dosage: "适量", imageUrl: "/images/ritual-step-1.png" },
        { title: "膜法守护", description: "取一片面膜完整贴合面部，静享 10-15 分钟后移除膜布 (可与泡澡环节同时进行)；确保珍贵成分能有效被面部吸收。", duration: "15分钟", tips: "可配合泡澡一同进行。", imageUrl: "/images/ritual-step-2.png" },
        { title: "芳香浸愈 (可选)", description: "将适量美容油滴入温热的浴缸水中。泡澡时，缓慢深呼吸，并将注意力集中在呼吸上从而放松身心。", duration: "15-20分钟", tips: "水温控制在38-40度为宜。", dosage: "几滴", imageUrl: "/images/ritual-step-2.png" },
        { title: "全身滋养", description: "取适量身体乳，于掌心混合温热，从四肢向心脏方向进行长推式按摩，重点护理颈部、小腿、手臂及腹部；若所处的外部环境湿度/温度较低，建议额外按照 1:5 比例混合护理油加强滋润效果。", duration: "5分钟", tips: "趁身体微湿时涂抹效果更佳。", dosage: "充足", imageUrl: "/images/ritual-step-2.png" },
        { title: "面部呵护", description: "取适量面霜，以由下至上、由内而外的手法进行全脸提拉按摩，重点按压眼周、法令纹及额头区域；确保全身及面部被完全呵护，实现更全面的修护及滋养，有效提亮肤质和弹性、延缓衰老、增强肌肤免疫力。", duration: "5分钟", tips: "配合按摩手法促进吸收。", dosage: "适量", imageUrl: "/images/ritual-step-2.png" },
      ],
    },
  ],
  professional: [
    {
      id: "p1",
      name: "酵素焕肤",
      nameEn: "ENZYME PEELING",
      tag: "专业",
      desc: "医学级角质更新处理",
      totalDuration: "15分钟",
      products: "酸类精华、中和液",
      benefits: ["角质更新", "提亮肤色"],
      steps: [
        { title: "酸性激活", description: "软化陈旧角质，促进代谢。", duration: "5-10分钟", tips: "首次使用建议从短时间开始，逐步增加。避免眼周和唇部。", dosage: "薄薄一层", imageUrl: "/images/ritual-step-1.png" },
        { title: "中和平衡", description: "恢复肌肤天然酸碱值。", duration: "2分钟", tips: "用专用中和液或清水彻底清洗，后续使用舒缓产品。", imageUrl: "/images/ritual-step-2.png" },
      ],
      subPlans: [
        {
          id: "gentle",
          name: "温和方案",
          products: "洁面慕斯、面霜",
          steps: [
            { title: "酵素软化", description: "使用低浓度酵素温和软化角质。", duration: "5分钟", tips: "适合敏感肌肤，首次使用建议从短时间开始。", dosage: "薄薄一层", imageUrl: "/images/ritual-step-1.png" },
            { title: "舒缓平衡", description: "使用舒缓水恢复肌肤平衡。", duration: "1分钟", tips: "轻拍至完全吸收。", imageUrl: "/images/ritual-step-2.png" },
          ]
        },
        {
          id: "professional",
          name: "专业方案",
          products: "洁面慕斯、面霜、面膜",
          steps: [
            { title: "深层清洁", description: "彻底清洁面部，为焕肤做准备。", duration: "2分钟", tips: "使用洁面慕斯彻底清洁。", imageUrl: "/images/ritual-step-1.png" },
            { title: "酸性激活", description: "软化陈旧角质，促进代谢。", duration: "10分钟", tips: "避免眼周和唇部，如感到刺痛立即清洗。", dosage: "薄薄一层", imageUrl: "/images/ritual-step-1.png" },
            { title: "中和平衡", description: "恢复肌肤天然酸碱值。", duration: "2分钟", tips: "用专用中和液彻底清洗。", imageUrl: "/images/ritual-step-2.png" },
            { title: "舒缓修护", description: "涂抹舒缓精华，镇定肌肤。", duration: "2分钟", tips: "配合轻柔按压促进吸收。", dosage: "适量", imageUrl: "/images/ritual-step-2.png" },
          ]
        }
      ]
    },
    {
      id: "p2",
      name: "注氧鲜肌",
      nameEn: "OXYGEN INFUSION",
      tag: "活氧",
      desc: "高压氧渗透嫩肤",
      totalDuration: "20分钟",
      products: "注氧仪、精华液",
      benefits: ["深层水润", "活肤注氧"],
      steps: [
        { title: "导入精粹", description: "配合专业设备深层透皮。", duration: "10-15分钟", tips: "确保肌肤洁净干燥，按照设备说明操作。", dosage: "根据设备要求", imageUrl: "/images/ritual-step-1.png" },
        { title: "屏障封存", description: "强效锁水，持久焕发神采。", duration: "2分钟", tips: "趁导入后肌肤通道打开时立即涂抹封层产品。", dosage: "充足涂抹", imageUrl: "/images/ritual-step-2.png" },
      ],
      subPlans: [
        {
          id: "home",
          name: "居家方案",
          products: "面霜、面膜",
          steps: [
            { title: "精华叠加", description: "使用多层精华进行手动按压导入。", duration: "5分钟", tips: "每层精华等待吸收后再涂抹下一层。", dosage: "2-3种精华", imageUrl: "/images/ritual-step-1.png" },
            { title: "面膜封存", description: "使用保湿面膜加速精华吸收。", duration: "15分钟", tips: "面膜不要等到完全干透再取下。", imageUrl: "/images/ritual-step-2.png" },
          ]
        },
        {
          id: "device",
          name: "仪器方案",
          products: "洁面慕斯、面霜、面膜",
          steps: [
            { title: "洁净准备", description: "彻底清洁面部，确保毛孔畅通。", duration: "2分钟", tips: "可配合热敷打开毛孔。", imageUrl: "/images/ritual-step-1.png" },
            { title: "注氧导入", description: "配合专业注氧仪深层导入精华。", duration: "15分钟", tips: "按设备说明操作，均匀覆盖全脸。", dosage: "根据设备要求", imageUrl: "/images/ritual-step-1.png" },
            { title: "高倍精华", description: "叠加高浓度精华增强效果。", duration: "2分钟", tips: "趁肌肤通道打开时快速涂抹。", dosage: "充足", imageUrl: "/images/ritual-step-2.png" },
            { title: "屏障封存", description: "强效锁水，持久焕发神采。", duration: "2分钟", tips: "使用滋润面霜封锁活性成分。", dosage: "充足涂抹", imageUrl: "/images/ritual-step-2.png" },
          ]
        }
      ]
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

  steps.forEach(step => {
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
interface RitualContentProps {
  backgroundImage?: string;
}

export function RitualContent({ backgroundImage }: RitualContentProps) {
  // 展开状态
  const [isExpanded, setIsExpanded] = useState(false);
  // 当前层级: 1=模块选择, 2=方案选择, 3=步骤详情
  const [currentLevel, setCurrentLevel] = useState(1);
  // 选中的模块
  const [selectedModule, setSelectedModule] = useState<ModuleId | null>(null);
  // 选中的方案
  const [selectedScheme, setSelectedScheme] = useState<Scheme | null>(null);
  // 选中的子方案（Tab）
  const [selectedSubPlan, setSelectedSubPlan] = useState<SubPlan | null>(null);
  // 悬停的模块索引
  const { isDrawerOpen, setDrawerOpen } = useLayout();
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // 轮播导航状态
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const stepsContainerRef = useRef<HTMLDivElement>(null);

  // 轮播导航函数 - 滚动到指定步骤
  const scrollToStep = useCallback((index: number) => {
    if (!stepsContainerRef.current) return;
    const container = stepsContainerRef.current;
    const stepWidth = 260 + 52; // 卡片宽度 + 间距
    const scrollPosition = index * stepWidth;
    container.scrollTo({
      left: scrollPosition,
      behavior: "smooth"
    });
    setCurrentStepIndex(index);
  }, []);

  // 上一步
  const goToPrevStep = useCallback(() => {
    if (currentStepIndex > 0) {
      scrollToStep(currentStepIndex - 1);
    }
  }, [currentStepIndex, scrollToStep]);

  // 下一步
  const goToNextStep = useCallback((totalSteps: number) => {
    // 当可见区域显示约3张卡片时，最大可滚动索引为 totalSteps - 3
    if (currentStepIndex < totalSteps - 3) {
      scrollToStep(currentStepIndex + 1);
    }
  }, [currentStepIndex, scrollToStep]);

  // 监听 LayoutContext 中的 isDrawerOpen 变化，同步本地 isExpanded 状态
  // 解决：点击底部导航栏时，setDrawerOpen(true) 不会触发本地状态更新的问题
  useEffect(() => {
    if (isDrawerOpen && !isExpanded) {
      setIsExpanded(true);
    } else if (!isDrawerOpen && isExpanded) {
      setIsExpanded(false);
    }
  }, [isDrawerOpen, isExpanded]);

  // 展开的步骤索引（用于显示技巧提示）
  const [_expandedStepIndex, _setExpandedStepIndex] = useState<number | null>(null);

  // 产品详情弹窗状态
  const [productDrawerOpen, setProductDrawerOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ProductData | null>(null);

  // 产品名称到产品数据的映射
  const productDataMap: Record<string, ProductData> = {
    "洁面慕斯": {
      id: "cleanser",
      name: "氨基酸洁面慕斯",
      nameEn: "AMINO ACID CLEANSING MOUSSE",
      slug: "cleanser",
      description: "温和洁面，深层清洁毛孔，保持肌肤水油平衡。采用氨基酸表活，亲肤温和不紧绷。",
      price: 168,
      capacity: "150ml",
      images: [{ url: "/images/products/cleanser.png", alt: "洁面慕斯" }],
      category: { name: "洁面" },
      benefits: ["深层清洁", "温和不刺激", "保湿锁水"],
    },
    "面霜": {
      id: "cream",
      name: "多效修护面霜",
      nameEn: "MULTI-REPAIR CREAM",
      slug: "cream",
      description: "深层滋养修护，增强肌肤屏障，提供持久保湿。",
      price: 298,
      capacity: "50ml",
      images: [{ url: "/images/products/cream.png", alt: "面霜" }],
      category: { name: "面霜" },
      benefits: ["深层滋养", "屏障修护", "持久保湿"],
    },
    "防晒乳": {
      id: "sunscreen",
      name: "清透防晒乳",
      nameEn: "LIGHT SUNSCREEN LOTION",
      slug: "sunscreen",
      description: "SPF50+ PA++++，轻薄透气，有效防护紫外线。",
      price: 198,
      capacity: "50ml",
      images: [{ url: "/images/products/sunscreen.png", alt: "防晒乳" }],
      category: { name: "防晒" },
      benefits: ["高倍防护", "清爽不油腻", "自然提亮"],
    },
    "护手霜": {
      id: "handcream",
      name: "滋润护手霜",
      nameEn: "NOURISHING HAND CREAM",
      slug: "handcream",
      description: "深层滋润双手肌肤，修护干燥粗糙，恢复柔嫩细滑。",
      price: 88,
      capacity: "50ml",
      images: [{ url: "/images/products/handcream.png", alt: "护手霜" }],
      category: { name: "身体护理" },
      benefits: ["深层滋润", "修护干燥", "柔嫩双手"],
    },
    "面膜": {
      id: "mask",
      name: "补水修护面膜",
      nameEn: "HYDRATING REPAIR MASK",
      slug: "mask",
      description: "密集补水，舒缓修护，让肌肤焕发健康光泽。",
      price: 168,
      capacity: "5片/盒",
      images: [{ url: "/images/products/mask.png", alt: "面膜" }],
      category: { name: "面膜" },
      benefits: ["密集补水", "舒缓修护", "提亮肤色"],
    },
  };

  // 打开产品详情弹窗
  const handleProductClick = (productName: string) => {
    const product = productDataMap[productName];
    if (product) {
      setSelectedProduct(product);
      setProductDrawerOpen(true);
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

    // 特殊处理：随身好物 (portable) 直接进入 Level 3
    if (moduleId === "portable") {
      const schemes = moduleData[moduleId];
      if (schemes && schemes.length > 0) {
        setSelectedScheme(schemes[0]);
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
      // 如果是随身好物，直接返回 Level 1
      if (selectedModule === "portable") {
        setSelectedScheme(null);
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

  // 获取当前应该显示的步骤（优先使用子方案的步骤）
  const currentSteps = selectedSubPlan?.steps || selectedScheme?.steps || [];
  // 获取当前应该显示的产品（优先使用子方案的产品）
  const currentProducts = selectedSubPlan?.products || selectedScheme?.products || "洁面慕斯、面霜";



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

  // 组件加载后自动展开，实现"抽屉下拉"动画
  useEffect(() => {
    // 稍微延迟以展示"下拉"动画
    const timer = setTimeout(() => {
      setIsExpanded(true);
      setDrawerOpen(true);
    }, 100);
    return () => clearTimeout(timer);
  }, [setDrawerOpen]);

  return (
    <>
      {/* 背景已移至 layout.tsx 实现无缝切换 */}

      {/* 内容区域容器 - 紧贴顶部，使用 framer-motion 统一控制动画 */}
      <m.div
        className="safe-area-content !top-0"
        transition={{
          duration: 0.8,
          ease: [0.22, 1, 0.36, 1]
        }}
      >
        {/* 主内容区域 + 展开按钮一体化 */}
        <m.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{
            opacity: 1,
            scale: 1
          }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="h-full"
        >
          {/* 主内容区域 + 按钮一体化容器 */}
          <div className="flex h-full flex-col items-center">
            {/* 主内容区域 - 三层级布局 */}
            <m.div
              className="relative w-full overflow-hidden rounded-b-2xl bg-[#F0EDE1] lg:rounded-b-3xl"
              style={{ willChange: "flex-grow" }}
              initial={{ flexGrow: 0, flexBasis: 0 }}
              animate={{
                flexGrow: isExpanded ? 1 : 0,
                flexBasis: 0
              }}
              transition={{
                duration: 1.2,
                ease: [0.22, 1, 0.36, 1],
                // 展开时延迟0.4s等待导航栏收起（大幅重叠以消除视觉间隔）；收起时不延迟
                delay: isExpanded ? 0.3 : 0
              }}
            >
              {/* 矿物纹理覆盖层 */}
              <div className="texture-overlay absolute inset-0" />

              {/* 动态背景图片 */}


              <div className={cn(
                "flex h-full flex-col overflow-hidden pb-3",
                !isExpanded && "hidden"
              )}>
                {/* ========== 移动端布局 - 参考 Ritual 移动端.html ========== */}
                <div className="flex h-full flex-col sm:hidden">
                  {/* 移动端顶部 Header */}
                  <header className="flex h-[80px] shrink-0 items-center justify-between px-6">
                    {/* 返回按钮 - 仅在 Level 2/3 显示 */}
                    <m.button
                      type="button"
                      onClick={() => {
                        if (currentLevel === 3) {
                          setSelectedScheme(null);
                          setCurrentLevel(2);
                        } else if (currentLevel === 2) {
                          setSelectedModule(null);
                          setCurrentLevel(1);
                        }
                      }}
                      className={cn(
                        "flex items-center text-sm tracking-wide transition-all duration-400",
                        currentLevel > 1 ? "translate-x-0 opacity-100" : "pointer-events-none -translate-x-2.5 opacity-0"
                      )}
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M19 12H5M5 12L12 19M5 12L12 5" />
                      </svg>
                      <span className="ml-2">返回</span>
                    </m.button>
                    {/* Logo */}
                    <Image
                      src="/images/logo.png"
                      alt="NIHPLOD"
                      width={100}
                      height={28}
                      className="h-7 w-auto brightness-[0.15]"
                      priority
                    />
                  </header>

                  {/* 移动端内容区域 */}
                  <div className="flex-1 overflow-y-auto px-6 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                    <AnimatePresence mode="wait">
                      {/* 移动端 Level 1: 主菜单 */}
                      {currentLevel === 1 && (
                        <m.div
                          key="mobile-level1"
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -20 }}
                          transition={{ duration: 0.6, ease: [0.19, 1, 0.22, 1] }}
                          className="flex h-full flex-col"
                        >
                          {/* 标题区 */}
                          <div className="mb-4 shrink-0 pt-2">
                            <p className="mb-2 text-xs uppercase tracking-[3px] text-[#00263e]/60">OFFICIAL GUIDE</p>
                            <h1 className="text-4xl font-normal leading-none text-[#00263e]">官方指南</h1>
                          </div>

                          {/* 菜单列表 */}
                          <div className="flex flex-1 flex-col">
                            {modules.map((module, index) => (
                              <button
                                key={module.id}
                                type="button"
                                onClick={() => selectModule(module.id)}
                                className={cn(
                                  "group flex flex-1 items-center justify-between py-4 text-left transition-transform duration-300 active:scale-[0.98]",
                                  index !== modules.length - 1 && "border-b border-[#00263e]/10"
                                )}
                              >
                                <div className="flex items-center gap-6">
                                  <span className="font-serif text-3xl italic text-[#00263e]/20 group-hover:text-[#00263e]/30 transition-colors">
                                    {module.number}
                                  </span>
                                  <span className="text-[24px] font-light tracking-wide text-[#00263e]">
                                    {module.label}
                                  </span>
                                  <div className="mt-1 flex flex-col items-start gap-1">
                                    <span className="text-[10px] font-normal uppercase tracking-wider text-[#00263e]/60">
                                      {module.subtitle}
                                    </span>
                                  </div>
                                </div>
                                <ArrowUpRight className="h-5 w-5 text-[#00263e]/20" />
                              </button>
                            ))}
                          </div>
                        </m.div>
                      )}

                      {/* 移动端 Level 2: 方案选择 */}
                      {currentLevel === 2 && selectedModule && (
                        <m.div
                          key="mobile-level2"
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -20 }}
                          transition={{ duration: 0.6, ease: [0.19, 1, 0.22, 1] }}
                        >
                          {/* 分类标题 */}
                          <h2 className="mb-6 text-2xl font-normal text-[#00263e]">
                            {modules.find(m => m.id === selectedModule)?.label}
                          </h2>

                          {/* 方案卡片网格 */}
                          <div className="flex flex-col gap-5 pt-5">
                            {moduleData[selectedModule].map((scheme, index) => (
                              <button
                                key={scheme.id}
                                type="button"
                                onClick={() => selectScheme(scheme)}
                                className="relative overflow-hidden border border-[#00263e] bg-[#F0EDE1] p-6 text-left shadow-[0_4px_0_#00263e] transition-all duration-300 active:translate-y-1 active:shadow-none"
                              >
                                {/* 右上角标签 */}
                                <span className="absolute right-0 top-0 bg-[#00263e] px-2.5 py-1 text-[10px] uppercase text-[#F0EDE1]">
                                  Protocol {index + 1}
                                </span>
                                <h3 className="mb-2 text-[18px] font-medium text-[#00263e]">{scheme.name}</h3>
                                <p className="text-[14px] text-[#00263e]/70">{scheme.desc}</p>
                              </button>
                            ))}
                          </div>
                        </m.div>
                      )}

                      {/* 移动端 Level 3: 详细步骤 */}
                      {currentLevel === 3 && selectedScheme && (
                        <m.div
                          key="mobile-level3"
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -20 }}
                          transition={{ duration: 0.6, ease: [0.19, 1, 0.22, 1] }}
                        >
                          {/* 详情头部 */}
                          <div className="mb-8">
                            <p className="mb-2 text-xs uppercase tracking-wide text-[#00263e]/50">
                              {modules.find(m => m.id === selectedModule)?.label}
                            </p>
                            <h2 className="text-[24px] font-normal leading-tight text-[#00263e]">
                              {selectedScheme.name}
                            </h2>
                          </div>

                          {/* 步骤列表 */}
                          <div className="flex flex-col gap-10">
                            {currentSteps.map((step, index) => (
                              <div key={step.title} className="flex flex-col gap-4">
                                {/* 步骤图片区域 - 墨水效果 */}
                                <div className="relative flex h-60 w-full items-center justify-center overflow-hidden bg-[#00263e]">
                                  {/* 墨水浮动效果 */}
                                  <m.div
                                    className="absolute h-[150px] w-[150px] rounded-full bg-[#F0EDE1]/30 blur-[40px]"
                                    animate={{
                                      x: ["-20%", "20%"],
                                      y: ["-20%", "20%"],
                                      scale: [1, 1.2, 1]
                                    }}
                                    transition={{ duration: 8, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" }}
                                  />
                                  <m.div
                                    className="absolute h-[100px] w-[100px] rounded-full bg-[#F0EDE1]/20 blur-[40px]"
                                    animate={{
                                      x: ["20%", "-20%"],
                                      y: ["20%", "-20%"],
                                      scale: [1.2, 1, 1.2]
                                    }}
                                    transition={{ duration: 8, repeat: Infinity, repeatType: "reverse", ease: "easeInOut", delay: 2 }}
                                  />
                                  <span className="z-10 text-xs uppercase tracking-wide text-white/60">
                                    VISUAL CONCEPT
                                  </span>
                                </div>

                                {/* 步骤编号 */}
                                <div className="w-fit border-b border-[#00263e] pb-1 text-[10px] uppercase tracking-wide text-[#00263e]/50">
                                  STEP 0{index + 1}
                                </div>

                                {/* 步骤信息 */}
                                <div>
                                  <h4 className="mb-2 text-[18px] font-medium text-[#00263e]">{step.title}</h4>
                                  <p className="text-[14px] leading-relaxed text-[#00263e]/80">{step.description}</p>
                                </div>
                              </div>
                            ))}
                          </div>

                          {/* 底部结束标记 */}
                          <div className="mt-16 pb-10 text-center text-[10px] uppercase tracking-[4px] text-[#00263e]/30">
                            END OF RITUAL
                          </div>
                        </m.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                {/* ========== 桌面端布局 - 保持原有样式 ========== */}
                <div className="hidden h-full flex-col sm:flex">
                  {/* 顶部栏：LOGO + 面包屑/用户按钮 */}
                  <div className="flex flex-shrink-0 items-center justify-center border-b border-brand-charcoal/5 px-8 py-4 lg:px-12">
                    <div className="flex w-full max-w-[1440px] items-center justify-between">
                      {/* 左侧：LOGO - 点击返回 Level 1 */}
                      <button
                        type="button"
                        onClick={() => {
                          setCurrentLevel(1);
                          setSelectedModule(null);
                          setSelectedScheme(null);
                        }}
                        className="block transition-opacity hover:opacity-70"
                      >
                        <Image
                          src="/images/logo.png"
                          alt="NIHPLOD"
                          width={100}
                          height={32}
                          className="h-7 w-auto lg:h-8"
                          priority
                        />
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
                            {/* 护肤仪式 - 点击返回 Level 1 */}
                            <button
                              type="button"
                              onClick={() => {
                                setCurrentLevel(1);
                                setSelectedModule(null);
                                setSelectedScheme(null);
                              }}
                              className="transition-colors duration-300 hover:text-brand-charcoal"
                            >
                              护肤仪式
                            </button>

                            {selectedModule && (
                              <>
                                <span className="text-brand-charcoal/30">/</span>
                                {currentLevel === 2 || selectedModule === "portable" ? (
                                  <span className="text-brand-charcoal">
                                    {modules.find(m => m.id === selectedModule)?.label}
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setCurrentLevel(2);
                                      setSelectedScheme(null);
                                    }}
                                    className="transition-colors duration-300 hover:text-brand-charcoal"
                                  >
                                    {modules.find(m => m.id === selectedModule)?.label}
                                  </button>
                                )}
                              </>
                            )}

                            {currentLevel === 3 && selectedScheme && selectedModule !== "portable" && (
                              <>
                                <span className="text-brand-charcoal/30">/</span>
                                <span className="text-brand-charcoal">{selectedScheme.name}</span>
                              </>
                            )}
                          </m.nav>
                        ) : null}
                      </AnimatePresence>
                    </div>
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
                          className="absolute inset-0 flex items-center justify-center overflow-visible p-5 lg:p-6"
                        >
                          <div className="flex h-full w-full max-w-[1440px] flex-row gap-5 lg:gap-6">
                            {modules.map((module, index) => (
                              <m.button
                                key={module.id}
                                type="button"
                                onClick={() => selectModule(module.id)}
                                onMouseEnter={() => setHoveredIndex(index)}
                                onMouseLeave={() => setHoveredIndex(null)}
                                className={cn(
                                  // 桌面端：垂直面板布局，居中对齐
                                  "group relative flex cursor-pointer flex-col items-center justify-end gap-0 overflow-hidden rounded-sm border-0 border-l p-8 lg:p-10",
                                  // 桌面端 hover 效果
                                  hoveredIndex === index
                                    ? "flex-[1.6] border-brand-charcoal/15 bg-white/65 shadow-[0_30px_60px_-10px_rgba(0,38,62,0.08)]"
                                    : hoveredIndex !== null
                                      ? "flex-[0.9] border-brand-charcoal/5 bg-white/25"
                                      : "flex-1 border-brand-charcoal/10 bg-white/30"
                                )}
                                style={{
                                  transition: "flex 0.9s cubic-bezier(0.16, 1, 0.3, 1), background-color 0.6s cubic-bezier(0.16, 1, 0.3, 1), border-color 0.5s ease, box-shadow 0.7s cubic-bezier(0.16, 1, 0.3, 1)"
                                }}
                                initial={{ opacity: 0, y: 15 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.7, delay: 0.1 + index * 0.05, ease: [0.16, 1, 0.3, 1] }}
                              >
                                {/* 序号 */}
                                <span
                                  className={cn(
                                    "mb-auto text-[13px] font-normal tracking-wide",
                                    hoveredIndex === index
                                      ? "text-brand-charcoal/55"
                                      : "text-brand-charcoal/30"
                                  )}
                                  style={{ transition: "color 0.5s cubic-bezier(0.16, 1, 0.3, 1)" }}
                                >
                                  {module.number}
                                </span>

                                {/* 标题 */}
                                <h2
                                  className={cn(
                                    "mb-5 text-center font-light tracking-wide text-brand-charcoal",
                                    hoveredIndex === index
                                      ? "text-[28px] lg:text-[32px]"
                                      : "text-2xl lg:text-[26px]"
                                  )}
                                  style={{ transition: "font-size 0.8s cubic-bezier(0.16, 1, 0.3, 1)" }}
                                >
                                  {module.label}
                                </h2>

                                {/* 副标题 */}
                                <h3
                                  className={cn(
                                    "mb-4 max-w-[220px] text-center text-[11px] font-medium uppercase tracking-[0.1em] text-brand-charcoal",
                                    hoveredIndex === index
                                      ? "opacity-60"
                                      : "opacity-40"
                                  )}
                                  style={{
                                    transition: hoveredIndex === index
                                      ? "opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1)"
                                      : "opacity 0.4s cubic-bezier(0.16, 1, 0.3, 1)"
                                  }}
                                >
                                  {module.subtitle}
                                </h3>

                                {/* 描述文字 - hover 时显示 */}
                                <p
                                  className={cn(
                                    "max-w-[200px] text-center text-[13px] leading-relaxed text-brand-charcoal/50",
                                    hoveredIndex === index
                                      ? "translate-y-0 opacity-100"
                                      : "pointer-events-none translate-y-3 opacity-0"
                                  )}
                                  style={{
                                    transition: hoveredIndex === index
                                      ? "opacity 0.5s cubic-bezier(0.16, 1, 0.3, 1) 0.15s, transform 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.1s"
                                      : "opacity 0.3s cubic-bezier(0.16, 1, 0.3, 1), transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)"
                                  }}
                                >
                                  {module.description}
                                </p>

                                {/* 底部指示线 - hover 时显示 */}
                                <div
                                  className={cn(
                                    "absolute bottom-0 left-0 h-px bg-brand-charcoal/15",
                                    hoveredIndex === index ? "w-full" : "w-0"
                                  )}
                                  style={{
                                    transition: hoveredIndex === index
                                      ? "width 1s cubic-bezier(0.16, 1, 0.3, 1) 0.1s"
                                      : "width 0.6s cubic-bezier(0.16, 1, 0.3, 1)"
                                  }}
                                />
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
                                  "group relative flex aspect-[4/5] w-full max-w-md cursor-pointer flex-col items-center justify-center overflow-hidden rounded-2xl border-0 bg-white/40 p-8 shadow-sm transition-all duration-500 lg:p-12",
                                  hoveredIndex === index
                                    ? "scale-105 bg-white/80 shadow-2xl ring-1 ring-brand-charcoal/5"
                                    : hoveredIndex !== null
                                      ? "opacity-50 blur-[2px] grayscale-[0.5]"
                                      : "hover:bg-white/60"
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

                                {/* 标题 */}
                                <h3 className="mb-4 text-center font-display text-2xl font-light tracking-widest text-brand-charcoal lg:text-3xl">
                                  {scheme.name}
                                </h3>

                                {/* 英文标题 (如果有) */}
                                {scheme.nameEn && (
                                  <span className="mb-6 text-[10px] uppercase tracking-[0.2em] text-brand-charcoal/40">
                                    {scheme.nameEn}
                                  </span>
                                )}

                                {/* 分隔线 */}
                                <div className="mb-6 h-px w-12 bg-brand-charcoal/10" />

                                {/* 描述文字 */}
                                <p className="mb-8 max-w-[260px] text-center text-sm leading-relaxed text-brand-charcoal/70">
                                  {scheme.desc}
                                </p>

                                {/* 预计用时 - 底部 */}
                                <div className="mt-auto flex items-center gap-2 rounded-full bg-brand-charcoal/5 px-4 py-1.5 text-xs text-brand-charcoal/50">
                                  <svg
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="1.5"
                                    className="h-3.5 w-3.5"
                                  >
                                    <circle cx="12" cy="12" r="10" />
                                    <path d="M12 6v6l4 2" />
                                  </svg>
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
                          className="absolute inset-0 flex flex-col overflow-hidden px-8 pt-10 lg:px-12 lg:pt-10 items-center"
                        >
                          <div className="flex h-full w-full max-w-[1440px] flex-col justify-center">
                            {/* Level 3 Header: 标题与切换器 */}
                            <header className="mb-9 flex flex-shrink-0 items-end justify-between border-b border-brand-charcoal/10 pb-5">
                              {/* 左侧标题组 */}
                              <div className="flex flex-col gap-3">
                                <h1 className="font-sans text-[48px] font-light leading-none tracking-wider text-brand-charcoal">
                                  {selectedModule === "portable"
                                    ? modules.find(m => m.id === "portable")?.label
                                    : selectedScheme.name}
                                </h1>
                                <p className="font-sans text-[12px] tracking-widest text-brand-charcoal-light">
                                  预计用时 {selectedScheme.totalDuration || "5-10分钟"}
                                </p>
                              </div>

                              {/* 右侧切换器 - 显示子方案Tab（如有）或情景列表（随身好物不显示） */}
                              {selectedModule !== "portable" && (
                                <nav className="flex gap-10">
                                  <LayoutGroup id={`tab-${selectedModule}-${selectedScheme.id}`}>
                                    {/* 如果有子方案，显示子方案 Tab */}
                                    {selectedScheme.subPlans && selectedScheme.subPlans.length > 0 ? (
                                      selectedScheme.subPlans.map((subPlan) => {
                                        const isActive = selectedSubPlan?.id === subPlan.id;
                                        return (
                                          <button
                                            key={subPlan.id}
                                            type="button"
                                            onClick={() => {
                                              setSelectedSubPlan(subPlan);
                                              setCurrentStepIndex(0); // 重置轮播索引
                                            }}
                                            className={cn(
                                              "relative pb-2 text-[16px] tracking-widest transition-colors duration-300",
                                              isActive
                                                ? "text-brand-charcoal"
                                                : "text-brand-charcoal-light/60 hover:text-brand-charcoal"
                                            )}
                                          >
                                            {subPlan.name}
                                            {isActive && (
                                              <m.div
                                                layoutId="activeSubPlanLine"
                                                className="absolute bottom-0 left-0 h-[1.5px] w-full bg-brand-charcoal rounded-full"
                                                initial={false}
                                                transition={{ type: "spring", stiffness: 400, damping: 35 }}
                                              />
                                            )}
                                          </button>
                                        );
                                      })
                                    ) : (
                                      /* 如果没有子方案，显示情景列表（原逻辑） */
                                      moduleData[selectedModule].map((scheme) => {
                                        const isActive = scheme.id === selectedScheme.id;
                                        return (
                                          <button
                                            key={scheme.id}
                                            type="button"
                                            onClick={() => selectScheme(scheme)}
                                            className={cn(
                                              "relative pb-2 text-[16px] tracking-widest transition-colors duration-300",
                                              isActive
                                                ? "text-brand-charcoal"
                                                : "text-brand-charcoal-light/60 hover:text-brand-charcoal"
                                            )}
                                          >
                                            {scheme.name}
                                            {isActive && (
                                              <m.div
                                                layoutId="activeSchemeLine"
                                                className="absolute bottom-0 left-0 h-[1.5px] w-full bg-brand-charcoal rounded-full"
                                                initial={false}
                                                transition={{ type: "spring", stiffness: 400, damping: 35 }}
                                              />
                                            )}
                                          </button>
                                        );
                                      })
                                    )}
                                  </LayoutGroup>
                                </nav>
                              )}
                            </header>

                            {/* 内容主体：左侧边栏 + 右侧网格 */}
                            {/* 内容主体：左侧边栏 + 右侧网格 */}
                            <div className="flex w-full flex-row gap-16 items-start pb-10 max-h-[75vh]">
                              {/* 左侧：信息侧边栏 (Info Sidebar) */}
                              <m.aside
                                className="flex w-[25%] flex-shrink-0 flex-col gap-12 overflow-y-auto pr-4 scrollbar-thin"
                                initial={{ opacity: 0, x: -30 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ duration: 0.8, delay: 0.1, ease: [0.19, 1, 0.22, 1] }}
                              >
                                {/* Meta Item: Products */}
                                <div className="flex flex-col">
                                  <h3 className="mb-3 font-display text-sm font-medium uppercase tracking-[0.2em] text-brand-charcoal-light">
                                    涉及产品
                                  </h3>
                                  <div className="flex flex-wrap gap-6">
                                    {currentProducts
                                      .split("、")
                                      .map((product, index) => {
                                        // 产品图标占位符映射 - 根据产品名匹配或按索引循环
                                        const productIcons: Record<string, React.ReactNode> = {
                                          // 洁面类
                                          "洁面慕斯": (
                                            <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                                              <rect x="17.9922" y="5" width="11.9999" height="37.9997" rx="1.99992" fill="url(#paint0_linear_2088_4549)" />
                                              <path d="M18.7941 5.99999C18.7941 5.99999 18.9941 5 23.9941 5C28.9941 5 29.1941 5.99999 29.1941 5.99999L29.4941 16.9999C29.994 16.9999 29.994 17.6666 29.994 17.9999V20.9999C30.494 21.0202 30.494 21.6665 30.494 21.9999V40.9997C30.494 42.1043 29.6006 42.9997 28.496 42.9997H23.9941H19.4922C18.3876 42.9997 17.4941 42.1051 17.4941 41.0005V21.9999C17.4941 21.1999 17.6608 20.9999 17.9941 20.9999V17.9999C17.9941 17.1999 18.1608 16.9999 18.4941 16.9999L18.7941 5.99999Z" stroke="#B795A7" stroke-width="1.59993" stroke-linecap="round" stroke-linejoin="round" />
                                              <path d="M20.4062 16.9989C20.4062 16.9989 21.303 16.7988 23.9932 16.7988C26.6833 16.7988 27.5801 16.9989 27.5801 16.9989" stroke="#B795A7" stroke-width="1.19995" stroke-linecap="round" stroke-linejoin="round" />
                                              <path d="M19.7441 21.099C19.7441 21.099 20.806 20.999 23.9916 20.999C27.1772 20.999 28.239 21.099 28.239 21.099" stroke="#B795A7" stroke-width="1.19995" stroke-linecap="round" stroke-linejoin="round" />
                                              <path d="M21.7218 38.0581L21.0954 37.2988H20.9922V38.2793H21.1151V37.52L21.7407 38.2793H21.8446V37.2988H21.7218V38.0581Z" fill="#00263E" />
                                              <path d="M22.1953 37.2988H22.0723V38.2808H22.1953V37.2988Z" fill="#00263E" />
                                              <path d="M23.285 38.2793V37.2988H23.1622V37.727H22.5604V37.2988H22.4375V38.2793H22.5604V37.8511H23.1622V38.2793H23.285Z" fill="#00263E" />
                                              <path d="M23.9095 37.2988H23.4785V38.2796H23.6012V37.9535H23.9095C23.9522 37.9537 23.9945 37.9454 24.034 37.929C24.0735 37.9126 24.1094 37.8886 24.1397 37.8582C24.1699 37.8277 24.1939 37.7916 24.2103 37.7518C24.2267 37.712 24.2351 37.6693 24.2351 37.6262C24.2351 37.583 24.2267 37.5404 24.2103 37.5005C24.1939 37.4607 24.1699 37.4246 24.1397 37.3942C24.1094 37.3638 24.0735 37.3397 24.034 37.3233C23.9945 37.307 23.9522 37.2986 23.9095 37.2988ZM23.9095 37.8296H23.6012V37.4228H23.9096C23.963 37.4228 24.0142 37.4442 24.0519 37.4823C24.0897 37.5205 24.1109 37.5722 24.1109 37.6262C24.1109 37.6801 24.0897 37.7318 24.0519 37.77C24.0142 37.8081 23.9629 37.8296 23.9095 37.8296Z" fill="#00263E" />
                                              <path d="M24.4941 37.2988H24.3711V38.28H25.0151V38.1559H24.4941V37.2988Z" fill="#00263E" />
                                              <path d="M25.4697 37.2991C25.3737 37.2991 25.2799 37.3278 25.2001 37.3817C25.1203 37.4355 25.0581 37.512 25.0213 37.6016C24.9846 37.6911 24.975 37.7896 24.9937 37.8847C25.0124 37.9797 25.0586 38.067 25.1265 38.1355C25.1944 38.2041 25.2808 38.2507 25.375 38.2696C25.4691 38.2886 25.5667 38.2788 25.6554 38.2418C25.7441 38.2047 25.8199 38.1419 25.8732 38.0613C25.9265 37.9807 25.955 37.886 25.955 37.7891C25.9572 37.7241 25.9462 37.6594 25.9226 37.599C25.899 37.5385 25.8633 37.4836 25.8178 37.4376C25.7723 37.3917 25.7179 37.3557 25.658 37.3319C25.5981 37.308 25.534 37.2969 25.4697 37.2991ZM25.4697 38.1552C25.398 38.1552 25.3279 38.1337 25.2683 38.0935C25.2086 38.0533 25.1621 37.9961 25.1347 37.9292C25.1072 37.8623 25.1 37.7887 25.114 37.7177C25.128 37.6467 25.1625 37.5814 25.2132 37.5302C25.264 37.479 25.3286 37.4442 25.3989 37.43C25.4692 37.4159 25.5422 37.4231 25.6084 37.4508C25.6747 37.4785 25.7313 37.5255 25.7712 37.5857C25.811 37.6459 25.8323 37.7167 25.8323 37.7891C25.8345 37.8378 25.8267 37.8864 25.8092 37.9318C25.7918 37.9772 25.7652 38.0185 25.7311 38.053C25.6969 38.0874 25.6561 38.1143 25.6111 38.1319C25.5661 38.1495 25.5179 38.1574 25.4697 38.1552Z" fill="#00263E" />
                                              <path d="M26.4774 37.2988H26.1113V38.2794H26.4774C26.6059 38.2789 26.7289 38.227 26.8196 38.1351C26.9103 38.0432 26.9612 37.9188 26.9612 37.7891C26.9612 37.6594 26.9103 37.535 26.8196 37.4431C26.7289 37.3512 26.6059 37.2993 26.4774 37.2988ZM26.4774 38.1555H26.234V37.4227H26.4774C26.5737 37.4227 26.666 37.4613 26.734 37.53C26.8021 37.5987 26.8403 37.6919 26.8403 37.7891C26.8403 37.8863 26.8021 37.9794 26.734 38.0482C26.666 38.1169 26.5737 38.1555 26.4774 38.1555Z" fill="#00263E" />
                                              <path d="M23.0053 38.9147L22.9052 38.6719H22.8516V38.9892H22.8932V38.7351L22.9856 38.9622H23.0244L23.1168 38.7343V38.9892H23.1584V38.6719H23.1048L23.0053 38.9147Z" fill="#00263E" />
                                              <path d="M23.424 38.667C23.3922 38.6672 23.3611 38.6769 23.3347 38.6949C23.3083 38.7129 23.2878 38.7384 23.2757 38.7681C23.2636 38.7979 23.2606 38.8306 23.2669 38.8622C23.2732 38.8937 23.2886 38.9226 23.3112 38.9453C23.3338 38.968 23.3625 38.9834 23.3937 38.9897C23.425 38.9959 23.4574 38.9926 23.4868 38.9802C23.5162 38.9679 23.5413 38.947 23.559 38.9202C23.5766 38.8935 23.5861 38.862 23.5861 38.8299C23.5863 38.8083 23.5823 38.787 23.5742 38.7671C23.5661 38.7471 23.5542 38.7291 23.5391 38.7139C23.524 38.6987 23.506 38.6867 23.4862 38.6787C23.4665 38.6706 23.4453 38.6667 23.424 38.667ZM23.4231 38.9502C23.3996 38.95 23.3767 38.9428 23.3572 38.9295C23.3377 38.9161 23.3226 38.8973 23.3137 38.8753C23.3048 38.8533 23.3026 38.8291 23.3073 38.8058C23.312 38.7826 23.3234 38.7612 23.3401 38.7445C23.3568 38.7277 23.378 38.7164 23.4011 38.7118C23.4241 38.7072 23.4481 38.7096 23.4698 38.7188C23.4915 38.7279 23.51 38.7433 23.5231 38.7631C23.5361 38.7829 23.5431 38.8061 23.5431 38.8299C23.5434 38.8458 23.5405 38.8617 23.5346 38.8765C23.5286 38.8913 23.5198 38.9047 23.5086 38.9159C23.4974 38.9272 23.484 38.936 23.4693 38.9419C23.4546 38.9478 23.4389 38.9506 23.4231 38.9502Z" fill="#00263E" />
                                              <path d="M23.9115 38.9139L23.7226 38.6719H23.6895V38.9891H23.731V38.7471L23.9206 38.9891H23.9531V38.6719H23.9115V38.9139Z" fill="#00263E" />
                                              <path d="M24.1852 38.668L24.0488 38.9879H24.093L24.1326 38.8922H24.2771L24.3167 38.9879H24.3617L24.2244 38.668H24.1852ZM24.1492 38.8524L24.2051 38.7178L24.2605 38.8524H24.1492Z" fill="#00263E" />
                                              <path d="M24.5852 38.9506C24.5652 38.9502 24.5456 38.9448 24.5282 38.9348C24.5108 38.9248 24.4961 38.9105 24.4856 38.8934C24.4751 38.8762 24.4691 38.8567 24.468 38.8365C24.4669 38.8164 24.4709 38.7963 24.4795 38.7781C24.4882 38.7599 24.5012 38.7442 24.5175 38.7324C24.5337 38.7206 24.5527 38.7131 24.5725 38.7105C24.5924 38.708 24.6126 38.7105 24.6313 38.7179C24.6499 38.7252 24.6665 38.7372 24.6793 38.7526L24.7095 38.7214C24.6939 38.704 24.6748 38.6901 24.6534 38.6808C24.6321 38.6714 24.609 38.6667 24.5857 38.667C24.5643 38.6668 24.543 38.6708 24.5232 38.6789C24.5033 38.687 24.4853 38.6989 24.47 38.7141C24.4548 38.7292 24.4427 38.7473 24.4344 38.7671C24.4262 38.787 24.4219 38.8083 24.4219 38.8299C24.4218 38.8514 24.4261 38.8728 24.4343 38.8927C24.4425 38.9126 24.4545 38.9306 24.4697 38.9458C24.4849 38.961 24.5029 38.973 24.5228 38.9812C24.5426 38.9893 24.5638 38.9934 24.5852 38.9932C24.6106 38.9936 24.6358 38.988 24.6587 38.977C24.6817 38.966 24.7018 38.9499 24.7176 38.9298L24.6856 38.9008C24.6741 38.9166 24.6589 38.9293 24.6414 38.938C24.624 38.9467 24.6047 38.951 24.5852 38.9506Z" fill="#00263E" />
                                              <path d="M24.9416 38.667C24.9097 38.6672 24.8786 38.6769 24.8522 38.6949C24.8259 38.7129 24.8053 38.7384 24.7933 38.7682C24.7812 38.7979 24.7781 38.8307 24.7845 38.8622C24.7908 38.8937 24.8062 38.9227 24.8288 38.9453C24.8514 38.968 24.8801 38.9834 24.9113 38.9897C24.9426 38.9959 24.9749 38.9926 25.0043 38.9802C25.0338 38.9679 25.0589 38.947 25.0766 38.9202C25.0942 38.8935 25.1036 38.862 25.1036 38.8299C25.1039 38.8083 25.0998 38.787 25.0918 38.7671C25.0837 38.7471 25.0717 38.729 25.0566 38.7139C25.0415 38.6987 25.0236 38.6867 25.0038 38.6787C24.984 38.6706 24.9629 38.6667 24.9416 38.667ZM24.9407 38.9502C24.9172 38.95 24.8942 38.9428 24.8748 38.9295C24.8553 38.9161 24.8402 38.8973 24.8313 38.8753C24.8224 38.8533 24.8202 38.8291 24.8249 38.8058C24.8296 38.7825 24.841 38.7612 24.8577 38.7445C24.8744 38.7277 24.8956 38.7163 24.9187 38.7118C24.9417 38.7072 24.9657 38.7096 24.9874 38.7188C25.0091 38.7279 25.0276 38.7433 25.0407 38.7631C25.0537 38.7829 25.0607 38.8061 25.0607 38.8299C25.061 38.8458 25.0581 38.8617 25.0521 38.8765C25.0462 38.8913 25.0374 38.9047 25.0262 38.9159C25.0149 38.9272 25.0016 38.936 24.9869 38.9419C24.9722 38.9478 24.9565 38.9506 24.9407 38.9502Z" fill="#00263E" />
                                              <defs>
                                                <linearGradient id="paint0_linear_2088_4549" x1="29.9921" y1="23.9999" x2="17.9922" y2="23.9999" gradientUnits="userSpaceOnUse">
                                                  <stop stop-color="#EAE0E5" />
                                                  <stop offset="0.15" stop-color="#FAF8F9" />
                                                  <stop offset="0.45" stop-color="#CBB3C0" />
                                                  <stop offset="0.55" stop-color="#CBB3C0" />
                                                  <stop offset="0.85" stop-color="#FAF8F9" />
                                                  <stop offset="1" stop-color="#EAE0E5" />
                                                </linearGradient>
                                              </defs>
                                            </svg>
                                          ),
                                          // 面霜类
                                          "面霜": (
                                            <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                                              <rect x="7.59979" y="10.5986" width="32.7998" height="28.1998" fill="url(#paint0_linear_2121_4309)" />
                                              <path d="M9.42296 10.5499C11.6962 10.2844 15.9983 10 23.9981 10C31.9979 10 36.3 10.2844 38.5732 10.5499C40.0781 10.7256 40.998 11.957 40.998 13.4721V35.9998C40.998 37.6566 39.6548 38.9998 37.998 38.9998H9.99825C8.34139 38.9998 6.99823 37.6566 6.99823 35.9998V13.4721C6.99823 11.957 7.91808 10.7256 9.42296 10.5499Z" stroke="#D6C0AD" stroke-width="1.60001" />
                                              <path d="M10 20.5C10 20.5 13.7333 20 23.9999 20C34.2665 20 37.9998 20.5 37.9998 20.5" stroke="#D6C0AD" stroke-width="1.20001" stroke-linecap="round" />
                                              <path d="M19.7866 34.0414L18.595 32.6006H18.3987V34.4611H18.6325V33.0203L19.8227 34.4611H20.0204V32.6006H19.7866V34.0414Z" fill="#00263E" />
                                              <path d="M20.6924 32.6006H20.4591V34.4606H20.6924V32.6006Z" fill="#00263E" />
                                              <path d="M22.7628 34.4611V32.6006H22.5291V33.4131H21.3843V32.6006H21.1505V34.4611H21.3843V33.6485H22.5291V34.4611H22.7628Z" fill="#00263E" />
                                              <path d="M23.9515 32.6006H23.131V34.4615H23.3645V33.8428H23.9515C24.0328 33.8431 24.1133 33.8274 24.1885 33.7963C24.2637 33.7653 24.332 33.7196 24.3896 33.6619C24.4472 33.6042 24.4929 33.5356 24.5241 33.46C24.5553 33.3845 24.5713 33.3035 24.5713 33.2217C24.5713 33.1399 24.5553 33.0589 24.5241 32.9833C24.4929 32.9078 24.4472 32.8392 24.3896 32.7815C24.332 32.7238 24.2637 32.6781 24.1885 32.647C24.1133 32.616 24.0328 32.6002 23.9515 32.6006ZM23.9515 33.6076H23.3645V32.8357H23.9516C24.0532 32.8357 24.1507 32.8764 24.2226 32.9488C24.2945 33.0212 24.3349 33.1193 24.3349 33.2217C24.3349 33.324 24.2945 33.4222 24.2226 33.4946C24.1507 33.567 24.0532 33.6076 23.9515 33.6076Z" fill="#00263E" />
                                              <path d="M25.0678 32.6006H24.8341V34.4605H26.0573V34.2252H25.0678V32.6006Z" fill="#00263E" />
                                              <path d="M26.9248 32.6011C26.7423 32.6011 26.564 32.6556 26.4122 32.7577C26.2605 32.8598 26.1422 33.0049 26.0723 33.1747C26.0025 33.3445 25.9842 33.5313 26.0198 33.7116C26.0554 33.8919 26.1433 34.0574 26.2723 34.1874C26.4013 34.3173 26.5658 34.4059 26.7447 34.4417C26.9237 34.4776 27.1093 34.4592 27.2779 34.3888C27.4465 34.3185 27.5906 34.1994 27.692 34.0466C27.7934 33.8938 27.8475 33.7141 27.8475 33.5303C27.8517 33.4072 27.8307 33.2844 27.7858 33.1698C27.741 33.0551 27.6731 32.951 27.5866 32.8639C27.5001 32.7767 27.3967 32.7084 27.2829 32.6632C27.169 32.618 27.0471 32.5969 26.9248 32.6011ZM26.9248 34.2247C26.7885 34.2247 26.6552 34.184 26.5418 34.1077C26.4284 34.0314 26.34 33.923 26.2878 33.7961C26.2356 33.6692 26.222 33.5297 26.2486 33.395C26.2752 33.2603 26.3408 33.1365 26.4372 33.0394C26.5336 32.9423 26.6565 32.8762 26.7902 32.8494C26.924 32.8226 27.0626 32.8363 27.1886 32.8889C27.3145 32.9414 27.4222 33.0304 27.498 33.1446C27.5738 33.2588 27.6142 33.393 27.6142 33.5303C27.6184 33.6226 27.6035 33.7148 27.5704 33.801C27.5372 33.8872 27.4866 33.9654 27.4217 34.0308C27.3569 34.0961 27.2792 34.1471 27.1936 34.1805C27.1081 34.2139 27.0165 34.2289 26.9248 34.2247Z" fill="#00263E" />
                                              <path d="M28.8392 32.6006H28.1427V34.4612H28.8392C29.0836 34.4602 29.3176 34.3618 29.4901 34.1875C29.6626 34.0131 29.7595 33.777 29.7595 33.5309C29.7595 33.2848 29.6626 33.0487 29.4901 32.8743C29.3176 32.7 29.0836 32.6015 28.8392 32.6006ZM28.8392 34.2261H28.3761V32.8357H28.8392C29.0223 32.8357 29.1979 32.9089 29.3273 33.0393C29.4568 33.1697 29.5295 33.3465 29.5295 33.5309C29.5295 33.7153 29.4568 33.8921 29.3273 34.0225C29.1979 34.1528 29.0223 34.2261 28.8392 34.2261Z" fill="#00263E" />
                                              <path d="M22.2273 35.6634L22.0373 35.2031H21.9355V35.8047H22.0145V35.3229L22.1899 35.7536H22.2635L22.4388 35.3216V35.8047H22.5178V35.2031H22.4161L22.2273 35.6634Z" fill="#00263E" />
                                              <path d="M23.0286 35.1944C22.9678 35.1947 22.9085 35.2131 22.8582 35.2473C22.8078 35.2815 22.7686 35.3299 22.7456 35.3864C22.7226 35.443 22.7167 35.5051 22.7288 35.565C22.7408 35.6249 22.7702 35.6798 22.8133 35.7229C22.8564 35.766 22.9112 35.7953 22.9709 35.8071C23.0305 35.8189 23.0922 35.8127 23.1483 35.7892C23.2044 35.7658 23.2524 35.7261 23.2861 35.6753C23.3198 35.6245 23.3378 35.5647 23.3378 35.5036C23.3383 35.4627 23.3306 35.4222 23.3151 35.3844C23.2997 35.3465 23.277 35.3122 23.2481 35.2834C23.2193 35.2545 23.185 35.2318 23.1473 35.2165C23.1096 35.2013 23.0692 35.1937 23.0286 35.1944ZM23.0269 35.7321C22.982 35.7318 22.9383 35.7181 22.9011 35.6928C22.864 35.6675 22.8351 35.6317 22.8181 35.5899C22.8012 35.5482 22.7969 35.5023 22.8059 35.458C22.8148 35.4138 22.8366 35.3733 22.8685 35.3415C22.9003 35.3097 22.9408 35.2881 22.9848 35.2794C23.0289 35.2707 23.0745 35.2753 23.1159 35.2927C23.1573 35.31 23.1927 35.3393 23.2176 35.3769C23.2425 35.4144 23.2558 35.4585 23.2558 35.5036C23.2564 35.5339 23.2509 35.564 23.2396 35.5921C23.2282 35.6202 23.2114 35.6457 23.19 35.6671C23.1686 35.6885 23.1431 35.7052 23.1151 35.7164C23.087 35.7276 23.0571 35.7329 23.0269 35.7321Z" fill="#00263E" />
                                              <path d="M23.9563 35.6612L23.598 35.2031H23.5352V35.8036H23.614V35.3455L23.9737 35.8036H24.0352V35.2031H23.9563V35.6612Z" fill="#00263E" />
                                              <path d="M24.4756 35.1982L24.2168 35.8047H24.3005L24.3757 35.6235H24.6499L24.7251 35.8047H24.8105L24.55 35.1982H24.4756ZM24.4073 35.5478L24.5132 35.2927L24.6183 35.5478H24.4073Z" fill="#00263E" />
                                              <path d="M25.2338 35.732C25.1958 35.7312 25.1585 35.7209 25.1255 35.7019C25.0925 35.683 25.0647 35.656 25.0448 35.6234C25.0248 35.5909 25.0133 35.5538 25.0113 35.5157C25.0093 35.4775 25.0168 35.4394 25.0332 35.4049C25.0496 35.3705 25.0744 35.3407 25.1052 35.3183C25.1361 35.2959 25.172 35.2817 25.2097 35.2769C25.2474 35.2721 25.2857 35.2768 25.3211 35.2908C25.3565 35.3047 25.3879 35.3274 25.4123 35.3566L25.4696 35.2974C25.44 35.2645 25.4037 35.2382 25.3632 35.2204C25.3227 35.2027 25.2788 35.1938 25.2346 35.1944C25.194 35.1939 25.1537 35.2016 25.116 35.2169C25.0784 35.2322 25.0441 35.2549 25.0152 35.2836C24.9863 35.3123 24.9634 35.3465 24.9477 35.3842C24.932 35.4218 24.9239 35.4623 24.9238 35.5031C24.9238 35.544 24.9318 35.5844 24.9473 35.6221C24.9629 35.6599 24.9858 35.6941 25.0146 35.7229C25.0434 35.7517 25.0776 35.7744 25.1152 35.7899C25.1529 35.8053 25.1931 35.8131 25.2338 35.8128C25.282 35.8134 25.3297 35.8028 25.3732 35.782C25.4168 35.7611 25.455 35.7305 25.4849 35.6925L25.4243 35.6375C25.4023 35.6674 25.3736 35.6916 25.3404 35.708C25.3073 35.7245 25.2707 35.7327 25.2338 35.732Z" fill="#00263E" />
                                              <path d="M25.9192 35.1944C25.8584 35.1947 25.7991 35.2131 25.7488 35.2473C25.6984 35.2815 25.6592 35.3299 25.6362 35.3865C25.6132 35.443 25.6073 35.5052 25.6194 35.565C25.6315 35.6249 25.6609 35.6799 25.704 35.723C25.7471 35.766 25.8019 35.7953 25.8615 35.8071C25.9211 35.8189 25.9829 35.8127 26.039 35.7892C26.0951 35.7658 26.143 35.7261 26.1768 35.6753C26.2105 35.6245 26.2285 35.5647 26.2285 35.5036C26.2289 35.4627 26.2212 35.4222 26.2058 35.3844C26.1904 35.3465 26.1676 35.3122 26.1387 35.2833C26.1099 35.2545 26.0756 35.2318 26.0379 35.2165C26.0002 35.2012 25.9598 35.1937 25.9192 35.1944ZM25.9175 35.7321C25.8726 35.7318 25.8289 35.7181 25.7917 35.6928C25.7546 35.6675 25.7257 35.6317 25.7088 35.5899C25.6918 35.5481 25.6876 35.5022 25.6965 35.458C25.7055 35.4138 25.7273 35.3732 25.7591 35.3415C25.791 35.3097 25.8315 35.2881 25.8755 35.2794C25.9195 35.2707 25.9651 35.2753 26.0066 35.2927C26.048 35.31 26.0834 35.3393 26.1083 35.3769C26.1332 35.4144 26.1465 35.4585 26.1465 35.5036C26.147 35.5339 26.1415 35.5641 26.1302 35.5922C26.1189 35.6203 26.102 35.6458 26.0806 35.6671C26.0592 35.6885 26.0337 35.7053 26.0057 35.7164C25.9776 35.7276 25.9476 35.733 25.9175 35.7321Z" fill="#00263E" />
                                              <defs>
                                                <linearGradient id="paint0_linear_2121_4309" x1="40.3995" y1="24.6985" x2="7.59979" y2="24.6985" gradientUnits="userSpaceOnUse">
                                                  <stop stop-color="#FBF7F4" />
                                                  <stop offset="0.1" stop-color="white" />
                                                  <stop offset="0.48" stop-color="#EAD9C9" />
                                                  <stop offset="0.52" stop-color="#EAD9C9" />
                                                  <stop offset="0.9" stop-color="white" />
                                                  <stop offset="1" stop-color="#FBF7F4" />
                                                </linearGradient>
                                              </defs>
                                            </svg>
                                          ),
                                          // 精华类
                                          "精华": (
                                            <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                                              <rect x="21.0004" y="4.00098" width="6" height="12" fill="url(#paint0_linear_2088_4438)" />
                                              <rect x="19.8009" y="15.999" width="8.4" height="28" fill="url(#paint1_radial_2088_4438)" />
                                              <path d="M21.9999 15.999L19.6837 16.7711C19.2754 16.9072 18.9999 17.2893 18.9999 17.7198V42.3991C18.9999 43.2827 19.7163 43.999 20.5999 43.999H27.4C28.2836 43.999 28.9999 43.2827 28.9999 42.3991V17.7198C28.9999 17.2893 28.7245 16.9072 28.3162 16.7711L25.9999 15.999" stroke="#C2B781" stroke-width="1.59995" stroke-linecap="round" />
                                              <path d="M20.4963 4.55879C20.4963 4.15877 20.737 3.80191 21.1253 3.70603C21.6952 3.56535 22.6522 3.39941 23.9963 3.39941C25.3405 3.39941 26.2975 3.56535 26.8674 3.70603C27.2557 3.80191 27.4963 4.15877 27.4963 4.55879V14.8994C27.4963 15.4517 27.0489 15.8994 26.4967 15.8994C25.7605 15.8994 24.7591 15.8994 23.9963 15.8994C23.2336 15.8994 22.2322 15.8994 21.496 15.8994C20.9437 15.8994 20.4963 15.4517 20.4963 14.8994V4.55879Z" stroke="#A19F95" stroke-width="1.39995" />
                                              <path d="M20.9964 18H26.997" stroke="#C2B781" stroke-width="1.19996" stroke-linecap="round" />
                                              <path d="M22.089 40.0603L21.5476 39.3994H21.4584V40.2528H21.5646V39.5919L22.1053 40.2528H22.1952V39.3994H22.089V40.0603Z" fill="#00263E" />
                                              <path d="M22.4962 39.3994H22.39V40.2535H22.4962V39.3994Z" fill="#00263E" />
                                              <path d="M23.4382 40.2528V39.3994H23.332V39.7721H22.8119V39.3994H22.7057V40.2528H22.8119V39.8801H23.332V40.2528H23.4382Z" fill="#00263E" />
                                              <path d="M23.975 39.3994H23.6022V40.2534H23.7083V39.9694H23.975C24.0119 39.9696 24.0485 39.9624 24.0827 39.9481C24.1169 39.9339 24.1479 39.9129 24.1741 39.8864C24.2002 39.8599 24.221 39.8285 24.2352 39.7938C24.2493 39.7591 24.2566 39.722 24.2566 39.6844C24.2566 39.6469 24.2493 39.6097 24.2352 39.575C24.221 39.5404 24.2002 39.5089 24.1741 39.4824C24.1479 39.4559 24.1169 39.435 24.0827 39.4207C24.0485 39.4065 24.0119 39.3992 23.975 39.3994ZM23.975 39.8615H23.7083V39.5073H23.975C24.0212 39.5073 24.0655 39.526 24.0982 39.5592C24.1309 39.5924 24.1492 39.6375 24.1492 39.6844C24.1492 39.7314 24.1309 39.7764 24.0982 39.8097C24.0655 39.8429 24.0212 39.8615 23.975 39.8615Z" fill="#00263E" />
                                              <path d="M24.4802 39.3994H24.374V40.2533H24.9298V40.1452H24.4802V39.3994Z" fill="#00263E" />
                                              <path d="M25.3191 39.3997C25.2362 39.3997 25.1552 39.4246 25.0862 39.4715C25.0173 39.5183 24.9636 39.5849 24.9318 39.6628C24.9001 39.7407 24.8918 39.8264 24.908 39.9091C24.9241 39.9918 24.9641 40.0678 25.0227 40.1274C25.0813 40.187 25.156 40.2276 25.2373 40.2441C25.3186 40.2605 25.4029 40.2521 25.4794 40.2198C25.556 40.1876 25.6215 40.1329 25.6676 40.0628C25.7136 39.9927 25.7382 39.9103 25.7382 39.826C25.7401 39.7695 25.7306 39.7132 25.7102 39.6606C25.6898 39.608 25.659 39.5602 25.6197 39.5202C25.5804 39.4802 25.5334 39.4489 25.4817 39.4282C25.43 39.4074 25.3746 39.3977 25.3191 39.3997ZM25.3191 40.1445C25.2572 40.1445 25.1966 40.1258 25.1451 40.0908C25.0936 40.0559 25.0534 40.0061 25.0297 39.9479C25.006 39.8897 24.9998 39.8257 25.0119 39.7639C25.024 39.7021 25.0538 39.6453 25.0976 39.6008C25.1414 39.5562 25.1972 39.5259 25.2579 39.5136C25.3187 39.5013 25.3817 39.5076 25.4389 39.5317C25.4961 39.5558 25.545 39.5966 25.5794 39.649C25.6139 39.7014 25.6322 39.763 25.6322 39.826C25.6342 39.8683 25.6274 39.9106 25.6123 39.9501C25.5973 39.9897 25.5743 40.0256 25.5448 40.0556C25.5153 40.0855 25.48 40.1089 25.4412 40.1243C25.4023 40.1396 25.3607 40.1465 25.3191 40.1445Z" fill="#00263E" />
                                              <path d="M26.1869 39.3994H25.8704V40.2528H26.1869C26.2979 40.2524 26.4043 40.2073 26.4826 40.1273C26.561 40.0473 26.605 39.939 26.605 39.8261C26.605 39.7132 26.561 39.6049 26.4826 39.525C26.4043 39.445 26.2979 39.3998 26.1869 39.3994ZM26.1869 40.145H25.9765V39.5073H26.1869C26.2701 39.5073 26.3498 39.5409 26.4087 39.6007C26.4675 39.6605 26.5005 39.7416 26.5005 39.8261C26.5005 39.9107 26.4675 39.9918 26.4087 40.0516C26.3498 40.1114 26.2701 40.145 26.1869 40.145Z" fill="#00263E" />
                                              <path d="M23.1903 40.8047L23.1035 40.5928H23.057V40.8698H23.0931V40.6479L23.1732 40.8463H23.2069L23.287 40.6473V40.8698H23.3231V40.5928H23.2766L23.1903 40.8047Z" fill="#00263E" />
                                              <path d="M23.5516 40.5889C23.5238 40.589 23.4967 40.5975 23.4737 40.6133C23.4506 40.629 23.4327 40.6513 23.4222 40.6774C23.4116 40.7034 23.409 40.732 23.4145 40.7596C23.42 40.7872 23.4334 40.8125 23.4531 40.8324C23.4729 40.8522 23.4979 40.8657 23.5252 40.8711C23.5525 40.8766 23.5807 40.8737 23.6064 40.8629C23.632 40.8521 23.654 40.8338 23.6694 40.8104C23.6848 40.787 23.693 40.7595 23.693 40.7313C23.6932 40.7125 23.6897 40.6938 23.6827 40.6764C23.6756 40.659 23.6652 40.6432 23.652 40.6299C23.6388 40.6166 23.6232 40.6061 23.6059 40.5991C23.5887 40.5921 23.5702 40.5886 23.5516 40.5889ZM23.5508 40.8366C23.5303 40.8365 23.5103 40.8302 23.4933 40.8185C23.4763 40.8068 23.4631 40.7903 23.4553 40.7711C23.4476 40.7519 23.4456 40.7307 23.4497 40.7103C23.4538 40.69 23.4638 40.6713 23.4784 40.6566C23.4929 40.642 23.5114 40.6321 23.5316 40.6281C23.5517 40.6241 23.5726 40.6262 23.5915 40.6342C23.6105 40.6422 23.6267 40.6557 23.6381 40.6729C23.6495 40.6902 23.6555 40.7106 23.6555 40.7313C23.6558 40.7453 23.6533 40.7592 23.6481 40.7721C23.6429 40.7851 23.6352 40.7968 23.6254 40.8066C23.6156 40.8165 23.604 40.8242 23.5911 40.8294C23.5783 40.8345 23.5646 40.837 23.5508 40.8366Z" fill="#00263E" />
                                              <path d="M23.9746 40.804L23.8107 40.5928H23.782V40.8697H23.818V40.6584L23.9825 40.8697H24.0106V40.5928H23.9746V40.804Z" fill="#00263E" />
                                              <path d="M24.2082 40.5889L24.0899 40.8681H24.1282L24.1625 40.7847H24.2879L24.3222 40.8681H24.3613L24.2422 40.5889H24.2082ZM24.177 40.7499L24.2254 40.6324L24.2734 40.7499H24.177Z" fill="#00263E" />
                                              <path d="M24.5512 40.8365C24.5338 40.8361 24.5168 40.8314 24.5017 40.8226C24.4866 40.8139 24.4739 40.8015 24.4648 40.7865C24.4557 40.7715 24.4504 40.7544 24.4495 40.7369C24.4486 40.7193 24.452 40.7017 24.4595 40.6859C24.467 40.67 24.4784 40.6563 24.4924 40.646C24.5065 40.6357 24.523 40.6291 24.5402 40.6269C24.5574 40.6247 24.5749 40.6269 24.5911 40.6333C24.6073 40.6397 24.6216 40.6501 24.6328 40.6636L24.659 40.6364C24.6454 40.6212 24.6289 40.6091 24.6103 40.6009C24.5918 40.5927 24.5718 40.5886 24.5516 40.5889C24.533 40.5887 24.5146 40.5922 24.4974 40.5993C24.4802 40.6063 24.4645 40.6168 24.4513 40.63C24.4381 40.6432 24.4276 40.6589 24.4204 40.6763C24.4133 40.6936 24.4096 40.7123 24.4095 40.7311C24.4095 40.7499 24.4132 40.7685 24.4203 40.7859C24.4274 40.8033 24.4378 40.819 24.451 40.8323C24.4642 40.8456 24.4798 40.856 24.497 40.8632C24.5142 40.8703 24.5326 40.8738 24.5512 40.8737C24.5732 40.874 24.595 40.8691 24.6149 40.8595C24.6348 40.8499 24.6523 40.8358 24.666 40.8183L24.6383 40.793C24.6282 40.8068 24.6151 40.8179 24.5999 40.8255C24.5848 40.833 24.5681 40.8368 24.5512 40.8365Z" fill="#00263E" />
                                              <path d="M24.8571 40.5889C24.8293 40.589 24.8022 40.5975 24.7792 40.6133C24.7561 40.629 24.7382 40.6513 24.7277 40.6774C24.7172 40.7034 24.7145 40.732 24.72 40.7596C24.7255 40.7872 24.739 40.8125 24.7587 40.8324C24.7784 40.8522 24.8035 40.8657 24.8307 40.8711C24.858 40.8766 24.8863 40.8737 24.9119 40.8629C24.9376 40.8521 24.9595 40.8338 24.9749 40.8104C24.9904 40.787 24.9986 40.7595 24.9986 40.7313C24.9988 40.7125 24.9953 40.6938 24.9882 40.6764C24.9812 40.659 24.9707 40.6431 24.9575 40.6299C24.9444 40.6166 24.9287 40.6061 24.9114 40.5991C24.8942 40.592 24.8757 40.5886 24.8571 40.5889ZM24.8564 40.8366C24.8358 40.8364 24.8158 40.8301 24.7988 40.8185C24.7818 40.8068 24.7686 40.7903 24.7609 40.7711C24.7531 40.7518 24.7512 40.7307 24.7553 40.7103C24.7594 40.69 24.7694 40.6713 24.7839 40.6566C24.7985 40.642 24.817 40.632 24.8371 40.628C24.8573 40.6241 24.8781 40.6262 24.8971 40.6342C24.916 40.6422 24.9322 40.6557 24.9436 40.6729C24.955 40.6902 24.9611 40.7106 24.9611 40.7313C24.9613 40.7453 24.9588 40.7592 24.9536 40.7721C24.9485 40.7851 24.9407 40.7968 24.931 40.8067C24.9212 40.8165 24.9095 40.8242 24.8967 40.8294C24.8839 40.8345 24.8701 40.837 24.8564 40.8366Z" fill="#00263E" />
                                              <defs>
                                                <linearGradient id="paint0_linear_2088_4438" x1="27.0004" y1="10.001" x2="21.0004" y2="10.001" gradientUnits="userSpaceOnUse">
                                                  <stop offset="0.1" stop-color="#E4E4E1" />
                                                  <stop offset="0.2" stop-color="#EBEBE9" />
                                                  <stop offset="0.45" stop-color="#BCBBB4" />
                                                  <stop offset="0.55" stop-color="#BCBBB4" />
                                                  <stop offset="0.8" stop-color="#EBEBE9" />
                                                  <stop offset="0.9" stop-color="#E4E4E1" />
                                                </linearGradient>
                                                <radialGradient id="paint1_radial_2088_4438" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(24.0009 39.999) rotate(-90) scale(23 5.28392)">
                                                  <stop stop-color="#EDE29D" />
                                                  <stop offset="0.9" stop-color="#FEFDF6" />
                                                  <stop offset="1" stop-color="#FAF7E2" />
                                                </radialGradient>
                                              </defs>
                                            </svg>
                                          ),
                                          // 面膜
                                          "面膜": (
                                            <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                                              <rect x="11.793" y="5.7998" width="24.3998" height="36.3997" fill="url(#paint0_radial_2123_4611)" />
                                              <path d="M10.9941 6.99992C10.9941 5.89539 11.8895 5 12.9941 5H34.994C36.0986 5 36.9939 5.89539 36.9939 6.99992V9.32388C36.9939 9.72122 36.7235 10.0676 36.3381 10.1639C35.9882 10.2514 35.9882 10.7485 36.3381 10.836C36.7235 10.9324 36.9939 11.2787 36.9939 11.676V40.9998C36.9939 42.1043 36.0986 42.9997 34.994 42.9997H12.9941C11.8895 42.9997 10.9941 42.1043 10.9941 40.9998V11.5933C10.9941 11.2389 11.2209 10.9244 11.557 10.8123C11.8572 10.7123 11.8572 10.2877 11.557 10.1876C11.2209 10.0755 10.9941 9.76097 10.9941 9.40665V6.99992Z" stroke="#D2C9BC" stroke-width="1.59993" />
                                              <path d="M13.9941 8.79997C13.9941 8.35816 14.3523 8.00001 14.7941 8.00001H33.194C33.6358 8.00001 33.994 8.35817 33.994 8.79997V38.1998C33.994 38.6416 33.6358 38.9998 33.194 38.9998H14.7941C14.3523 38.9998 13.9941 38.6416 13.9941 38.1998V8.79997Z" stroke="#D2C9BC" stroke-width="1.19995" stroke-linejoin="round" />
                                              <path d="M21.6174 34.2064L20.9482 33.3984H20.8379V34.4418H20.9692V33.6338L21.6377 34.4418H21.7487V33.3984H21.6174V34.2064Z" fill="#00263E" />
                                              <path d="M22.1275 33.3984H21.9961V34.4416H22.1275V33.3984Z" fill="#00263E" />
                                              <path d="M23.2865 34.4418V33.3984H23.1552V33.8541H22.5122V33.3984H22.3809V34.4418H22.5122V33.9862H23.1552V34.4418H23.2865Z" fill="#00263E" />
                                              <path d="M23.9567 33.3984H23.4961V34.442H23.6272V34.095H23.9567C24.0023 34.0952 24.0476 34.0864 24.0898 34.069C24.132 34.0516 24.1703 34.0259 24.2026 33.9936C24.235 33.9612 24.2606 33.9227 24.2781 33.8804C24.2956 33.838 24.3046 33.7926 24.3046 33.7467C24.3046 33.7009 24.2956 33.6554 24.2781 33.6131C24.2606 33.5707 24.235 33.5322 24.2026 33.4999C24.1703 33.4675 24.132 33.4419 24.0898 33.4245C24.0476 33.4071 24.0023 33.3982 23.9567 33.3984ZM23.9567 33.9632H23.6272V33.5303H23.9567C24.0138 33.5303 24.0686 33.5531 24.1089 33.5937C24.1493 33.6343 24.1719 33.6893 24.1719 33.7467C24.1719 33.8041 24.1493 33.8592 24.1089 33.8998C24.0686 33.9403 24.0138 33.9632 23.9567 33.9632Z" fill="#00263E" />
                                              <path d="M24.5845 33.3984H24.4531V34.442H25.1409V34.3099H24.5845V33.3984Z" fill="#00263E" />
                                              <path d="M25.6261 33.3987C25.5235 33.3987 25.4232 33.4293 25.3379 33.4866C25.2526 33.5439 25.1862 33.6253 25.1469 33.7205C25.1077 33.8158 25.0974 33.9206 25.1174 34.0217C25.1374 34.1229 25.1868 34.2157 25.2593 34.2887C25.3318 34.3616 25.4242 34.4112 25.5248 34.4313C25.6254 34.4515 25.7297 34.4411 25.8245 34.4017C25.9192 34.3622 26.0002 34.2954 26.0572 34.2097C26.1142 34.1239 26.1446 34.0231 26.1446 33.92C26.147 33.8509 26.1352 33.7821 26.11 33.7178C26.0847 33.6534 26.0466 33.595 25.998 33.5461C25.9494 33.4972 25.8913 33.4589 25.8273 33.4336C25.7633 33.4082 25.6948 33.3964 25.6261 33.3987ZM25.6261 34.3096C25.5494 34.3096 25.4745 34.2867 25.4108 34.2439C25.347 34.2012 25.2974 34.1403 25.268 34.0691C25.2387 33.998 25.231 33.9197 25.246 33.8441C25.2609 33.7685 25.2978 33.6991 25.352 33.6446C25.4062 33.5902 25.4752 33.5531 25.5504 33.538C25.6256 33.523 25.7035 33.5307 25.7743 33.5602C25.8451 33.5897 25.9056 33.6396 25.9482 33.7036C25.9908 33.7677 26.0135 33.843 26.0135 33.92C26.0159 33.9718 26.0075 34.0235 25.9889 34.0719C25.9703 34.1202 25.9418 34.1641 25.9053 34.2008C25.8689 34.2375 25.8252 34.2661 25.7771 34.2848C25.729 34.3035 25.6776 34.312 25.6261 34.3096Z" fill="#00263E" />
                                              <path d="M26.7017 33.3984H26.3105V34.4419H26.7017C26.839 34.4414 26.9705 34.3862 27.0674 34.2884C27.1642 34.1906 27.2186 34.0582 27.2186 33.9202C27.2186 33.7821 27.1642 33.6497 27.0674 33.5519C26.9705 33.4542 26.839 33.399 26.7017 33.3984ZM26.7017 34.31H26.4416V33.5303H26.7017C26.8046 33.5303 26.9032 33.5714 26.9759 33.6445C27.0486 33.7176 27.0895 33.8168 27.0895 33.9202C27.0895 34.0236 27.0486 34.1227 26.9759 34.1959C26.9032 34.269 26.8046 34.31 26.7017 34.31Z" fill="#00263E" />
                                              <path d="M22.9881 35.1156L22.8814 34.8574H22.8242V35.1949H22.8686V34.9246L22.9671 35.1662H23.0084L23.1069 34.9239V35.1949H23.1513V34.8574H23.0942L22.9881 35.1156Z" fill="#00263E" />
                                              <path d="M23.4375 34.8535C23.4034 34.8537 23.3701 34.8641 23.3418 34.8832C23.3135 34.9024 23.2915 34.9295 23.2785 34.9613C23.2656 34.993 23.2623 35.0278 23.2691 35.0614C23.2758 35.095 23.2924 35.1258 23.3166 35.15C23.3408 35.1741 23.3716 35.1905 23.4051 35.1972C23.4386 35.2038 23.4733 35.2003 23.5048 35.1871C23.5363 35.174 23.5632 35.1517 23.5822 35.1232C23.6011 35.0947 23.6112 35.0612 23.6112 35.027C23.6115 35.004 23.6071 34.9813 23.5985 34.9601C23.5898 34.9389 23.577 34.9196 23.5608 34.9035C23.5446 34.8873 23.5254 34.8745 23.5042 34.866C23.483 34.8574 23.4603 34.8532 23.4375 34.8535ZM23.4366 35.1551C23.4114 35.1549 23.3868 35.1473 23.3659 35.1331C23.345 35.1189 23.3288 35.0988 23.3193 35.0754C23.3097 35.0519 23.3073 35.0262 23.3124 35.0014C23.3174 34.9766 23.3296 34.9539 23.3475 34.936C23.3654 34.9182 23.3882 34.9061 23.4129 34.9012C23.4377 34.8964 23.4633 34.8989 23.4866 34.9087C23.5098 34.9184 23.5297 34.9348 23.5437 34.9559C23.5577 34.9769 23.5652 35.0017 23.5652 35.027C23.5655 35.044 23.5624 35.0609 23.556 35.0766C23.5497 35.0924 23.5402 35.1067 23.5282 35.1186C23.5161 35.1306 23.5018 35.14 23.4861 35.1463C23.4703 35.1526 23.4535 35.1556 23.4366 35.1551Z" fill="#00263E" />
                                              <path d="M23.9599 35.1148L23.7581 34.8574H23.7227V35.1948H23.7671V34.9374L23.9697 35.1948H24.0044V34.8574H23.9599V35.1148Z" fill="#00263E" />
                                              <path d="M24.2527 34.8555L24.1073 35.1956H24.1543L24.1965 35.094H24.3506L24.3928 35.1956H24.4408L24.2944 34.8555H24.2527ZM24.2143 35.0516L24.2738 34.9085L24.3329 35.0516H24.2143Z" fill="#00263E" />
                                              <path d="M24.6741 35.1551C24.6528 35.1547 24.6319 35.1489 24.6133 35.1383C24.5948 35.1277 24.5792 35.1125 24.568 35.0943C24.5568 35.076 24.5503 35.0552 24.5492 35.0338C24.548 35.0124 24.5523 34.991 24.5615 34.9717C24.5707 34.9523 24.5846 34.9356 24.6019 34.9231C24.6192 34.9105 24.6394 34.9025 24.6606 34.8998C24.6818 34.8971 24.7033 34.8998 24.7232 34.9076C24.7431 34.9154 24.7607 34.9282 24.7744 34.9446L24.8066 34.9114C24.7899 34.8929 24.7696 34.8781 24.7468 34.8682C24.7241 34.8582 24.6994 34.8532 24.6746 34.8535C24.6518 34.8533 24.6292 34.8576 24.608 34.8662C24.5868 34.8748 24.5676 34.8875 24.5514 34.9036C24.5351 34.9197 24.5222 34.9389 24.5134 34.96C24.5046 34.9811 24.5001 35.0038 24.5 35.0267C24.5 35.0497 24.5045 35.0724 24.5132 35.0935C24.522 35.1147 24.5348 35.1339 24.551 35.1501C24.5672 35.1662 24.5864 35.179 24.6075 35.1876C24.6287 35.1963 24.6513 35.2006 24.6741 35.2005C24.7012 35.2008 24.728 35.1949 24.7525 35.1832C24.7769 35.1715 24.7984 35.1543 24.8152 35.133L24.7811 35.1022C24.7688 35.1189 24.7526 35.1325 24.734 35.1417C24.7154 35.1509 24.6949 35.1555 24.6741 35.1551Z" fill="#00263E" />
                                              <path d="M25.0607 34.8535C25.0266 34.8537 24.9933 34.8641 24.965 34.8832C24.9367 34.9024 24.9147 34.9296 24.9017 34.9613C24.8888 34.993 24.8855 35.0278 24.8923 35.0614C24.8991 35.095 24.9156 35.1258 24.9398 35.15C24.964 35.1741 24.9948 35.1905 25.0283 35.1972C25.0618 35.2038 25.0965 35.2003 25.128 35.1871C25.1595 35.174 25.1865 35.1517 25.2054 35.1232C25.2244 35.0947 25.2345 35.0612 25.2345 35.027C25.2347 35.004 25.2304 34.9813 25.2217 34.9601C25.2131 34.9389 25.2003 34.9196 25.1841 34.9034C25.1679 34.8873 25.1486 34.8745 25.1274 34.866C25.1062 34.8574 25.0835 34.8532 25.0607 34.8535ZM25.0598 35.1551C25.0346 35.1549 25.01 35.1472 24.9891 35.133C24.9682 35.1189 24.952 35.0988 24.9425 35.0753C24.933 35.0519 24.9306 35.0262 24.9356 35.0014C24.9407 34.9766 24.9529 34.9538 24.9708 34.936C24.9887 34.9182 25.0114 34.9061 25.0362 34.9012C25.0609 34.8963 25.0865 34.8989 25.1098 34.9087C25.1331 34.9184 25.153 34.9348 25.167 34.9559C25.1809 34.9769 25.1884 35.0017 25.1884 35.027C25.1887 35.044 25.1856 35.0609 25.1793 35.0766C25.1729 35.0924 25.1634 35.1067 25.1514 35.1187C25.1394 35.1306 25.1251 35.14 25.1093 35.1463C25.0936 35.1526 25.0767 35.1556 25.0598 35.1551Z" fill="#00263E" />
                                              <defs>
                                                <radialGradient id="paint0_radial_2123_4611" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(23.9929 23.9997) rotate(-180) scale(15.8599 21.8428)">
                                                  <stop offset="0.384615" stop-color="white" />
                                                  <stop offset="0.9" stop-color="#EBE7E4" />
                                                </radialGradient>
                                              </defs>
                                            </svg>
                                          ),
                                          // 护手霜
                                          "护手霜": (
                                            <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                                              <rect x="18.9868" y="6.97559" width="9.99979" height="1.92479" fill="white" />
                                              <mask id="mask0_2121_4240" maskUnits="userSpaceOnUse" x="18" y="6" width="12" height="37">
                                                <path d="M28.9885 6.97559H18.9885C18.7676 6.97559 18.5885 7.15466 18.5885 7.37557V8.77557L19.4885 9.67557C20.3393 10.5263 20.3858 34.6985 20.3884 37.3415C20.3885 37.493 20.4741 37.6181 20.6096 37.6859L21.9674 38.3648C22.1029 38.4325 22.1885 38.571 22.1885 38.7225V39.8753C22.1885 40.0962 22.0094 40.2753 21.7885 40.2753H21.6885C21.4676 40.2753 21.2885 40.4544 21.2885 40.6753V41.6753C21.2885 41.8962 21.4676 42.0753 21.6885 42.0753H26.2885C26.5094 42.0753 26.6885 41.8962 26.6885 41.6753V40.6753C26.6885 40.4544 26.5094 40.2753 26.2885 40.2753H26.1885C25.9676 40.2753 25.7885 40.0962 25.7885 39.8753V38.7225C25.7885 38.571 25.8741 38.4325 26.0096 38.3648L27.3674 37.6859C27.5029 37.6181 27.5885 37.493 27.5886 37.3415C27.5912 34.6985 27.6377 10.5263 28.4885 9.67557L29.0546 9.10943C29.2294 8.93466 29.3884 8.55057 29.3884 8.30341V7.37557C29.3884 7.15466 29.2094 6.97559 28.9885 6.97559Z" fill="#D9D9D9" />
                                              </mask>
                                              <g mask="url(#mask0_2121_4240)">
                                                <rect x="18.987" y="8.90137" width="9.99993" height="32.577" fill="url(#paint0_linear_2121_4240)" />
                                              </g>
                                              <path d="M28.9883 6.97559H18.9883C18.7674 6.97559 18.5883 7.15466 18.5883 7.37557V8.77557L19.4883 9.67557C20.3391 10.5263 20.3856 34.6985 20.3882 37.3415C20.3883 37.493 20.4739 37.6182 20.6094 37.6859L21.9672 38.3648C22.1027 38.4326 22.1883 38.5711 22.1883 38.7226V39.8753C22.1883 40.0963 22.0092 40.2753 21.7883 40.2753H21.6883C21.4674 40.2753 21.2883 40.4544 21.2883 40.6753V41.6753C21.2883 41.8962 21.4674 42.0753 21.6883 42.0753H26.2883C26.5092 42.0753 26.6883 41.8962 26.6883 41.6753V40.6753C26.6883 40.4544 26.5092 40.2753 26.2883 40.2753H26.1882C25.9673 40.2753 25.7883 40.0963 25.7883 39.8753V38.7226C25.7883 38.5711 25.8739 38.4326 26.0094 38.3648L27.3671 37.6859C27.5027 37.6182 27.5883 37.493 27.5884 37.3415C27.5909 34.6985 27.6375 10.5263 28.4882 9.67557L29.0544 9.10943C29.2292 8.93466 29.3882 8.55057 29.3882 8.30341V7.37557C29.3882 7.15466 29.2092 6.97559 28.9883 6.97559Z" stroke="#B79C8E" stroke-width="1.39994" stroke-linecap="round" stroke-linejoin="round" />
                                              <path d="M20.7289 8.97656H27.2467" stroke="#B79C8E" stroke-width="0.999959" stroke-linecap="round" stroke-linejoin="round" />
                                              <path d="M22.1254 37.0664L25.8502 37.0664" stroke="#B79C8E" stroke-width="0.999959" stroke-linecap="round" stroke-linejoin="round" />
                                              <path d="M23.5197 40.2588L24.451 40.2588" stroke="#B79C8E" stroke-width="0.999959" stroke-linecap="round" stroke-linejoin="round" />
                                              <path d="M22.1953 34.7723L21.6863 34.1611H21.6024V34.9503H21.7023V34.3392L22.2107 34.9503H22.2952V34.1611H22.1953V34.7723Z" fill="#00263E" />
                                              <path d="M22.581 34.1611H22.4813V34.9503H22.581V34.1611Z" fill="#00263E" />
                                              <path d="M23.463 34.9503V34.1611H23.3632V34.5058H22.8742V34.1611H22.7743V34.9503H22.8742V34.6056H23.3632V34.9503H23.463Z" fill="#00263E" />
                                              <path d="M23.9723 34.1611H23.622V34.9503H23.7217V34.6879H23.9723C24.007 34.6881 24.0414 34.6814 24.0735 34.6682C24.1056 34.6551 24.1348 34.6357 24.1594 34.6112C24.184 34.5868 24.2035 34.5577 24.2168 34.5256C24.2301 34.4936 24.237 34.4592 24.237 34.4245C24.237 34.3898 24.2301 34.3555 24.2168 34.3235C24.2035 34.2914 24.184 34.2623 24.1594 34.2379C24.1348 34.2134 24.1056 34.194 24.0735 34.1808C24.0414 34.1677 24.007 34.161 23.9723 34.1611ZM23.9723 34.5882H23.7217V34.2609H23.9724C24.0158 34.2609 24.0574 34.2781 24.0881 34.3088C24.1188 34.3395 24.136 34.3811 24.136 34.4245C24.136 34.468 24.1188 34.5096 24.0881 34.5403C24.0574 34.571 24.0157 34.5882 23.9723 34.5882Z" fill="#00263E" />
                                              <path d="M24.4464 34.1611H24.3466V34.9503H24.8693V34.8504H24.4464V34.1611Z" fill="#00263E" />
                                              <path d="M25.241 34.1614C25.163 34.1614 25.0867 34.1845 25.0219 34.2278C24.957 34.2711 24.9065 34.3327 24.8766 34.4048C24.8468 34.4768 24.8389 34.5561 24.8542 34.6326C24.8694 34.7091 24.9069 34.7794 24.9621 34.8345C25.0172 34.8897 25.0875 34.9272 25.164 34.9424C25.2405 34.9577 25.3198 34.9499 25.3918 34.92C25.4639 34.8902 25.5255 34.8396 25.5688 34.7748C25.6121 34.7099 25.6353 34.6337 25.6353 34.5557C25.6371 34.5034 25.6281 34.4513 25.6089 34.4027C25.5897 34.354 25.5607 34.3098 25.5238 34.2729C25.4868 34.2359 25.4426 34.2069 25.3939 34.1877C25.3453 34.1685 25.2932 34.1596 25.241 34.1614ZM25.241 34.8503C25.1827 34.8503 25.1257 34.8331 25.0773 34.8007C25.0288 34.7683 24.991 34.7223 24.9687 34.6685C24.9464 34.6146 24.9406 34.5554 24.9519 34.4982C24.9633 34.4411 24.9914 34.3886 25.0326 34.3474C25.0738 34.3062 25.1263 34.2781 25.1834 34.2667C25.2406 34.2553 25.2998 34.2612 25.3537 34.2835C25.4075 34.3058 25.4535 34.3435 25.4859 34.392C25.5183 34.4404 25.5356 34.4974 25.5356 34.5557C25.5374 34.5949 25.531 34.634 25.5168 34.6705C25.5027 34.7071 25.481 34.7403 25.4533 34.7681C25.4256 34.7958 25.3924 34.8174 25.3558 34.8316C25.3192 34.8458 25.2801 34.8521 25.241 34.8503Z" fill="#00263E" />
                                              <path d="M26.0521 34.1611H25.7545V34.9503H26.0521C26.1565 34.9499 26.2564 34.9082 26.3301 34.8342C26.4038 34.7603 26.4452 34.6601 26.4452 34.5557C26.4452 34.4513 26.4038 34.3512 26.3301 34.2772C26.2564 34.2033 26.1565 34.1615 26.0521 34.1611ZM26.0521 34.8506H25.8542V34.2609H26.0521C26.1303 34.2609 26.2053 34.2919 26.2606 34.3472C26.3159 34.4025 26.3469 34.4775 26.3469 34.5557C26.3469 34.6339 26.3159 34.709 26.2606 34.7643C26.2053 34.8196 26.1303 34.8506 26.0521 34.8506Z" fill="#00263E" />
                                              <path d="M23.233 35.4583L23.1518 35.2627H23.1083V35.5184H23.1421V35.3136L23.217 35.4966H23.2485L23.3234 35.313V35.5184H23.3572V35.2627H23.3137L23.233 35.4583Z" fill="#00263E" />
                                              <path d="M23.577 35.2588C23.551 35.2589 23.5257 35.2668 23.5041 35.2813C23.4826 35.2958 23.4659 35.3164 23.456 35.3404C23.4462 35.3645 23.4437 35.3909 23.4488 35.4163C23.454 35.4418 23.4666 35.4651 23.485 35.4834C23.5034 35.5017 23.5268 35.5142 23.5523 35.5192C23.5778 35.5242 23.6041 35.5216 23.6281 35.5116C23.6521 35.5016 23.6726 35.4848 23.687 35.4632C23.7014 35.4416 23.7091 35.4162 23.7091 35.3902C23.7093 35.3729 23.706 35.3556 23.6994 35.3395C23.6928 35.3235 23.6831 35.3089 23.6708 35.2966C23.6585 35.2844 23.6438 35.2747 23.6277 35.2682C23.6116 35.2617 23.5943 35.2585 23.577 35.2588ZM23.5762 35.4873C23.5571 35.4872 23.5384 35.4814 23.5225 35.4706C23.5066 35.4599 23.4943 35.4447 23.487 35.4269C23.4798 35.4092 23.478 35.3896 23.4818 35.3709C23.4856 35.3521 23.4949 35.3348 23.5085 35.3213C23.5221 35.3078 23.5394 35.2986 23.5583 35.2949C23.5771 35.2913 23.5966 35.2932 23.6143 35.3006C23.632 35.308 23.6471 35.3204 23.6577 35.3364C23.6684 35.3523 23.6741 35.3711 23.6741 35.3902C23.6743 35.4031 23.6719 35.4159 23.6671 35.4278C23.6623 35.4398 23.6551 35.4506 23.6459 35.4597C23.6368 35.4688 23.6259 35.4759 23.6139 35.4807C23.6019 35.4854 23.5891 35.4877 23.5762 35.4873Z" fill="#00263E" />
                                              <path d="M23.9721 35.4577L23.8188 35.2627H23.7919V35.5184H23.8257V35.3233L23.9795 35.5184H24.0059V35.2627H23.9721V35.4577Z" fill="#00263E" />
                                              <path d="M24.1936 35.2607L24.0829 35.5185H24.1187L24.1508 35.4415H24.268L24.3002 35.5185H24.3367L24.2253 35.2607H24.1936ZM24.1644 35.4093L24.2096 35.3009L24.2545 35.4093H24.1644Z" fill="#00263E" />
                                              <path d="M24.5162 35.4873C24.4999 35.487 24.484 35.4826 24.4699 35.4746C24.4558 35.4665 24.444 35.455 24.4354 35.4412C24.4269 35.4274 24.422 35.4116 24.4211 35.3954C24.4203 35.3792 24.4235 35.363 24.4305 35.3483C24.4375 35.3337 24.4481 35.321 24.4613 35.3115C24.4744 35.302 24.4898 35.2959 24.5059 35.2939C24.522 35.2918 24.5384 35.2939 24.5535 35.2998C24.5686 35.3057 24.582 35.3153 24.5925 35.3278L24.617 35.3026C24.6043 35.2886 24.5888 35.2774 24.5715 35.2699C24.5542 35.2623 24.5354 35.2585 24.5166 35.2588C24.4992 35.2586 24.482 35.2619 24.4659 35.2684C24.4498 35.2749 24.4351 35.2845 24.4228 35.2967C24.4104 35.3089 24.4006 35.3235 24.3939 35.3395C24.3872 35.3555 24.3838 35.3727 24.3837 35.39C24.3837 35.4074 24.3871 35.4246 24.3938 35.4406C24.4004 35.4567 24.4102 35.4712 24.4225 35.4835C24.4348 35.4957 24.4495 35.5054 24.4655 35.5119C24.4816 35.5185 24.4988 35.5218 24.5162 35.5217C24.5368 35.5219 24.5572 35.5174 24.5758 35.5086C24.5944 35.4997 24.6107 35.4867 24.6235 35.4705L24.5976 35.4472C24.5882 35.4599 24.5759 35.4702 24.5618 35.4771C24.5476 35.4841 24.532 35.4876 24.5162 35.4873Z" fill="#00263E" />
                                              <path d="M24.8074 35.2588C24.7814 35.259 24.7561 35.2668 24.7346 35.2813C24.7131 35.2958 24.6963 35.3164 24.6865 35.3404C24.6767 35.3645 24.6742 35.3909 24.6793 35.4163C24.6845 35.4418 24.697 35.4651 24.7155 35.4834C24.7339 35.5017 24.7573 35.5142 24.7828 35.5192C24.8082 35.5242 24.8346 35.5216 24.8586 35.5116C24.8826 35.5016 24.9031 35.4848 24.9175 35.4632C24.9319 35.4416 24.9396 35.4162 24.9396 35.3902C24.9398 35.3729 24.9365 35.3556 24.9299 35.3395C24.9233 35.3235 24.9136 35.3089 24.9012 35.2966C24.8889 35.2844 24.8743 35.2747 24.8582 35.2682C24.842 35.2617 24.8248 35.2585 24.8074 35.2588ZM24.8067 35.4873C24.7875 35.4872 24.7688 35.4814 24.7529 35.4706C24.7371 35.4599 24.7247 35.4446 24.7175 35.4269C24.7103 35.4091 24.7084 35.3896 24.7123 35.3708C24.7161 35.3521 24.7254 35.3348 24.739 35.3213C24.7526 35.3078 24.7699 35.2986 24.7887 35.2949C24.8076 35.2912 24.8271 35.2932 24.8448 35.3006C24.8625 35.308 24.8776 35.3204 24.8882 35.3364C24.8989 35.3523 24.9045 35.3711 24.9045 35.3902C24.9048 35.4031 24.9024 35.4159 24.8976 35.4279C24.8927 35.4398 24.8855 35.4506 24.8764 35.4597C24.8672 35.4688 24.8563 35.4759 24.8444 35.4807C24.8324 35.4854 24.8196 35.4877 24.8067 35.4873Z" fill="#00263E" />
                                              <defs>
                                                <linearGradient id="paint0_linear_2121_4240" x1="28.9869" y1="25.1899" x2="18.987" y2="25.1899" gradientUnits="userSpaceOnUse">
                                                  <stop stop-color="#F6F1EF" />
                                                  <stop offset="0.1" stop-color="white" />
                                                  <stop offset="0.48" stop-color="#D1BAAE" />
                                                  <stop offset="0.52" stop-color="#D1BAAE" />
                                                  <stop offset="0.9" stop-color="white" />
                                                  <stop offset="1" stop-color="#F6F1EF" />
                                                </linearGradient>
                                              </defs>
                                            </svg>

                                          ),
                                          // 防晒乳
                                          "防晒乳": (
                                            <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                                              <rect x="9.78906" y="4.7998" width="28.3998" height="38.3997" rx="9.99984" fill="url(#paint0_radial_2121_4267)" />
                                              <path d="M11.9902 19C11.9902 19 15.1902 18 23.9901 18C32.7901 18 35.9901 19 35.9901 19" stroke="#DBBBA4" stroke-width="1.19998" stroke-linecap="round" />
                                              <path d="M23.7381 4C12.9882 4 10.5798 10.6337 9.7382 13.9999C8.89665 17.3661 8.87818 30.5597 9.7382 33.9998C10.5982 37.4399 12.9882 43.9997 23.7381 43.9997" stroke="#DBBBA4" stroke-width="1.59997" stroke-linecap="round" stroke-linejoin="round" />
                                              <path d="M23.9881 4C34.738 4 37.1464 10.6337 37.988 13.9999C38.8295 17.3661 38.848 30.5597 37.988 33.9998C37.128 37.4399 34.738 43.9997 23.9881 43.9997" stroke="#DBBBA4" stroke-width="1.59997" stroke-linecap="round" stroke-linejoin="round" />
                                              <path d="M19.7779 35.437L18.5834 33.999H18.3865V35.8559H18.6209V34.4179L19.8141 35.8559H20.0123V33.999H19.7779V35.437Z" fill="#00263E" />
                                              <path d="M20.6846 33.999H20.4507V35.8552H20.6846V33.999Z" fill="#00263E" />
                                              <path d="M22.7586 35.8559V33.999H22.5242V34.81H21.3765V33.999H21.1422V35.8559H21.3765V35.0449H22.5242V35.8559H22.7586Z" fill="#00263E" />
                                              <path d="M23.9492 33.999H23.1265V35.8565H23.3606V35.2389H23.9492C24.0306 35.2393 24.1114 35.2235 24.1867 35.1925C24.2621 35.1616 24.3306 35.116 24.3884 35.0584C24.4461 35.0007 24.4919 34.9323 24.5232 34.8569C24.5544 34.7815 24.5705 34.7006 24.5705 34.619C24.5705 34.5373 24.5544 34.4565 24.5232 34.3811C24.4919 34.3057 24.4461 34.2372 24.3884 34.1796C24.3306 34.122 24.2621 34.0764 24.1867 34.0454C24.1114 34.0144 24.0306 33.9987 23.9492 33.999ZM23.9492 35.0042H23.3607V34.2338H23.9492C24.0511 34.2338 24.1489 34.2743 24.2209 34.3466C24.293 34.4188 24.3335 34.5168 24.3335 34.619C24.3335 34.7211 24.293 34.8191 24.2209 34.8914C24.1489 34.9636 24.0511 35.0042 23.9492 35.0042Z" fill="#00263E" />
                                              <path d="M25.0678 33.999H24.8336V35.8551H26.0596V35.6202H25.0678V33.999Z" fill="#00263E" />
                                              <path d="M26.9272 33.9996C26.7442 33.9995 26.5652 34.054 26.413 34.1559C26.2607 34.2579 26.1421 34.4028 26.072 34.5724C26.0019 34.742 25.9836 34.9286 26.0193 35.1086C26.055 35.2886 26.1432 35.454 26.2726 35.5837C26.4021 35.7135 26.567 35.8019 26.7466 35.8377C26.9261 35.8736 27.1122 35.8552 27.2814 35.7849C27.4505 35.7147 27.5951 35.5958 27.6968 35.4431C27.7985 35.2905 27.8528 35.1111 27.8528 34.9276C27.8571 34.8046 27.836 34.682 27.791 34.5675C27.746 34.453 27.6779 34.349 27.5911 34.2619C27.5043 34.1749 27.4006 34.1067 27.2864 34.0616C27.1722 34.0164 27.0499 33.9953 26.9272 33.9996ZM26.9272 35.621C26.7904 35.621 26.6567 35.5803 26.543 35.5042C26.4292 35.428 26.3406 35.3197 26.2882 35.193C26.2358 35.0663 26.2221 34.9269 26.2488 34.7924C26.2755 34.6579 26.3413 34.5343 26.4381 34.4373C26.5348 34.3403 26.658 34.2743 26.7922 34.2475C26.9264 34.2207 27.0654 34.2345 27.1918 34.2869C27.3182 34.3394 27.4262 34.4283 27.5022 34.5423C27.5782 34.6564 27.6188 34.7904 27.6188 34.9276C27.623 35.0197 27.6081 35.1118 27.5748 35.1979C27.5416 35.2839 27.4908 35.3621 27.4257 35.4273C27.3606 35.4926 27.2827 35.5435 27.1969 35.5769C27.111 35.6102 27.0192 35.6252 26.9272 35.621Z" fill="#00263E" />
                                              <path d="M28.8463 33.999H28.148V35.856H28.8463C29.0913 35.8551 29.3259 35.7568 29.4988 35.5828C29.6718 35.4088 29.7689 35.1732 29.7689 34.9275C29.7689 34.6819 29.6718 34.4462 29.4988 34.2722C29.3259 34.0982 29.0913 34 28.8463 33.999ZM28.8463 35.6214H28.382V34.2337H28.8463C29.0298 34.2337 29.2058 34.3068 29.3356 34.4369C29.4654 34.567 29.5383 34.7435 29.5383 34.9275C29.5383 35.1115 29.4654 35.288 29.3356 35.4181C29.2058 35.5483 29.0298 35.6214 28.8463 35.6214Z" fill="#00263E" />
                                              <path d="M22.2221 37.0558L22.0315 36.5957H21.9295V37.197H22.0087V36.7154L22.1845 37.1459H22.2583L22.4342 36.7141V37.197H22.5134V36.5957H22.4114L22.2221 37.0558Z" fill="#00263E" />
                                              <path d="M23.0253 36.5879C22.9644 36.5883 22.9049 36.6067 22.8544 36.6408C22.8039 36.675 22.7646 36.7234 22.7415 36.7799C22.7185 36.8364 22.7126 36.8985 22.7247 36.9584C22.7368 37.0182 22.7663 37.0731 22.8095 37.1162C22.8527 37.1593 22.9076 37.1886 22.9674 37.2003C23.0272 37.2121 23.0891 37.2059 23.1454 37.1825C23.2016 37.159 23.2497 37.1194 23.2835 37.0686C23.3173 37.0178 23.3354 36.9581 23.3354 36.897C23.3358 36.8562 23.3281 36.8156 23.3127 36.7778C23.2972 36.74 23.2744 36.7057 23.2455 36.6769C23.2166 36.6481 23.1822 36.6254 23.1444 36.6101C23.1066 36.5948 23.0661 36.5873 23.0253 36.5879ZM23.0236 37.1254C22.9786 37.1251 22.9347 37.1114 22.8975 37.0861C22.8602 37.0608 22.8313 37.025 22.8143 36.9833C22.7973 36.9415 22.793 36.8956 22.802 36.8515C22.811 36.8073 22.8328 36.7667 22.8647 36.735C22.8967 36.7032 22.9373 36.6816 22.9814 36.6729C23.0256 36.6642 23.0713 36.6689 23.1129 36.6862C23.1544 36.7035 23.1899 36.7328 23.2149 36.7703C23.2398 36.8078 23.2532 36.8519 23.2532 36.897C23.2537 36.9273 23.2482 36.9574 23.2369 36.9855C23.2255 37.0136 23.2086 37.0391 23.1871 37.0604C23.1657 37.0817 23.1401 37.0985 23.112 37.1097C23.0839 37.1209 23.0539 37.1262 23.0236 37.1254Z" fill="#00263E" />
                                              <path d="M23.953 37.0557L23.5938 36.5977H23.5308V37.1981H23.6099V36.7401L23.9705 37.1981H24.0321V36.5977H23.953V37.0557Z" fill="#00263E" />
                                              <path d="M24.474 36.5928L24.2144 37.1989H24.2984L24.3737 37.0178H24.6487L24.7242 37.1989H24.8098L24.5485 36.5928H24.474ZM24.4054 36.9422L24.5117 36.6872L24.6171 36.9422H24.4054Z" fill="#00263E" />
                                              <path d="M25.2303 37.1254C25.1922 37.1246 25.1549 37.1143 25.1218 37.0954C25.0887 37.0764 25.0608 37.0494 25.0408 37.0169C25.0208 36.9844 25.0093 36.9473 25.0072 36.9091C25.0052 36.871 25.0128 36.8329 25.0292 36.7984C25.0457 36.764 25.0705 36.7342 25.1014 36.7118C25.1323 36.6894 25.1683 36.6752 25.2062 36.6704C25.244 36.6656 25.2824 36.6704 25.3179 36.6843C25.3534 36.6983 25.3848 36.7209 25.4094 36.7502L25.4668 36.691C25.4371 36.658 25.4007 36.6317 25.3601 36.614C25.3194 36.5962 25.2755 36.5873 25.2312 36.5879C25.1904 36.5875 25.15 36.5951 25.1123 36.6105C25.0745 36.6258 25.0401 36.6484 25.0111 36.6771C24.9822 36.7058 24.9591 36.74 24.9434 36.7777C24.9277 36.8153 24.9196 36.8558 24.9195 36.8966C24.9194 36.9374 24.9274 36.9779 24.9431 37.0156C24.9587 37.0533 24.9816 37.0875 25.0105 37.1163C25.0394 37.1451 25.0737 37.1679 25.1114 37.1833C25.1492 37.1987 25.1896 37.2065 25.2303 37.2062C25.2787 37.2068 25.3265 37.1962 25.3702 37.1754C25.4138 37.1546 25.4521 37.1239 25.4821 37.0859L25.4213 37.031C25.3993 37.0609 25.3705 37.085 25.3372 37.1015C25.304 37.1179 25.2673 37.1261 25.2303 37.1254Z" fill="#00263E" />
                                              <path d="M25.9176 36.5879C25.8567 36.5883 25.7972 36.6067 25.7467 36.6409C25.6963 36.675 25.657 36.7234 25.6339 36.7799C25.6108 36.8365 25.6049 36.8986 25.617 36.9584C25.6291 37.0183 25.6586 37.0732 25.7019 37.1162C25.7451 37.1593 25.8 37.1886 25.8598 37.2003C25.9196 37.2121 25.9815 37.2059 26.0378 37.1825C26.094 37.159 26.1421 37.1194 26.1759 37.0686C26.2097 37.0178 26.2278 36.9581 26.2278 36.897C26.2282 36.8562 26.2205 36.8156 26.205 36.7778C26.1896 36.74 26.1667 36.7057 26.1378 36.6769C26.1089 36.648 26.0745 36.6253 26.0367 36.6101C25.9989 36.5948 25.9584 36.5873 25.9176 36.5879ZM25.9159 37.1254C25.871 37.1251 25.8271 37.1114 25.7898 37.0861C25.7526 37.0608 25.7236 37.025 25.7066 36.9832C25.6897 36.9415 25.6854 36.8956 25.6944 36.8514C25.7034 36.8072 25.7252 36.7667 25.7571 36.7349C25.7891 36.7032 25.8297 36.6816 25.8738 36.6729C25.918 36.6642 25.9637 36.6689 26.0053 36.6862C26.0468 36.7035 26.0823 36.7328 26.1073 36.7703C26.1322 36.8078 26.1455 36.8519 26.1455 36.897C26.1461 36.9273 26.1406 36.9574 26.1292 36.9855C26.1179 37.0136 26.101 37.0391 26.0795 37.0604C26.058 37.0818 26.0325 37.0985 26.0044 37.1097C25.9763 37.1209 25.9462 37.1262 25.9159 37.1254Z" fill="#00263E" />
                                              <defs>
                                                <radialGradient id="paint0_radial_2121_4267" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(23.989 23.9997) rotate(180) scale(14.1999 19.1999)">
                                                  <stop stop-color="#F1D7C4" />
                                                  <stop offset="0.826923" stop-color="#FAF5F2" />
                                                  <stop offset="1" stop-color="#F8F1ED" />
                                                </radialGradient>
                                              </defs>
                                            </svg>
                                          ),
                                          // 身体乳
                                          "身体乳": (
                                            <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                                              <rect x="18.7954" y="2" width="10.4" height="44" fill="url(#paint0_linear_2121_4179)" />
                                              <path d="M17.9945 3.82842C17.9945 3.29799 18.2285 2.80528 18.7276 2.62557C19.516 2.34166 21.0719 2 23.9945 2C26.9171 2 28.473 2.34166 29.2615 2.62557C29.7605 2.80528 29.9945 3.29799 29.9945 3.82842V44C29.9945 45.1046 29.0991 46 27.9945 46H19.9945C18.8899 46 17.9945 45.1046 17.9945 44V3.82842Z" stroke="#C1AFA1" stroke-width="1.59998" stroke-linejoin="round" />
                                              <path d="M19.9948 9.80092C19.9948 9.80092 20.9946 9.50098 23.9941 9.50098C26.9935 9.50098 27.9934 9.80092 27.9934 9.80092" stroke="#C1AFA1" stroke-width="1.19999" stroke-linecap="round" />
                                              <circle cx="23.9955" cy="5.00131" r="1.00034" stroke="#C1AFA1" stroke-width="0.999991" />
                                              <path d="M21.6139 41.0138L20.9462 40.2031H20.8362V41.2499H20.9672V40.4393L21.6341 41.2499H21.7449V40.2031H21.6139V41.0138Z" fill="#00263E" />
                                              <path d="M22.1195 40.2031H21.9884V41.2507H22.1195V40.2031Z" fill="#00263E" />
                                              <path d="M23.2789 41.2499V40.2031H23.1479V40.6603H22.5064V40.2031H22.3754V41.2499H22.5064V40.7928H23.1479V41.2499H23.2789Z" fill="#00263E" />
                                              <path d="M23.9444 40.2031H23.4849V41.25H23.6156V40.902H23.9444C23.9899 40.9022 24.035 40.8933 24.0771 40.8758C24.1192 40.8584 24.1574 40.8327 24.1897 40.8002C24.2219 40.7677 24.2475 40.7291 24.265 40.6866C24.2824 40.6441 24.2914 40.5986 24.2914 40.5525C24.2914 40.5065 24.2824 40.461 24.265 40.4185C24.2475 40.376 24.2219 40.3374 24.1897 40.3049C24.1574 40.2724 24.1192 40.2467 24.0771 40.2293C24.035 40.2118 23.9899 40.2029 23.9444 40.2031ZM23.9444 40.7697H23.6156V40.3354H23.9444C24.0013 40.3354 24.0559 40.3583 24.0962 40.399C24.1364 40.4397 24.159 40.495 24.159 40.5525C24.159 40.6101 24.1364 40.6654 24.0962 40.7061C24.0559 40.7468 24.0013 40.7697 23.9444 40.7697Z" fill="#00263E" />
                                              <path d="M24.569 40.2031H24.438V41.2499H25.1233V41.1175H24.569V40.2031Z" fill="#00263E" />
                                              <path d="M25.6074 40.2034C25.5052 40.2034 25.4052 40.2341 25.3202 40.2916C25.2352 40.349 25.169 40.4307 25.1298 40.5263C25.0907 40.6219 25.0804 40.727 25.1004 40.8285C25.1203 40.9299 25.1696 41.0231 25.2419 41.0963C25.3141 41.1694 25.4063 41.2193 25.5065 41.2395C25.6068 41.2596 25.7108 41.2493 25.8052 41.2097C25.8997 41.1701 25.9804 41.1031 26.0372 41.0171C26.094 40.931 26.1243 40.8299 26.1243 40.7265C26.1267 40.6571 26.1149 40.5881 26.0898 40.5235C26.0647 40.459 26.0267 40.4004 25.9782 40.3513C25.9297 40.3023 25.8718 40.2638 25.808 40.2384C25.7442 40.2129 25.676 40.201 25.6074 40.2034ZM25.6074 41.1173C25.531 41.1173 25.4564 41.0944 25.3928 41.0514C25.3293 41.0085 25.2798 40.9475 25.2505 40.8761C25.2213 40.8046 25.2137 40.7261 25.2286 40.6503C25.2434 40.5744 25.2802 40.5048 25.3342 40.4501C25.3883 40.3955 25.4571 40.3583 25.532 40.3432C25.6069 40.3281 25.6846 40.3358 25.7552 40.3654C25.8258 40.395 25.8861 40.4451 25.9285 40.5093C25.971 40.5736 25.9936 40.6492 25.9936 40.7265C25.996 40.7784 25.9877 40.8303 25.9691 40.8788C25.9505 40.9273 25.9222 40.9714 25.8858 41.0081C25.8495 41.0449 25.806 41.0736 25.758 41.0924C25.7101 41.1112 25.6588 41.1197 25.6074 41.1173Z" fill="#00263E" />
                                              <path d="M26.6801 40.2031H26.2898V41.25H26.6801C26.817 41.2494 26.9482 41.1941 27.0449 41.096C27.1415 40.9979 27.1958 40.865 27.1958 40.7266C27.1958 40.5881 27.1415 40.4552 27.0449 40.3571C26.9482 40.259 26.817 40.2037 26.6801 40.2031ZM26.6801 41.1177H26.4206V40.3354H26.6801C26.7827 40.3354 26.8811 40.3766 26.9536 40.45C27.0262 40.5233 27.0669 40.6228 27.0669 40.7266C27.0669 40.8303 27.0262 40.9298 26.9536 41.0031C26.8811 41.0765 26.7827 41.1177 26.6801 41.1177Z" fill="#00263E" />
                                              <path d="M22.9763 41.927L22.87 41.668H22.8131V42.0065H22.8573V41.7354L22.9553 41.9777H22.9965L23.0945 41.7346V42.0065H23.1387V41.668H23.0818L22.9763 41.927Z" fill="#00263E" />
                                              <path d="M23.4217 41.6641C23.3877 41.6643 23.3546 41.6746 23.3264 41.6939C23.2983 41.7131 23.2764 41.7403 23.2635 41.7722C23.2506 41.804 23.2473 41.8389 23.2541 41.8726C23.2608 41.9063 23.2773 41.9372 23.3013 41.9615C23.3254 41.9857 23.3561 42.0022 23.3894 42.0088C23.4228 42.0155 23.4573 42.012 23.4887 41.9988C23.5201 41.9856 23.5469 41.9633 23.5657 41.9347C23.5846 41.9061 23.5947 41.8725 23.5947 41.8381C23.5949 41.8151 23.5906 41.7923 23.582 41.771C23.5734 41.7497 23.5606 41.7304 23.5445 41.7142C23.5284 41.6979 23.5092 41.6852 23.4881 41.6766C23.467 41.668 23.4445 41.6637 23.4217 41.6641ZM23.4208 41.9667C23.3957 41.9665 23.3712 41.9588 23.3504 41.9445C23.3297 41.9303 23.3135 41.9102 23.304 41.8866C23.2946 41.8631 23.2922 41.8373 23.2972 41.8124C23.3022 41.7876 23.3144 41.7647 23.3322 41.7469C23.35 41.729 23.3726 41.7168 23.3973 41.7119C23.4219 41.707 23.4474 41.7096 23.4706 41.7194C23.4937 41.7292 23.5135 41.7456 23.5274 41.7668C23.5414 41.7879 23.5488 41.8127 23.5488 41.8381C23.5491 41.8551 23.546 41.8721 23.5397 41.8879C23.5334 41.9037 23.5239 41.918 23.512 41.9301C23.5 41.9421 23.4858 41.9515 23.4701 41.9578C23.4544 41.9641 23.4376 41.9671 23.4208 41.9667Z" fill="#00263E" />
                                              <path d="M23.9411 41.9269L23.7392 41.668H23.7038V42.0074H23.7482V41.7484L23.9509 42.0074H23.9856V41.668H23.9411V41.9269Z" fill="#00263E" />
                                              <path d="M24.2353 41.668L24.0905 42.0092H24.1374L24.1794 41.9072H24.3327L24.3748 42.0092H24.4225L24.2768 41.668H24.2353ZM24.1971 41.8647L24.2563 41.7211L24.3151 41.8647H24.1971Z" fill="#00263E" />
                                              <path d="M24.659 41.9668C24.6377 41.9664 24.6168 41.9606 24.5983 41.9499C24.5798 41.9392 24.5642 41.924 24.553 41.9057C24.5418 41.8874 24.5353 41.8665 24.5342 41.845C24.5331 41.8235 24.5373 41.8021 24.5465 41.7827C24.5557 41.7632 24.5696 41.7465 24.5869 41.7339C24.6042 41.7213 24.6243 41.7132 24.6455 41.7105C24.6666 41.7078 24.6881 41.7105 24.708 41.7184C24.7279 41.7262 24.7454 41.739 24.7592 41.7555L24.7913 41.7221C24.7747 41.7036 24.7543 41.6888 24.7316 41.6788C24.7089 41.6687 24.6843 41.6637 24.6595 41.6641C24.6367 41.6638 24.6141 41.6682 24.593 41.6768C24.5718 41.6854 24.5526 41.6982 24.5364 41.7143C24.5202 41.7305 24.5073 41.7497 24.4985 41.771C24.4897 41.7922 24.4852 41.815 24.4851 41.838C24.4851 41.861 24.4896 41.8837 24.4983 41.905C24.5071 41.9262 24.5199 41.9455 24.536 41.9617C24.5522 41.9779 24.5714 41.9908 24.5925 41.9994C24.6136 42.0081 24.6362 42.0125 24.659 42.0123C24.686 42.0127 24.7128 42.0067 24.7372 41.995C24.7617 41.9833 24.7831 41.966 24.7999 41.9446L24.7659 41.9137C24.7535 41.9305 24.7374 41.9441 24.7188 41.9534C24.7002 41.9626 24.6797 41.9672 24.659 41.9668Z" fill="#00263E" />
                                              <path d="M25.0429 41.6641C25.009 41.6643 24.9758 41.6746 24.9476 41.6939C24.9195 41.7131 24.8976 41.7404 24.8847 41.7722C24.8718 41.804 24.8686 41.8389 24.8753 41.8726C24.8821 41.9063 24.8985 41.9372 24.9226 41.9615C24.9467 41.9857 24.9774 42.0022 25.0107 42.0088C25.044 42.0155 25.0786 42.012 25.1099 41.9988C25.1413 41.9856 25.1681 41.9633 25.187 41.9347C25.2058 41.9061 25.2159 41.8725 25.2159 41.8381C25.2161 41.8151 25.2118 41.7923 25.2032 41.771C25.1946 41.7497 25.1819 41.7304 25.1657 41.7141C25.1496 41.6979 25.1304 41.6851 25.1094 41.6765C25.0883 41.6679 25.0657 41.6637 25.0429 41.6641ZM25.042 41.9667C25.0169 41.9665 24.9924 41.9588 24.9717 41.9445C24.9509 41.9303 24.9348 41.9101 24.9253 41.8866C24.9158 41.8631 24.9134 41.8373 24.9184 41.8124C24.9235 41.7875 24.9356 41.7647 24.9534 41.7468C24.9712 41.729 24.9939 41.7168 25.0185 41.7119C25.0431 41.707 25.0687 41.7096 25.0918 41.7194C25.115 41.7292 25.1348 41.7456 25.1487 41.7668C25.1626 41.7879 25.1701 41.8127 25.1701 41.8381C25.1704 41.8551 25.1673 41.8721 25.1609 41.8879C25.1546 41.9037 25.1452 41.9181 25.1332 41.9301C25.1212 41.9421 25.107 41.9515 25.0913 41.9578C25.0756 41.9641 25.0589 41.9671 25.042 41.9667Z" fill="#00263E" />
                                              <defs>
                                                <linearGradient id="paint0_linear_2121_4179" x1="29.1954" y1="24" x2="18.7954" y2="24" gradientUnits="userSpaceOnUse">
                                                  <stop stop-color="#F5F0EC" />
                                                  <stop offset="0.1" stop-color="white" />
                                                  <stop offset="0.45" stop-color="#DBCCBF" />
                                                  <stop offset="0.55" stop-color="#DBCCBF" />
                                                  <stop offset="0.9" stop-color="white" />
                                                  <stop offset="1" stop-color="#F5F0EC" />
                                                </linearGradient>
                                              </defs>
                                            </svg>
                                          ),
                                          // 磨砂膏
                                          "磨砂膏": (
                                            <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                                              <rect x="5.69531" y="13.999" width="36.5979" height="19.7989" rx="1.99982" fill="url(#paint0_linear_2121_4220)" />
                                              <path d="M7.99721 14.0407C10.7442 13.738 15.6787 13.3984 23.9931 13.3984C32.2237 13.3984 37.1422 13.6995 39.9053 13.9713C41.7318 14.1509 42.992 15.6859 42.992 17.5212V31.3975C42.992 33.0542 41.649 34.3973 39.9923 34.3973H7.99387C6.33717 34.3973 4.99414 33.0542 4.99414 31.3975V17.548C4.99414 15.7493 6.20935 14.2378 7.99721 14.0407Z" stroke="#BFBAB6" stroke-width="1.59986" />
                                              <path d="M7.99414 21.8984C7.99414 21.8984 14.5493 21.3984 23.9932 21.3984C33.4372 21.3984 39.9923 21.8984 39.9923 21.8984" stroke="#BFBAB6" stroke-width="1.19989" stroke-linecap="round" />
                                              <path d="M19.7835 29.4379L18.5894 27.998H18.3926V29.8573H18.6269V28.4175L19.8196 29.8573H20.0178V27.998H19.7835V29.4379Z" fill="#00263E" />
                                              <path d="M20.6891 27.998H20.4551V29.8575H20.6891V27.998Z" fill="#00263E" />
                                              <path d="M22.7619 29.8575V27.998H22.5276V28.8101H21.3806V27.998H21.1463V29.8575H21.3806V29.0454H22.5276V29.8575H22.7619Z" fill="#00263E" />
                                              <path d="M23.9524 27.9981H23.1309V29.857H23.3647V29.2389H23.9524C24.0338 29.2393 24.1144 29.2235 24.1897 29.1925C24.265 29.1615 24.3334 29.1159 24.391 29.0582C24.4487 29.0006 24.4945 28.932 24.5257 28.8566C24.5569 28.7811 24.573 28.7002 24.573 28.6185C24.573 28.5368 24.5569 28.4559 24.5257 28.3804C24.4945 28.3049 24.4487 28.2364 24.391 28.1788C24.3334 28.1211 24.265 28.0755 24.1897 28.0445C24.1144 28.0134 24.0338 27.9977 23.9524 27.9981ZM23.9524 29.004H23.3647V28.233H23.9525C24.0543 28.233 24.1519 28.2736 24.2239 28.3459C24.2958 28.4182 24.3363 28.5162 24.3363 28.6185C24.3363 28.7207 24.2958 28.8188 24.2239 28.8911C24.1519 28.9634 24.0542 29.004 23.9524 29.004Z" fill="#00263E" />
                                              <path d="M25.0681 27.998H24.834V29.8567H26.0592V29.6215H25.0681V27.998Z" fill="#00263E" />
                                              <path d="M26.9293 27.9986C26.7463 27.9986 26.5674 28.053 26.4152 28.1551C26.263 28.2572 26.1444 28.4023 26.0744 28.572C26.0043 28.7418 25.986 28.9286 26.0217 29.1088C26.0574 29.2891 26.1455 29.4546 26.2749 29.5845C26.4043 29.7145 26.5692 29.803 26.7487 29.8388C26.9282 29.8747 27.1142 29.8563 27.2833 29.786C27.4524 29.7156 27.597 29.5966 27.6986 29.4438C27.8003 29.291 27.8546 29.1114 27.8546 28.9276C27.8588 28.8045 27.8378 28.6818 27.7928 28.5671C27.7478 28.4525 27.6798 28.3484 27.593 28.2613C27.5062 28.1741 27.4025 28.1059 27.2883 28.0607C27.1742 28.0155 27.052 27.9943 26.9293 27.9986ZM26.9293 29.6218C26.7926 29.6218 26.6589 29.5811 26.5452 29.5049C26.4315 29.4286 26.3428 29.3202 26.2905 29.1933C26.2381 29.0665 26.2244 28.9269 26.2511 28.7923C26.2778 28.6576 26.3436 28.5339 26.4403 28.4368C26.537 28.3397 26.6602 28.2736 26.7943 28.2468C26.9284 28.22 27.0674 28.2337 27.1938 28.2863C27.3201 28.3388 27.4281 28.4278 27.5041 28.542C27.5801 28.6561 27.6206 28.7903 27.6206 28.9276C27.6249 29.0199 27.6099 29.1121 27.5767 29.1982C27.5435 29.2844 27.4927 29.3626 27.4276 29.428C27.3626 29.4933 27.2847 29.5443 27.1989 29.5777C27.113 29.611 27.0212 29.6261 26.9293 29.6218Z" fill="#00263E" />
                                              <path d="M28.8464 27.998H28.1484V29.8574H28.8464C29.0914 29.8565 29.3259 29.7581 29.4988 29.5839C29.6716 29.4096 29.7687 29.1737 29.7687 28.9277C29.7687 28.6818 29.6716 28.4458 29.4988 28.2716C29.3259 28.0973 29.0914 27.999 28.8464 27.998ZM28.8464 29.6225H28.3823V28.233H28.8464C29.0299 28.233 29.2059 28.3062 29.3356 28.4365C29.4654 28.5668 29.5382 28.7435 29.5382 28.9277C29.5382 29.112 29.4654 29.2887 29.3356 29.419C29.2059 29.5493 29.0299 29.6225 28.8464 29.6225Z" fill="#00263E" />
                                              <path d="M22.2258 31.0573L22.0353 30.5967H21.9333V31.1987H22.0125V30.7165L22.1882 31.1475H22.262L22.4377 30.7152V31.1987H22.5168V30.5967H22.4149L22.2258 31.0573Z" fill="#00263E" />
                                              <path d="M23.0252 30.5879C22.9643 30.5883 22.9048 30.6067 22.8544 30.6409C22.8039 30.6751 22.7646 30.7236 22.7416 30.7801C22.7185 30.8367 22.7126 30.8989 22.7247 30.9588C22.7368 31.0188 22.7663 31.0737 22.8094 31.1169C22.8526 31.16 22.9075 31.1893 22.9673 31.2011C23.027 31.2129 23.0889 31.2067 23.1451 31.1832C23.2014 31.1597 23.2494 31.1201 23.2832 31.0692C23.317 31.0183 23.335 30.9586 23.335 30.8974C23.3355 30.8565 23.3278 30.8159 23.3123 30.7781C23.2969 30.7402 23.274 30.7058 23.2452 30.677C23.2163 30.6481 23.1819 30.6254 23.1441 30.6101C23.1064 30.5948 23.0659 30.5873 23.0252 30.5879ZM23.0235 31.1261C22.9785 31.1258 22.9346 31.1121 22.8974 31.0867C22.8602 31.0614 22.8312 31.0256 22.8142 30.9838C22.7973 30.942 22.793 30.896 22.802 30.8518C22.8109 30.8075 22.8328 30.767 22.8647 30.7351C22.8966 30.7033 22.9372 30.6817 22.9813 30.673C23.0254 30.6643 23.0711 30.669 23.1127 30.6863C23.1542 30.7037 23.1896 30.733 23.2146 30.7705C23.2396 30.8081 23.2529 30.8522 23.2529 30.8974C23.2534 30.9277 23.2479 30.9579 23.2366 30.986C23.2252 31.0141 23.2083 31.0396 23.1869 31.061C23.1654 31.0824 23.1399 31.0992 23.1118 31.1103C23.0837 31.1215 23.0537 31.1269 23.0235 31.1261Z" fill="#00263E" />
                                              <path d="M23.9552 31.0557L23.596 30.5967H23.5331V31.1984H23.6121V30.7394L23.9726 31.1984H24.0342V30.5967H23.9552V31.0557Z" fill="#00263E" />
                                              <path d="M24.4761 30.5918L24.2167 31.1987H24.3006L24.3759 31.0173H24.6507L24.7261 31.1987H24.8117L24.5506 30.5918H24.4761ZM24.4076 30.9417L24.5138 30.6863L24.6191 30.9417H24.4076Z" fill="#00263E" />
                                              <path d="M25.2305 31.126C25.1924 31.1252 25.1551 31.1149 25.122 31.0959C25.0889 31.0769 25.0611 31.0499 25.0411 31.0174C25.0211 30.9848 25.0096 30.9477 25.0076 30.9095C25.0056 30.8713 25.0131 30.8332 25.0295 30.7987C25.046 30.7642 25.0708 30.7344 25.1017 30.712C25.1326 30.6896 25.1686 30.6753 25.2064 30.6705C25.2442 30.6657 25.2825 30.6705 25.318 30.6844C25.3535 30.6984 25.3849 30.721 25.4094 30.7503L25.4668 30.6911C25.4371 30.6581 25.4007 30.6318 25.3602 30.614C25.3196 30.5962 25.2757 30.5873 25.2314 30.5879C25.1907 30.5875 25.1503 30.5952 25.1125 30.6105C25.0748 30.6258 25.0405 30.6485 25.0115 30.6772C24.9825 30.706 24.9595 30.7402 24.9438 30.7779C24.9281 30.8156 24.92 30.8561 24.9199 30.8969C24.9199 30.9378 24.9279 30.9783 24.9435 31.0161C24.9591 31.0538 24.982 31.0881 25.0109 31.1169C25.0397 31.1457 25.074 31.1685 25.1117 31.1839C25.1494 31.1994 25.1898 31.2072 25.2305 31.2068C25.2788 31.2075 25.3266 31.1969 25.3702 31.1761C25.4139 31.1552 25.4521 31.1245 25.4821 31.0865L25.4214 31.0315C25.3994 31.0614 25.3706 31.0856 25.3374 31.102C25.3041 31.1185 25.2675 31.1267 25.2305 31.126Z" fill="#00263E" />
                                              <path d="M25.9179 30.5879C25.857 30.5883 25.7976 30.6067 25.7471 30.6409C25.6966 30.6751 25.6574 30.7236 25.6343 30.7802C25.6112 30.8368 25.6054 30.8989 25.6175 30.9589C25.6295 31.0188 25.659 31.0738 25.7022 31.1169C25.7454 31.16 25.8003 31.1893 25.8601 31.2011C25.9198 31.2129 25.9817 31.2067 26.0379 31.1832C26.0942 31.1597 26.1422 31.1201 26.176 31.0692C26.2098 31.0183 26.2278 30.9585 26.2278 30.8974C26.2282 30.8565 26.2205 30.8159 26.2051 30.7781C26.1896 30.7402 26.1668 30.7058 26.1379 30.677C26.109 30.6481 26.0747 30.6254 26.0369 30.6101C25.9991 30.5948 25.9586 30.5873 25.9179 30.5879ZM25.9162 31.1261C25.8712 31.1257 25.8274 31.112 25.7901 31.0867C25.7529 31.0614 25.724 31.0255 25.707 30.9837C25.69 30.9419 25.6858 30.896 25.6948 30.8517C25.7037 30.8075 25.7256 30.7669 25.7575 30.7351C25.7894 30.7033 25.83 30.6817 25.8741 30.673C25.9182 30.6643 25.9639 30.669 26.0055 30.6863C26.047 30.7037 26.0824 30.733 26.1074 30.7705C26.1323 30.8081 26.1456 30.8523 26.1456 30.8974C26.1462 30.9277 26.1407 30.9579 26.1293 30.986C26.118 31.0141 26.1011 31.0397 26.0796 31.061C26.0582 31.0824 26.0326 31.0992 26.0046 31.1104C25.9765 31.1215 25.9464 31.1269 25.9162 31.1261Z" fill="#00263E" />
                                              <defs>
                                                <linearGradient id="paint0_linear_2121_4220" x1="42.2932" y1="23.8985" x2="5.69531" y2="23.8985" gradientUnits="userSpaceOnUse">
                                                  <stop stop-color="#F2F1F0" />
                                                  <stop offset="0.1" stop-color="white" />
                                                  <stop offset="0.5" stop-color="#CECBC8" />
                                                  <stop offset="0.9" stop-color="white" />
                                                  <stop offset="1" stop-color="#F2F1F0" />
                                                </linearGradient>
                                              </defs>
                                            </svg>
                                          ),
                                          // 身体油
                                          "身体油": (
                                            <svg width="400" height="400" viewBox="0 0 400 400" fill="none" xmlns="http://www.w3.org/2000/svg">
                                              <path d="M224.841 51.218H175.082C171.534 51.218 168.658 54.0941 168.658 57.642V173.865C168.658 177.413 171.534 180.289 175.082 180.289H224.841C228.389 180.289 231.265 177.413 231.265 173.865V57.642C231.265 54.0941 228.389 51.218 224.841 51.218Z" fill="url(#paint0_linear_22_2)" />
                                              <path d="M262.405 186.466H137.594C133.539 186.466 130.252 189.753 130.252 193.808V345.634C130.252 349.689 133.539 352.976 137.594 352.976H262.405C266.46 352.976 269.747 349.689 269.747 345.634V193.808C269.747 189.753 266.46 186.466 262.405 186.466Z" fill="url(#paint1_radial_22_2)" />
                                              <path d="M262.405 186.466H137.594C133.539 186.466 130.252 189.753 130.252 193.808V345.634C130.252 349.689 133.539 352.976 137.594 352.976H262.405C266.46 352.976 269.747 349.689 269.747 345.634V193.808C269.747 189.753 266.46 186.466 262.405 186.466Z" fill="url(#paint2_linear_22_2)" fill-opacity="0.6" />
                                              <path d="M132.857 199.91C132.857 196.385 134.165 192.989 137.226 191.243C144.329 187.19 161.651 180.748 200 180.748C238.349 180.748 255.67 187.19 262.774 191.243C265.835 192.989 267.142 196.385 267.142 199.91V338.904C267.142 347.352 260.294 354.2 251.847 354.2H148.153C139.705 354.2 132.857 347.352 132.857 338.904V199.91Z" stroke="#355826" stroke-width="13.33" stroke-linejoin="round" />
                                              <path d="M188.069 72.456C188.069 72.456 191.649 71.538 200 71.538C208.351 71.538 211.93 72.456 211.93 72.456" stroke="#383F36" stroke-width="10" stroke-linecap="round" stroke-linejoin="round" />
                                              <path d="M152.344 202.315C152.344 202.315 166.641 201.397 200 201.397C233.359 201.397 247.656 202.315 247.656 202.315" stroke="#355826" stroke-width="10" stroke-linecap="round" stroke-linejoin="round" />
                                              <path d="M199.955 46.3C190.409 46.3 180.864 49.478 176.606 51.602C175.358 52.224 174.717 53.535 174.717 54.929V70.62C170.886 71.089 167.594 72.421 165.284 74.505C164.507 75.205 164.155 76.224 164.149 77.27C164.087 87.712 164.131 137.955 164.163 164.229L162.787 166.982V180.289H200H237.213V166.982L235.837 164.229C235.869 137.955 235.913 87.712 235.851 77.27C235.845 76.224 235.493 75.205 234.716 74.505C232.406 72.421 229.114 71.089 225.283 70.62V54.929C225.283 53.535 224.642 52.224 223.394 51.602C219.136 49.478 209.591 46.3 200.045 46.3" stroke="#383F36" stroke-width="13.33" stroke-linecap="round" stroke-linejoin="round" />
                                              <path d="M175.868 309.534L169.165 301.487H168.061V311.878H169.376V303.831L176.071 311.878H177.183V301.487H175.868V309.534ZM180.959 301.487H179.646V311.879H180.959V301.487ZM192.594 311.878V301.487H191.279V306.025H184.839V301.487H183.524V311.878H184.839V307.34H191.279V311.878H192.594ZM199.284 301.487H194.671V311.879H195.984V308.424H199.284C199.741 308.426 200.194 308.338 200.617 308.165C201.039 307.991 201.424 307.736 201.747 307.413C202.071 307.091 202.328 306.708 202.504 306.286C202.679 305.864 202.769 305.412 202.769 304.955C202.769 304.498 202.679 304.046 202.504 303.624C202.328 303.202 202.071 302.819 201.747 302.497C201.423 302.175 201.039 301.92 200.617 301.746C200.194 301.573 199.741 301.485 199.284 301.487ZM199.284 307.11H195.984V302.8H199.285C199.856 302.801 200.404 303.029 200.807 303.433C201.211 303.836 201.439 304.384 201.44 304.955C201.44 305.238 201.384 305.518 201.276 305.78C201.168 306.041 201.009 306.279 200.808 306.479C200.608 306.679 200.371 306.838 200.109 306.946C199.847 307.054 199.567 307.11 199.284 307.11ZM205.556 301.487H204.241V311.878H211.123V310.563H205.556V301.487ZM215.996 301.491C215.228 301.49 214.47 301.66 213.775 301.988C213.081 302.317 212.468 302.795 211.981 303.388C211.494 303.982 211.145 304.676 210.958 305.421C210.772 306.166 210.753 306.943 210.903 307.696C211.052 308.449 211.367 309.16 211.824 309.777C212.282 310.393 212.87 310.901 213.547 311.263C214.224 311.625 214.973 311.832 215.74 311.87C216.507 311.907 217.273 311.774 217.982 311.48C218.931 311.087 219.742 310.422 220.313 309.568C220.884 308.714 221.188 307.71 221.188 306.683C221.213 305.995 221.096 305.308 220.843 304.668C220.59 304.027 220.208 303.445 219.72 302.959C219.233 302.472 218.651 302.09 218.011 301.838C217.37 301.585 216.684 301.467 215.996 301.491ZM215.996 310.563C215.228 310.564 214.478 310.337 213.839 309.911C213.201 309.484 212.704 308.878 212.411 308.168C212.116 307.459 212.039 306.679 212.188 305.926C212.338 305.173 212.708 304.482 213.252 303.94C213.794 303.397 214.486 303.026 215.238 302.876C215.991 302.726 216.772 302.803 217.481 303.096C218.19 303.39 218.796 303.888 219.222 304.526C219.649 305.165 219.876 305.915 219.875 306.683C219.9 307.199 219.816 307.714 219.629 308.196C219.442 308.677 219.157 309.114 218.792 309.479C218.426 309.844 217.989 310.129 217.508 310.316C217.027 310.503 216.512 310.587 215.996 310.563ZM226.763 301.487H222.845V311.879H226.763C228.123 311.852 229.419 311.293 230.372 310.322C231.324 309.35 231.858 308.044 231.858 306.683C231.858 305.322 231.324 304.016 230.372 303.044C229.419 302.073 228.123 301.514 226.763 301.487ZM226.763 310.566H224.158V302.8H226.763C227.28 302.788 227.795 302.88 228.276 303.07C228.758 303.26 229.196 303.544 229.566 303.906C229.936 304.267 230.23 304.699 230.431 305.176C230.632 305.653 230.735 306.166 230.735 306.683C230.735 307.2 230.632 307.713 230.431 308.19C230.23 308.667 229.936 309.099 229.566 309.46C229.196 309.822 228.758 310.106 228.276 310.296C227.795 310.486 227.28 310.578 226.763 310.566ZM189.582 318.587L188.515 316.017H187.944V319.376H188.387V316.686L189.371 319.09H189.785L190.769 316.678V319.376H191.212V316.017H190.641L189.582 318.587ZM194.085 315.971C193.83 315.973 193.579 316.031 193.349 316.142C193.12 316.252 192.917 316.412 192.756 316.609C192.596 316.807 192.48 317.038 192.419 317.285C192.358 317.532 192.352 317.79 192.402 318.04C192.489 318.458 192.727 318.829 193.071 319.081C193.415 319.334 193.84 319.45 194.265 319.408C194.69 319.365 195.084 319.167 195.371 318.851C195.658 318.536 195.818 318.125 195.82 317.698C195.825 317.354 195.725 317.017 195.535 316.73C195.344 316.444 195.07 316.223 194.751 316.095C194.54 316.009 194.313 315.967 194.085 315.971ZM194.075 318.973C193.823 318.972 193.577 318.896 193.368 318.755C193.16 318.614 192.998 318.413 192.903 318.18C192.807 317.947 192.783 317.69 192.833 317.443C192.884 317.196 193.007 316.97 193.186 316.793C193.32 316.66 193.481 316.559 193.659 316.496C193.836 316.434 194.025 316.411 194.212 316.43C194.4 316.448 194.581 316.508 194.742 316.605C194.903 316.702 195.041 316.834 195.146 316.99C195.286 317.2 195.36 317.446 195.36 317.698C195.363 317.867 195.332 318.035 195.268 318.192C195.204 318.348 195.109 318.49 194.989 318.61C194.869 318.729 194.727 318.822 194.569 318.885C194.412 318.947 194.244 318.977 194.075 318.973ZM199.303 318.581L197.289 316.019H196.936V319.377H197.379V316.815L199.401 319.377H199.746V316.019H199.303V318.581ZM202.222 315.99L200.769 319.376H201.239L201.66 318.364H203.2L203.622 319.376H204.101L202.639 315.99H202.222ZM201.838 317.942L202.433 316.518L203.023 317.942H201.838ZM206.472 318.974C206.149 318.969 205.841 318.841 205.609 318.617C205.377 318.393 205.239 318.088 205.223 317.766C205.207 317.444 205.313 317.129 205.519 316.882C205.726 316.634 206.018 316.474 206.337 316.433C206.549 316.406 206.764 316.433 206.963 316.51C207.161 316.588 207.337 316.715 207.475 316.878L207.796 316.548C207.63 316.363 207.426 316.217 207.199 316.117C206.971 316.018 206.725 315.968 206.477 315.972C206.249 315.97 206.023 316.013 205.812 316.099C205.601 316.184 205.408 316.311 205.246 316.471C205.084 316.631 204.955 316.822 204.867 317.032C204.779 317.242 204.733 317.468 204.732 317.696C204.732 317.924 204.777 318.15 204.864 318.361C205.042 318.785 205.381 319.122 205.807 319.297C206.018 319.383 206.244 319.427 206.472 319.425C206.743 319.428 207.011 319.369 207.255 319.253C207.5 319.136 207.714 318.965 207.882 318.753L207.542 318.447C207.419 318.614 207.257 318.749 207.071 318.84C206.885 318.932 206.679 318.978 206.472 318.974ZM210.339 315.971C210.084 315.973 209.833 316.031 209.603 316.142C209.373 316.252 209.171 316.412 209.01 316.61C208.849 316.807 208.734 317.038 208.673 317.286C208.612 317.533 208.606 317.791 208.656 318.041C208.74 318.462 208.977 318.837 209.322 319.092C209.667 319.348 210.094 319.465 210.521 319.423C210.948 319.38 211.344 319.179 211.631 318.86C211.919 318.542 212.077 318.127 212.075 317.698C212.077 317.354 211.976 317.018 211.786 316.733C211.595 316.447 211.323 316.225 211.005 316.095C210.794 316.009 210.567 315.967 210.339 315.971ZM210.329 318.973C210.077 318.972 209.831 318.895 209.623 318.754C209.414 318.613 209.252 318.413 209.158 318.179C209.063 317.946 209.04 317.69 209.09 317.443C209.14 317.196 209.262 316.97 209.44 316.792C209.574 316.659 209.735 316.558 209.913 316.495C210.09 316.432 210.279 316.409 210.467 316.428C210.654 316.447 210.835 316.507 210.996 316.604C211.158 316.701 211.296 316.833 211.4 316.99C211.54 317.2 211.615 317.446 211.615 317.698C211.618 317.867 211.587 318.035 211.524 318.192C211.46 318.349 211.365 318.491 211.245 318.61C211.125 318.729 210.982 318.823 210.824 318.886C210.667 318.948 210.498 318.978 210.329 318.973Z" fill="white" />
                                              <defs>
                                                <linearGradient id="paint0_linear_22_2" x1="231.264" y1="115.754" x2="168.658" y2="115.754" gradientUnits="userSpaceOnUse">
                                                  <stop offset="0.1" stop-color="#697265" />
                                                  <stop offset="0.2" stop-color="#95A196" />
                                                  <stop offset="0.45" stop-color="#364335" />
                                                  <stop offset="0.55" stop-color="#364335" />
                                                  <stop offset="0.8" stop-color="#95A196" />
                                                  <stop offset="0.9" stop-color="#697265" />
                                                </linearGradient>
                                                <radialGradient id="paint1_radial_22_2" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(200 317.499) rotate(-90) scale(131.034 69.7474)">
                                                  <stop stop-color="#30482E" />
                                                  <stop offset="0.862" stop-color="#8DA77E" />
                                                </radialGradient>
                                                <linearGradient id="paint2_linear_22_2" x1="263.622" y1="261.216" x2="136.098" y2="261.216" gradientUnits="userSpaceOnUse">
                                                  <stop stop-color="#30482E" />
                                                  <stop offset="0.524" stop-color="#B5F68E" stop-opacity="0" />
                                                  <stop offset="1" stop-color="#30482E" />
                                                </linearGradient>
                                              </defs>
                                            </svg>
                                          ),
                                        };

                                        // 查找匹配的图标，否则使用默认图标（根据索引循环）
                                        const defaultIcons = [
                                          // 默认瓶子1
                                          <svg key="d1" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-brand-charcoal/60">
                                            <path d="M9 3h6v3H9V3z" />
                                            <path d="M8 6h8v2l2 2v8a2 2 0 01-2 2H8a2 2 0 01-2-2v-8l2-2V6z" />
                                          </svg>,
                                          // 默认瓶子2
                                          <svg key="d2" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-brand-charcoal/60">
                                            <rect x="7" y="8" width="10" height="12" rx="2" />
                                            <path d="M9 4h6v4H9z" />
                                          </svg>,
                                          // 默认瓶子3
                                          <svg key="d3" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-brand-charcoal/60">
                                            <path d="M10 4h4v2h-4z" />
                                            <path d="M8 6h8c1 0 2 1 2 2v10a2 2 0 01-2 2H8a2 2 0 01-2-2V8c0-1 1-2 2-2z" />
                                            <ellipse cx="12" cy="13" rx="3" ry="4" />
                                          </svg>,
                                        ];

                                        const trimmedProduct = product.trim();
                                        const icon = productIcons[trimmedProduct] || defaultIcons[index % defaultIcons.length];

                                        return (
                                          <button
                                            key={trimmedProduct}
                                            type="button"
                                            onClick={() => handleProductClick(trimmedProduct)}
                                            className="group flex flex-col items-center gap-2 transition-transform hover:scale-105"
                                          >
                                            {/* SVG 图标 - 白色圆形背景 */}
                                            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white shadow-sm border border-brand-charcoal/10 transition-all group-hover:shadow-md group-hover:border-brand-gold/30">
                                              {icon}
                                            </div>
                                            {/* 产品名称 */}
                                            <span className="text-sm text-brand-charcoal group-hover:text-brand-gold transition-colors">
                                              {trimmedProduct}
                                            </span>
                                          </button>
                                        );
                                      })}
                                  </div>
                                </div>

                                {/* Meta Item: Benefits (Tags) */}
                                <div className="flex flex-col">
                                  <h3 className="mb-3 font-display text-sm font-medium uppercase tracking-[0.2em] text-brand-charcoal-light">
                                    针对功效
                                  </h3>
                                  <div className="flex flex-wrap gap-2">
                                    {(selectedScheme.benefits || ["保湿锁水", "屏障增强"]).map((tag) => (
                                      <span
                                        key={tag}
                                        className="rounded-full border border-brand-charcoal/20 px-4 py-1.5 text-sm text-brand-charcoal"
                                      >
                                        {tag}
                                      </span>
                                    ))}
                                  </div>
                                </div>

                                {/* Meta Item: Certifications */}
                                <div className="flex flex-col">
                                  <h3 className="mb-3 font-display text-sm font-medium uppercase tracking-[0.2em] text-brand-charcoal-light">
                                    检测认证
                                  </h3>
                                  <div className="flex items-center gap-5">
                                    <img
                                      src="/images/sgs.png"
                                      alt="SGS"
                                      title="SGS 权威认证"
                                      className="h-7 w-auto"
                                    />
                                    <img
                                      src="/images/intertek-logo.png"
                                      alt="Intertek"
                                      title="Intertek 质量认证"
                                      className="h-7 w-auto"
                                    />
                                  </div>
                                </div>

                                {/* Meta Item: Special Support */}
                                {selectedScheme.specialSupport && (
                                  <div className="flex flex-col">
                                    <h3 className="mb-3 font-display text-sm font-medium uppercase tracking-[0.2em] text-brand-charcoal-light">
                                      特殊人群支持
                                    </h3>
                                    <div className="border border-dashed border-brand-charcoal/30 p-5 text-sm leading-relaxed text-brand-charcoal/80">
                                      {selectedScheme.specialSupport}
                                    </div>
                                  </div>
                                )}
                              </m.aside>

                              {/* 右侧：步骤网格 (Steps Grid) - 使用 AnimatePresence 实现交叉淡入淡出 */}
                              <AnimatePresence mode="wait">
                                {selectedModule === "portable" ? (
                                  <m.section
                                    key="portable-content"
                                    className="flex w-[75%] items-center justify-end overflow-hidden"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    transition={{ duration: 0.3, ease: "easeInOut" }}
                                  >
                                    {/* 容器尺寸与晨间焕活步骤区域保持一致：940px宽 (3×260 + 2×80) */}
                                    <div className="flex items-center justify-end" style={{ width: '940px', height: '450px' }}>
                                      <Image
                                        src="/images/portable-ritual.webp"
                                        alt="Portable Ritual"
                                        width={940}
                                        height={450}
                                        className="h-full w-full object-cover object-center"
                                        priority
                                      />
                                    </div>
                                  </m.section>
                                ) : (
                                  <m.section
                                    key={`steps-${selectedScheme?.id}-${selectedSubPlan?.id || 'default'}`}
                                    className={cn(
                                      "flex w-[75%] items-center overflow-hidden",
                                      currentSteps.length > 3 && "gap-4"
                                    )}
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    transition={{ duration: 0.3, ease: "easeInOut" }}
                                  >
                                    {/* 左箭头 - 独立空间 (仅在步骤数 > 3 时显示) */}
                                    {currentSteps.length > 3 && (
                                      <button
                                        type="button"
                                        onClick={goToPrevStep}
                                        disabled={currentStepIndex === 0}
                                        className={cn(
                                          "flex-shrink-0 flex h-10 w-10 items-center justify-center rounded-full transition-all duration-300",
                                          currentStepIndex === 0
                                            ? "text-brand-charcoal/20 cursor-not-allowed"
                                            : "text-brand-charcoal/60 hover:border hover:border-brand-gold hover:text-brand-gold hover:bg-brand-gold/5"
                                        )}
                                      >
                                        <ChevronLeft className="h-6 w-6" />
                                      </button>
                                    )}

                                    {/* 步骤卡片容器 */}
                                    <div
                                      ref={stepsContainerRef}
                                      className={cn(
                                        "flex flex-1 min-w-0 overflow-x-auto scrollbar-hide",
                                        currentSteps.length > 3
                                          ? "justify-start snap-x snap-mandatory gap-[52px]"
                                          : currentSteps.length === 3
                                            ? "justify-end gap-[80px]"
                                            : "justify-center gap-[80px]"
                                      )}
                                    >
                                      {currentSteps.map((step, index) => (
                                        <m.article
                                          key={`${step.title}-${index}`}
                                          className="group flex w-[260px] flex-shrink-0 flex-col gap-5 snap-start h-full"
                                          initial={{ opacity: 0, y: 20 }}
                                          animate={{ opacity: 1, y: 0 }}
                                          transition={{
                                            duration: 0.5,
                                            delay: 0.1 + index * 0.05,
                                            ease: [0.23, 1, 0.32, 1]
                                          }}
                                        >
                                          {/* Image Wrapper */}
                                          <div className="relative w-full h-[347px] flex items-center justify-center overflow-hidden bg-brand-beige/20">
                                            <img
                                              src={step.imageUrl || "https://wp-cdn.4ce.cn/v2/sSNhrfD.png"}
                                              alt={step.title}
                                              className="h-full w-full object-contain mix-blend-multiply transition-transform duration-[1.2s] ease-out group-hover:scale-105"
                                            />
                                          </div>

                                          {/* Step Info */}
                                          <div className="flex flex-col gap-2">
                                            <div className="flex items-center gap-3 text-sm text-brand-charcoal-light opacity-60 after:flex-1 after:h-px after:bg-brand-charcoal/10">
                                              STEP {String((index % currentSteps.length) + 1).padStart(2, "0")}
                                            </div>
                                            <h2 className="font-display text-xl font-medium text-brand-charcoal">
                                              {step.title}
                                            </h2>
                                            <p className="text-justify text-sm leading-relaxed text-brand-charcoal/80">
                                              {step.description}
                                            </p>
                                          </div>
                                        </m.article>
                                      ))}
                                    </div>

                                    {/* 右箭头 - 独立空间 (仅在步骤数 > 3 时显示) */}
                                    {currentSteps.length > 3 && (
                                      <button
                                        type="button"
                                        onClick={() => goToNextStep(currentSteps.length)}
                                        disabled={currentStepIndex >= currentSteps.length - 3}
                                        className={cn(
                                          "flex-shrink-0 flex h-10 w-10 items-center justify-center rounded-full transition-all duration-300",
                                          currentStepIndex >= currentSteps.length - 3
                                            ? "text-brand-charcoal/20 cursor-not-allowed"
                                            : "text-brand-charcoal/60 hover:border hover:border-brand-gold hover:text-brand-gold hover:bg-brand-gold/5"
                                        )}
                                      >
                                        <ChevronRight className="h-6 w-6" />
                                      </button>
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
                </div>
              </div>
            </m.div>

            {/* 展开/收起按钮 */}
            <button
              onClick={() => {
                const newState = !isExpanded;
                setIsExpanded(newState);
                setDrawerOpen(newState);
              }}
              className="group -mt-[1px] relative z-10 flex items-center justify-center rounded-b-2xl bg-[#F0EDE1] px-10 py-3 shadow-sm transition-shadow hover:shadow-md lg:px-14 lg:py-3.5"
            >
              {/* 矿物纹理覆盖层 */}
              <div className="texture-overlay absolute inset-0 rounded-b-2xl" />
              <m.div
                className="relative z-10 flex flex-col items-center"
                animate={{
                  rotate: isExpanded ? 180 : 0,
                  scale: 1
                }}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
              >
                <ChevronDown className="h-7 w-7 text-brand-gold lg:h-8 lg:w-8" />
                <ChevronDown className="-mt-5 h-7 w-7 text-brand-gold lg:h-8 lg:w-8" />
              </m.div>
            </button>
          </div>
        </m.div>
      </m.div>

      {/* 动态背景图片 - 移至最底层，位于 safe-area-content 之外 */}
      {backgroundImage && (
        <div className="fixed inset-0 z-[-1]">
          <Image
            src={backgroundImage}
            alt="Background"
            fill
            className="object-cover"
            priority
          />
          {/* 叠加层，确保文字可读性 */}
          <div className="absolute inset-0 bg-black/10" />
        </div>
      )}

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
