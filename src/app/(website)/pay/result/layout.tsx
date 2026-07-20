import { Metadata } from "next";

export const metadata: Metadata = {
  title: "支付结果",
  robots: {
    index: false,
    follow: false,
  },
};

export default function PayResultLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
