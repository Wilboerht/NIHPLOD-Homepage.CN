export interface AwardEntry {
  year: string;
  org: string;
  title: string;
  image: string;
}

export const AWARDS_DATA: AwardEntry[] = [
  {
    year: "2026",
    org: "胡润百富",
    title: "国际高端护肤品牌最佳表现",
    image: "/images/story/awards/pc/hurun.webp",
  },
  {
    year: "2025",
    org: "亚洲女性友好品牌",
    title: "时空逆转成就奖",
    image: "/images/story/awards/pc/best.webp",
  },
  {
    year: "2024",
    org: "Timout Magazine",
    title: "年度影响力高奢品牌",
    image: "/images/story/awards/pc/timeout.webp",
  },
  {
    year: "2023",
    org: "罗博报告",
    title: "优中优选奖",
    image: "/images/story/awards/pc/robb.webp",
  },
  {
    year: "2020",
    org: "LUX Magazine",
    title: "消费者满意奖",
    image: "/images/story/awards/pc/lux.webp",
  },
  {
    year: "2019",
    org: "Prestige Magazine",
    title: "最佳创新化妆品奖",
    image: "/images/story/awards/pc/prestige.webp",
  },
  {
    year: "2018",
    org: "Wellness & SPA Innovation",
    title: "最佳治疗产品",
    image: "/images/story/awards/pc/wellness.webp",
  },
  {
    year: "2017",
    org: "Pure Beauty Global Awards",
    title: "最佳新晋抗衰老产品",
    image: "/images/story/awards/pc/purebeauty.webp",
  },
];

export const AWARD_TITLES = AWARDS_DATA.map(
  (award) => `${award.org} ${award.title}（${award.year}）`
);
