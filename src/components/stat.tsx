"use client";

import { useEffect, useRef, useState } from "react";
import { animate, useInView, useReducedMotion } from "framer-motion";

/**
 * Animated counter: counts up from 0 to `value` (~1.2s) when scrolled into
 * view. Supports a suffix (% / M) and one decimal. Reduced-motion users
 * see the final value immediately.
 */
export function Stat({
  value,
  suffix = "",
  decimals = 0,
  className,
}: {
  value: number;
  suffix?: string;
  decimals?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (reduce) {
      setShown(value);
      return;
    }
    if (!inView) return;
    const ctrl = animate(0, value, {
      duration: 1.2,
      ease: "easeOut",
      onUpdate: (v) => setShown(v),
    });
    return () => ctrl.stop();
  }, [inView, reduce, value]);

  return (
    <span ref={ref} className={className}>
      {shown.toFixed(decimals)}
      {suffix}
    </span>
  );
}
