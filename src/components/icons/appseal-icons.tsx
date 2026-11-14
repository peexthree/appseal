/**
 * AppSeal Animated SVG Icon Pack (v1.0)
 * Прямая drop-in замена для lucide-react в scanner-page.tsx, report-view.tsx и registry/page.tsx.
 * - Поддержка currentColor и любых Tailwind-классов (text-sky-400, text-red-500 и т.д.)
 * - Цикл 2.8с со статичным первым кадром (0%) и поддержкой prefers-reduced-motion
 */
import * as React from "react";

export interface AppSealIconProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string;
  strokeWidth?: number | string;
  /** Опциональное состояние для радара сканирования: wait | active | done */
  radarState?: "wait" | "active" | "done";
}

export function ShieldCheck({ size = 24, strokeWidth = 2, className = "", ...props }: AppSealIconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={size} height={size} overflow="visible" style={{ overflow: "visible" }} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
  <style>{`svg { overflow: visible; }
    .am-sc-body {
      transform-origin: 12px 12px;
      animation: am-sc-shield 2.8s cubic-bezier(0.22, 1, 0.36, 1) infinite;
    }
    .am-sc-wave {
      transform-origin: 12px 12px;
      opacity: 0;
      animation: am-sc-pulse 2.8s cubic-bezier(0.16, 1, 0.3, 1) infinite;
    }
    .am-sc-tick {
      stroke-dasharray: 12;
      stroke-dashoffset: 0;
      transform-origin: 12px 12.5px;
      animation: am-sc-check 2.8s cubic-bezier(0.34, 1.56, 0.64, 1) infinite;
    }
    @keyframes am-sc-shield {
      0%, 100% { transform: scale(1); }
      12% { transform: scale(0.84, 0.86); }
      26% { transform: scale(1, 1); }
      34% { transform: scale(0.95, 0.96); }
      48%, 90% { transform: scale(1); }
    }
    @keyframes am-sc-check {
      0%, 8% { stroke-dashoffset: 0; transform: scale(1); opacity: 1; }
      14% { stroke-dashoffset: 12; transform: scale(0.75); opacity: 0.2; }
      22% { stroke-dashoffset: 12; transform: scale(0.75); opacity: 1; }
      36% { stroke-dashoffset: 0; transform: scale(1.24); opacity: 1; }
      48%, 100% { stroke-dashoffset: 0; transform: scale(1); opacity: 1; }
    }
    @keyframes am-sc-pulse {
      0%, 26% { transform: scale(0.45); opacity: 0; stroke-width: 2.2; }
      36% { transform: scale(0.68); opacity: 0.75; stroke-width: 1.6; }
      64%, 100% { transform: scale(0.96); opacity: 0; stroke-width: 0.5; }
    }
    @media (prefers-reduced-motion: reduce) {
      .am-sc-body, .am-sc-wave, .am-sc-tick { animation: none !important; opacity: 1 !important; transform: none !important; stroke-dashoffset: 0 !important; }
      .am-sc-wave { display: none !important; }
    }`}</style>
  <path className="am-sc-wave" d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
  <path className="am-sc-body" d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
  <path className="am-sc-tick" d="m9 12 2 2 4-4" />
</svg>
  );
}

export function ShieldAlert({ size = 24, strokeWidth = 2, className = "", ...props }: AppSealIconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={size} height={size} overflow="visible" style={{ overflow: "visible" }} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
  <style>{`svg { overflow: visible; }
    .am-sa-shield {
      transform-origin: 12px 12px;
      animation: am-sa-shake 2.8s cubic-bezier(0.36, 0.07, 0.19, 0.97) infinite;
    }
    .am-sa-bang {
      transform-origin: 12px 12px;
      animation: am-sa-excl 2.8s cubic-bezier(0.34, 1.56, 0.64, 1) infinite;
    }
    .am-sa-core {
      transform-origin: 12px 12px;
      opacity: 0;
      animation: am-sa-radar 2.8s ease-out infinite;
    }
    @keyframes am-sa-shake {
      0%, 100% { transform: translate(0, 0) scale(1) rotate(0deg); }
      10% { transform: translate(0, 0) scale(0.86); }
      17% { transform: translate(-1.2px, 0) scale(0.95) rotate(-6deg); }
      24% { transform: translate(1.2px, 0) scale(0.95) rotate(6deg); }
      31% { transform: translate(-0.9px, 0) scale(0.97) rotate(-4deg); }
      38% { transform: translate(0.7px, 0) scale(0.99) rotate(2.5deg); }
      46% { transform: translate(-0.3px, 0) scale(1) rotate(-1deg); }
      54%, 90% { transform: translate(0, 0) scale(1) rotate(0deg); }
    }
    @keyframes am-sa-excl {
      0%, 100% { transform: scale(1) translateY(0); }
      12% { transform: scale(0.72) translateY(1.8px); }
      23% { transform: scale(1.28) translateY(-1.2px); }
      36% { transform: scale(0.92) translateY(0.5px); }
      48% { transform: scale(1.08) translateY(-0.3px); }
      60% { transform: scale(1) translateY(0); }
    }
    @keyframes am-sa-radar {
      0%, 16% { opacity: 0; transform: scale(0.3); }
      26% { opacity: 0.75; transform: scale(0.85); }
      56%, 100% { opacity: 0; transform: scale(1.35); }
    }
    @media (prefers-reduced-motion: reduce) {
      .am-sa-shield, .am-sa-bang, .am-sa-core { animation: none !important; transform: none !important; }
      .am-sa-core { display: none !important; }
    }`}</style>
  <circle className="am-sa-core" cx="12" cy="12" r="4" strokeWidth="1.4" />
  <path className="am-sa-shield" d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
  <g className="am-sa-bang">
    <path d="M12 8v4" />
    <path d="M12 16h.01" />
  </g>
</svg>
  );
}

export function KeyRound({ size = 24, strokeWidth = 2, radarState, className = "", ...props }: AppSealIconProps) {
  if (radarState === "done") {
    return <Check size={size} strokeWidth={strokeWidth} className={`text-emerald-400 ${className}`} {...props} />;
  }
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={size} height={size} overflow="visible" style={{ overflow: "visible" }} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={`${radarState === "wait" ? "opacity-45 [&_path]:!animate-none [&_g]:!animate-none [&_circle]:!animate-none" : ""} ${className}`} {...props}>
  <style>{`svg { overflow: visible; }
    .am-kr-key {
      transform-origin: 12px 12px;
      animation: am-kr-turn 2.8s cubic-bezier(0.34, 1.56, 0.64, 1) infinite;
    }
    .am-kr-pin {
      transform-origin: 16.5px 7.5px;
      animation: am-kr-spark 2.8s ease-out infinite;
    }
    .am-kr-wave {
      transform-origin: 15.5px 8.5px;
      opacity: 0;
      animation: am-kr-ring 2.8s cubic-bezier(0.16, 1, 0.3, 1) infinite;
    }
    @keyframes am-kr-turn {
      0%, 100% { transform: rotate(0deg) scale(1); }
      14% { transform: rotate(-8deg) scale(0.88); }
      28% { transform: rotate(6deg) scale(0.96); }
      40% { transform: rotate(4deg) scaleY(0.58) scaleX(0.96); }
      54% { transform: rotate(-2deg) scale(1); }
      68% { transform: rotate(0deg) scale(1); }
    }
    @keyframes am-kr-spark {
      0%, 30%, 100% { transform: scale(1); }
      44% { transform: scale(2.2); }
      62% { transform: scale(1); }
    }
    @keyframes am-kr-ring {
      0%, 34% { transform: scale(0.3); opacity: 0; }
      46% { transform: scale(0.75); opacity: 0.75; }
      72%, 100% { transform: scale(1.15); opacity: 0; }
    }
    @media (prefers-reduced-motion: reduce) {
      .am-kr-key, .am-kr-pin, .am-kr-wave { animation: none !important; transform: none !important; }
      .am-kr-wave { display: none !important; }
    }`}</style>
  <circle className="am-kr-wave" cx="15.5" cy="8.5" r="4.2" strokeWidth="1.4" />
  <g className="am-kr-key">
    <path d="M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z" />
    <circle className="am-kr-pin" cx="16.5" cy="7.5" r=".5" fill="currentColor" />
  </g>
</svg>
  );
}

export function ShieldHeaders({ size = 24, strokeWidth = 2, radarState, className = "", ...props }: AppSealIconProps) {
  if (radarState === "done") {
    return <Check size={size} strokeWidth={strokeWidth} className={`text-emerald-400 ${className}`} {...props} />;
  }
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={size} height={size} overflow="visible" style={{ overflow: "visible" }} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={`${radarState === "wait" ? "opacity-45 [&_path]:!animate-none [&_g]:!animate-none [&_circle]:!animate-none" : ""} ${className}`} {...props}>
  <style>{`svg { overflow: visible; }
    .am-sh-shell {
      transform-origin: 12px 12px;
      animation: am-sh-armor 2.8s cubic-bezier(0.22, 1, 0.36, 1) infinite;
    }
    .am-sh-h1, .am-sh-h2, .am-sh-h3 {
      stroke-dasharray: 10;
      stroke-dashoffset: 0;
      transform-origin: 12px 12px;
    }
    .am-sh-h1 { animation: am-sh-line1 2.8s cubic-bezier(0.34, 1.56, 0.64, 1) infinite; }
    .am-sh-h2 { animation: am-sh-line2 2.8s cubic-bezier(0.34, 1.56, 0.64, 1) infinite; }
    .am-sh-h3 { animation: am-sh-line3 2.8s cubic-bezier(0.34, 1.56, 0.64, 1) infinite; }
    @keyframes am-sh-armor {
      0%, 100% { transform: scale(1); }
      12% { transform: scale(0.88); }
      46% { transform: scale(0.93); }
      58% { transform: scale(1); }
    }
    @keyframes am-sh-line1 {
      0%, 8%, 62%, 100% { stroke-dashoffset: 0; transform: translateX(0); opacity: 1; }
      14% { stroke-dashoffset: 10; transform: translateX(-2px); opacity: 0.2; }
      28% { stroke-dashoffset: 0; transform: translateX(0.6px); opacity: 1; }
      36% { transform: translateX(0); }
    }
    @keyframes am-sh-line2 {
      0%, 12%, 66%, 100% { stroke-dashoffset: 0; transform: translateX(0); opacity: 1; }
      20% { stroke-dashoffset: 10; transform: translateX(-2px); opacity: 0.2; }
      36% { stroke-dashoffset: 0; transform: translateX(0.6px); opacity: 1; }
      44% { transform: translateX(0); }
    }
    @keyframes am-sh-line3 {
      0%, 16%, 70%, 100% { stroke-dashoffset: 0; transform: translateX(0); opacity: 1; }
      26% { stroke-dashoffset: 10; transform: translateX(-2px); opacity: 0.2; }
      46% { stroke-dashoffset: 0; transform: translateX(0.6px); opacity: 1; }
      54% { transform: translateX(0); }
    }
    @media (prefers-reduced-motion: reduce) {
      .am-sh-shell, .am-sh-h1, .am-sh-h2, .am-sh-h3 { animation: none !important; transform: none !important; stroke-dashoffset: 0 !important; opacity: 1 !important; }
    }`}</style>
  <path className="am-sh-shell" d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
  <path className="am-sh-h1" d="M8.5 9h7" />
  <path className="am-sh-h2" d="M8.5 12.5h7" />
  <path className="am-sh-h3" d="M10 16h4" />
</svg>
  );
}

export function Lock({ size = 24, strokeWidth = 2, radarState, className = "", ...props }: AppSealIconProps) {
  if (radarState === "done") {
    return <Check size={size} strokeWidth={strokeWidth} className={`text-emerald-400 ${className}`} {...props} />;
  }
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={size} height={size} overflow="visible" style={{ overflow: "visible" }} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={`${radarState === "wait" ? "opacity-45 [&_path]:!animate-none [&_g]:!animate-none [&_circle]:!animate-none" : ""} ${className}`} {...props}>
  <style>{`svg { overflow: visible; }
    .am-lk-root {
      transform-origin: 12px 12px;
      animation: am-lk-frame 2.8s cubic-bezier(0.22, 1, 0.36, 1) infinite;
    }
    .am-lk-shackle {
      transform-origin: 12px 11px;
      animation: am-lk-snap 2.8s cubic-bezier(0.34, 1.56, 0.64, 1) infinite;
    }
    .am-lk-body {
      transform-origin: 12px 17px;
      animation: am-lk-impact 2.8s cubic-bezier(0.22, 1, 0.36, 1) infinite;
    }
    .am-lk-hole {
      transform-origin: 12px 16.5px;
      animation: am-lk-keyhole 2.8s ease-in-out infinite;
    }
    @keyframes am-lk-frame {
      0%, 100% { transform: translateY(0) scale(1); }
      14%, 24% { transform: translateY(1.8px) scale(0.92); }
      33% { transform: translateY(0) scale(1); }
    }
    @keyframes am-lk-snap {
      0%, 100% { transform: translateY(0); }
      14%, 23% { transform: translateY(-2.4px); }
      32% { transform: translateY(0.5px); }
      42% { transform: translateY(-0.2px); }
      52%, 90% { transform: translateY(0); }
    }
    @keyframes am-lk-impact {
      0%, 28%, 100% { transform: scale(1, 1); }
      33% { transform: scale(1.06, 0.90); }
      43% { transform: scale(0.97, 1.04); }
      54%, 90% { transform: scale(1, 1); }
    }
    @keyframes am-lk-keyhole {
      0%, 32%, 100% { transform: rotate(0deg) scale(1); }
      44% { transform: rotate(90deg) scale(1.25); }
      62% { transform: rotate(90deg) scale(1); }
      78% { transform: rotate(0deg) scale(1); }
    }
    @media (prefers-reduced-motion: reduce) {
      .am-lk-root, .am-lk-shackle, .am-lk-body, .am-lk-hole { animation: none !important; transform: none !important; }
    }`}</style>
  <g className="am-lk-root">
    <path className="am-lk-shackle" d="M7 11V7a5 5 0 0 1 10 0v4" />
    <g className="am-lk-body">
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
      <path className="am-lk-hole" d="M12 15.5v2" />
    </g>
  </g>
</svg>
  );
}

export function Activity({ size = 24, strokeWidth = 2, radarState, className = "", ...props }: AppSealIconProps) {
  if (radarState === "done") {
    return <Check size={size} strokeWidth={strokeWidth} className={`text-emerald-400 ${className}`} {...props} />;
  }
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={size} height={size} overflow="visible" style={{ overflow: "visible" }} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={`${radarState === "wait" ? "opacity-45 [&_path]:!animate-none [&_g]:!animate-none [&_circle]:!animate-none" : ""} ${className}`} {...props}>
  <style>{`svg { overflow: visible; }
    .am-ac-base {
      opacity: 0.22;
    }
    .am-ac-wave {
      stroke-dasharray: 48;
      stroke-dashoffset: 0;
      transform-origin: 12px 12px;
      animation: am-ac-pulse 2.8s cubic-bezier(0.22, 1, 0.36, 1) infinite;
    }
    .am-ac-beacon {
      transform-origin: 12px 12px;
      opacity: 0;
      animation: am-ac-ping 2.8s ease-out infinite;
    }
    @keyframes am-ac-pulse {
      0%, 8% { stroke-dashoffset: 0; transform: scaleY(1); }
      15% { stroke-dashoffset: 48; transform: scaleY(0.65); }
      38% { stroke-dashoffset: 0; transform: scaleY(1); }
      48% { transform: scaleY(0.88); }
      60%, 100% { stroke-dashoffset: 0; transform: scaleY(1); }
    }
    @keyframes am-ac-ping {
      0%, 28% { opacity: 0; transform: scale(0.3); }
      38% { opacity: 0.85; transform: scale(1.1); }
      66%, 100% { opacity: 0; transform: scale(1.8); }
    }
    @media (prefers-reduced-motion: reduce) {
      .am-ac-wave, .am-ac-beacon { animation: none !important; transform: none !important; stroke-dashoffset: 0 !important; }
      .am-ac-beacon { display: none !important; }
    }`}</style>
  <path className="am-ac-base" d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2" />
  <path className="am-ac-wave" d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2" />
  <circle className="am-ac-beacon" cx="12" cy="12" r="2.2" strokeWidth="1.4" />
</svg>
  );
}

export function CheckCircle2({ size = 24, strokeWidth = 2, className = "", ...props }: AppSealIconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={size} height={size} overflow="visible" style={{ overflow: "visible" }} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
  <style>{`svg { overflow: visible; }
    .am-sp-ring {
      stroke-dasharray: 64;
      stroke-dashoffset: 0;
      transform-origin: 12px 12px;
      animation: am-sp-circle 2.8s cubic-bezier(0.22, 1, 0.36, 1) infinite;
    }
    .am-sp-check {
      stroke-dasharray: 14;
      stroke-dashoffset: 0;
      transform-origin: 12px 12px;
      animation: am-sp-tick 2.8s cubic-bezier(0.34, 1.56, 0.64, 1) infinite;
    }
    @keyframes am-sp-circle {
      0%, 8%, 100% { stroke-dashoffset: 0; transform: rotate(0deg) scale(1); }
      15% { stroke-dashoffset: 64; transform: rotate(-90deg) scale(0.84); }
      34% { stroke-dashoffset: 0; transform: rotate(0deg) scale(1); }
      44% { transform: scale(0.96); }
      56% { transform: scale(1); }
    }
    @keyframes am-sp-tick {
      0%, 12%, 100% { stroke-dashoffset: 0; transform: scale(1); }
      18% { stroke-dashoffset: 14; transform: scale(0.65); }
      36% { stroke-dashoffset: 0; transform: scale(1.26); }
      48% { transform: scale(0.94); }
      60% { transform: scale(1); }
    }
    @media (prefers-reduced-motion: reduce) {
      .am-sp-ring, .am-sp-check { animation: none !important; transform: none !important; stroke-dashoffset: 0 !important; }
    }`}</style>
  <circle className="am-sp-ring" cx="12" cy="12" r="10" />
  <path className="am-sp-check" d="m9 12 2 2 4-4" />
</svg>
  );
}

export function XCircle({ size = 24, strokeWidth = 2, className = "", ...props }: AppSealIconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={size} height={size} overflow="visible" style={{ overflow: "visible" }} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
  <style>{`svg { overflow: visible; }
    .am-sf-group {
      transform-origin: 12px 12px;
      animation: am-sf-recoil 2.8s cubic-bezier(0.36, 0.07, 0.19, 0.97) infinite;
    }
    .am-sf-s1, .am-sf-s2 {
      stroke-dasharray: 10;
      stroke-dashoffset: 0;
      transform-origin: 12px 12px;
    }
    .am-sf-s1 { animation: am-sf-slash1 2.8s ease-out infinite; }
    .am-sf-s2 { animation: am-sf-slash2 2.8s ease-out infinite; }
    @keyframes am-sf-recoil {
      0%, 10%, 100% { transform: translateX(0) scale(1); }
      14% { transform: scale(0.86); }
      28% { transform: translateX(-1px) scale(0.94); }
      34% { transform: translateX(1px) scale(0.94); }
      40% { transform: translateX(-0.8px) scale(0.97); }
      46% { transform: translateX(0.6px) scale(0.99); }
      54% { transform: translateX(0) scale(1); }
    }
    @keyframes am-sf-slash1 {
      0%, 10%, 100% { stroke-dashoffset: 0; transform: scale(1); }
      14% { stroke-dashoffset: 10; transform: scale(0.8); }
      25% { stroke-dashoffset: 0; transform: scale(1.18); }
      36% { transform: scale(1); }
    }
    @keyframes am-sf-slash2 {
      0%, 14%, 100% { stroke-dashoffset: 0; transform: scale(1); }
      20% { stroke-dashoffset: 10; transform: scale(0.8); }
      31% { stroke-dashoffset: 0; transform: scale(1.18); }
      42% { transform: scale(1); }
    }
    @media (prefers-reduced-motion: reduce) {
      .am-sf-group, .am-sf-s1, .am-sf-s2 { animation: none !important; transform: none !important; stroke-dashoffset: 0 !important; }
    }`}</style>
  <g className="am-sf-group">
    <circle cx="12" cy="12" r="10" />
    <path className="am-sf-s1" d="m15 9-6 6" />
    <path className="am-sf-s2" d="m9 9 6 6" />
  </g>
</svg>
  );
}

export function AlertTriangle({ size = 24, strokeWidth = 2, className = "", ...props }: AppSealIconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={size} height={size} overflow="visible" style={{ overflow: "visible" }} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
  <style>{`svg { overflow: visible; }
    .am-sw-tri {
      transform-origin: 12px 13px;
      animation: am-sw-bell 2.8s cubic-bezier(0.34, 1.56, 0.64, 1) infinite;
    }
    .am-sw-bang {
      transform-origin: 12px 11px;
      animation: am-sw-clapper 2.8s ease-in-out infinite;
    }
    @keyframes am-sw-bell {
      0%, 10%, 100% { transform: rotate(0deg) scale(1); }
      15% { transform: rotate(0deg) scale(0.88); }
      24% { transform: rotate(-6deg) scale(0.94); }
      32% { transform: rotate(6deg) scale(0.94); }
      40% { transform: rotate(-4deg) scale(0.97); }
      48% { transform: rotate(2deg) scale(0.99); }
      58% { transform: rotate(0deg) scale(1); }
    }
    @keyframes am-sw-clapper {
      0%, 12%, 100% { transform: rotate(0deg) scale(1); }
      26% { transform: rotate(12deg) scale(1.18); }
      34% { transform: rotate(-12deg) scale(1.18); }
      44% { transform: rotate(6deg); }
      56% { transform: rotate(0deg) scale(1); }
    }
    @media (prefers-reduced-motion: reduce) {
      .am-sw-tri, .am-sw-bang { animation: none !important; transform: none !important; }
    }`}</style>
  <g className="am-sw-tri">
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
    <g className="am-sw-bang">
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </g>
  </g>
</svg>
  );
}

export function Info({ size = 24, strokeWidth = 2, className = "", ...props }: AppSealIconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={size} height={size} overflow="visible" style={{ overflow: "visible" }} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
  <style>{`svg { overflow: visible; }
    .am-si-ring {
      transform-origin: 12px 12px;
      animation: am-si-pulse 2.8s cubic-bezier(0.22, 1, 0.36, 1) infinite;
    }
    .am-si-stem {
      transform-origin: 12px 16px;
      animation: am-si-stem-bounce 2.8s cubic-bezier(0.34, 1.56, 0.64, 1) infinite;
    }
    .am-si-dot {
      transform-origin: 12px 8px;
      animation: am-si-dot-hop 2.8s cubic-bezier(0.34, 1.56, 0.64, 1) infinite;
    }
    @keyframes am-si-dot-hop {
      0%, 10%, 100% { transform: translateY(0) scale(1); }
      22% { transform: translateY(-2px) scale(1.35); }
      34% { transform: translateY(0.8px) scale(0.9); }
      46% { transform: translateY(-0.4px) scale(1.1); }
      58% { transform: translateY(0) scale(1); }
    }
    @keyframes am-si-stem-bounce {
      0%, 28%, 100% { transform: scaleY(1); }
      35% { transform: scaleY(0.75); }
      47% { transform: scaleY(1.15); }
      60% { transform: scaleY(1); }
    }
    @keyframes am-si-pulse {
      0%, 24%, 100% { transform: scale(1); }
      35% { transform: scale(0.92); }
      50% { transform: scale(1); }
    }
    @media (prefers-reduced-motion: reduce) {
      .am-si-ring, .am-si-stem, .am-si-dot { animation: none !important; transform: none !important; }
    }`}</style>
  <circle className="am-si-ring" cx="12" cy="12" r="10" />
  <path className="am-si-stem" d="M12 16v-4" />
  <path className="am-si-dot" d="M12 8h.01" />
</svg>
  );
}

export function MinusCircle({ size = 24, strokeWidth = 2, className = "", ...props }: AppSealIconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={size} height={size} overflow="visible" style={{ overflow: "visible" }} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
  <style>{`svg { overflow: visible; }
    .am-sk-ring {
      stroke-dasharray: 64;
      transform-origin: 12px 12px;
      animation: am-sk-bypass 2.8s ease-in-out infinite;
    }
    .am-sk-bar {
      transform-origin: 12px 12px;
      animation: am-sk-slide 2.8s cubic-bezier(0.22, 1, 0.36, 1) infinite;
    }
    @keyframes am-sk-bypass {
      0%, 10%, 70%, 100% { stroke-dasharray: 64 0; transform: rotate(0deg); opacity: 1; }
      30%, 48% { stroke-dasharray: 6 5; transform: rotate(45deg); opacity: 0.65; }
    }
    @keyframes am-sk-slide {
      0%, 12%, 100% { transform: translateX(0) scaleX(1); opacity: 1; }
      28% { transform: translateX(3px) scaleX(0.55); opacity: 0.3; }
      36% { transform: translateX(-3px) scaleX(0.55); opacity: 0.3; }
      54% { transform: translateX(0.5px) scaleX(1.12); opacity: 1; }
      66% { transform: translateX(0) scaleX(1); }
    }
    @media (prefers-reduced-motion: reduce) {
      .am-sk-ring, .am-sk-bar { animation: none !important; transform: none !important; opacity: 1 !important; stroke-dasharray: none !important; }
    }`}</style>
  <circle className="am-sk-ring" cx="12" cy="12" r="10" />
  <path className="am-sk-bar" d="M8 12h8" />
</svg>
  );
}

export function Zap({ size = 24, strokeWidth = 2, className = "", ...props }: AppSealIconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={size} height={size} overflow="visible" style={{ overflow: "visible" }} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
  <style>{`svg { overflow: visible; }
    .am-zp-bolt {
      transform-origin: 12px 12px;
      animation: am-zp-strike 2.8s cubic-bezier(0.34, 1.56, 0.64, 1) infinite;
    }
    .am-zp-sparks {
      transform-origin: 12px 12px;
      opacity: 0;
      animation: am-zp-arc 2.8s ease-out infinite;
    }
    @keyframes am-zp-strike {
      0%, 100% { transform: scale(1) rotate(0deg); }
      12% { transform: scale(0.76) rotate(8deg); }
      22% { transform: scale(1) rotate(-5deg); }
      28% { transform: scale(0.86) rotate(4deg); }
      36% { transform: scale(1) rotate(-2deg); }
      48%, 90% { transform: scale(1) rotate(0deg); }
    }
    @keyframes am-zp-arc {
      0%, 18% { opacity: 0; transform: scale(0.6); }
      24% { opacity: 1; transform: scale(0.88); }
      32% { opacity: 0.35; transform: scale(0.94); }
      37% { opacity: 0.95; transform: scale(0.98); }
      58%, 100% { opacity: 0; transform: scale(1.04); }
    }
    @media (prefers-reduced-motion: reduce) {
      .am-zp-bolt, .am-zp-sparks { animation: none !important; transform: none !important; }
      .am-zp-sparks { display: none !important; }
    }`}</style>
  <path className="am-zp-sparks" strokeWidth="1.6" d="M5.5 6.5 4 5M18.5 17.5 20 19M18.5 6.5 20 5M5.5 17.5 4 19" />
  <path className="am-zp-bolt" d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z" />
</svg>
  );
}

export function Download({ size = 24, strokeWidth = 2, className = "", ...props }: AppSealIconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={size} height={size} overflow="visible" style={{ overflow: "visible" }} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
  <style>{`svg { overflow: visible; }
    .am-dl-arrow {
      transform-origin: 12px 9px;
      animation: am-dl-drop 2.8s cubic-bezier(0.34, 1.56, 0.64, 1) infinite;
    }
    .am-dl-tray {
      transform-origin: 12px 21px;
      animation: am-dl-catch 2.8s cubic-bezier(0.22, 1, 0.36, 1) infinite;
    }
    @keyframes am-dl-drop {
      0%, 100% { transform: translateY(0) scaleY(1); }
      14% { transform: translateY(-1.2px) scaleY(0.84); }
      30% { transform: translateY(2.2px) scaleY(0.92); }
      44% { transform: translateY(-0.5px) scaleY(1.02); }
      58%, 90% { transform: translateY(0) scaleY(1); }
    }
    @keyframes am-dl-catch {
      0%, 24%, 100% { transform: scale(1, 1); }
      32% { transform: scale(1.04, 0.78); }
      46% { transform: scale(0.98, 1.05); }
      60% { transform: scale(1, 1); }
    }
    @media (prefers-reduced-motion: reduce) {
      .am-dl-arrow, .am-dl-tray { animation: none !important; transform: none !important; }
    }`}</style>
  <path className="am-dl-tray" d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
  <g className="am-dl-arrow">
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" x2="12" y1="15" y2="3" />
  </g>
</svg>
  );
}

export function RotateCcw({ size = 24, strokeWidth = 2, className = "", ...props }: AppSealIconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={size} height={size} overflow="visible" style={{ overflow: "visible" }} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
  <style>{`svg { overflow: visible; }
    .am-rc-group {
      transform-origin: 12px 12px;
      animation: am-rc-spin 2.8s cubic-bezier(0.22, 1, 0.36, 1) infinite;
    }
    @keyframes am-rc-spin {
      0% { transform: rotate(0deg) scale(1); }
      14% { transform: rotate(26deg) scale(0.88); }
      52% { transform: rotate(-370deg) scale(0.96); }
      66% { transform: rotate(-357deg) scale(1); }
      78%, 100% { transform: rotate(-360deg) scale(1); }
    }
    @media (prefers-reduced-motion: reduce) {
      .am-rc-group { animation: none !important; transform: none !important; }
    }`}</style>
  <g className="am-rc-group">
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5" />
  </g>
</svg>
  );
}

export function Copy({ size = 24, strokeWidth = 2, className = "", ...props }: AppSealIconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={size} height={size} overflow="visible" style={{ overflow: "visible" }} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
  <style>{`svg { overflow: visible; }
    .am-cp-back {
      transform-origin: 9px 9px;
      animation: am-cp-base 2.8s cubic-bezier(0.34, 1.56, 0.64, 1) infinite;
    }
    .am-cp-front {
      transform-origin: 15px 15px;
      animation: am-cp-clone 2.8s cubic-bezier(0.34, 1.56, 0.64, 1) infinite;
    }
    @keyframes am-cp-clone {
      0%, 100% { transform: translate(0, 0) scale(1); }
      18% { transform: translate(-3px, -3px) scale(0.92); }
      36% { transform: translate(0, 0) scale(1); }
      46% { transform: translate(-0.6px, -0.6px) scale(0.98); }
      60%, 90% { transform: translate(0, 0) scale(1); }
    }
    @keyframes am-cp-base {
      0%, 100% { opacity: 1; transform: translate(0, 0) scale(1); }
      18% { opacity: 0.45; transform: translate(2px, 2px) scale(0.92); }
      36% { opacity: 1; transform: translate(0, 0) scale(1); }
    }
    @media (prefers-reduced-motion: reduce) {
      .am-cp-back, .am-cp-front { animation: none !important; transform: none !important; opacity: 1 !important; }
    }`}</style>
  <path className="am-cp-back" d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
  <rect className="am-cp-front" width="14" height="14" x="8" y="8" rx="2" ry="2" />
</svg>
  );
}

export function Check({ size = 24, strokeWidth = 2, className = "", ...props }: AppSealIconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={size} height={size} overflow="visible" style={{ overflow: "visible" }} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
  <style>{`svg { overflow: visible; }
    .am-ck-path {
      stroke-dasharray: 24;
      stroke-dashoffset: 0;
      transform-origin: 12px 12px;
      animation: am-ck-whip 2.8s cubic-bezier(0.34, 1.56, 0.64, 1) infinite;
    }
    @keyframes am-ck-whip {
      0%, 8%, 100% { stroke-dashoffset: 0; transform: scale(1) rotate(0deg); }
      14% { stroke-dashoffset: 24; transform: scale(0.78) rotate(-6deg); }
      32% { stroke-dashoffset: 0; transform: scale(1.08) rotate(2deg); }
      46% { transform: scale(0.96) rotate(-1deg); }
      60% { transform: scale(1) rotate(0deg); }
    }
    @media (prefers-reduced-motion: reduce) {
      .am-ck-path { animation: none !important; transform: none !important; stroke-dashoffset: 0 !important; }
    }`}</style>
  <path className="am-ck-path" d="M20 6 9 17l-5-5" />
</svg>
  );
}

export function ArrowRight({ size = 24, strokeWidth = 2, className = "", ...props }: AppSealIconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={size} height={size} overflow="visible" style={{ overflow: "visible" }} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
  <style>{`svg { overflow: visible; }
    .am-ar-group {
      transform-origin: 12px 12px;
      animation: am-ar-shoot 2.8s cubic-bezier(0.34, 1.56, 0.64, 1) infinite;
    }
    @keyframes am-ar-shoot {
      0%, 100% { transform: translateX(0) scaleX(1); }
      16% { transform: translateX(-2.4px) scaleX(0.84); }
      32% { transform: translateX(1.8px) scaleX(1.04); }
      46% { transform: translateX(-0.5px) scaleX(0.98); }
      60%, 90% { transform: translateX(0) scaleX(1); }
    }
    @media (prefers-reduced-motion: reduce) {
      .am-ar-group { animation: none !important; transform: none !important; }
    }`}</style>
  <g className="am-ar-group">
    <path d="M5 12h14" />
    <path d="m12 5 7 7-7 7" />
  </g>
</svg>
  );
}

export function Globe({ size = 24, strokeWidth = 2, className = "", ...props }: AppSealIconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={size} height={size} overflow="visible" style={{ overflow: "visible" }} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
  <style>{`svg { overflow: visible; }
    .am-gl-world {
      transform-origin: 12px 12px;
      animation: am-gl-tilt 2.8s cubic-bezier(0.22, 1, 0.36, 1) infinite;
    }
    .am-gl-meridian {
      transform-origin: 12px 12px;
      animation: am-gl-spin 2.8s ease-in-out infinite;
    }
    @keyframes am-gl-tilt {
      0%, 100% { transform: rotate(0deg) scale(1); }
      18% { transform: rotate(-12deg) scale(0.92); }
      42% { transform: rotate(10deg) scale(0.98); }
      65%, 90% { transform: rotate(0deg) scale(1); }
    }
    @keyframes am-gl-spin {
      0%, 10%, 100% { transform: scaleX(1); }
      28% { transform: scaleX(0.18); }
      46% { transform: scaleX(1.08); }
      62% { transform: scaleX(1); }
    }
    @media (prefers-reduced-motion: reduce) {
      .am-gl-world, .am-gl-meridian { animation: none !important; transform: none !important; }
    }`}</style>
  <g className="am-gl-world">
    <circle cx="12" cy="12" r="10" />
    <path d="M2 12h20" />
    <path className="am-gl-meridian" d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
  </g>
</svg>
  );
}

export function FileCheck2({ size = 24, strokeWidth = 2, className = "", ...props }: AppSealIconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={size} height={size} overflow="visible" style={{ overflow: "visible" }} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
  <style>{`svg { overflow: visible; }
    .am-fc-doc {
      transform-origin: 12px 12px;
      animation: am-fc-sheet 2.8s cubic-bezier(0.22, 1, 0.36, 1) infinite;
    }
    .am-fc-stamp {
      stroke-dasharray: 14;
      stroke-dashoffset: 0;
      transform-origin: 6px 17px;
      animation: am-fc-check 2.8s cubic-bezier(0.34, 1.56, 0.64, 1) infinite;
    }
    @keyframes am-fc-sheet {
      0%, 100% { transform: scale(1); }
      16% { transform: scale(0.90); }
      34% { transform: scale(0.95); }
      48% { transform: scale(1); }
    }
    @keyframes am-fc-check {
      0%, 10%, 100% { stroke-dashoffset: 0; transform: scale(1); }
      18% { stroke-dashoffset: 14; transform: scale(0.65); }
      34% { stroke-dashoffset: 0; transform: scale(1.22); }
      48% { transform: scale(0.96); }
      62% { transform: scale(1); }
    }
    @media (prefers-reduced-motion: reduce) {
      .am-fc-doc, .am-fc-stamp { animation: none !important; transform: none !important; stroke-dashoffset: 0 !important; }
    }`}</style>
  <g className="am-fc-doc">
    <path d="M4 22h14a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v4" />
    <path d="M14 2v4a2 2 0 0 0 2 2h4" />
  </g>
  <path className="am-fc-stamp" d="m3 15 2 2 4-4" />
</svg>
  );
}

export function X({ size = 24, strokeWidth = 2, className = "", ...props }: AppSealIconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={size} height={size} overflow="visible" style={{ overflow: "visible" }} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
  <style>{`svg { overflow: visible; }
    .am-xc-group {
      transform-origin: 12px 12px;
      animation: am-xc-turn 2.8s cubic-bezier(0.34, 1.56, 0.64, 1) infinite;
    }
    @keyframes am-xc-turn {
      0% { transform: rotate(0deg) scale(1); }
      14% { transform: rotate(-18deg) scale(0.82); }
      38% { transform: rotate(102deg) scale(1.06); }
      52% { transform: rotate(87deg) scale(0.98); }
      66%, 100% { transform: rotate(90deg) scale(1); }
    }
    @media (prefers-reduced-motion: reduce) {
      .am-xc-group { animation: none !important; transform: none !important; }
    }`}</style>
  <g className="am-xc-group">
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </g>
</svg>
  );
}

/** ChevronDown (collapsible disclosure, pack v2.0) - rotation handled by className in consumers */
export function ChevronDown({ size = 24, strokeWidth = 2, className = "", ...props }: AppSealIconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={size} height={size} overflow="visible" style={{ overflow: "visible" }} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
  <style>{`svg { overflow: visible; }
    .am-cd-main {
      transform-origin: 12px 12px;
      animation: am-cd-latch 2.8s cubic-bezier(0.34, 1.56, 0.64, 1) infinite;
    }
    .am-cd-echo {
      transform-origin: 12px 10px;
      opacity: 0;
      animation: am-cd-cascade 2.8s cubic-bezier(0.16, 1, 0.3, 1) infinite;
    }
    @keyframes am-cd-latch {
      0%, 100% { transform: translateY(0) scaleX(1); }
      15% { transform: translateY(-1.5px) scaleX(0.95); }
      34% { transform: translateY(2px) scaleX(1.03); }
      50% { transform: translateY(-0.4px) scaleX(0.99); }
      66%, 100% { transform: translateY(0) scaleX(1); }
    }
    @keyframes am-cd-cascade {
      0%, 16% { transform: translateY(-1px) scale(0.88); opacity: 0; }
      28% { transform: translateY(1.5px) scale(0.96); opacity: 0.65; }
      52%, 100% { transform: translateY(5px) scale(1.02); opacity: 0; }
    }
    @media (prefers-reduced-motion: reduce) {
      .am-cd-main, .am-cd-echo { animation: none !important; transform: none !important; }
      .am-cd-echo { display: none !important; }
    }`}</style>
  <path className="am-cd-echo" strokeWidth="1.5" d="m8 7 4 4 4-4" />
  <path className="am-cd-main" d="m6 9 6 6 6-6" />
</svg>
  );
}

/** Telegram-style paper plane (static, matches the stroke icon set) */
export function Send({ size = 24, strokeWidth = 2, className = "", ...props }: AppSealIconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={size} height={size} overflow="visible" style={{ overflow: "visible" }} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
      <path d="m22 2-7 20-4-9-9-4Z" />
      <path d="M22 2 11 13" />
    </svg>
  );
}

/** Hamburger menu (static, matches the stroke icon set) */
export function Menu({ size = 24, strokeWidth = 2, className = "", ...props }: AppSealIconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={size} height={size} overflow="visible" style={{ overflow: "visible" }} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
      <line x1="4" x2="20" y1="6" y2="6" />
      <line x1="4" x2="20" y1="12" y2="12" />
      <line x1="4" x2="20" y1="18" y2="18" />
    </svg>
  );
}

/** AI sparkle - the AI trust & hygiene category mark (static, stroke set) */
export function Sparkles({ size = 24, strokeWidth = 2, className = "", ...props }: AppSealIconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={size} height={size} overflow="visible" style={{ overflow: "visible" }} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" />
      <circle cx="12" cy="12" r="3.5" />
    </svg>
  );
}

/** Magnifier for the registry catalog search (static, matches the stroke icon set) */
export function Search({ size = 24, strokeWidth = 2, className = "", ...props }: AppSealIconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={size} height={size} overflow="visible" style={{ overflow: "visible" }} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}
