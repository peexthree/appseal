#!/usr/bin/env python3
"""Push grade-A/A+ hosts from a finished benchmark run to the public registry.

Reads scripts/benchmark_data/*.json (written by appseal_benchmark.py), keeps
status=done non-demo scans with grade A+ or A, dedupes by host (newest scan
wins) and POSTs batches to the production ingest endpoint. Hosts below grade
A are intentionally NOT listed: the public registry policy is grade A / A+
plus owners who scanned the site themselves; the rest stays aggregate-only.

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

BENCH_DIR = pathlib.Path(__file__).parent / "benchmark_data"
ENV_FILE = pathlib.Path("D:/BIR/.env")
STOP_HOSTS = pathlib.Path(__file__).parent / "stop_hosts.txt"
PUBLISH_GRADES = ("A+", "A")


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


def collect() -> list[dict]:
    stop = load_stop_hosts()
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
        if d.get("grade") not in PUBLISH_GRADES:
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
    args = ap.parse_args()

    entries = collect()
    print(f"grade A/A+ hosts ready for the registry: {len(entries)}")
    for e in entries:
        print(f"  {e['grade']:2} {e['score']:3}  {e['host']}")
    if args.push and entries:
        push(entries, read_key())
    elif not args.push:
        print("(dry run - pass --push to publish)")


if __name__ == "__main__":
    main()
