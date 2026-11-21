#!/usr/bin/env python3
"""Live status of the batch scan run. Usage: python scripts\\scan_status.py"""
import collections
import json
import pathlib
import time

BENCH = pathlib.Path(__file__).parent / "benchmark_data"
TARGETS = pathlib.Path(__file__).parent / "targets_harvest.txt"
DEVLOG = pathlib.Path(__file__).parent / "pipeline-dev.log"

now = time.time()
files = [p for p in BENCH.glob("*.json")
         if p.name not in ("summary.json", "harvest_meta.json")]
buckets = collections.Counter()
for p in files:
    age = (now - p.stat().st_mtime) / 60
    if age < 2:
        buckets["<2m"] += 1
    elif age < 10:
        buckets["2-10m"] += 1
    elif age < 60:
        buckets["10-60m"] += 1

total_targets = sum(
    1 for l in TARGETS.read_text(encoding="utf-8").splitlines()
    if l.strip() and not l.startswith("#")
)
newest = max(files, key=lambda p: p.stat().st_mtime)
rate = buckets["<2m"] / 2  # files per minute
remain = total_targets - len(files)
eta_h = round(remain / rate / 60, 1) if rate > 0 else None

print(f"time now: {time.strftime('%H:%M:%S')}")
print(f"targets: {total_targets}, scanned: {len(files)}, remaining: {remain}")
print(f"fresh: <2min {buckets['<2m']}, 2-10min {buckets['2-10m']}, "
      f"10-60min {buckets['10-60m']}")
print(f"rate ~{round(rate, 1)}/min, ETA ~{eta_h}h" if eta_h else "rate: idle")
print(f"newest file: {newest.name} "
      f"({round((now - newest.stat().st_mtime) / 60, 1)} min ago)")

status = "STOPPED" if buckets["<2m"] == 0 and buckets["2-10m"] == 0 else "RUNNING"
print(f"scan status: {status}")

try:
    lines = DEVLOG.read_text(encoding="utf-8", errors="replace").splitlines()
    api = [l for l in lines[-50:] if "api/scan" in l]
    print(f"dev log last api call: {api[-1].split('  ')[0] if api else '-'}")
except OSError:
    print("dev log: not found")
