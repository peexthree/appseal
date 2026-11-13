#!/usr/bin/env python3
"""Aggregate harvested benchmark results into the /stats page snapshot.

Reads scripts/benchmark_data/ (summary.json for the panel breakdown, per-scan
JSONs for grades and failed checks, harvest_meta.json for sources) and writes
src/data/stats-harvest.json. Only aggregates go in - no host names: the
public stats page is anonymous by design (names only in the registry for
grade A/A+ or owner-submitted hosts).

Run after appseal_benchmark.py finishes (needs summary.json).

Usage:
  python3 scripts/appseal_stats.py
"""
import json
import pathlib
import statistics

SCRIPTS_DIR = pathlib.Path(__file__).parent
BENCH_DIR = SCRIPTS_DIR / "benchmark_data"
TARGETS_TXT = SCRIPTS_DIR / "targets_harvest.txt"
OUT_FILE = SCRIPTS_DIR.parent / "src" / "data" / "stats-harvest.json"

GRADE_ORDER = ["A+", "A", "B", "C", "D", "E"]


def main() -> None:
    summary = json.loads((BENCH_DIR / "summary.json").read_text(encoding="utf-8"))
    meta = {}
    meta_path = BENCH_DIR / "harvest_meta.json"
    if meta_path.exists():
        meta = json.loads(meta_path.read_text(encoding="utf-8"))

    # panel status counts from the run summary
    status_counts: dict[str, int] = {}
    for r in summary.get("results", []):
        s = r.get("status", "missing")
        status_counts[s] = status_counts.get(s, 0) + 1

    total_panel = sum(status_counts.values()) or sum(
        1 for l in TARGETS_TXT.read_text(encoding="utf-8").splitlines()
        if l.strip() and not l.startswith("#")
    )

    grades = {g: 0 for g in GRADE_ORDER}
    scores: list[int] = []
    src_scores: dict[str, list[int]] = {}
    fail_by_check: dict[str, dict] = {}
    scanned = 0

    for path in sorted(BENCH_DIR.glob("*.json")):
        if path.name in ("summary.json", "harvest_meta.json"):
            continue
        try:
            d = json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            continue
        if d.get("status") != "done" or d.get("isDemo") or d.get("group") != "harvest":
            continue
        scanned += 1
        g = d.get("grade", "E")
        if g in grades:
            grades[g] += 1
        score = d.get("score", 0)
        scores.append(int(score))

        host = str(d.get("host", "")).lower().removeprefix("www.")
        source = meta.get(host, {}).get("source", "unknown").split(":")[0]
        src_scores.setdefault(source, []).append(int(score))

        results = d.get("results") or []
        for c in results:
            cid = c.get("id", "")
            if not cid:
                continue
            agg = fail_by_check.setdefault(
                cid, {"title": c.get("title", {}).get("ru", cid), "fail": 0, "warn": 0, "n": 0}
            )
            agg["n"] += 1
            st = c.get("status")
            if st == "fail":
                agg["fail"] += 1
            elif st == "warn":
                agg["warn"] += 1

    top_fails = sorted(
        (
            {
                "id": cid,
                "title": a["title"],
                "failPct": round(a["fail"] * 100 / a["n"]),
                "warnPct": round(a["warn"] * 100 / a["n"]),
            }
            for cid, a in fail_by_check.items()
            if a["n"] >= scanned * 0.5  # checks that actually ran on most hosts
        ),
        key=lambda x: (-x["failPct"], -x["warnPct"]),
    )[:12]

    sources = {s: len(v) for s, v in sorted(src_scores.items(), key=lambda kv: -len(kv[1]))}
    avg_by_source = {
        s: round(statistics.mean(v)) for s, v in src_scores.items() if len(v) >= 5
    }

    out = {
        "generatedAt": summary.get("generated_at", ""),
        "panel": {"total": total_panel, "done": scanned, **status_counts},
        "grades": grades,
        "avgScore": round(statistics.mean(scores)) if scores else 0,
        "medianScore": round(statistics.median(scores)) if scores else 0,
        "gradeACount": grades["A+"] + grades["A"],
        "sources": sources,
        "avgScoreBySource": avg_by_source,
        "topFails": top_fails,
    }
    OUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    OUT_FILE.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"written {OUT_FILE}")
    print(json.dumps({k: out[k] for k in ("panel", "grades", "avgScore", "gradeACount")}, ensure_ascii=False))


if __name__ == "__main__":
    main()
