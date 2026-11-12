#!/usr/bin/env python3
"""Charts for the AppSeal benchmark report (RU). Crystal Blue family, DejaVu Sans.

Rules applied (charts skill + typesetting/charts.md):
- no internal chart titles (external captions live in the PDF)
- horizontal bars for long RU labels; values labeled -> no grid
- pale fills + saturated borders; grade colors are the product's functional state colors
- constrained_layout=True, no bbox_inches='tight'
"""
import json
import pathlib

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.colors import to_rgba

# Template 07 Crystal Blue — fixed body palette (typesetting/cover.md, Template 07 table)
ACCENT = "#2d7ab3"     # XS tier (cover glow color)
HEADER = "#1a4a7a"     # M tier (table header, bridges to cover)
BORDER = "#c0d0e2"     # S tier
TEXT = "#142840"       # text primary
MUTED = "#5a7a96"      # text muted

# product grade colors (functional state colors from the app's GRADE_META)
GRADE_C = {"A": "#10b981", "B": "#84cc16", "C": "#f59e0b", "D": "#ef4444"}

plt.rcParams.update({
    "font.sans-serif": ["DejaVu Sans"],
    "axes.unicode_minus": False,
    "text.color": TEXT,
    "axes.edgecolor": BORDER,
    "axes.linewidth": 0.8,
    "xtick.color": MUTED, "ytick.color": TEXT,
    "figure.facecolor": "#ffffff", "axes.facecolor": "#ffffff",
    "savefig.facecolor": "#ffffff",
})

HERE = pathlib.Path(__file__).resolve().parent
OUT = HERE / "report_assets"
OUT.mkdir(exist_ok=True)

DS = json.loads((HERE.parent / "download" / "appseal_benchmark" / "dataset.json").read_text(encoding="utf-8"))
PANEL = {p["key"]: p for p in DS["panel"]}

# ------------------------------------------------------------------
# Fig 1: panel scores — horizontal bars, grade-tinted
# ------------------------------------------------------------------
rows = [
    ("FreshBite (модель vibe-кода)", "demo"),
    ("FreshBite hardened (эталон)", "secure"),
    ("AppSeal (dev-инстанс)", "self"),
    ("cloudflare.com", "cloudflare"),
    ("anthropic.com", "anthropic"),
    ("railway.app", "railway"),
    ("render.com", "render"),
    ("fly.io", "flyio"),
    ("vercel.com", "vercel"),
    ("huggingface.co", "huggingface"),
    ("netlify.com", "netlify"),
    ("mistral.ai", "mistral"),
]
labels = [r[0] for r in rows]
scores = [PANEL[r[1]]["score"] for r in rows]
grades = [PANEL[r[1]]["grade"] for r in rows]

fig, ax = plt.subplots(figsize=(7.6, 5.4), dpi=200, constrained_layout=True)
ypos = range(len(rows))[::-1]
for y, s, g in zip(ypos, scores, grades):
    c = GRADE_C[g]
    ax.barh(y, s, height=0.62, left=0,
            color=to_rgba(c, 0.22), edgecolor=c, linewidth=1.4, zorder=3)
    ax.text(s + 2, y, f"{g} · {s}", va="center", ha="left",
            fontsize=10.5, fontweight="bold", color=c, zorder=4)

ax.set_yticks(list(ypos))
ax.set_yticklabels(labels, fontsize=10.5)
ax.set_xlim(0, 118)
ax.set_xticks([0, 25, 50, 75, 100])
ax.set_xlabel("Балл AppSeal (0–100)", fontsize=9.5, color=MUTED)
for sp in ("top", "right", "left"):
    ax.spines[sp].set_visible(False)
ax.spines["bottom"].set_color(BORDER)
ax.tick_params(axis="y", length=0)
ax.grid(False)
# blocked target note (drawn under the axis area, never overlapping bars)
ax.text(0, -1.85, "openai.com — скан заблокирован WAF (403); в панель не входит",
        fontsize=9, color=MUTED, va="top")
ax.set_ylim(-2.6, len(rows) - 0.4)
fig.savefig(OUT / "fig1_panel.png")
plt.close(fig)

# ------------------------------------------------------------------
# Fig 2: how often each check fired (fail/warn) across the 12 scanned
# ------------------------------------------------------------------
CHECK_RU = {
    "env_exposure": ".env доступен из сети",
    "git_exposure": ".git доступен из сети",
    "secrets_in_source": "Секреты в клиентском коде",
    "baas_open_read": "Открытый BaaS (Firebase/Supabase)",
    "source_maps": "Открыты source maps",
    "security_headers": "Не хватает защитных заголовков",
    "cors_wildcard": "CORS открыт для всех",
    "cookie_flags": "Cookie без защитных флагов",
    "tls_cert": "Нет HTTPS / проблемы TLS",
    "admin_exposure": "Админка без защиты",
    "backup_files": "Бэкапы по прямой ссылке",
    "debug_endpoints": "Открыты debug-эндпоинты",
    "placeholder_content": "Заглушки на страницах",
    "rendered_errors": "Ошибки в разметке",
    "broken_links": "Битые внутренние ссылки",
    "meta_health": "Не заполнены meta-теги",
}
counts = {}
for p in DS["panel"]:
    if p.get("status") != "done":
        continue
    for r in p["results"]:
        if r["status"] in ("fail", "warn"):
            counts[r["id"]] = counts.get(r["id"], 0) + 1

# compact for A4: checks with count >= 2, the rest aggregated into one row
pairs = sorted(((CHECK_RU[k], v) for k, v in counts.items() if v >= 2), key=lambda x: x[1])
others = [k for k, v in counts.items() if v < 2]
if others:
    pairs.append((f"Прочие ({len(others)} проверок, по 1 цели)", len(others)))
labels2 = [p[0] for p in pairs]
vals2 = [p[1] for p in pairs]

fig, ax = plt.subplots(figsize=(7.6, max(4.4, 0.44 * len(pairs) + 1.0)), dpi=200, constrained_layout=True)
y2 = range(len(pairs))
ax.barh(y2, vals2, height=0.6, color=ACCENT, edgecolor="none", zorder=3)
for y, v in zip(y2, vals2):
    ax.text(v + 0.12, y, str(v), va="center", ha="left", fontsize=10.5,
            fontweight="bold", color=HEADER)
ax.set_yticks(list(y2))
ax.set_yticklabels(labels2, fontsize=10)
ax.set_xlim(0, max(vals2) * 1.22)
for sp in ("top", "right", "left"):
    ax.spines[sp].set_visible(False)
ax.spines["bottom"].set_color(BORDER)
ax.tick_params(axis="y", length=0)
ax.set_xticks(range(0, max(vals2) + 2))
ax.grid(False)
ax.set_xlabel("Число целей из 12 отсканированных", fontsize=9.5, color=MUTED)
fig.savefig(OUT / "fig2_checks.png")
plt.close(fig)

# ------------------------------------------------------------------
# Fig 3: twin case — problem count by category, before vs after
# ------------------------------------------------------------------
CATS = ["Секреты и утечки", "Заголовки и TLS", "Админки и доступ", "Живость и контент"]

# map check id -> category via raw scan json
RAW = HERE / "benchmark_data"
cat_by_id = {}
for name in ("demo", "secure"):
    d = json.loads((RAW / f"{name}.json").read_text(encoding="utf-8"))
    for r in d["results"]:
        cat_by_id[r["id"]] = r["category"]

def problems_by_cat(key):
    p = PANEL[key]
    cnt = {"secrets": 0, "headers": 0, "admin": 0, "liveness": 0}
    for r in p["results"]:
        if r["status"] in ("fail", "warn"):
            cnt[cat_by_id[r["id"]]] += 1
    return [cnt["secrets"], cnt["headers"], cnt["admin"], cnt["liveness"]]

before = problems_by_cat("demo")
after = problems_by_cat("secure")

fig, ax = plt.subplots(figsize=(7.6, 3.7), dpi=200, constrained_layout=True)
h = 0.34
ybase = range(len(CATS))[::-1]
yb = [y + h / 2 + 0.03 for y in ybase]
ya = [y - h / 2 - 0.03 for y in ybase]
ax.barh(yb, before, height=h, color=to_rgba(GRADE_C["D"], 0.22),
        edgecolor=GRADE_C["D"], linewidth=1.3, zorder=3, label="FreshBite, до лечения — D (0/100)")
ax.barh(ya, after, height=h, color=to_rgba(GRADE_C["A"], 0.22),
        edgecolor=GRADE_C["A"], linewidth=1.3, zorder=3, label="FreshBite hardened, после — A (100/100)")
for y, v in zip(yb, before):
    ax.text(v + 0.06, y, str(v), va="center", ha="left", fontsize=10,
            fontweight="bold", color=GRADE_C["D"])
for y, v in zip(ya, after):
    ax.text(v + 0.06, y, str(v), va="center", ha="left", fontsize=10,
            fontweight="bold", color=GRADE_C["A"])
ax.set_yticks(list(ybase))
ax.set_yticklabels(CATS, fontsize=10.5)
ax.set_xlim(0, max(before) * 1.30)
ax.set_xticks(range(0, max(before) + 2))
for sp in ("top", "right", "left"):
    ax.spines[sp].set_visible(False)
ax.spines["bottom"].set_color(BORDER)
ax.tick_params(axis="y", length=0)
ax.grid(False)
ax.set_xlabel("Число сработавших проверок (fail/warn)", fontsize=9.5, color=MUTED)
ax.legend(loc="lower right", frameon=False, fontsize=9.5)
fig.savefig(OUT / "fig3_twins.png")
plt.close(fig)

print("before/after by category:", dict(zip(CATS, zip(before, after))))
print("check counts:", counts)
print("saved:", sorted(p.name for p in OUT.glob("*.png")))
