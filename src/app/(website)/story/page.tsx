import { Metadata } from "next";
import { StoryContent } from "./StoryContent";

export const metadata: Metadata = {
  title: "品牌故事 | NIHPLOD 旎柏",
  description:
    "探索 NIHPLOD 旎柏的品牌故事，源自摩纳哥的高端护肤理念，融合东方智慧与西方科技。",
  openGraph: {
    title: "品牌故事 | NIHPLOD 旎柏",
    description:
      "探索 NIHPLOD 旎柏的品牌故事，源自摩纳哥的高端护肤理念，融合东方智慧与西方科技。",
  },
};

export default function StoryPage() {
  return <StoryContent />;
}
