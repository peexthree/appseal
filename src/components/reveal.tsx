"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

/** shared reveal easing for the wave-3 motion layer */
const REVEAL_EASE: [number, number, number, number] = [0.21, 0.6, 0.35, 1];

/**
 * Scroll-reveal wrapper: fades/slides children in once when they enter
 * the viewport. Reduced-motion users get static content immediately.
 */
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  /** stagger offset in seconds */
  delay?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  if (reduce) {
    return <div className={className}>{children}</div>;
  }
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 22 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.55, delay, ease: REVEAL_EASE }}
    >
      {children}
    </motion.div>
  );
}
