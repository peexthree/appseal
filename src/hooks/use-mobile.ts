import * as React from "react"

const MOBILE_BREAKPOINT = 768

export function useIsMobile() {
  // media-query store via useSyncExternalStore: no setState-in-effect
  // cascades, SSR snapshot stays desktop-stable through hydration
  return React.useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
      mql.addEventListener("change", onChange)
      return () => mql.removeEventListener("change", onChange)
    },
    () => window.innerWidth < MOBILE_BREAKPOINT,
    () => false,
  )
}
