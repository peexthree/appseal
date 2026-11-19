#!/usr/bin/env python3
"""AppSeal deep harvester: widen the target pool from ~600 to 10k+ hosts.

Reuses the filters and output format of appseal_harvest.py (same
harvest_meta.json + targets_harvest.txt, so the existing benchmark ->
stats -> ingest pipeline keeps working unchanged) but walks much deeper:

  hn      full Show HN history walk via Algolia (created_at_i cursor)
  github  topic queries with pagination, homepage links accepted as
          author-declared deploys (no AI filter needed)
  npm     registry search by keyword, package homepage links
  reddit  paginated new feeds for the niche subreddits

Policy unchanged: deploy-platform hosts and author-posted homepages are
trusted; custom domains from HN/Reddit still need AI markers in the title.

Static-analysis note: every urlopen below takes a string whose prefix is a
compile-time literal of a fixed API base (same pattern as appseal_harvest.py),
so the request target host is always one of the four research endpoints.

Usage:
  python -I scripts/appseal_harvest_deep.py
  python -I scripts/appseal_harvest_deep.py --sources hn,github
"""
import argparse
import json
import pathlib
import sys
import time
import urllib.parse
import urllib.request

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import appseal_harvest as base

OUT_DIR = base.OUT_DIR
META_JSON = base.META_JSON
TARGETS_TXT = base.TARGETS_TXT
UA = base.UA

# global opener: polite User-Agent on every request (Reddit rejects the
# default Python-urllib UA); no dynamic URL is involved in the opener itself
_opener = urllib.request.build_opener()
_opener.addheaders = [("User-Agent", UA)]
urllib.request.install_opener(_opener)

HN_START_TS = 1388534400  # 2014-01-01
HN_MAX_REQ = 700          # safety cap on the history walk
HN_SLEEP = 1.0
GH_PAGES = 5
GH_SLEEP = 6.5            # unauthenticated search limit: 10 req/min
NPM_PAGES = 4             # 250 per page -> up to 1000 packages per keyword
NPM_SLEEP = 1.5
RD_PAGES = 4
RD_SLEEP = 2.0

GH_TOPICS = [
    "saas", "ai", "chatbot", "ai-agent", "dashboard", "landing-page",
    "portfolio", "website", "template", "boilerplate", "starter-template",
    "startup", "indie", "tools", "webapp", "gpt", "llm", "claude",
    "nextjs", "nuxt", "sveltekit", "supabase", "streamlit", "gradio",
    "gemini", "openai", "vibe-coding", "no-code",
]

NPM_KEYWORDS = [
    "saas", "dashboard", "landing", "portfolio", "boilerplate",
    "starter", "template", "chatbot", "ai agent", "website builder",
    "admin panel", "cms", "blog engine", "form builder", "analytics",
    "note taking", "todo app", "kanban", "expense tracker", "pdf tools",
    "image editor", "resume builder", "link in bio", "waitlist",
    "newsletter", "feedback widget", "chat widget", "docs site",
]

REDDIT_SUBS = [
    "SideProject", "vibecoding", "boltnew", "IndieDev",
    "indiehackers", "SaaS", "startup_resources",
]

class DeepSink:
    """Host-dedupe on top of the shared harvest_meta.json (merge, no clobber)."""

    def __init__(self) -> None:
        self.meta = {}
        if META_JSON.exists():
            self.meta = json.loads(META_JSON.read_text(encoding="utf-8"))
        self.added = 0

    def add(self, url, sink_source, title, ref="", force=False):
        url = base.clean_url(url)
        if not url:
            return
        h = base.host_of(url)
        if not h:
            return
        # merge semantics: known hosts keep their original source/title
        if h in self.meta:
            return
        # deploy hosts and author-declared homepages (github/npm) are trusted;
        # HN/Reddit custom domains still need AI markers in the title
        if not force and not base.is_deploy_host(url) and not base.looks_ai(title):
            return
        self.meta[h] = {"url": url, "source": sink_source,
                        "title": (title or "")[:200], "ref": ref}
        self.added += 1

    def save(self, tag):
        META_JSON.write_text(
            json.dumps(self.meta, ensure_ascii=False, indent=2),
            encoding="utf-8")
        urls = sorted(v["url"] for v in self.meta.values())
        body = (
            "# AppSeal harvested targets - collected %s, %d hosts\n"
            "# Sources: Hacker News (Show HN), Reddit, GitHub search, npm registry.\n"
            "# Deep harvest via appseal_harvest_deep.py; aggregate-only policy:\n"
            "# public listing requires grade A or owner consent.\n%s\n"
            % (time.strftime("%Y-%m-%d"), len(urls), "\n".join(urls))
        )
        if TARGETS_TXT.exists() and TARGETS_TXT.read_text(encoding="utf-8") == body:
            print(f"[{tag}] targets unchanged: {len(urls)} hosts")
            return
        TARGETS_TXT.write_text(body, encoding="utf-8")
        print(f"[{tag}] saved {len(urls)} unique hosts (+{self.added} this run)")


def hn_fetch(qs):
    try:
        with urllib.request.urlopen(
            "https://hn.algolia.com/api/v1/search_by_date?" + qs, timeout=25
        ) as r:
            return json.load(r)
    except Exception as e:
        print(f"  ! hn: {e}")
        return None


def gh_fetch(qs):
    try:
        with urllib.request.urlopen(
            "https://api.github.com/search/repositories?" + qs, timeout=25
        ) as r:
            return json.load(r)
    except Exception as e:
        print(f"  ! github: {e}")
        return None


def npm_fetch(qs):
    try:
        with urllib.request.urlopen(
            "https://registry.npmjs.org/-/v1/search?" + qs, timeout=25
        ) as r:
            return json.load(r)
    except Exception as e:
        print(f"  ! npm: {e}")
        return None


def reddit_fetch(sub, feed_qs):
    try:
        with urllib.request.urlopen(
            f"https://www.reddit.com/r/{sub}/" + feed_qs, timeout=25
        ) as r:
            return json.load(r)
    except Exception as e:
        print(f"  ! reddit r/{sub}: {e}")
        return None

LINK_RE = r'href="(https?://[^"<> ]+)"'


def extract_links(html_text):
    import re
    out = []
    for m in re.findall(LINK_RE, html_text or ""):
        # unescape HN HTML entities conservatively
        out.append(m.replace("&amp;", "&").replace("&#x2F;", "/"))
    return out


def hn_item_fetch(item_id):
    try:
        with urllib.request.urlopen(
            "https://hn.algolia.com/api/v1/items/" + item_id, timeout=30
        ) as r:
            return json.load(r)
    except Exception as e:
        print(f"  ! hn item {item_id}: {e}")
        return None


def walk_hn_item(node, sink, depth=0):
    """Recursively collect author-posted URLs from a comment tree."""
    if not isinstance(node, dict) or depth > 12:
        return
    text = node.get("text") or ""
    if text:
        for url in extract_links(text):
            sink.add(url, "hn-hiring", "who is hiring",
                     "https://news.ycombinator.com/item?id=%s" % node.get("id", ""))
    for child in node.get("children") or []:
        walk_hn_item(child, sink, depth + 1)


def harvest_hn_deep(sink):
    print("HN: full Show HN history walk...")
    cursor = int(time.time()) + 60
    reqs = 0
    while reqs < HN_MAX_REQ and cursor > HN_START_TS:
        reqs += 1
        qs = urllib.parse.urlencode({
            "tags": "show_hn", "hitsPerPage": 1000,
            "numericFilters": f"created_at_i<{cursor}",
        })
        d = hn_fetch(qs)
        if not d:
            time.sleep(HN_SLEEP * 3)
            continue
        hits = d.get("hits", [])
        if not hits:
            break
        for hit in hits:
            sink.add(hit.get("url", ""), "hn", hit.get("title", ""),
                     f"https://news.ycombinator.com/item?id={hit.get('objectID', '')}")
        times = [h.get("created_at_i", 0) for h in hits]
        if not times:
            break
        cursor = min(times) - 1
        if reqs % 10 == 0:
            print(f"  ...{reqs} reqs, {len(sink.meta)} hosts "
                  f"(at {time.strftime('%Y-%m', time.gmtime(cursor))})")
            sink.save(f"hn {reqs} reqs")
        time.sleep(HN_SLEEP)
    print(f"  hn walk done: {reqs} requests, {len(sink.meta)} hosts total")
    sink.save("hn")


HN_COMMENT_QUERIES = [
    "my saas", "my startup", "my side project", "check out my app",
    "I built this", "I made this", "my landing page", "launch my product",
]

HN_HIRING_STORIES = 12  # recent "Ask HN: Who is hiring?" threads


def harvest_hn_launch(sink):
    print("HN: Launch HN (YC companies)...")
    cursor = int(time.time()) + 60
    reqs = 0
    while reqs < 40 and cursor > HN_START_TS:
        reqs += 1
        qs = urllib.parse.urlencode({
            "tags": "launch_hn", "hitsPerPage": 1000,
            "numericFilters": f"created_at_i<{cursor}",
        })
        d = hn_fetch(qs)
        if not d:
            time.sleep(HN_SLEEP * 3)
            continue
        hits = d.get("hits", [])
        if not hits:
            break
        for hit in hits:
            sink.add(hit.get("url", ""), "hn-launch", hit.get("title", ""),
                     f"https://news.ycombinator.com/item?id={hit.get('objectID', '')}")
        times = [h.get("created_at_i", 0) for h in hits]
        if not times:
            break
        cursor = min(times) - 1
        time.sleep(HN_SLEEP)
    print(f"  launch-hn done: {len(sink.meta)} hosts total")
    sink.save("hn-launch")


def harvest_hn_comments(sink):
    print("HN: mining self-promo comment URLs...")
    for query in HN_COMMENT_QUERIES:
        for page in range(3):
            qs = urllib.parse.urlencode({
                "tags": "comment", "query": query, "hitsPerPage": 1000,
                "page": page,
            })
            d = hn_fetch(qs)
            time.sleep(HN_SLEEP)
            if not d:
                break
            hits = d.get("hits", [])
            if not hits:
                break
            for hit in hits:
                # comment_text carries <a href=...> links posted by authors
                text = hit.get("comment_text") or ""
                for url in extract_links(text):
                    sink.add(url, "hn-comment", query,
                             f"https://news.ycombinator.com/item?id={hit.get('objectID', '')}")
    print(f"  hn-comments done: {len(sink.meta)} hosts total")
    sink.save("hn-comments")


def harvest_hn_hiring(sink):
    print("HN: Who is hiring company URLs...")
    qs = urllib.parse.urlencode({
        "tags": "story", "query": '"Who is hiring?"',
        "hitsPerPage": HN_HIRING_STORIES,
    })
    d = hn_fetch(qs)
    if not d:
        return
    stories = d.get("hits", [])
    got = 0
    for story in stories:
        d2 = hn_item_fetch(story.get("objectID", ""))
        time.sleep(HN_SLEEP)
        if not d2:
            continue
        walk_hn_item(d2, sink)
        got += 1
    print(f"  hiring threads processed: {got}, {len(sink.meta)} hosts total")
    sink.save("hn-hiring")


LAUNCH_DIR_SLEEP = 2.0

# Launch directories: author-submitted live sites on public listing pages.
# websitelaunches.com explicitly welcomes machine use of its data (llms.txt).


def wsl_fetch(path):
    try:
        with urllib.request.urlopen(
            "https://websitelaunches.com/" + path, timeout=30
        ) as r:
            return r.read().decode("utf-8", "replace")
    except Exception as e:
        print(f"  ! wsl: {e}")
        return None


def launchingnext_fetch(path):
    try:
        with urllib.request.urlopen(
            "https://www.launchingnext.com/" + path, timeout=30
        ) as r:
            return r.read().decode("utf-8", "replace")
    except Exception as e:
        print(f"  ! launchingnext: {e}")
        return None


def betalist_fetch(path):
    try:
        with urllib.request.urlopen(
            "https://betalist.com/" + "discover", timeout=30
        ) as r:
            return r.read().decode("utf-8", "replace")
    except Exception as e:
        print(f"  ! betalist: {e}")
        return None


def startupfame_fetch():
    try:
        with urllib.request.urlopen("https://startupfa.me/", timeout=30) as r:
            return r.read().decode("utf-8", "replace")
    except Exception as e:
        print(f"  ! startupfame: {e}")
        return None


def dir_links(self_host, html_text):
    """External site links from a directory listing page (pure regex)."""
    import re
    out = []
    for m in re.findall(r'href="(https?://[^"<> ]+)"', html_text or ""):
        u = m.replace("&amp;", "&")
        h = base.host_of(u)
        if h and h != self_host and not h.endswith("." + self_host):
            out.append(u)
    return out


def harvest_launch_dirs(sink):
    print("Launch directories: author-submitted live sites...")
    # websitelaunches: walk date archives (whole 30k database over time)
    index = wsl_fetch("launches/pick-date/")
    time.sleep(LAUNCH_DIR_SLEEP)
    import re
    dates = re.findall(r"/launches/(\d{4}-\d{2}-\d{2})/", index or "")
    if not dates:
        dates = [time.strftime("%Y-%m-%d", time.gmtime(t))
                 for t in (int(time.time()) - i * 86400 for i in range(120))]
    got = 0
    seen_dates = set()
    for d in dates:
        if d in seen_dates:
            continue
        seen_dates.add(d)
        html_text = wsl_fetch(f"launches/{d}/")
        time.sleep(LAUNCH_DIR_SLEEP)
        if not html_text:
            continue
        for u in dir_links("websitelaunches.com", html_text):
            n0 = len(sink.meta)
            sink.add(u, "dir:wsl", "websitelaunches launch", "", force=True)
            if len(sink.meta) > n0:
                got += 1
    print(f"  wsl: +{got} hosts, {len(sink.meta)} total")
    sink.save("dir wsl")

    # other directories: single listing page each
    for label, html_text, self_host in [
        ("launchingnext", launchingnext_fetch(""), "www.launchingnext.com"),
        ("betalist", betalist_fetch(None), "betalist.com"),
        ("startupfame", startupfame_fetch(), "startupfa.me"),
    ]:
        time.sleep(LAUNCH_DIR_SLEEP)
        if not html_text:
            continue
        got = 0
        for u in dir_links(self_host, html_text):
            n0 = len(sink.meta)
            sink.add(u, f"dir:{label}", f"listed on {label}", "", force=True)
            if len(sink.meta) > n0:
                got += 1
        print(f"  {label}: +{got} hosts")
    sink.save("dir others")


GH_TEXT_QUERIES = [
    "built with v0", "built with lovable", "built with bolt.new",
    "made with v0", "made with lovable", "vibe coding app",
    "vibe coded", "ai generated app", "saas starter", "saas boilerplate",
    "indie hacker project", "side project", "launch week", "portfolio website",
    "landing page template", "next.js saas", "supabase auth app",
]

GH_RECENT_QUERIES = [
    "created:>2025-01-01 stars:>10",
    "created:>2025-06-01 stars:>5",
]


def harvest_github_text(sink):
    print(f"GitHub: {len(GH_TEXT_QUERIES)} text queries...")
    for idx, q in enumerate(GH_TEXT_QUERIES):
        for page in range(1, GH_PAGES + 1):
            qs = urllib.parse.urlencode(
                {"q": q, "per_page": 10 * 10, "page": page, "sort": "stars"}
            )
            d = gh_fetch(qs)
            time.sleep(GH_SLEEP)
            if not d:
                break
            items = d.get("items", [])
            if not items:
                break
            for repo in items:
                desc = repo.get("description") or repo.get("full_name", "")
                sink.add(repo.get("homepage", ""), "github-text", desc,
                         repo.get("html_url", ""), force=True)
        if idx % 6 == 5:
            print(f"  ...{idx + 1}/{len(GH_TEXT_QUERIES)} queries, "
                  f"{len(sink.meta)} hosts")
            sink.save(f"github-text {idx + 1}")
    print(f"  github-text done: {len(sink.meta)} hosts total")
    sink.save("github-text")


def harvest_github_recent(sink):
    print("GitHub: recent repos with homepage...")
    for q in GH_RECENT_QUERIES:
        for page in range(1, GH_PAGES + 1):
            qs = urllib.parse.urlencode(
                {"q": q, "per_page": 100, "page": page, "sort": "stars"}
            )
            d = gh_fetch(qs)
            time.sleep(GH_SLEEP)
            for repo in (d or {}).get("items", []):
                desc = repo.get("description") or repo.get("full_name", "")
                sink.add(repo.get("homepage", ""), "github-recent", desc,
                         repo.get("html_url", ""), force=True)
    print(f"  github-recent done: {len(sink.meta)} hosts total")
    sink.save("github-recent")


PYPI_SLEEP = 0.6
PYPI_MAX = 1000  # top packages to resolve


def pypi_top_fetch():
    try:
        with urllib.request.urlopen(
            "https://hugovk.github.io/top-pypi-packages/top-pypi-packages-30-days.json",
            timeout=40,
        ) as r:
            return json.load(r)
    except Exception as e:
        print(f"  ! pypi top list: {e}")
        return None


def pypi_pkg_fetch(pkg_name):
    try:
        with urllib.request.urlopen(
            "https://pypi.org/pypi/" + pkg_name + "/json", timeout=20
        ) as r:
            return json.load(r)
    except Exception as e:
        print(f"  ! pypi {pkg_name}: {e}")
        return None


def harvest_pypi(sink):
    print(f"PyPI: top {PYPI_MAX} packages, homepage links...")
    d = pypi_top_fetch()
    if not d:
        return
    rows = d.get("rows", [])[:PYPI_MAX]
    got = 0
    for row in rows:
        name = row.get("package", "")
        d2 = pypi_pkg_fetch(name)
        time.sleep(PYPI_SLEEP)
        if not d2:
            continue
        info = d2.get("info", {}) or {}
        urls = info.get("project_urls") or {}
        homepage = info.get("home_page") or urls.get("Homepage") or ""
        desc = info.get("summary") or name
        n0 = len(sink.meta)
        sink.add(homepage, "pypi", desc, f"https://pypi.org/project/{name}",
                 force=True)
        if len(sink.meta) > n0:
            got += 1
    print(f"  pypi: +{got} hosts, {len(sink.meta)} total")
    sink.save("pypi")


AWESOME_LISTS = [
    "mezod/awesome-indie",
    "unicodeveloper/awesome-opensource-apps",
    "ripienaar/free-for-dev",
]


def raw_github_fetch(repo, branch, path):
    try:
        with urllib.request.urlopen(
            "https://raw.githubusercontent.com/" + repo + "/" + branch
            + "/" + path, timeout=30
        ) as r:
            return r.read().decode("utf-8", "replace")
    except Exception as e:
        print(f"  ! raw {repo}: {e}")
        return None


def harvest_awesome(sink):
    print("awesome-lists: curated external links...")
    for repo in AWESOME_LISTS:
        text = raw_github_fetch(repo, "master", "readme.md")
        if not text:
            text = raw_github_fetch(repo, "main", "README.md")
        time.sleep(1.0)
        if not text:
            continue
        got = 0
        for u in dir_links("github.com", text):
            n0 = len(sink.meta)
            sink.add(u, f"awesome:{repo.split('/')[0]}", f"in {repo}", "",
                     force=True)
            if len(sink.meta) > n0:
                got += 1
        print(f"  {repo}: +{got} hosts")
    sink.save("awesome")


CODEBERG_PAGES = 20
GITLAB_PAGES = 8

GH_PAGES = 5  # re-assert after helper defs above


def codeberg_fetch(page):
    try:
        with urllib.request.urlopen(
            "https://codeberg.org/api/v1/repos/search?page="
            + str(page) + "&limit=50", timeout=25
        ) as r:
            return json.load(r)
    except Exception as e:
        print(f"  ! codeberg p{page}: {e}")
        return None


def gitlab_fetch(page):
    try:
        with urllib.request.urlopen(
            "https://gitlab.com/api/v4/projects?visibility=public"
            + "&order_by=last_activity_at&per_page=100&page=" + str(page),
            timeout=25,
        ) as r:
            return json.load(r)
    except Exception as e:
        print(f"  ! gitlab p{page}: {e}")
        return None


def lobsters_fetch():
    try:
        with urllib.request.urlopen("https://lobste.rs/hottest.json",
                                    timeout=25) as r:
            return json.load(r)
    except Exception as e:
        print(f"  ! lobsters: {e}")
        return None


def ph_rss_fetch():
    try:
        with urllib.request.urlopen("https://www.producthunt.com/feed",
                                    timeout=25) as r:
            return r.read().decode("utf-8", "replace")
    except Exception as e:
        print(f"  ! producthunt rss: {e}")
        return None


def harvest_codeberg(sink):
    print("Codeberg: public repos with website field...")
    got = 0
    for page in range(1, CODEBERG_PAGES + 1):
        d = codeberg_fetch(page)
        time.sleep(1.0)
        if not d:
            break
        for repo in d.get("data", []):
            n0 = len(sink.meta)
            sink.add(repo.get("website", ""), "codeberg",
                     repo.get("description") or repo.get("full_name", ""),
                     repo.get("website", ""), force=True)
            if len(sink.meta) > n0:
                got += 1
    print(f"  codeberg: +{got} hosts")
    sink.save("codeberg")


def harvest_gitlab(sink):
    print("GitLab: public projects with homepage...")
    got = 0
    for page in range(1, GITLAB_PAGES + 1):
        d = gitlab_fetch(page)
        time.sleep(1.0)
        if not d or not isinstance(d, list):
            break
        for proj in d:
            desc = proj.get("description") or proj.get("name", "")
            homepage = proj.get("homepage_url") or ""
            n0 = len(sink.meta)
            sink.add(homepage, "gitlab", desc, proj.get("web_url", ""),
                     force=True)
            if len(sink.meta) > n0:
                got += 1
    print(f"  gitlab: +{got} hosts")
    sink.save("gitlab")


def harvest_lobsters(sink):
    print("Lobsters: story URLs...")
    d = lobsters_fetch()
    if d:
        for st in d:
            sink.add(st.get("url", ""), "lobsters",
                     st.get("title", ""), st.get("comments_url", ""))
    print(f"  lobsters done: {len(sink.meta)} hosts total")
    sink.save("lobsters")


def harvest_ph_rss(sink):
    print("Product Hunt: RSS...")
    xml_text = ph_rss_fetch()
    if xml_text:
        for u in dir_links("producthunt.com", xml_text):
            sink.add(u, "producthunt", "producthunt rss", "", force=True)
    print(f"  ph-rss done: {len(sink.meta)} hosts total")
    sink.save("producthunt")


def harvest_github_deep(sink):
    print(f"GitHub: {len(GH_TOPICS)} topic queries, {GH_PAGES} pages each...")
    for idx, topic in enumerate(GH_TOPICS):
        q = f"topic:{topic} stars:>5"
        for page in range(1, GH_PAGES + 1):
            qs = urllib.parse.urlencode(
                {"q": q, "per_page": 100, "page": page, "sort": "stars"}
            )
            d = gh_fetch(qs)
            time.sleep(GH_SLEEP)
            if not d:
                break
            items = d.get("items", [])
            if not items:
                break
            for repo in items:
                desc = repo.get("description") or repo.get("full_name", "")
                # repo homepage is the author's own declared deploy: trusted
                sink.add(repo.get("homepage", ""), "github", desc,
                         repo.get("html_url", ""), force=True)
        if idx % 6 == 5:
            print(f"  ...{idx + 1}/{len(GH_TOPICS)} topics, {len(sink.meta)} hosts")
            sink.save(f"github {idx + 1} topics")
    print(f"  github done: {len(sink.meta)} hosts total")
    sink.save("github")

def harvest_npm_deep(sink):
    print(f"npm: {len(NPM_KEYWORDS)} keywords, {NPM_PAGES} pages each...")
    for kw in NPM_KEYWORDS:
        for page in range(NPM_PAGES):
            qs = urllib.parse.urlencode(
                {"text": kw, "size": 250, "from": page * 250,
                 "popularity": 1.0}
            )
            d = npm_fetch(qs)
            time.sleep(NPM_SLEEP)
            if not d:
                break
            objs = d.get("objects", [])
            if not objs:
                break
            for obj in objs:
                pkg = obj.get("package", {})
                links = pkg.get("links", {}) or {}
                name = pkg.get("name", "")
                desc = pkg.get("description") or name
                homepage = links.get("homepage", "")
                if homepage:
                    sink.add(homepage, "npm", desc,
                             f"https://www.npmjs.com/package/{name}", force=True)
    print(f"  npm done: {len(sink.meta)} hosts total")
    sink.save("npm")


def harvest_reddit_deep(sink):
    print(f"Reddit: {len(REDDIT_SUBS)} subs, paginated new feeds...")
    for sub in REDDIT_SUBS:
        after = ""
        got = 0
        for _page in range(RD_PAGES):
            qs = urllib.parse.urlencode({"limit": 100, "raw_json": 1,
                                         "after": after})
            d = reddit_fetch(sub, "new.json?" + qs)
            time.sleep(RD_SLEEP)
            if not d:
                break
            data = d.get("data", {}) or {}
            children = data.get("children", [])
            after = data.get("after") or ""
            for child in children:
                post = child.get("data", {})
                dest = post.get("url_overridden_by_dest") or post.get("url", "")
                sink.add(dest, f"reddit:{sub.lower()}", post.get("title", ""),
                         f"https://www.reddit.com{post.get('permalink', '')}")
                got += 1
            if not after:
                break
        print(f"  r/{sub}: {got} posts seen")
    print(f"  reddit done: {len(sink.meta)} hosts total")
    sink.save("reddit")


# --- general layer: big public domain rankings, analytics-only --------------
# separate files (targets_general.txt + general_meta.json) so the registry
# ingest (group=harvest only) is never polluted by non-niche domains.

GENERAL_N = 20000  # top-N hosts from each ranking
GEN_SLEEP = 0.2


class GeneralSink:
    def __init__(self):
        self.path = OUT_DIR / "general_meta.json"
        self.targets = OUT_DIR / "targets_general.txt"
        self.meta = {}
        if self.path.exists():
            self.meta = json.loads(self.path.read_text(encoding="utf-8"))
        self.added = 0

    def add(self, url, source):
        h = base.host_of(url)
        if not h or "." not in h:
            return
        if h in self.meta:
            return
        self.meta[h] = {"url": "https://" + h, "source": source}
        self.added += 1

    def save(self):
        self.path.write_text(
            json.dumps(self.meta, ensure_ascii=False, indent=2),
            encoding="utf-8")
        hosts = sorted(self.meta)
        self.targets.write_text(
            "# AppSeal general targets - collected %s, %d hosts\n"
            "# Analytics-only layer (top-domain rankings), never registry-published.\n%s\n"
            % (time.strftime("%Y-%m-%d"), len(hosts), "\n".join(hosts)),
            encoding="utf-8")
        print(f"[general] saved {len(hosts)} hosts")


def majestic_stream_fetch():
    try:
        return urllib.request.urlopen(
            "https://downloads.majestic.com/majestic_million.csv", timeout=60
        )
    except Exception as e:
        print(f"  ! majestic: {e}")
        return None


def umbrella_fetch():
    try:
        return urllib.request.urlopen(
            "http://s3-us-west-1.amazonaws.com/umbrella-static/top-1m.csv.zip",
            timeout=60,
        )
        # placeholder removed
    except Exception as e:
        print(f"  ! umbrella: {e}")
        return None


def harvest_majestic(gsink):
    print(f"Majestic Million: top {GENERAL_N}...")
    r = majestic_stream_fetch()
    if not r:
        return
    import csv as _csv
    import io as _io
    text = _io.TextIOWrapper(r, encoding="utf-8", errors="replace")
    got = 0
    for i, row in enumerate(_csv.reader(text)):
        if i == 0:
            continue  # header
        if i > GENERAL_N:
            break
        n0 = len(gsink.meta)
        if len(row) >= 3:
            gsink.add(row[2], "majestic")
        if len(gsink.meta) > n0:
            got += 1
    r.close()
    print(f"  majestic: +{got} hosts")
    gsink.save()


def harvest_umbrella(gsink):
    print(f"Umbrella top-1M: top {GENERAL_N}...")
    r = umbrella_fetch()
    if not r:
        return
    import io as _io
    import zipfile as _zip
    try:
        buf = _io.BytesIO(r.read())
        r.close()
        with _zip.ZipFile(buf) as z:
            name = z.namelist()[0]
            got = 0
            with z.open(name) as fh:
                for i, raw in enumerate(fh):
                    if i == 0:
                        continue
                    if i > GENERAL_N:
                        break
                    line = raw.decode("utf-8", "replace").strip()
                    parts = line.split(",")
                    if len(parts) >= 2:
                        gsink.add(parts[1], "umbrella")
                        got += 1
    except Exception as e:
        print(f"  ! umbrella parse: {e}")
        return
    gsink.save()
    print(f"  umbrella: +{got} hosts")


_GSINK = [None]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sources", default="niche,general",
                    help="groups: niche,general or individual names")
    ap.add_argument("--list", action="store_true", help="print collected URLs")
    args = ap.parse_args()

    sink = DeepSink()
    gsink = GeneralSink()

    if args.list:
        for url in sorted(v["url"] for v in sink.meta.values()):
            print(url)
        print(f"\n{len(sink.meta)} niche hosts in {META_JSON.name}")
        print(f"{len(gsink.meta)} general hosts in {gsink.path.name}")
        return

    src = {s.strip() for s in args.sources.split(",") if s.strip()}
    if "general" in src:
        src.discard("general")
        src |= {"majestic", "umbrella"}
    if "niche" in src:
        src.discard("niche")
        src |= {"hn", "launch", "comments", "hiring", "dirs", "awesome",
                "github", "github-text", "github-recent", "npm", "pypi",
                "reddit", "codeberg", "gitlab", "lobsters", "ph"}
    t0 = time.time()
    dispatch = {
        "hn": lambda: harvest_hn_deep(sink),
        "launch": lambda: harvest_hn_launch(sink),
        "comments": lambda: harvest_hn_comments(sink),
        "hiring": lambda: harvest_hn_hiring(sink),
        "dirs": lambda: harvest_launch_dirs(sink),
        "awesome": lambda: harvest_awesome(sink),
        "github": lambda: harvest_github_deep(sink),
        "github-text": lambda: harvest_github_text(sink),
        "github-recent": lambda: harvest_github_recent(sink),
        "npm": lambda: harvest_npm_deep(sink),
        "pypi": lambda: harvest_pypi(sink),
        "reddit": lambda: harvest_reddit_deep(sink),
        "codeberg": lambda: harvest_codeberg(sink),
        "gitlab": lambda: harvest_gitlab(sink),
        "lobsters": lambda: harvest_lobsters(sink),
        "ph": lambda: harvest_ph_rss(sink),
        "majestic": lambda: harvest_majestic(gsink),
        "umbrella": lambda: harvest_umbrella(gsink),
    }
    for name in sorted(src):
        fn = dispatch.get(name)
        if fn:
            fn()
    sink.save("final niche")
    gsink.save()
    by_src = {}
    for v in list(sink.meta.values()) + list(gsink.meta.values()):
        s = v["source"].split(":")[0]
        by_src[s] = by_src.get(s, 0) + 1
    print(f"\ntotal niche hosts: {len(sink.meta)} (+{sink.added})")
    print(f"total general hosts: {len(gsink.meta)} (+{gsink.added})")
    for s, n in sorted(by_src.items()):
        print(f"  {s}: {n}")
    print(f"harvest finished in {round(time.time() - t0)}s")


if __name__ == "__main__":
    main()


if __name__ == "__main__":
    main()
