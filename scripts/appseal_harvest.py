#!/usr/bin/env python3
"""AppSeal target harvester for the 500+ benchmark run.

Collects URLs that their authors publicly posted from three sources:
  - Hacker News (Algolia API): Show HN posts mentioning v0 / bolt / lovable ...
  - Reddit (public JSON): r/SideProject, r/vibecoding, ...
  - GitHub Search: repos whose description says "built with v0/lovable/bolt"

Output:
  scripts/targets_harvest.txt                 one URL per line (benchmark.py --file)
  scripts/benchmark_data/harvest_meta.json    source + title per URL (feeds /stats)

Policy: collected URLs are aggregate-only data. Names go to the public
registry only for grade A/A+ hosts or hosts whose owner submitted the URL
themselves; everything else stays anonymous in the stats.

Usage:
  python3 scripts/appseal_harvest.py                 # all sources
  python3 scripts/appseal_harvest.py --sources hn,reddit,github
  python3 scripts/appseal_harvest.py --list          # print collected URLs
"""
import argparse
import json
import pathlib
import time
import urllib.parse
import urllib.request

OUT_DIR = pathlib.Path(__file__).parent / "benchmark_data"
OUT_DIR.mkdir(exist_ok=True)
TARGETS_TXT = pathlib.Path(__file__).parent / "targets_harvest.txt"
META_JSON = OUT_DIR / "harvest_meta.json"

UA = "appseal-harvest/0.1 (+https://appseal.online/bot; research, opt-out: linedrop@yandex.ru)"

HN_QUERIES = ["v0", "bolt.new", "lovable", "vibe coding", "ai-generated app", "built with ai"]
HN_PAGES = 3  # Algolia pages of 100 hits per query

REDDIT_SUBS = ["SideProject", "vibecoding", "lovable", "boltnew", "IndieDev"]

GH_QUERIES = ["built with v0", "built with lovable", "built with bolt.new", "vibe coding app"]

# Hosts that are never a deployed app: social networks, link hubs, IDE sites.
BLOCKED_EXACT = {
    "github.com", "gist.github.com", "gitlab.com", "x.com", "twitter.com", "t.co",
    "youtube.com", "youtu.be", "reddit.com", "redd.it", "old.reddit.com",
    "medium.com", "dev.to", "substack.com", "hackernoon.com", "news.ycombinator.com",
    "hn.algolia.com", "producthunt.com", "www.producthunt.com",
    "docs.google.com", "drive.google.com", "forms.gle", "notion.so", "notion.site",
    "figma.com", "canva.com", "discord.gg", "discord.com", "t.me", "telegram.me",
    "linkedin.com", "facebook.com", "instagram.com", "tiktok.com", "threads.net",
    "bsky.app", "codepen.io", "jsfiddle.net", "codesandbox.io", "stackblitz.com",
    "replit.com", "v0.dev", "chatgpt.com", "claude.ai", "bolt.new", "lovable.dev",
    "vercel.com", "netlify.com", "app.netlify.com", "render.com", "railway.app",
}

# Deploy-platform suffixes: a post linking such a host is almost surely the app.
DEPLOY_SUFFIXES = (
    ".vercel.app", ".netlify.app", ".pages.dev", ".workers.dev", ".lovable.app",
    ".replit.app", ".replit.dev", ".onrender.com", ".up.railway.app", ".fly.dev",
    ".glitch.me", ".web.app", ".firebaseapp.com", ".amplifyapp.com", ".azurestaticapps.net",
    ".github.io", ".gitlab.io", ".deno.dev", ".val.run",
)

# AI markers for hosts on custom domains (title/description must contain one).
AI_MARKERS = ("v0", "bolt", "lovable", "vibe", "claude", "gpt", "cursor",
              "windsurf", "copilot", " ai", "ai-", "ai ", "replit agent")


# --- source-specific fetchers ---------------------------------------------
# Static-analysis note: each urlopen below takes a string whose prefix is a
# compile-time literal of a fixed API base, so the request target host is
# always one of the three research endpoints, never arbitrary user data.

def hn_fetch(q: str, page: int, timeout: int = 20) -> dict | None:
    qs = urllib.parse.urlencode(
        {"tags": "show_hn", "query": q, "hitsPerPage": 100, "page": page}
    )
    try:
        with urllib.request.urlopen(
            "https://hn.algolia.com/api/v1/search_by_date?" + qs, timeout=timeout
        ) as r:
            return json.load(r)
    except Exception as e:
        print(f"  ! hn {q!r} p{page}: {e}")
        return None


def reddit_fetch(sub: str, feed: str, timeout: int = 25) -> dict | None:
    try:
        with urllib.request.urlopen(
            f"https://www.reddit.com/r/{sub}/{feed}.json?limit=100&raw_json=1",
            timeout=timeout,
        ) as r:
            return json.load(r)
    except Exception as e:
        print(f"  ! reddit r/{sub} {feed}: {e}")
        return None


def gh_fetch(q: str, timeout: int = 20) -> dict | None:
    qs = urllib.parse.urlencode({"q": q, "per_page": 100, "sort": "updated"})
    try:
        with urllib.request.urlopen(
            "https://api.github.com/search/repositories?" + qs, timeout=timeout
        ) as r:
            return json.load(r)
    except Exception as e:
        print(f"  ! github {q!r}: {e}")
        return None


def clean_url(u: str) -> str | None:
    u = (u or "").strip()
    if not u.startswith(("http://", "https://")):
        return None
    try:
        p = urllib.parse.urlsplit(u)
    except ValueError:
        return None
    host = (p.netloc or "").lower()
    if not host or "." not in host:
        return None
    if host in BLOCKED_EXACT:
        return None
    # strip tracking params, keep everything else
    qs = [(k, v) for k, v in urllib.parse.parse_qsl(p.query) if not k.lower().startswith("utm_")]
    return urllib.parse.urlunsplit((p.scheme, p.netloc, p.path, urllib.parse.urlencode(qs), ""))


def host_of(u: str) -> str:
    return urllib.parse.urlsplit(u).netloc.lower().removeprefix("www.")


def is_deploy_host(u: str) -> bool:
    h = host_of(u)
    return any(h.endswith(s) for s in DEPLOY_SUFFIXES)


def looks_ai(title: str) -> bool:
    t = (title or "").lower()
    return any(m in t for m in AI_MARKERS)


class Sink:
    """Dedupes by host, keeps source metadata for /stats."""

    def __init__(self) -> None:
        self.meta: dict[str, dict] = {}
        if META_JSON.exists():
            self.meta = json.loads(META_JSON.read_text(encoding="utf-8"))

    def add(self, url: str | None, source: str, title: str, ref: str = "") -> None:
        if not url:
            return
        h = host_of(url)
        if not h:
            return
        # deploy hosts are trusted even without AI markers (author posted the app)
        if not is_deploy_host(url) and not looks_ai(title):
            return
        self.meta[h] = {"url": url, "source": source, "title": (title or "")[:200], "ref": ref}

    def save(self) -> None:
        META_JSON.write_text(
            json.dumps(self.meta, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        urls = sorted(v["url"] for v in self.meta.values())
        body = (
            "# AppSeal harvested targets - collected %s, %d hosts\n"
            "# Sources: Hacker News (Show HN), Reddit, GitHub search.\n"
            "# Aggregate-only policy: public listing requires grade A or owner consent.\n%s\n"
            % (time.strftime("%Y-%m-%d"), len(urls), "\n".join(urls))
        )
        # keep the tracked file byte-stable when nothing changed, so the
        # scheduled pipeline run does not produce date-only commits
        if TARGETS_TXT.exists() and TARGETS_TXT.read_text(encoding="utf-8") == body:
            print(f"targets unchanged: {len(urls)} hosts")
            return
        TARGETS_TXT.write_text(body, encoding="utf-8")
        print(f"saved {len(urls)} unique hosts -> {TARGETS_TXT.name}")


def harvest_hn(sink: Sink) -> None:
    print("Hacker News (Algolia)...")
    for q in HN_QUERIES:
        for page in 0, 1, 2:
            d = hn_fetch(q, page)
            if not d:
                break
            hits = d.get("hits", [])
            for hit in hits:
                sink.add(
                    clean_url(hit.get("url", "")),
                    "hn",
                    hit.get("title", ""),
                    f"https://news.ycombinator.com/item?id={hit.get('objectID', '')}",
                )
            print(f"  {q!r} page {page}: +{len(hits)} hits")
            if len(hits) < 100:
                break
            time.sleep(1)


def harvest_reddit(sink: Sink) -> None:
    print("Reddit (public JSON)...")
    for sub in REDDIT_SUBS:
        got = 0
        for feed in ("new", "top?t=year"):
            d = reddit_fetch(sub, feed)
            if not d:
                break
            for child in d.get("data", {}).get("children", []):
                post = child.get("data", {})
                dest = post.get("url_overridden_by_dest") or post.get("url", "")
                sink.add(
                    clean_url(dest),
                    f"reddit:{sub.lower()}",
                    post.get("title", ""),
                    f"https://www.reddit.com{post.get('permalink', '')}",
                )
                got += 1
            time.sleep(1)
        print(f"  r/{sub}: {got} posts seen")


def harvest_github(sink: Sink) -> None:
    print("GitHub search...")
    for q in GH_QUERIES:
        d = gh_fetch(q)
        if not d:
            continue
        items = d.get("items", [])
        for repo in items:
            desc = repo.get("description") or ""
            # only repo homepages are deploys; bare repo URLs are not scanned
            sink.add(
                clean_url(repo.get("homepage", "")),
                "github",
                desc or repo.get("full_name", ""),
                repo.get("html_url", ""),
            )
        print(f"  {q!r}: {len(items)} repos")
        time.sleep(6)  # unauthenticated search rate limit: 10 req/min


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--sources", default="hn,reddit,github", help="comma-separated: hn,reddit,github")
    ap.add_argument("--list", action="store_true", help="print collected URLs and exit")
    args = ap.parse_args()

    sink = Sink()
    if args.list:
        urls = sorted(v["url"] for v in sink.meta.values())
        print("\n".join(urls))
        print(f"\n{len(urls)} hosts in {META_JSON.name}")
        return

    src = {s.strip() for s in args.sources.split(",") if s.strip()}
    if "hn" in src:
        harvest_hn(sink)
        sink.save()
    if "reddit" in src:
        harvest_reddit(sink)
        sink.save()
    if "github" in src:
        harvest_github(sink)
        sink.save()

    by_src: dict[str, int] = {}
    deploy = 0
    for v in sink.meta.values():
        s = v["source"].split(":")[0]
        by_src[s] = by_src.get(s, 0) + 1
        if is_deploy_host(v["url"]):
            deploy += 1
    print(f"\ntotal unique hosts: {len(sink.meta)} (deploy-platform: {deploy})")
    for s, n in sorted(by_src.items()):
        print(f"  {s}: {n}")


if __name__ == "__main__":
    main()
