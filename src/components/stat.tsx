"use client";

import { useEffect, useRef, useState } from "react";
import { animate, useInView, useReducedMotion } from "framer-motion";

/**
 * Animated counter: counts up from 0 to `value` (~1.2s) when scrolled into
 * view. Supports a suffix (% / M) and one decimal. `delay` staggers a row
 * of counters so they ramp in sequence. Reduced-motion users see the final
 * value immediately.
 */
export function Stat({
  value,
  suffix = "",
  decimals = 0,
  delay = 0,
  className,
}: {
  value: number;
  suffix?: string;
  decimals?: number;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  const reduce = useReducedMotion();
  // SSR и первый клиентский рендер показывают финальное значение: числа видны
  // поисковикам и без JS; при попадании в вьюпорт счётчик проигрывается заново
  const [shown, setShown] = useState(value);

  useEffect(() => {
    // reduced-motion keeps the initial value (already `value` from useState)
    if (reduce || !inView) return;
    const id = window.setTimeout(() => {
      const ctrl = animate(0, value, {
        duration: 1.2,
        ease: "easeOut",
        onUpdate: (v) => setShown(v),
      });
      cleanup = () => ctrl.stop();
    }, delay);
    let cleanup: () => void = () => {};
    return () => {
      window.clearTimeout(id);
      cleanup();
    };
  }, [inView, reduce, value, delay]);

  return (
    <span ref={ref} className={className}>
      {shown.toFixed(decimals)}
      {suffix}
    </span>
  );
}
