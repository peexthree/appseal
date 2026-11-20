import { useId } from "react";

export type BugLegMode = "idle" | "step" | "panic";

export interface CyberBugSvgProps {
  /** boss (500) fight: crimson palette, heavier armor, HP bar under the body */
  boss?: boolean;
  /** current HP; drives damage cracks and the boss health bar */
  hp: number;
  /** HP at full strength; visible cracks = maxHp - hp */
  maxHp: number;
  /** gait preset; globals.css reads the timing vars set on the root svg */
  legs: BugLegMode;
}

type LegSpec = {
  side: "l" | "r";
  group: "a" | "b";
  hip: readonly [number, number];
  knee: readonly [number, number];
  foot: readonly [number, number];
};

type TraceSpec = {
  d: string;
  pins: ReadonlyArray<readonly [number, number]>;
};

type CrackSpec = {
  d: string;
  branch: string;
};

// tripod gait in counter-phase: A = L-front + R-mid + L-rear, B mirrors it;
// hips sit on the shell outline so the CSS swing pivots at the armor edge
const LEGS: LegSpec[] = [
  { side: "l", group: "a", hip: [32, 46], knee: [20, 53], foot: [12, 66] },
  { side: "r", group: "b", hip: [88, 46], knee: [100, 53], foot: [108, 66] },
  { side: "l", group: "b", hip: [26, 70], knee: [14, 79], foot: [9, 94] },
  { side: "r", group: "a", hip: [94, 70], knee: [106, 79], foot: [111, 94] },
  { side: "l", group: "a", hip: [33, 95], knee: [23, 103], foot: [17, 115] },
  { side: "r", group: "b", hip: [87, 95], knee: [97, 103], foot: [103, 115] },
];

// circuit traces etched into the wing shells; mirrored pairs keep the silhouette symmetric
const TRACES: TraceSpec[] = [
  { d: "M38 46h9l5 7h16l5-7h9", pins: [[38, 46], [82, 46]] },
  { d: "M33 64h8l6 8v8l5 6h5", pins: [[33, 64], [57, 86]] },
  { d: "M87 64h-8l-6 8v8l-5 6h-5", pins: [[87, 64], [63, 86]] },
  { d: "M46 100v-6l6-6h6", pins: [[46, 100], [58, 88]] },
  { d: "M74 100v-6l-6-6h-6", pins: [[74, 100], [62, 88]] },
];

// predefined hull fractures; the first (maxHp - hp) are revealed as HP drops
const CRACKS: CrackSpec[] = [
  { d: "M40 38l8 9-4 7 7 6-3 9", branch: "M44 54l-7 3" },
  { d: "M81 56l-9 6 4 8-6 7 3 8", branch: "M76 70l7 4" },
  { d: "M53 92l7-6 8 4 6-8 7 3", branch: "M60 90l1 8" },
];

export function CyberBugSvg({ boss = false, hp, maxHp, legs }: CyberBugSvgProps) {
  // useId keeps gradient ids unique when several bugs render on one page;
  // strip non-alphanumerics so the id is safe inside url(#...) references
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  // amber warning tone takes over at the last HP point (also covers a dead hp = 0 bug)
  const accent = boss ? "#FF2E5B" : hp <= 1 ? "#FFB800" : "#39FF14";
  const glowClass = boss ? "nf-glow-red" : hp <= 1 ? "nf-glow-amber" : "nf-glow-green";
  const label = boss ? "500" : "404";

  const metal = boss
    ? { femur: "#331f3a", tibia: "#200f24", socket: "#140a18", plate: "#150a18", seam: "#0b050a" }
    : { femur: "#2b3548", tibia: "#1b2233", socket: "#10151f", plate: "#1a212f", seam: "#0a0e16" };

  // boss armor stroke is deliberately heavier
  const armorWidth = boss ? 2.2 : 1.3;
  const armorOpacity = boss ? 0.85 : 0.5;
  const crackWidth = boss ? 2.8 : 2;

  const damage = Math.min(Math.max(maxHp - hp, 0), CRACKS.length);
  const hpRatio = maxHp > 0 ? Math.min(Math.max(hp / maxHp, 0), 1) : 0;

  const shellId = `${uid}-shell`;
  const headId = `${uid}-head`;

  return (
    <svg
      viewBox="0 0 120 160"
      overflow="visible"
      aria-hidden
      focusable="false"
      className={`nf-bug-svg h-auto w-full overflow-visible ${glowClass}`}
      style={{
        ["--nf-ant-dur" as string]: legs === "panic" ? "0.3s" : "2.4s",
        ["--nf-leg-dur" as string]: legs === "panic" ? "0.11s" : legs === "step" ? "0.5s" : "3.4s",
        ["--nf-leg-amp" as string]: legs === "panic" ? "9deg" : legs === "step" ? "7deg" : "2.5deg",
      }}
    >
      <defs>
        <linearGradient id={shellId} x1="0" y1="0" x2="0" y2="1">
          {boss ? (
            <>
              <stop offset="0" stopColor="#1c1020" />
              <stop offset="0.55" stopColor="#150b18" />
              <stop offset="1" stopColor="#12060c" />
            </>
          ) : (
            <>
              <stop offset="0" stopColor="#2a3242" />
              <stop offset="0.55" stopColor="#1f2734" />
              <stop offset="1" stopColor="#141a26" />
            </>
          )}
        </linearGradient>
        <linearGradient id={headId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={boss ? "#2a1731" : "#333d52"} />
          <stop offset="1" stopColor={boss ? "#1a0c20" : "#20283a"} />
        </linearGradient>
      </defs>

      {/* boss silhouette scales 1.4x about its own centre; the viewBox stays the same
          and overflow is visible, so the boss may loom slightly past the frame */}
      <g transform={boss ? "translate(60 63) scale(1.4) translate(-60 -63)" : undefined}>
        {/* antennae: sway speed comes from --nf-ant-dur; pivot origin lives in globals.css */}
        <g className="nf-antenna nf-antenna-l" style={{ transformBox: "fill-box" }}>
          <path d="M52 15C47 11 41 10 30 10" fill="none" stroke={metal.tibia} strokeWidth="2" strokeLinecap="round" />
          <circle cx="30" cy="10" r="1.8" fill={accent} className="appseal-pulse" />
        </g>
        <g className="nf-antenna nf-antenna-r" style={{ transformBox: "fill-box" }}>
          <path d="M68 15C73 11 79 10 90 10" fill="none" stroke={metal.tibia} strokeWidth="2" strokeLinecap="round" />
          <circle cx="90" cy="10" r="1.8" fill={accent} className="appseal-pulse" />
        </g>

        {/* legs: tripod groups swing in counter-phase; pivots are set in globals.css */}
        {LEGS.map((leg, i) => (
          <g key={i} className={`nf-leg nf-leg-${leg.group}`} data-side={leg.side}>
            <path
              d={`M${leg.hip[0]} ${leg.hip[1]}L${leg.knee[0]} ${leg.knee[1]}`}
              fill="none"
              stroke={metal.femur}
              strokeWidth="3.2"
              strokeLinecap="round"
            />
            <path
              d={`M${leg.knee[0]} ${leg.knee[1]}L${leg.foot[0]} ${leg.foot[1]}`}
              fill="none"
              stroke={metal.tibia}
              strokeWidth="2.2"
              strokeLinecap="round"
            />
            {/* glowing articulations at hip, knee and foot */}
            <circle cx={leg.hip[0]} cy={leg.hip[1]} r="2.1" fill={metal.socket} stroke={accent} strokeOpacity="0.9" strokeWidth="1" />
            <circle cx={leg.knee[0]} cy={leg.knee[1]} r="1.7" fill={accent} />
            <circle cx={leg.foot[0]} cy={leg.foot[1]} r="1.2" fill={accent} opacity="0.9" />
          </g>
        ))}

        {/* armored wing shells */}
        <path d="M60 28A34 42 0 0 0 60 112Z" fill={`url(#${shellId})`} stroke={accent} strokeOpacity={armorOpacity} strokeWidth={armorWidth} />
        <path d="M60 28A34 42 0 0 1 60 112Z" fill={`url(#${shellId})`} stroke={accent} strokeOpacity={armorOpacity} strokeWidth={armorWidth} />
        {/* center seam of the elytra */}
        <path d="M60 29V111" stroke={metal.seam} strokeWidth="2" />
        <path d="M60 29V111" stroke={accent} strokeOpacity="0.25" strokeWidth="0.6" />
        {/* inner sheen contour for panel depth */}
        <path d="M60 38A27 32 0 0 0 60 102" fill="none" stroke="#ffffff" strokeOpacity="0.07" strokeWidth="1" />
        <path d="M60 38A27 32 0 0 1 60 102" fill="none" stroke="#ffffff" strokeOpacity="0.07" strokeWidth="1" />
        {/* pronotum plate layered over the shell top */}
        <ellipse cx="60" cy="31" rx="21" ry="6" fill={metal.plate} stroke={accent} strokeOpacity={armorOpacity * 0.8} strokeWidth={armorWidth * 0.8} />

        {/* glowing circuit traces with pin dots at both ends */}
        {TRACES.map((trace, i) => (
          <g key={i}>
            <path d={trace.d} fill="none" stroke={accent} strokeOpacity="0.75" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            {trace.pins.map(([px, py], j) => (
              <circle key={j} cx={px} cy={py} r="1.4" fill={accent} />
            ))}
          </g>
        ))}

        {/* engraved error code: dark face over a faint neon underlayer for depth */}
        <g fontFamily="var(--font-code, monospace)" fontSize="20" fontWeight="700" letterSpacing="1" textAnchor="middle">
          <text x="60" y="72.5" dominantBaseline="central" fill={accent} fillOpacity="0.35">{label}</text>
          <text x="60" y="71" dominantBaseline="central" fill="#05070b" stroke={accent} strokeOpacity="0.22" strokeWidth="0.5">{label}</text>
        </g>

        {/* damage cracks: first (maxHp - hp) fractures show up, boss cracks are thicker */}
        {CRACKS.slice(0, damage).map((crack, i) => (
          <g key={i} fill="none" stroke={accent} strokeLinecap="round" strokeLinejoin="round">
            <path d={crack.d} strokeWidth={crackWidth} strokeOpacity="0.85" />
            <path d={crack.branch} strokeWidth={crackWidth * 0.55} strokeOpacity="0.7" />
          </g>
        ))}

        {/* sensor head with eye diodes and mandibles */}
        <rect x="48" y="12" width="24" height="15" rx="7.5" fill={`url(#${headId})`} stroke={accent} strokeOpacity={armorOpacity} strokeWidth={armorWidth} />
        <circle cx="55" cy="19.5" r="3.2" fill={metal.socket} />
        <circle cx="65" cy="19.5" r="3.2" fill={metal.socket} />
        <circle cx="55" cy="19.5" r="2" fill={accent} className="appseal-pulse" />
        <circle cx="65" cy="19.5" r="2" fill={accent} className="appseal-pulse" />
        <path d="M53 26C51 30 48 32 45 32" fill="none" stroke={metal.femur} strokeWidth="2" strokeLinecap="round" />
        <path d="M67 26C69 30 72 32 75 32" fill="none" stroke={metal.femur} strokeWidth="2" strokeLinecap="round" />
      </g>

      {/* boss-only HP bar below the body, outside the scale transform */}
      {boss ? (
        <g>
          <rect x="25" y="147" width="70" height="6" rx="3" fill="#160a10" stroke={accent} strokeOpacity="0.35" strokeWidth="1" />
          <rect x="26" y="148" width={68 * hpRatio} height="4" rx="2" fill={accent} />
          {/* segment ticks so each hit point reads as its own cell */}
          {maxHp >= 2 && maxHp <= 12
            ? Array.from({ length: maxHp - 1 }, (_, i) => {
                const tickX = 26 + (68 * (i + 1)) / maxHp;
                return <line key={i} x1={tickX} x2={tickX} y1="148" y2="152" stroke="#0b0409" strokeWidth="1" opacity="0.8" />;
              })
            : null}
        </g>
      ) : null}
    </svg>
  );
}
