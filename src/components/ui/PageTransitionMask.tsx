"use client";

import { usePathname } from "next/navigation";
import { m, AnimatePresence } from "framer-motion";

const ANIMATED_ROUTES = ["/services", "/terms", "/privacy", "/careers", "/contact"];

export function PageTransitionMask() {
  const pathname = usePathname();

  if (!ANIMATED_ROUTES.includes(pathname)) return null;

  return (
    <AnimatePresence>
      <m.div
        key={pathname}
        initial={{ left: "100vw" }}
        animate={{ left: "-100vw" }}
        transition={{ duration: 1.2, ease: [0.55, 0.06, 0.68, 0.19] }}
        className="fixed inset-y-0 z-[999] w-screen bg-[#fefcf8] pointer-events-none"
      />
    </AnimatePresence>
  );
}
