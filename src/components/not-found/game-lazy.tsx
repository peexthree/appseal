"use client";

import dynamic from "next/dynamic";

// the cyber-bug game (svg rig + splat physics + sfx engine, ~41KB raw) lives
// in the not-found boundary, whose chunk every route's bundle includes - the
// dynamic import turns it into an async chunk fetched only on the 404 page,
// so the landing and all inner pages stop shipping game code
const CyberBugEasterEgg = dynamic(
  () => import("./CyberBugEasterEgg").then((m) => m.CyberBugEasterEgg),
  { ssr: false },
);

export function CyberBugLazy() {
  return <CyberBugEasterEgg />;
}
