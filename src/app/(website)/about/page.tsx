import { Metadata } from "next";
import { StoryContent } from "./StoryContent";


// ISR: 品牌故事页面每60秒重新验证一次
export const revalidate = 60;

export const metadata: Metadata = {
  title: "品牌故事",
  description:
    "探索 NIHPLOD 旎柏：源自 2008 年摩纳哥，复刻海豚肌肤每 2 小时自我更新的自愈力，开启真脂质体护肤传奇。",
  openGraph: {
    title: "品牌故事 | NIHPLOD 旎柏",
    description:
      "NIHPLOD 旎柏源自摩纳哥，复刻海豚肌肤自我更新的生命力，开启高端护肤之旅。",
    images: ["/images/og-image.png"],
  },
  twitter: {
    card: "summary",
    title: "品牌故事 | NIHPLOD 旎柏",
    description: "探索 NIHPLOD 旎柏源自摩纳哥的高端护肤传奇。",
    images: ["/images/og-image.png"],
  },
};

// ...

export default async function StoryPage() {
  return <StoryContent />;
}
