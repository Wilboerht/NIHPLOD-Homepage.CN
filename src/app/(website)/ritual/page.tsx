import { Metadata } from "next";
import { RitualContent } from "./RitualContent";

export const metadata: Metadata = {
  title: "护肤仪式 | NIHPLOD 旎柏",
  description:
    "每一次护肤，都是与自己对话的珍贵时光。探索 NIHPLOD 旎柏专属晨间与晚间护肤仪式。",
  openGraph: {
    title: "护肤仪式 | NIHPLOD 旎柏",
    description:
      "每一次护肤，都是与自己对话的珍贵时光。探索 NIHPLOD 旎柏专属晨间与晚间护肤仪式。",
  },
};

export default function RitualPage() {
  return <RitualContent />;
}
