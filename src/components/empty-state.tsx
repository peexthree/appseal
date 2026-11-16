/**
 * Contour illustration for empty states (registry empty, versus unknown
 * host, stats without data): monoline radar with concentric rings and a
 * slowly sweeping beam - matches the HUD style of the scan UI.
 */
export function EmptyRadar({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 120"
      fill="none"
      aria-hidden
      className={`text-slate-600 ${className}`}
    >
      {/* outer frame: rounded square HUD viewport */}
      <rect x="8" y="8" width="104" height="104" rx="14" stroke="currentColor" strokeWidth="1.6" />
      {/* corner ticks */}
      <path d="M8 22V14a6 6 0 0 1 6-6h8M98 8h8a6 6 0 0 1 6 6v8M112 98v8a6 6 0 0 1-6 6h-8M22 112h-8a6 6 0 0 1-6-6v-8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      {/* concentric scan rings */}
      <circle cx="60" cy="60" r="16" stroke="currentColor" strokeWidth="1.6" opacity="0.9" />
      <circle cx="60" cy="60" r="30" stroke="currentColor" strokeWidth="1.6" opacity="0.55" />
      <circle cx="60" cy="60" r="44" stroke="currentColor" strokeWidth="1.6" opacity="0.3" />
      {/* crosshair */}
      <path d="M60 8v10M60 102v10M8 60h10M102 60h10" stroke="currentColor" strokeWidth="1.6" opacity="0.5" strokeLinecap="round" />
      {/* sweep beam: slow rotation, skipped for reduced motion via CSS */}
      <g className="appseal-radar-sweep" style={{ transformOrigin: "60px 60px" }}>
        <path d="M60 60L94 38" stroke="#38bdf8" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M60 60L94 38A42.4 42.4 0 0 0 74 22.8" stroke="#38bdf8" strokeWidth="1.6" opacity="0.28" strokeLinecap="round" />
      </g>
      {/* blips */}
      <circle cx="74" cy="44" r="2.5" fill="#38bdf8" opacity="0.9" />
      <circle cx="47" cy="72" r="2" fill="currentColor" opacity="0.6" />
      <circle cx="80" cy="74" r="2" fill="currentColor" opacity="0.4" />
    </svg>
  );
}
