#!/usr/bin/env python3
"""Push every finished benchmark scan to the public registry (any grade).

Reads scripts/benchmark_data/*.json (written by appseal_benchmark.py), keeps
status=done non-demo scans that produced real results (dead URLs and
api-error targets have empty results and are skipped), dedupes by host
(newest scan wins) and POSTs batches to the production ingest endpoint.
The registry UI blurs descriptions of hosts below grade A, so listing all
grades is safe; the runner never sends scans without results.

The ingest key lives in the local env file (never in the repo):
  REGISTRY_INGEST_KEY=...

Usage:
  python3 scripts/appseal_ingest.py            # dry run: show what would go
  python3 scripts/appseal_ingest.py --push     # actually POST to production
"""
import argparse
import http.client
import json
import pathlib
import re
import subprocess

BENCH_DIR = pathlib.Path(__file__).parent / "benchmark_data"
ENV_FILE = pathlib.Path("D:/BIR/.env")
STOP_HOSTS = pathlib.Path(__file__).parent / "stop_hosts.txt"
SCRIPTS_DIR = pathlib.Path(__file__).parent


def load_hostlatest() -> dict:
    """host -> {ts, grade, score} of everything ever pushed.

    Local mirror (benchmark_data/hostlatest.json), seeded once from Redis
    HSCAN and updated after every successful push - no runtime Redis calls.
    """
    dump = BENCH_DIR / "hostlatest.json"
    try:
        return json.loads(dump.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        print("  ! hostlatest.json missing -> full push this run")
        return {}


def save_hostlatest(entries) -> None:
    """Merge pushed entries into the local mirror after a successful push."""
    dump = BENCH_DIR / "hostlatest.json"
    try:
        state = json.loads(dump.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        state = {}
    for e in entries:
        state[e["host"]] = {"ts": e["ts"], "grade": e["grade"], "score": e["score"]}
    dump.write_text(json.dumps(state, ensure_ascii=False), encoding="utf-8")
    print(f"hostlatest mirror updated: {len(state)} hosts")


def load_stop_hosts() -> set[str]:
    try:
        return {
            l.strip().lower()
            for l in STOP_HOSTS.read_text(encoding="utf-8").splitlines()
            if l.strip() and not l.startswith("#")
        }
    except OSError:
        return set()


def read_key() -> str:
    k = ""
    for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
        if line.startswith("REGISTRY_INGEST_KEY="):
            k = line.split("=", 1)[1].strip().strip('"').strip("'")
    if not k:
        raise SystemExit("REGISTRY_INGEST_KEY not found in D:/BIR/.env")
    return k


def iso_to_ms(iso: str) -> int:
    from datetime import datetime, timezone

    try:
        dt = datetime.fromisoformat((iso or "").replace("Z", "+00:00"))
    except ValueError:
        return 0
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return int(dt.timestamp() * 1000)


def load_titles() -> dict[str, str]:
    """host -> one-line description from the harvest metadata (Show HN title)."""
    try:
        meta = json.loads((BENCH_DIR / "harvest_meta.json").read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}
    out: dict[str, str] = {}
    for url, m in meta.items():
        host = str(url).split("//", 1)[-1].split("/", 1)[0].lower().removeprefix("www.")
        title = str(m.get("title", "") if isinstance(m, dict) else m or "").strip()
        # forum prefixes and markup leftovers do not describe the site itself
        title = re.sub(r"^Show HN:\s*", "", title)
        title = title.replace("\u2013", "-").replace("\u2014", "-").replace("<", "").replace(">", "").replace('"', "")
        if host and title:
            out[host] = title[:160]
    return out


def collect() -> list[dict]:
    stop = load_stop_hosts()
    titles = load_titles()
    by_host: dict[str, dict] = {}
    for path in sorted(BENCH_DIR.glob("*.json")):
        if path.name in ("summary.json", "harvest_meta.json"):
            continue
        try:
            d = json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            continue
        if d.get("status") != "done" or d.get("isDemo"):
            continue
        # only the harvested AI-app panel: the old own/market panel scans
        # (platforms, our own apps) never belong in the public registry
        if d.get("group") != "harvest":
            continue
        # dead URLs and errored scans have no results: a badge on a site that
        # does not exist is noise, never publish those
        if not d.get("results"):
            continue
        host = str(d.get("host", "")).lower().removeprefix("www.")
        if not host or "." not in host or host in stop:
            continue
        ts = iso_to_ms(d.get("finishedAt", ""))
        entry = {
            "host": host,
            "grade": d["grade"],
            "score": int(d.get("score", 0)),
            "ts": ts,
            "id": d.get("id", ""),
        }
        if host in titles:
            entry["desc"] = titles[host]
        # builder platform detected by the engine (detectPlatform): keeps the
        # /stats platform battle honest for custom-domain builds
        platform = d.get("platform")
        if isinstance(platform, str) and platform.strip():
            entry["platform"] = platform.strip()[:24]
        prev = by_host.get(host)
        if not prev or entry["ts"] > prev["ts"]:
            by_host[host] = entry
    return sorted(by_host.values(), key=lambda e: e["ts"])


def push(entries: list[dict], key: str) -> None:
    # fixed production host as a literal: the ingest endpoint is singular
    conn = http.client.HTTPSConnection("appseal.online", timeout=30)
    for i in range(0, len(entries), 50):
        batch = entries[i : i + 50]
        payload = json.dumps({"entries": batch})
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {key}",
        }
        try:
            conn.request("POST", "/api/registry/ingest", body=payload, headers=headers)
            resp = conn.getresponse()
            body = resp.read().decode("utf-8", "replace")
            print(f"  batch {i // 50 + 1}: HTTP {resp.status} {body[:120]}")
        except Exception as e:
            print(f"  batch {i // 50 + 1} failed: {e}")
            conn.close()
            conn = http.client.HTTPSConnection("appseal.online", timeout=30)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--push", action="store_true", help="POST to production (default: dry run)")
    ap.add_argument("--full", action="store_true",
                    help="push ALL collected entries (default: incremental - only "
                         "hosts missing from the registry or re-scanned newer)")
    args = ap.parse_args()

    entries = collect()
    print(f"hosts ready for the registry (all grades): {len(entries)}")
    if not args.full:
        latest = load_hostlatest()
        if latest:
            delta = [e for e in entries
                     if e["host"] not in latest or e["ts"] > latest[e["host"]].get("ts", 0)]
            print(f"incremental: {len(delta)} new/updated of {len(entries)} "
                  f"(registry has {len(latest)})")
            entries = delta
        for e in entries:
            print(f"  {e['grade']:2} {e['score']:3}  {e['host']}")
    if args.push and entries:
        push(entries, read_key())
        save_hostlatest(entries)
    elif not args.push:
        print("(dry run - pass --push to publish)")


if __name__ == "__main__":
    main()
