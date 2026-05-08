"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function CreateCouponPage() {
  const router = useRouter();
  useEffect(() => {
    router.push("/admin/coupons");
  }, [router]);
  return null;
}
