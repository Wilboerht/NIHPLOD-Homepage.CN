"use client";

import { usePathname } from "next/navigation";
import { m, AnimatePresence } from "framer-motion";

const ANIMATED_ROUTES = ["/services", "/terms", "/privacy", "/careers", "/contact"];

export function PageContentTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const enteringAnimated = ANIMATED_ROUTES.includes(pathname);

  return (
    <AnimatePresence>
      <m.div
        key={pathname}
        initial={enteringAnimated ? { opacity: 0, x: 60 } : false}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -60 }}
        transition={{ duration: 0.6, ease: [0.55, 0.06, 0.68, 0.19] }}
      >
        {children}
      </m.div>
    </AnimatePresence>
  );
}
