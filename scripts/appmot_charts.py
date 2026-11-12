#!/usr/bin/env python3
"""Charts for AppMOT spec PDF. Russian labels, DejaVu Sans (Cyrillic-safe)."""
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import os

# AppMOT Crystal Blue palette (Template 07 body subset)
ACCENT = "#2d7ab3"
HEADER = "#1a4a7a"
BORDER = "#c0d0e2"
TEXT = "#142840"
MUTED = "#5a7a96"
BG = "#ffffff"

plt.rcParams["font.sans-serif"] = ["DejaVu Sans"]
plt.rcParams["axes.unicode_minus"] = False
plt.rcParams["text.color"] = TEXT
plt.rcParams["axes.edgecolor"] = BORDER
plt.rcParams["axes.labelcolor"] = MUTED
plt.rcParams["xtick.color"] = MUTED
plt.rcParams["ytick.color"] = TEXT

OUT = "/home/z/my-project/scripts/pdf_assets"
os.makedirs(OUT, exist_ok=True)

# ------------------------------------------------------------------
# Chart 1: problem stats — horizontal bars (values labeled, no grid)
# ------------------------------------------------------------------
labels = [
    "Код ИИ не проходит\nsecurity-тесты (Veracode, 2026)",
    "Вайб-кодед приложения\nсливают данные (скан Access)",
    "Авторы называют свой код\n«быстрый, но дырявый» (ICSE'26)",
    "Разработчики не доверяют\nкорректности ИИ-кода",
]
vals = [45, 40, 68, 96]
order = sorted(range(len(vals)), key=lambda i: vals[i])
labels = [labels[i] for i in order]
vals = [vals[i] for i in order]

fig, ax = plt.subplots(figsize=(7.6, 3.4), dpi=200, constrained_layout=True)
bars = ax.barh(labels, vals, color=[ACCENT] * 3 + [HEADER], height=0.58, edgecolor="none", zorder=3)
for b, v in zip(bars, vals):
    ax.text(v + 1.6, b.get_y() + b.get_height() / 2, f"{v}%",
            va="center", ha="left", fontsize=13, fontweight="bold", color=TEXT)
ax.set_xlim(0, 108)
ax.spines["top"].set_visible(False)
ax.spines["right"].set_visible(False)
ax.spines["left"].set_visible(False)
ax.spines["bottom"].set_color(BORDER)
ax.tick_params(axis="y", length=0, labelsize=10)
ax.tick_params(axis="x", labelsize=9)
ax.set_xticks([0, 25, 50, 75, 100])
ax.grid(False)
fig.savefig(f"{OUT}/chart_problem.png", facecolor=BG)
plt.close(fig)

# ------------------------------------------------------------------
# Chart 2: MRR projection months 1-12 (line, first/last/max labels)
# ------------------------------------------------------------------
months = list(range(1, 13))
# Public beta m1-2 (free only), paid launch m3 at 20 Pro, +60 Pro/mo,
# Platform tier: 1 deal x $499 from m8, 2 from m10
pro = 0
mrr = []
for m in months:
    if m >= 3:
        pro = 20 + (m - 3) * 60
    platform = (1 if m >= 8 else 0) + (1 if m >= 10 else 0)
    mrr.append(pro * 19 + platform * 499)

fig, ax = plt.subplots(figsize=(7.6, 3.2), dpi=200, constrained_layout=True)
ax.plot(months, mrr, color=ACCENT, linewidth=2.5, zorder=3,
        marker="o", markersize=0, solid_capstyle="round")
ax.fill_between(months, mrr, color=ACCENT, alpha=0.12, zorder=2)
for idx in [0, 2, len(mrr) - 1]:  # first, paid launch, last(max)
    ax.plot(months[idx], mrr[idx], "o", color=HEADER, markersize=5, zorder=4)
    ax.annotate(f"${mrr[idx]:,.0f}".replace(",", " "),
                (months[idx], mrr[idx]),
                textcoords="offset points", xytext=(0, 10),
                ha="center", fontsize=11, fontweight="bold", color=TEXT)
ax.set_xlim(0.6, 12.4)
ax.set_ylim(0, max(mrr) * 1.22)
ax.spines["top"].set_visible(False)
ax.spines["right"].set_visible(False)
ax.spines["left"].set_visible(False)
ax.spines["bottom"].set_color(BORDER)
ax.set_xticks(months)
ax.tick_params(labelsize=9)
ax.set_yticks([])
ax.grid(axis="y", linestyle="--", linewidth=0.5, alpha=0.2, color=MUTED)
fig.savefig(f"{OUT}/chart_mrr.png", facecolor=BG)
plt.close(fig)

print("MRR by month:", {m: v for m, v in zip(months, mrr)})
print("final MRR:", mrr[-1], "| ARR approx:", mrr[-1] * 12)
print("charts saved:", os.listdir(OUT))
