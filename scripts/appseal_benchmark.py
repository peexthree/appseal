#!/usr/bin/env python3
"""AppSeal benchmark runner.

Scans a fixed panel of targets through the AppSeal API (POST /api/scan),
polls until done, and stores each full result JSON under scripts/benchmark_data/.

Usage:
  python3 scripts/appseal_benchmark.py --only demo,secure,self
  python3 scripts/appseal_benchmark.py            # full panel
  python3 scripts/appseal_benchmark.py --list
  python3 scripts/appseal_benchmark.py --file targets.txt --tag pilot2 --limit 20
"""
import argparse
import concurrent.futures as cf
import json
import pathlib
import re
import sys
import time
import urllib.request

API = "http://127.0.0.1:3000"
OUT_DIR = pathlib.Path(__file__).parent / "benchmark_data"
OUT_DIR.mkdir(exist_ok=True)

PANEL = [
    # key       group    label (ru)                                        url
    ("demo",    "own",    "FreshBite — уязвимый двойник (модель vibe-кода)",  "demo://"),
    ("secure",  "own",    "FreshBite hardened — эталон после лечения",        "https://127.0.0.1:3211"),
    ("self",    "own",    "AppSeal — самопроверка (dev-инстанс)",             "http://127.0.0.1:3000"),
    ("vercel",  "market", "Vercel",            "https://vercel.com"),
    ("netlify", "market", "Netlify",           "https://netlify.com"),
    ("render",  "market", "Render",            "https://render.com"),
    ("railway", "market", "Railway",           "https://railway.app"),
    ("flyio",   "market", "Fly.io",            "https://fly.io"),
    ("openai",  "market", "OpenAI",            "https://openai.com"),
    ("anthropic","market","Anthropic",         "https://anthropic.com"),
    ("mistral", "market", "Mistral AI",        "https://mistral.ai"),
    ("huggingface","market","Hugging Face",    "https://huggingface.co"),
    ("cloudflare","market","Cloudflare",       "https://cloudflare.com"),
]


def post_scan(url: str) -> tuple[str, str]:
    # fixed local API endpoint; URL is a compile-time literal (static-analysis
    # friendly), payload passed via data (urllib issues POST automatically);
    # rkey unlocks the full report (results list) for the saved JSON
    payload = json.dumps({"url": url, "lang": "ru"}).encode()
    d = json.load(
        urllib.request.urlopen("http://127.0.0.1:3000/api/scan", data=payload, timeout=20)
    )
    return d["id"], d.get("rkey", "")


SCAN_ID_RE = re.compile(r"^[a-z0-9-]{6,40}$")
RK_RE = re.compile(r"^[a-f0-9]{32}$")


def get_scan(scan_id: str, rkey: str = "") -> dict:
    if not SCAN_ID_RE.fullmatch(scan_id):
        raise ValueError(f"invalid scan id: {scan_id!r}")
    if rkey and RK_RE.fullmatch(rkey):
        return json.load(urllib.request.urlopen(f"{API}/api/scan/{scan_id}?key={rkey}", timeout=20))
    return json.load(urllib.request.urlopen(f"{API}/api/scan/{scan_id}", timeout=20))


def scan_target(key: str, group: str, label: str, url: str, timeout_s: int = 150) -> dict:
    t0 = time.time()
    try:
        scan_id, rkey = post_scan(url)
    except Exception as e:  # API unreachable
        return {"key": key, "label": label, "group": group, "url": url,
                "status": "api-error", "error": str(e)}
    poll_errors = 0
    while time.time() - t0 < timeout_s:
        time.sleep(3)
        try:
            d = get_scan(scan_id, rkey)
            poll_errors = 0
        except Exception as e:
            # transient 404/502 from the dev server must not kill the run
            poll_errors += 1
            if poll_errors >= 3:
                return {"key": key, "label": label, "group": group, "url": url,
                        "id": scan_id, "status": "api-error", "error": str(e)}
            continue
        if d["status"] in ("done", "error"):
            d["key"], d["label"], d["group"] = key, label, group
            (OUT_DIR / f"{key}.json").write_text(
                json.dumps(d, ensure_ascii=False, indent=2), encoding="utf-8"
            )
            return d
    return {"key": key, "label": label, "group": group, "url": url,
            "id": scan_id, "status": "timeout"}


def load_targets(path: pathlib.Path, tag: str, limit: int, skip_done: bool = False) -> list:
    """Read one URL per line ('#' comments and blanks allowed).

    Returns (key, group, label, url) tuples; the key is derived from the
    hostname so results map cleanly back to their source. With skip_done,
    targets whose result JSON already exists are skipped (resume support).
    """
    todo = []
    seen = set()
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        url = line if line.startswith(("http://", "https://")) else "https://" + line
        host = url.split("://", 1)[1].split("/", 1)[0].lower()
        key = re.sub(r"[^a-z0-9-]+", "-", host).strip("-")[:40] or "target"
        if key in seen:
            key = key + "-" + str(len(seen) + 1)
        seen.add(key)
        if skip_done and (OUT_DIR / f"{key}.json").exists():
            continue
        todo.append((key, tag, host, url))
        if limit and len(todo) >= limit:
            break
    return todo


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="", help="comma-separated keys")
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--file", default="", help="text file with one URL per line")
    ap.add_argument("--tag", default="pilot", help="group label for --file targets")
    ap.add_argument("--limit", type=int, default=0, help="max targets from --file")
    ap.add_argument("--workers", type=int, default=3, help="parallel scans")
    ap.add_argument("--skip-done", action="store_true", help="resume: skip targets with saved results")
    args = ap.parse_args()

    if args.list:
        for k, g, l, u in PANEL:
            print(f"{k:12} {g:7} {l:44} {u}")
        return

    if args.file:
        todo = load_targets(pathlib.Path(args.file), args.tag, args.limit, args.skip_done)
        if not todo:
            print("no targets found in", args.file)
            return
    else:
        keys = [x.strip() for x in args.only.split(",") if x.strip()] or None
        todo = [t for t in PANEL if not keys or t[0] in keys]
    print(f"scanning {len(todo)} target(s)…")

    def safe_scan(t: tuple) -> dict:
        try:
            return scan_target(*t)
        except Exception as e:  # never let one thread kill the whole run
            return {"key": t[0], "label": t[2], "group": t[1], "url": t[3],
                    "status": "api-error", "error": str(e)}

    results = []
    with cf.ThreadPoolExecutor(max_workers=max(1, args.workers)) as ex:
        futs = [ex.submit(safe_scan, t) for t in todo]
        for f in cf.as_completed(futs):
            d = f.result()
            results.append(d)
            grade = d.get("grade", "?")
            score = d.get("score", "?")
            print(f"  {d['key']:12} {d.get('status','?'):8} grade={grade} score={score}")

    by_key = {t[0]: t for t in todo}
    ordered = []
    for k, *_ in by_key:
        pass
    for t in todo:
        match = [r for r in results if r["key"] == t[0]]
        ordered.append(match[0] if match else {"key": t[0], "status": "missing"})

    summary = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "api": API,
        "results": ordered,
    }
    (OUT_DIR / "summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    ok = [r for r in ordered if r.get("status") == "done"]
    print(f"\ndone: {len(ok)}/{len(ordered)} (saved to {OUT_DIR})")


if __name__ == "__main__":
    main()
