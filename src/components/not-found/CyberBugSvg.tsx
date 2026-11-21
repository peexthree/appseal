import React, { useId } from "react";

/**
 * Procedural cyber-bug for the 404 easter egg - user-authored art pass
 * (2026-11-21), integrated 1:1 with the sandbox stripped out. Ten layers:
 * contact shadow + core glow, 6 three-segment faceted legs with servo joints,
 * tail pygidium, inner energy spine, segmented elytra with hex-carbon plating
 * and rim lights, engraving plate, progressive cracks, faceted pronotum,
 * capsule head with plasma mandibles, two-segment scanner antennae with a
 * radar ping tip. All keyframes live in globals.css (cb-* namespace); the
 * component itself stays keyframe-free. Contract consumed by
 * CyberBugEasterEgg: hp/maxHp drive cracks + the boss HP readout, isBoss
 * switches the crimson palette/1.4 scale, mode toggles walk/idle rigs.
 */

export type CyberBugLabel = "404" | "ERROR" | "500";
export type CyberBugMode = "walk" | "idle";

export interface CyberBugSvgProps {
  /** Текущее здоровье жука */
  hp: number;
  /** Максимальное здоровье жука */
  maxHp: number;
  /** Является ли жук боссом (акцент #FF2E5B, scale 1.4, тяжёлая броня, HP-шкала) */
  isBoss?: boolean;
  /** Текст гравировки на панцире */
  label?: CyberBugLabel;
  /** Режим анимации: бег (трипод) или ожидание (дыхание) */
  mode?: CyberBugMode;
  /** Базовая ширина SVG до применения boss scale (по умолчанию 120) */
  width?: number;
  /** Показывать ли HP-шкалу (по умолчанию true для босса) */
  showHpBar?: boolean;
  /** Флаг кратковременной вспышки урона */
  isHit?: boolean;
  /** Скрывать SVG от скринридеров (жук внутри кнопки с собственным aria-label) */
  ariaHidden?: boolean;
  /** Переопределение цвета акцента (опционально) */
  accentOverride?: string;
  /** Дополнительный CSS-класс контейнера */
  className?: string;
  /** Обработчик клика (удобно для мини-игры 404) */
  onClick?: () => void;
}

/**
 * Конфигурация геометрии 3 пар сочленённых лапок (симметрия вокруг x=60).
 * Группы трипода: A = [L1, R2, L3], B = [R1, L2, R3].
 */
interface LegConfig {
  id: string;
  side: "L" | "R";
  pair: 0 | 1 | 2;
  group: "a" | "b";
  /** Точка крепления к корпусу (сустав coxa / ось вращения) */
  socket: [number, number];
  /** Коленный сустав (конец бедра / femur) */
  knee: [number, number];
  /** Голеностоп (конец голени / tibia) */
  ankle: [number, number];
  /** Кончик когтя (tarsus) */
  claw: [number, number];
  /** Толщина бедра */
  femurWidth: number;
}

const LEFT_LEGS: Omit<LegConfig, "side" | "group" | "id">[] = [
  // Передняя лапа: вытянута вперёд-вбок, острая клешневидная постановка
  { pair: 0, socket: [40, 54], knee: [19, 39], ankle: [12, 23], claw: [15, 13], femurWidth: 4.2 },
  // Средняя лапа: широкий упор для стабилизации корпуса
  { pair: 1, socket: [33, 82], knee: [14, 77], ankle: [8, 93], claw: [11, 104], femurWidth: 4.6 },
  // Задняя лапа: мощный силовой рычаг для рывка
  { pair: 2, socket: [37, 108], knee: [16, 121], ankle: [11, 141], claw: [16, 151], femurWidth: 5.0 },
];

/** Отражает X относительно оси симметрии x = 60 */
const mirrorX = (x: number): number => 120 - x;

/**
 * Генерирует полигон конического бронированного сегмента лапки между двумя точками.
 * Вместо «прямой палки» получаем объёмную гранёную механическую конечность.
 */
function buildSegmentPolygon(
  p1: [number, number],
  p2: [number, number],
  startHalfW: number,
  endHalfW: number,
  elbowBulge = 0,
): string {
  const dx = p2[0] - p1[0];
  const dy = p2[1] - p1[1];
  const len = Math.hypot(dx, dy) || 1;
  // Нормаль перпендикулярно оси сегмента
  const nx = -dy / len;
  const ny = dx / len;
  const mx = (p1[0] + p2[0]) * 0.5 + nx * elbowBulge;
  const my = (p1[1] + p2[1]) * 0.5 + ny * elbowBulge;

  const a1x = p1[0] + nx * startHalfW;
  const a1y = p1[1] + ny * startHalfW;
  const b1x = mx + nx * ((startHalfW + endHalfW) * 0.58);
  const b1y = my + ny * ((startHalfW + endHalfW) * 0.58);
  const c1x = p2[0] + nx * endHalfW;
  const c1y = p2[1] + ny * endHalfW;

  const c2x = p2[0] - nx * endHalfW;
  const c2y = p2[1] - ny * endHalfW;
  const a2x = p1[0] - nx * startHalfW;
  const a2y = p1[1] - ny * startHalfW;

  return `M ${a1x.toFixed(1)} ${a1y.toFixed(1)} L ${b1x.toFixed(1)} ${b1y.toFixed(1)} L ${c1x.toFixed(1)} ${c1y.toFixed(1)} L ${c2x.toFixed(1)} ${c2y.toFixed(1)} L ${a2x.toFixed(1)} ${a2y.toFixed(1)} Z`;
}

/**
 * Основной процедурный SVG-компонент кибер-жука.
 * Строго соблюдает контракт: viewBox="0 0 120 160", симметрия x=60, единый accent.
 */
export const CyberBugSvg: React.FC<CyberBugSvgProps> = ({
  hp,
  maxHp,
  isBoss = false,
  label,
  mode = "walk",
  width = 120,
  showHpBar,
  isHit = false,
  ariaHidden = false,
  accentOverride,
  className = "",
  onClick,
}) => {
  const uid = useId().replace(/:/g, "");
  const safeMaxHp = Math.max(1, maxHp);
  const clampedHp = Math.max(0, Math.min(hp, safeMaxHp));
  const hpRatio = clampedHp / safeMaxHp;
  const isCritical = !isBoss && clampedHp === 1;
  const isBossEnraged = isBoss && hpRatio <= 0.35 && clampedHp > 0;

  // Палитра через один accent по контракту:
  // Босс -> #FF2E5B | hp=1 -> #FFB800 | Норма -> #39FF14
  const accent =
    accentOverride ||
    (isBoss ? "#FF2E5B" : clampedHp <= 1 ? "#FFB800" : "#39FF14");

  // Текст на панцире: у обычного по умолчанию 404, у босса ERROR
  const displayLabel: CyberBugLabel = label ?? (isBoss ? "ERROR" : "404");

  // Уровень раскрытия трещин (0..3) по мере потери HP
  const damageTaken = safeMaxHp - clampedHp;
  const crackStage =
    damageTaken <= 0
      ? 0
      : safeMaxHp <= 3
        ? Math.min(3, damageTaken)
        : Math.min(3, Math.ceil((damageTaken / safeMaxHp) * 3));

  // Масштаб босса 1.4x по контракту
  const scaleFactor = isBoss ? 1.4 : 1;
  const renderWidth = Math.round(width * scaleFactor);
  const renderHeight = Math.round(((width * 160) / 120) * scaleFactor);
  const shouldShowHp = showHpBar ?? isBoss;

  // Собираем все 6 лапок с правильной трипод-группировкой A/B
  const legs: LegConfig[] = [
    ...LEFT_LEGS.map((l) => ({
      ...l,
      id: `L${l.pair}`,
      side: "L" as const,
      group: (l.pair % 2 === 0 ? "a" : "b") as "a" | "b",
    })),
    ...LEFT_LEGS.map((l) => ({
      ...l,
      id: `R${l.pair}`,
      side: "R" as const,
      group: (l.pair % 2 === 0 ? "b" : "a") as "a" | "b",
      socket: [mirrorX(l.socket[0]), l.socket[1]] as [number, number],
      knee: [mirrorX(l.knee[0]), l.knee[1]] as [number, number],
      ankle: [mirrorX(l.ankle[0]), l.ankle[1]] as [number, number],
      claw: [mirrorX(l.claw[0]), l.claw[1]] as [number, number],
    })),
  ];

  // Динамическая скорость анимаций: при критическом HP или ярости босса бежит быстрее
  const rootStyle: React.CSSProperties & Record<string, string> = {
    "--cb-walk-speed": isBossEnraged ? "0.32s" : isCritical ? "0.34s" : isBoss ? "0.52s" : "0.42s",
    "--cb-trace-speed": isBossEnraged || isCritical ? "1.15s" : "1.9s",
    "--cb-breathe-speed": isBossEnraged || isCritical ? "1.6s" : "2.7s",
    filter: `drop-shadow(0 0 ${isBoss ? 10 : 6}px ${accent}70) drop-shadow(0 6px 10px rgba(0, 0, 0, 0.72))`,
  };

  // ID для локальных SVG defs (защита от конфликтов при множестве жуков на экране)
  const idShell = `cb-shell-${uid}`;
  const idShellDark = `cb-shell-dark-${uid}`;
  const idPronotum = `cb-pronotum-${uid}`;
  const idMetal = `cb-metal-${uid}`;
  const idRimL = `cb-rim-l-${uid}`;
  const idRimR = `cb-rim-r-${uid}`;
  const idCore = `cb-core-${uid}`;
  const idHex = `cb-hex-${uid}`;
  const idGlowClipL = `cb-clip-l-${uid}`;
  const idGlowClipR = `cb-clip-r-${uid}`;

  // Контуры левого и правого надкрыльев (аэродинамический многогранный силуэт)
  const elytronLeftPath =
    "M 58.6 60 C 44 60.5, 29 67.5, 24.5 84 C 21 97, 23 116, 32.5 131 C 39.5 141.5, 49.5 147.2, 58.2 147.6 L 58.8 142.5 L 58.8 62 Z";
  const elytronRightPath =
    "M 61.4 60 C 76 60.5, 91 67.5, 95.5 84 C 99 97, 97 116, 87.5 131 C 80.5 141.5, 70.5 147.2, 61.8 147.6 L 61.2 142.5 L 61.2 62 Z";

  // Количество сегментов для босс HP-шкалы
  const hpSegments = Math.min(12, safeMaxHp);

  return (
    <div
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      className={`relative inline-flex flex-col items-center select-none ${
        onClick ? "cursor-crosshair focus:outline-none" : ""
      } ${className}`}
    >
      {/* HP-шкала босса (или при явном showHpBar) */}
      {shouldShowHp && (
        <div
          className="mb-2 flex flex-col items-center gap-1"
          style={{ width: Math.max(120, renderWidth * 0.88) }}
        >
          <div className="flex w-full items-center justify-between px-0.5 font-mono text-[11px] font-bold tracking-widest uppercase">
            <span style={{ color: accent }}>
              {isBoss ? `BOSS // ${displayLabel}` : `BUG // ${displayLabel}`}
            </span>
            <span className="text-slate-300">
              {clampedHp}/{safeMaxHp}
            </span>
          </div>
          <div
            className="relative h-2.5 w-full overflow-hidden rounded-sm border bg-slate-950/90 p-[2px]"
            style={{
              borderColor: `${accent}88`,
              boxShadow: `0 0 10px ${accent}40`,
            }}
          >
            <div
              className="h-full rounded-[1px] transition-all duration-300 ease-out"
              style={{
                width: `${hpRatio * 100}%`,
                background: `linear-gradient(90deg, ${accent}cc, ${accent})`,
                boxShadow: `0 0 8px ${accent}`,
              }}
            />
            {/* Тактические деления поверх шкалы */}
            <div className="pointer-events-none absolute inset-0 flex">
              {Array.from({ length: hpSegments }).map((_, idx) => (
                <div
                  key={idx}
                  className="h-full flex-1 border-r border-slate-950/70 last:border-r-0"
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Основной процедурный SVG 120×160 */}
      <svg
        viewBox="0 0 120 160"
        width={renderWidth}
        height={renderHeight}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={`cb-root cb-state-${mode} ${isHit ? "cb-hit-flash" : ""} overflow-visible`}
        style={rootStyle}
        aria-hidden={ariaHidden || undefined}
        aria-label={ariaHidden ? undefined : `${isBoss ? "Босс кибер-жук" : "Кибер-жук"} ${displayLabel}`}
      >
        <defs>
          {/* Металлический градиент основной брони надкрыльев */}
          <linearGradient id={idShell} x1="60" y1="58" x2="60" y2="148" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#2c3545" />
            <stop offset="28%" stopColor="#1b212e" />
            <stop offset="72%" stopColor="#11151f" />
            <stop offset="100%" stopColor="#090c12" />
          </linearGradient>

          {/* Тёмная подложка для утопленных сегментов брони */}
          <linearGradient id={idShellDark} x1="25" y1="60" x2="95" y2="145" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#121620" />
            <stop offset="50%" stopColor="#0b0e16" />
            <stop offset="100%" stopColor="#171d29" />
          </linearGradient>

          {/* Градиент пронотума (грудной щит) */}
          <linearGradient id={idPronotum} x1="60" y1="34" x2="60" y2="66" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#384357" />
            <stop offset="45%" stopColor="#202736" />
            <stop offset="100%" stopColor="#111621" />
          </linearGradient>

          {/* Матовый титан для сегментов лапок и жвал */}
          <linearGradient id={idMetal} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#465269" />
            <stop offset="50%" stopColor="#212836" />
            <stop offset="100%" stopColor="#10141d" />
          </linearGradient>

          {/* Рим-лайт по левому краю панциря */}
          <linearGradient id={idRimL} x1="22" y1="88" x2="48" y2="96" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.92" />
            <stop offset="28%" stopColor={accent} stopOpacity="0.88" />
            <stop offset="100%" stopColor={accent} stopOpacity="0" />
          </linearGradient>

          {/* Рим-лайт по правому краю панциря */}
          <linearGradient id={idRimR} x1="98" y1="88" x2="72" y2="96" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.92" />
            <stop offset="28%" stopColor={accent} stopOpacity="0.88" />
            <stop offset="100%" stopColor={accent} stopOpacity="0" />
          </linearGradient>

          {/* Свечение внутреннего энергоядра под швом */}
          <radialGradient id={idCore} cx="60" cy="100" r="34" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
            <stop offset="25%" stopColor={accent} stopOpacity="0.85" />
            <stop offset="100%" stopColor={accent} stopOpacity="0" />
          </radialGradient>

          {/* Микро-карбон (шестиугольная сетка брони) */}
          <pattern id={idHex} width="8" height="7" patternUnits="userSpaceOnUse">
            <path
              d="M 2 0 L 6 0 L 8 3.5 L 6 7 L 2 7 L 0 3.5 Z"
              fill="none"
              stroke="#94a3b8"
              strokeWidth="0.35"
              strokeOpacity="0.13"
            />
          </pattern>

          <clipPath id={idGlowClipL}>
            <path d={elytronLeftPath} />
          </clipPath>
          <clipPath id={idGlowClipR}>
            <path d={elytronRightPath} />
          </clipPath>
        </defs>

        {/* ================================================================
            СЛОЙ 1: Контактная тень и лёгкий нижний отсвет ядра
           ================================================================ */}
        <ellipse cx="60" cy="94" rx="34" ry="52" fill="#030508" opacity="0.58" />
        <ellipse
          cx="60"
          cy="100"
          rx={isBoss ? 28 : 20}
          ry={isBoss ? 36 : 28}
          fill={accent}
          opacity={isBoss ? 0.14 : 0.08}
          className="cb-core-glow"
        />

        {/* ================================================================
            СЛОЙ 2: 6 сочленённых механических лапок (трипод A/B)
           ================================================================ */}
        <g id="layer-legs">
          {legs.map((leg) => {
            const bulge = leg.side === "L" ? -1.4 : 1.4;
            const femurPath = buildSegmentPolygon(
              leg.socket,
              leg.knee,
              leg.femurWidth * 0.62,
              leg.femurWidth * 0.42,
              bulge,
            );
            const tibiaPath = buildSegmentPolygon(
              leg.knee,
              leg.ankle,
              leg.femurWidth * 0.38,
              1.1,
              bulge * 0.6,
            );
            const clawPath = buildSegmentPolygon(leg.ankle, leg.claw, 1.25, 0.35, bulge * 0.4);
            const legDir = leg.side === "L" ? "1" : "-1";

            return (
              <g
                key={leg.id}
                className={`cb-leg-${leg.group}`}
                style={
                  {
                    transformOrigin: `${leg.socket[0]}px ${leg.socket[1]}px`,
                    "--cb-leg-dir": legDir,
                  } as React.CSSProperties
                }
              >
                {/* Гидравлический шток вдоль бедра */}
                <line
                  x1={leg.socket[0]}
                  y1={leg.socket[1]}
                  x2={leg.knee[0]}
                  y2={leg.knee[1]}
                  stroke={accent}
                  strokeWidth="1.2"
                  strokeOpacity="0.45"
                />

                {/* Бронированное бедро (Femur) */}
                <path
                  d={femurPath}
                  fill={`url(#${idMetal})`}
                  stroke="#4b5870"
                  strokeWidth="0.7"
                  strokeLinejoin="round"
                />

                {/* Шип-наколенник у босса */}
                {isBoss && (
                  <path
                    d={`M ${leg.knee[0]} ${leg.knee[1] - 3} L ${
                      leg.knee[0] + (leg.side === "L" ? -5.5 : 5.5)
                    } ${leg.knee[1] - 1} L ${leg.knee[0]} ${leg.knee[1] + 2.5} Z`}
                    fill="#1e2432"
                    stroke={accent}
                    strokeWidth="0.65"
                  />
                )}

                {/* Голень (Tibia) */}
                <path
                  d={tibiaPath}
                  fill={`url(#${idMetal})`}
                  stroke="#64748b"
                  strokeWidth="0.55"
                  strokeLinejoin="round"
                />

                {/* Коготь (Tarsus) */}
                <path
                  d={clawPath}
                  fill="#0f131c"
                  stroke={isBoss || isCritical ? accent : "#94a3b8"}
                  strokeWidth="0.6"
                  strokeLinejoin="round"
                />

                {/* Сустав крепления (Coxa) */}
                <circle
                  cx={leg.socket[0]}
                  cy={leg.socket[1]}
                  r="3.2"
                  fill="#121722"
                  stroke="#475569"
                  strokeWidth="0.8"
                />
                <circle cx={leg.socket[0]} cy={leg.socket[1]} r="1.2" fill={accent} opacity="0.85" />

                {/* Светящийся коленный сервопривод */}
                <circle
                  cx={leg.knee[0]}
                  cy={leg.knee[1]}
                  r="2.9"
                  fill="#0d1119"
                  stroke="#64748b"
                  strokeWidth="0.7"
                />
                <circle
                  cx={leg.knee[0]}
                  cy={leg.knee[1]}
                  r="1.45"
                  fill={accent}
                  className="cb-diode"
                />

                {/* Сустав голеностопа */}
                <circle cx={leg.ankle[0]} cy={leg.ankle[1]} r="1.7" fill="#18202e" stroke={accent} strokeWidth="0.6" />
              </g>
            );
          })}
        </g>

        {/* ================================================================
            СЛОЙ 3: Хвостовой сегмент-сопло (пигидий) с термоотводом
           ================================================================ */}
        <g id="layer-tail">
          <path
            d="M 46 140 L 74 140 L 68.5 151.5 L 60 155 L 51.5 151.5 Z"
            fill="#101520"
            stroke="#3b475e"
            strokeWidth="0.9"
          />
          {/* Двойные термощели */}
          <path
            d="M 52 146.5 L 57.5 149.5 M 68 146.5 L 62.5 149.5"
            stroke={accent}
            strokeWidth="1.6"
            strokeLinecap="round"
            className="cb-core-glow"
          />
          {isBoss && (
            <>
              {/* Хвостовые стабилизаторы босса */}
              <path
                d="M 45 138 L 38 149 L 49 147 Z M 75 138 L 82 149 L 71 147 Z"
                fill="#171d29"
                stroke={accent}
                strokeWidth="0.7"
              />
            </>
          )}
        </g>

        {/* ================================================================
            СЛОЙ 4: Внутренний светящийся энергохребет (виден при дыхании)
           ================================================================ */}
        <g id="layer-inner-core" className="cb-core-glow">
          <rect x="57.2" y="62" width="5.6" height="82" rx="2.8" fill={`url(#${idCore})`} />
          <line
            x1="60"
            y1="63"
            x2="60"
            y2="144"
            stroke="#ffffff"
            strokeWidth="1"
            strokeOpacity="0.85"
          />
          {/* Энерго-рёбра вдоль позвоночника */}
          {[76, 92, 108, 124].map((y) => (
            <line
              key={y}
              x1="56.5"
              y1={y}
              x2="63.5"
              y2={y}
              stroke={accent}
              strokeWidth="1.1"
              strokeLinecap="round"
            />
          ))}
        </g>

        {/* ================================================================
            СЛОЙ 5: Сегментированные надкрылья с карбоном, бронёй и рим-лайтом
           ================================================================ */}
        <g id="layer-elytra">
          {/* --- ЛЕВОЕ НАДКРЫЛЬЕ --- */}
          <g className="cb-elytron-l">
            {/* Базовая форма */}
            <path d={elytronLeftPath} fill={`url(#${idShell})`} stroke="#2b3447" strokeWidth="1" />
            {/* Микро-карбоновая фактура */}
            <path d={elytronLeftPath} fill={`url(#${idHex})`} />

            {/* Сегментация брони внутри клипа */}
            <g clipPath={`url(#${idGlowClipL})`}>
              {/* Боковая утопленная фланговая бронепластина */}
              <path
                d="M 22 78 L 32 82 L 34 114 L 25 123 L 18 110 Z"
                fill={`url(#${idShellDark})`}
                stroke="#3a4760"
                strokeWidth="0.8"
              />
              {/* Верхний плечевой сегмент брони */}
              <path
                d="M 59 60 L 59 78 L 37 82 L 26 73 L 34 61 Z"
                fill="#222a3a"
                fillOpacity="0.6"
                stroke="#435069"
                strokeWidth="0.7"
              />
              {/* Нижний хвостовой щиток */}
              <path
                d="M 59 124 L 40 121 L 31 131 L 46 149 L 59 149 Z"
                fill="#141925"
                fillOpacity="0.75"
                stroke="#364259"
                strokeWidth="0.7"
              />
              {/* Фаска-блик вдоль стыка сегментов */}
              <path
                d="M 37.5 82.8 L 58 78.8 M 40.5 121.8 L 58 124.8"
                stroke="#94a3b8"
                strokeWidth="0.45"
                strokeOpacity="0.45"
              />
              {/* Заклёпки/винты на броне */}
              <circle cx="33" cy="72" r="1" fill="#64748b" />
              <circle cx="29" cy="96" r="1" fill="#64748b" />
              <circle cx="37" cy="127" r="1" fill="#64748b" />
            </g>

            {/* РИМ-ЛАЙТ по внешнему левому краю панциря */}
            <path
              d="M 55 60.6 C 42 61.5, 29.4 68.5, 25.1 84.3 C 21.8 97, 23.8 115.5, 33.1 130.5 C 39.2 140.2, 47.6 145.6, 55.6 147"
              stroke={`url(#${idRimL})`}
              strokeWidth="2.1"
              strokeLinecap="round"
            />
            {/* Тонкий белый контурный спекуляр-блик */}
            <path
              d="M 39 65.5 C 31.2 70, 26.8 77.8, 25.4 86.2"
              stroke="#ffffff"
              strokeWidth="0.95"
              strokeLinecap="round"
              strokeOpacity="0.78"
            />

            {/* Неоновая окантовка вдоль центрального шва */}
            <path
              d="M 58.6 62 L 58.6 144.5"
              stroke={accent}
              strokeWidth="0.9"
              strokeOpacity="0.75"
            />

            {/* --- БЕГУЩИЕ ДОРОЖКИ МИКРОСХЕМ (Левое крыло) --- */}
            <g id="traces-left">
              {/* Дорожка 1 (верхняя) */}
              <path
                d="M 55 72 L 46 72 L 40 78 L 34 78"
                stroke={accent}
                strokeWidth="1.05"
                strokeOpacity="0.28"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M 55 72 L 46 72 L 40 78 L 34 78"
                stroke={accent}
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="cb-trace-pulse"
              />
              <circle cx="34" cy="78" r="1.7" fill="#0d111a" stroke={accent} strokeWidth="0.9" />
              <circle cx="34" cy="78" r="0.7" fill="#ffffff" className="cb-diode" />

              {/* Дорожка 2 (центральная силовая) */}
              <path
                d="M 56 88 L 43 88 L 36 95 L 36 108 L 30 114"
                stroke={accent}
                strokeWidth="1.05"
                strokeOpacity="0.28"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M 56 88 L 43 88 L 36 95 L 36 108 L 30 114"
                stroke={accent}
                strokeWidth="1.25"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="cb-trace-pulse-fast"
                style={{ animationDelay: "-0.6s" }}
              />
              <circle cx="30" cy="114" r="1.8" fill="#0d111a" stroke={accent} strokeWidth="0.9" />
              <circle cx="30" cy="114" r="0.75" fill="#ffffff" className="cb-diode" />

              {/* Дорожка 3 (нижняя) */}
              <path
                d="M 55 129 L 47 129 L 42 135 L 42 139"
                stroke={accent}
                strokeWidth="1"
                strokeOpacity="0.28"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M 55 129 L 47 129 L 42 135 L 42 139"
                stroke={accent}
                strokeWidth="1.15"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="cb-trace-pulse"
                style={{ animationDelay: "-1.2s" }}
              />
              <circle cx="42" cy="139" r="1.5" fill="#0d111a" stroke={accent} strokeWidth="0.85" />
            </g>
          </g>

          {/* --- ПРАВОЕ НАДКРЫЛЬЕ (Симметрия x = 60) --- */}
          <g className="cb-elytron-r">
            <path d={elytronRightPath} fill={`url(#${idShell})`} stroke="#2b3447" strokeWidth="1" />
            <path d={elytronRightPath} fill={`url(#${idHex})`} />

            <g clipPath={`url(#${idGlowClipR})`}>
              {/* Боковая фланговая пластина */}
              <path
                d="M 98 78 L 88 82 L 86 114 L 95 123 L 102 110 Z"
                fill={`url(#${idShellDark})`}
                stroke="#3a4760"
                strokeWidth="0.8"
              />
              {/* Верхний плечевой сегмент */}
              <path
                d="M 61 60 L 61 78 L 83 82 L 94 73 L 86 61 Z"
                fill="#222a3a"
                fillOpacity="0.6"
                stroke="#435069"
                strokeWidth="0.7"
              />
              {/* Нижний хвостовой щиток */}
              <path
                d="M 61 124 L 80 121 L 89 131 L 74 149 L 61 149 Z"
                fill="#141925"
                fillOpacity="0.75"
                stroke="#364259"
                strokeWidth="0.7"
              />
              {/* Фаска-блик */}
              <path
                d="M 82.5 82.8 L 62 78.8 M 79.5 121.8 L 62 124.8"
                stroke="#94a3b8"
                strokeWidth="0.45"
                strokeOpacity="0.45"
              />
              {/* Заклёпки */}
              <circle cx="87" cy="72" r="1" fill="#64748b" />
              <circle cx="91" cy="96" r="1" fill="#64748b" />
              <circle cx="83" cy="127" r="1" fill="#64748b" />
            </g>

            {/* РИМ-ЛАЙТ по внешнему правому краю панциря */}
            <path
              d="M 65 60.6 C 78 61.5, 90.6 68.5, 94.9 84.3 C 98.2 97, 96.2 115.5, 86.9 130.5 C 80.8 140.2, 72.4 145.6, 64.4 147"
              stroke={`url(#${idRimR})`}
              strokeWidth="2.1"
              strokeLinecap="round"
            />
            {/* Белый спекуляр-блик */}
            <path
              d="M 81 65.5 C 88.8 70, 93.2 77.8, 94.6 86.2"
              stroke="#ffffff"
              strokeWidth="0.95"
              strokeLinecap="round"
              strokeOpacity="0.78"
            />

            {/* Неоновая линия вдоль шва */}
            <path
              d="M 61.4 62 L 61.4 144.5"
              stroke={accent}
              strokeWidth="0.9"
              strokeOpacity="0.75"
            />

            {/* --- БЕГУЩИЕ ДОРОЖКИ МИКРОСХЕМ (Правое крыло) --- */}
            <g id="traces-right">
              {/* Дорожка 4 */}
              <path
                d="M 65 72 L 74 72 L 80 78 L 86 78"
                stroke={accent}
                strokeWidth="1.05"
                strokeOpacity="0.28"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M 65 72 L 74 72 L 80 78 L 86 78"
                stroke={accent}
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="cb-trace-pulse"
                style={{ animationDelay: "-0.3s" }}
              />
              <circle cx="86" cy="78" r="1.7" fill="#0d111a" stroke={accent} strokeWidth="0.9" />
              <circle cx="86" cy="78" r="0.7" fill="#ffffff" className="cb-diode" />

              {/* Дорожка 5 */}
              <path
                d="M 64 88 L 77 88 L 84 95 L 84 108 L 90 114"
                stroke={accent}
                strokeWidth="1.05"
                strokeOpacity="0.28"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M 64 88 L 77 88 L 84 95 L 84 108 L 90 114"
                stroke={accent}
                strokeWidth="1.25"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="cb-trace-pulse-fast"
                style={{ animationDelay: "-0.95s" }}
              />
              <circle cx="90" cy="114" r="1.8" fill="#0d111a" stroke={accent} strokeWidth="0.9" />
              <circle cx="90" cy="114" r="0.75" fill="#ffffff" className="cb-diode" />

              {/* Дорожка 6 */}
              <path
                d="M 65 129 L 73 129 L 78 135 L 78 139"
                stroke={accent}
                strokeWidth="1"
                strokeOpacity="0.28"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M 65 129 L 73 129 L 78 135 L 78 139"
                stroke={accent}
                strokeWidth="1.15"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="cb-trace-pulse"
                style={{ animationDelay: "-1.55s" }}
              />
              <circle cx="78" cy="139" r="1.5" fill="#0d111a" stroke={accent} strokeWidth="0.85" />
            </g>
          </g>

          {/* Босс-наплечники и боковые радиаторные щитки */}
          {isBoss && (
            <g id="boss-pauldron-armor">
              <path
                d="M 27 64 L 18 71 L 20 84 L 28 80 Z"
                fill="#19202e"
                stroke={accent}
                strokeWidth="0.85"
              />
              <path
                d="M 93 64 L 102 71 L 100 84 L 92 80 Z"
                fill="#19202e"
                stroke={accent}
                strokeWidth="0.85"
              />
              {/* Светящиеся жабры охлаждения */}
              <path
                d="M 21.5 73 L 25.5 71.5 M 21.5 77 L 25.5 75.5 M 98.5 73 L 94.5 71.5 M 98.5 77 L 94.5 75.5"
                stroke={accent}
                strokeWidth="1"
                strokeLinecap="round"
              />
            </g>
          )}
        </g>

        {/* ================================================================
            СЛОЙ 6: Гравировка 404 / ERROR / 500 (подложка + неоновый контур)
           ================================================================ */}
        <g
          id="layer-engraving"
          className={isCritical || isBossEnraged ? "cb-critical-label" : undefined}
        >
          {/* Утопленная технологическая плашка под гравировку */}
          <path
            d="M 38 96 L 42 92 L 78 92 L 82 96 L 82 112 L 78 116 L 42 116 L 38 112 Z"
            fill="#0a0d14"
            fillOpacity="0.84"
            stroke={accent}
            strokeWidth="0.7"
            strokeOpacity="0.5"
          />
          {/* Угловые скобы-визиры */}
          <path
            d="M 40.5 96.5 L 43 94 L 47 94 M 79.5 96.5 L 77 94 L 73 94 M 40.5 111.5 L 43 114 L 47 114 M 79.5 111.5 L 77 114 L 73 114"
            stroke={accent}
            strokeWidth="0.9"
            strokeOpacity="0.85"
          />

          {/* Неоновая светящаяся подложка текста */}
          <text
            x="60"
            y={displayLabel === "ERROR" ? "107.6" : "109"}
            textAnchor="middle"
            fontFamily="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
            fontWeight="900"
            fontSize={displayLabel === "ERROR" ? "11.4" : "15.5"}
            letterSpacing={displayLabel === "ERROR" ? "0.9" : "1.4"}
            fill="none"
            stroke={accent}
            strokeWidth="2.4"
            strokeOpacity="0.45"
          >
            {displayLabel}
          </text>

          {/* Тёмная гравировка с чёткой неоновой окантовкой */}
          <text
            x="60"
            y={displayLabel === "ERROR" ? "107.6" : "109"}
            textAnchor="middle"
            fontFamily="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
            fontWeight="900"
            fontSize={displayLabel === "ERROR" ? "11.4" : "15.5"}
            letterSpacing={displayLabel === "ERROR" ? "0.9" : "1.4"}
            fill="#070a10"
            stroke={accent}
            strokeWidth="0.85"
          >
            {displayLabel}
          </text>
        </g>

        {/* ================================================================
            СЛОЙ 7: 3 прогрессивные заготовки трещин (раскрываются по урону)
           ================================================================ */}
        <g id="layer-damage-cracks">
          {/* Трещина 1: скол на верхнем левом надкрылье */}
          {crackStage >= 1 && (
            <g>
              <path
                d="M 31 74 L 38 80 L 35 87 L 43 92 M 38 80 L 45 78"
                stroke="#05070b"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M 31 74 L 38 80 L 35 87 L 43 92 M 38 80 L 45 78"
                stroke={accent}
                strokeWidth="0.9"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </g>
          )}

          {/* Трещина 2: глубокий разлом правого фланга */}
          {crackStage >= 2 && (
            <g>
              <path
                d="M 91 102 L 82 108 L 85 117 L 75 124 M 82 108 L 76 104"
                stroke="#05070b"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M 91 102 L 82 108 L 85 117 L 75 124 M 82 108 L 76 104"
                stroke={accent}
                strokeWidth="1"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="82" cy="108" r="1.4" fill="#ffffff" className="cb-diode" />
            </g>
          )}

          {/* Трещина 3: критический раскол нижней брони и пронотума */}
          {crackStage >= 3 && (
            <g>
              <path
                d="M 41 138 L 48 128 L 54 132 L 58 122 M 48 128 L 43 121"
                stroke="#05070b"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M 41 138 L 48 128 L 54 132 L 58 122 M 48 128 L 43 121"
                stroke="#ffffff"
                strokeWidth="0.85"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M 65 44 L 62 51 L 68 56"
                stroke="#05070b"
                strokeWidth="1.9"
                strokeLinecap="round"
              />
              <path
                d="M 65 44 L 62 51 L 68 56"
                stroke={accent}
                strokeWidth="0.85"
                strokeLinecap="round"
              />
            </g>
          )}
        </g>

        {/* ================================================================
            СЛОЙ 8: Пластина-пронотум (многогранный нагрудный щит)
           ================================================================ */}
        <g id="layer-pronotum" className="cb-pronotum">
          {/* Основной гранёный щит */}
          <path
            d={
              isBoss
                ? "M 40 37 L 60 33 L 80 37 L 91 53 L 83 64 L 60 68 L 37 64 L 29 53 Z"
                : "M 43 38 L 60 35 L 77 38 L 86 52 L 80 63 L 60 66 L 40 63 L 34 52 Z"
            }
            fill={`url(#${idPronotum})`}
            stroke="#475569"
            strokeWidth="1"
            strokeLinejoin="round"
          />

          {/* Внутренняя трапеция-накладка */}
          <path
            d="M 48 42 L 72 42 L 76 56 L 60 61 L 44 56 Z"
            fill="#141924"
            stroke="#334155"
            strokeWidth="0.7"
          />

          {/* Рим-лайт по верхним плечам пронотума */}
          <path
            d={
              isBoss
                ? "M 30.2 52.5 L 40.5 37.8 L 60 34 L 79.5 37.8 L 89.8 52.5"
                : "M 35 51.5 L 43.5 38.8 L 60 36 L 76.5 38.8 L 85 51.5"
            }
            stroke={accent}
            strokeWidth="1.2"
            strokeOpacity="0.85"
            strokeLinecap="round"
          />
          {/* Белый верхний спекуляр */}
          <path
            d="M 46 37.6 L 60 35.6 L 74 37.6"
            stroke="#ffffff"
            strokeWidth="0.7"
            strokeOpacity="0.65"
            strokeLinecap="round"
          />

          {/* Центральный энерго-индикатор на пронотуме */}
          {isBoss ? (
            <g>
              {/* Реакторный ромб босса */}
              <path
                d="M 60 44 L 66 51 L 60 58 L 54 51 Z"
                fill="#0a0e16"
                stroke={accent}
                strokeWidth="1.1"
              />
              <path
                d="M 60 46.8 L 63.3 51 L 60 55.2 L 56.7 51 Z"
                fill={accent}
                className="cb-diode"
              />
              <circle cx="60" cy="51" r="1.3" fill="#ffffff" />
            </g>
          ) : (
            <g>
              {/* Тройная диодная полоса статуса */}
              <rect x="53" y="48.5" width="3.2" height="3.2" rx="0.8" fill={accent} className="cb-diode" />
              <rect x="58.4" y="47.5" width="3.2" height="5.2" rx="0.8" fill={accent} className="cb-diode" />
              <rect x="63.8" y="48.5" width="3.2" height="3.2" rx="0.8" fill={accent} className="cb-diode" />
            </g>
          )}
        </g>

        {/* ================================================================
            СЛОЙ 9: Голова-капсула, жвала-клешни и диодные глаза
           ================================================================ */}
        <g id="layer-head">
          {/* --- ЖВАЛА (Mandibles) --- */}
          <g className="cb-mandible-l">
            <path
              d={
                isBoss
                  ? "M 51 23 C 43 17, 41 9, 49 4 L 53 7 L 49.5 11 L 54 13 L 50.5 16.5 L 55 21 Z"
                  : "M 52 24 C 46 19, 45 12, 51 8 L 54 11 C 51 14, 51.5 17.5, 55.5 21 Z"
              }
              fill={`url(#${idMetal})`}
              stroke="#64748b"
              strokeWidth="0.75"
              strokeLinejoin="round"
            />
            {/* Плазменная режущая кромка жвал */}
            <path
              d={isBoss ? "M 49 4 L 53 7 L 49.5 11 L 54 13" : "M 51 8 L 53.8 11.2"}
              stroke={accent}
              strokeWidth="1"
              strokeLinecap="round"
            />
          </g>

          <g className="cb-mandible-r">
            <path
              d={
                isBoss
                  ? "M 69 23 C 77 17, 79 9, 71 4 L 67 7 L 70.5 11 L 66 13 L 69.5 16.5 L 65 21 Z"
                  : "M 68 24 C 74 19, 75 12, 69 8 L 66 11 C 69 14, 68.5 17.5, 64.5 21 Z"
              }
              fill={`url(#${idMetal})`}
              stroke="#64748b"
              strokeWidth="0.75"
              strokeLinejoin="round"
            />
            <path
              d={isBoss ? "M 71 4 L 67 7 L 70.5 11 L 66 13" : "M 69 8 L 66.2 11.2"}
              stroke={accent}
              strokeWidth="1"
              strokeLinecap="round"
            />
          </g>

          {/* --- КАПСУЛА ГОЛОВЫ --- */}
          <path
            d="M 46 37 L 43.5 27.5 L 49.5 20.5 L 60 18.5 L 70.5 20.5 L 76.5 27.5 L 74 37 L 60 40 Z"
            fill={`url(#${idPronotum})`}
            stroke="#475569"
            strokeWidth="0.95"
            strokeLinejoin="round"
          />
          {/* Центральный гребень шлема */}
          <path
            d="M 60 19.5 L 63 26 L 60 36 L 57 26 Z"
            fill="#141a26"
            stroke="#475569"
            strokeWidth="0.6"
          />
          {/* Рим-лайт шлема */}
          <path
            d="M 45 27.5 L 50 21.5 L 60 19.6 L 70 21.5 L 75 27.5"
            stroke={accent}
            strokeWidth="0.95"
            strokeOpacity="0.8"
            strokeLinecap="round"
          />

          {/* --- ДИОДНЫЕ ГЛАЗА (Агрессивный кибер-визор) --- */}
          <g className="cb-diode">
            {/* Левый главный оптический сенсор */}
            <path
              d="M 46.2 26.8 L 54.5 28.8 L 53.2 32.5 L 46.8 31.2 Z"
              fill={accent}
              stroke="#ffffff"
              strokeWidth="0.45"
            />
            <line x1="48" y1="28.6" x2="52.6" y2="29.8" stroke="#ffffff" strokeWidth="0.9" strokeLinecap="round" />

            {/* Правый главный оптический сенсор */}
            <path
              d="M 73.8 26.8 L 65.5 28.8 L 66.8 32.5 L 73.2 31.2 Z"
              fill={accent}
              stroke="#ffffff"
              strokeWidth="0.45"
            />
            <line x1="72" y1="28.6" x2="67.4" y2="29.8" stroke="#ffffff" strokeWidth="0.9" strokeLinecap="round" />

            {/* Дополнительные тактические глазки у босса */}
            {isBoss && (
              <>
                <circle cx="51" cy="24.4" r="1.2" fill={accent} />
                <circle cx="69" cy="24.4" r="1.2" fill={accent} />
              </>
            )}
          </g>
        </g>

        {/* ================================================================
            СЛОЙ 10: Многосегментные кибер-усики со сканерами
           ================================================================ */}
        <g id="layer-antennae">
          {/* Левый усик */}
          <g className="cb-antenna-l">
            {/* Гнездо крепления */}
            <circle cx="48" cy="23" r="2.1" fill="#121722" stroke="#64748b" strokeWidth="0.7" />
            {/* 1-й сегмент (усиленный) */}
            <path
              d="M 48 23 Q 40 16, 35 12"
              stroke="#64748b"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
            {/* Промежуточный сустав-ретранслятор */}
            <circle cx="35" cy="12" r="1.7" fill="#0e131d" stroke={accent} strokeWidth="0.85" />
            {/* 2-й гибкий сенсорный хлыст */}
            <path
              d="M 35 12 Q 28 7.5, 22 6.5"
              stroke="#94a3b8"
              strokeWidth="1.1"
              strokeLinecap="round"
            />
            {/* Радарное кольцо на кончике */}
            <circle
              cx="22"
              cy="6.5"
              r="2.4"
              stroke={accent}
              strokeWidth="0.7"
              fill="none"
              className="cb-radar-ring"
            />
            {/* Неоновый наконечник */}
            <circle cx="22" cy="6.5" r="2.1" fill={accent} />
            <circle cx="22" cy="6.5" r="0.9" fill="#ffffff" />
          </g>

          {/* Правый усик */}
          <g className="cb-antenna-r">
            <circle cx="72" cy="23" r="2.1" fill="#121722" stroke="#64748b" strokeWidth="0.7" />
            <path
              d="M 72 23 Q 80 16, 85 12"
              stroke="#64748b"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
            <circle cx="85" cy="12" r="1.7" fill="#0e131d" stroke={accent} strokeWidth="0.85" />
            <path
              d="M 85 12 Q 92 7.5, 98 6.5"
              stroke="#94a3b8"
              strokeWidth="1.1"
              strokeLinecap="round"
            />
            <circle
              cx="98"
              cy="6.5"
              r="2.4"
              stroke={accent}
              strokeWidth="0.7"
              fill="none"
              className="cb-radar-ring"
              style={{ animationDelay: "-1.1s" }}
            />
            <circle cx="98" cy="6.5" r="2.1" fill={accent} />
            <circle cx="98" cy="6.5" r="0.9" fill="#ffffff" />
          </g>
        </g>
      </svg>
    </div>
  );
};
