import { Metadata } from "next";
import { StoryContent } from "./StoryContent";


// ISR: 品牌故事页面每天重新验证一次
export const revalidate = 86400; // 24小时

export const metadata: Metadata = {
  title: "品牌故事",
  description:
    "探索 NIHPLOD 旎柏的品牌故事，源自摩纳哥的高端护肤理念，融合东方智慧与西方科技。",
  openGraph: {
    title: "品牌故事 | NIHPLOD 旎柏",
    description:
      "探索 NIHPLOD 旎柏的品牌故事，源自摩纳哥的高端护肤理念，融合东方智慧与西方科技。",
    images: ["/images/story-og.jpg"],
  },
  twitter: {
    card: "summary_large_image",
    title: "品牌故事 | NIHPLOD 旎柏",
    description: "探索 NIHPLOD 旎柏的品牌故事，源自摩纳哥的高端护肤理念。",
    images: ["/images/story-og.jpg"],
  },
};

export default async function StoryPage() {
  return <StoryContent />;
}
