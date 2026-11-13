#!/usr/bin/env python3
"""AppSeal automated pipeline: harvest -> scan -> stats -> registry -> deploy.

One command runs the whole loop:
  python -I scripts/appseal_pipeline.py            # full cycle
  python -I scripts/appseal_pipeline.py --no-git   # skip commit/push
  python -I scripts/appseal_pipeline.py --skip-harvest

Steps:
  1. start the local dev server on :3000 if it is not answering;
  2. appseal_harvest.py - refresh the target list (keeps old targets, adds
     freshly posted ones; the tracked file is untouched when nothing changed);
  3. appseal_benchmark.py --skip-done - scan whatever has no result file yet
     (api-error targets retry automatically: they get no file on failure);
  4. appseal_stats.py - regenerate the anonymous /stats snapshot;
  5. appseal_ingest.py --push - publish new grade-A/A+ hosts;
  6. if scan data actually changed: git add + commit + push (Vercel redeploys).

Meant to be driven by scripts/appseal_pipeline.bat in the Windows Task
Scheduler (every 2nd Sunday 03:00). Run output goes to scripts/pipeline.log
via the bat redirect.
"""
import argparse
import pathlib
import subprocess
import sys
import time
import urllib.request

ROOT = pathlib.Path(__file__).parent.parent
SCRIPTS = pathlib.Path(__file__).parent

# fixed interpreter paths used by every subprocess call below
PYTHON = sys.executable or "python"

GIT_PATHS = [
    "src/data/stats-harvest.json",
    "scripts/benchmark_data",
    "scripts/targets_harvest.txt",
]


def dev_up() -> bool:
    try:
        with urllib.request.urlopen("http://127.0.0.1:3000/", timeout=5) as r:
            return r.status == 200
    except Exception:
        return False


def start_dev() -> bool:
    if dev_up():
        print("dev server already up on :3000", flush=True)
        return True
    print("starting dev server...", flush=True)
    log = open(SCRIPTS / "pipeline-dev.log", "ab")
    subprocess.Popen(  # survives this run; logs to pipeline-dev.log
        ["node", "node_modules/next/dist/bin/next", "dev", "-p", "3000"],
        cwd=str(ROOT), stdout=log, stderr=subprocess.STDOUT,
    )
    log.close()
    for _ in range(40):
        time.sleep(3)
        if dev_up():
            print("dev server up", flush=True)
            return True
    print("!!! dev server did not come up in 120s")
    return False


def git_commit_and_push() -> None:
    staged = subprocess.run(
        ["git", "status", "--porcelain", *GIT_PATHS],
        cwd=str(ROOT), capture_output=True, text=True,
    )
    if not staged.stdout.strip():
        print("\n=== git: no scan-data changes, nothing to commit")
        return
    subprocess.run(["git", "add", *GIT_PATHS], cwd=str(ROOT), check=True)
    diff = subprocess.run(["git", "diff", "--cached", "--quiet"], cwd=str(ROOT))
    if diff.returncode == 0:
        print("\n=== git: staged diff is empty, skipping commit")
        return
    stamp = time.strftime("%Y-%m-%d %H:%M")
    c = subprocess.run(
        ["git", "commit", "-m", f"auto pipeline run {stamp}"],
        cwd=str(ROOT), capture_output=True, text=True,
    )
    print((c.stdout + c.stderr).strip()[-300:])
    p = subprocess.run(["git", "push"], cwd=str(ROOT), capture_output=True, text=True)
    print((p.stdout + p.stderr).strip()[-400:])
    if p.returncode == 0:
        print("=== git: pushed (Vercel redeploys)")
    else:
        print(f"!!! git push failed: {p.returncode}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-git", action="store_true", help="skip commit/push")
    ap.add_argument("--skip-harvest", action="store_true", help="keep the target list as is")
    ap.add_argument("--skip-benchmark", action="store_true", help="scan nothing new")
    args = ap.parse_args()

    t0 = time.time()
    print(f"AppSeal pipeline started {time.strftime('%Y-%m-%d %H:%M:%S')}", flush=True)

    if not start_dev():
        sys.exit(1)

    ok = True
    if not args.skip_harvest:
        print("\n=== harvest", flush=True)
        h = subprocess.run(
            [PYTHON, "-I", "scripts/appseal_harvest.py"], cwd=str(ROOT), text=True
        )
        ok = h.returncode == 0
    if ok and not args.skip_benchmark:
        print("\n=== benchmark", flush=True)
        b = subprocess.run(
            [PYTHON, "-I", "scripts/appseal_benchmark.py", "--file",
             "scripts/targets_harvest.txt", "--tag", "harvest", "--workers", "6",
             "--skip-done"],
            cwd=str(ROOT), text=True,
        )
        ok = b.returncode == 0
    if ok:
        print("\n=== stats", flush=True)
        s = subprocess.run(
            [PYTHON, "-I", "scripts/appseal_stats.py"], cwd=str(ROOT), text=True
        )
        ok = s.returncode == 0
    if ok:
        print("\n=== ingest", flush=True)
        i = subprocess.run(
            [PYTHON, "-I", "scripts/appseal_ingest.py", "--push"], cwd=str(ROOT), text=True
        )
        ok = i.returncode == 0

    if args.no_git or not ok:
        print("\n=== git skipped (step failed or --no-git)")
    else:
        git_commit_and_push()

    print(f"\nAppSeal pipeline finished in {round(time.time() - t0)}s", flush=True)


if __name__ == "__main__":
    main()
