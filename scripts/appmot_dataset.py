#!/usr/bin/env python3
"""Assemble the AppMOT benchmark dataset from scripts/benchmark_data/*.json.

Outputs (public deliverables):
  download/appmot_benchmark/dataset.json   - full panel with per-check results
  download/appmot_benchmark/summary.csv    - one row per target
  download/appmot_benchmark/checks.csv     - long format: one row per (target, check)

Also refreshes scripts/benchmark_data/summary.json from individual files
(secure was re-scanned after the TLS port fix, so the panel summary must be rebuilt).
"""
import csv
import glob
import json
import pathlib
import statistics

HERE = pathlib.Path(__file__).parent
DATA = HERE / "benchmark_data"
OUT = pathlib.Path("/home/z/my-project/download/appmot_benchmark")
OUT.mkdir(parents=True, exist_ok=True)

# key -> (label ru, group) ; mirrors scripts/appmot_benchmark.py PANEL
META = {
    "demo":        ("FreshBite — уязвимый двойник (модель vibe-кода)", "модель"),
    "secure":      ("FreshBite hardened — эталон после лечения",       "модель"),
    "self":        ("AppMOT — самопроверка (dev-инстанс)",             "модель"),
    "vercel":      ("vercel.com",        "рынок"),
    "netlify":     ("netlify.com",       "рынок"),
    "render":      ("render.com",        "рынок"),
    "railway":     ("railway.app",       "рынок"),
    "flyio":       ("fly.io",            "рынок"),
    "openai":      ("openai.com",        "рынок"),
    "anthropic":   ("anthropic.com",     "рынок"),
    "mistral":     ("mistral.ai",        "рынок"),
    "huggingface": ("huggingface.co",    "рынок"),
    "cloudflare":  ("cloudflare.com",    "рынок"),
}
ORDER = ["demo", "secure", "self", "vercel", "netlify", "render", "railway",
         "flyio", "openai", "anthropic", "mistral", "huggingface", "cloudflare"]

CHECK_RU = {
    "env_exposure": "Файл .env доступен",
    "git_exposure": "Папка .git доступна",
    "secrets_in_source": "Секреты в клиентском коде",
    "baas_open_read": "Открытый доступ к BaaS-базе",
    "source_maps": "Открыты source maps",
    "security_headers": "Не хватает защитных заголовков",
    "cors_wildcard": "CORS открыт для всех",
    "cookie_flags": "Cookie без флагов",
    "tls_cert": "Проблемы с TLS/HTTPS",
    "admin_exposure": "Админка доступна без защиты",
    "backup_files": "Бэкапы доступны по прямой ссылке",
    "debug_endpoints": "Открыты отладочные эндпоинты",
    "placeholder_content": "Заглушки на сайте",
    "rendered_errors": "Ошибки в разметке",
    "broken_links": "Битые внутренние ссылки",
    "meta_health": "Не заполнены meta-теги",
}
CAT_RU = {"secrets": "Секреты", "headers": "Заголовки и TLS", "admin": "Админки", "liveness": "Живость"}

def load(key):
    p = DATA / f"{key}.json"
    if not p.exists():
        return None
    d = json.loads(p.read_text(encoding="utf-8"))
    label, group = META[key]
    d["key"], d["label"], d["group"] = key, label, group
    return d

panel = []
for key in ORDER:
    d = load(key)
    if d:
        panel.append(d)

# ---- stats for the report text ----
done = [d for d in panel if d.get("status") == "done"]
market = [d for d in done if d["group"] == "рынок"]
scores = [d["score"] for d in market]
stats = {
    "scanned_at": "2026-11-12",
    "panel_size": len(panel),
    "done": len(done),
    "blocked": [d["key"] for d in panel if d.get("status") == "error"],
    "market": {
        "n": len(market),
        "mean_score": round(statistics.mean(scores), 1),
        "median_score": statistics.median(scores),
        "min": min(scores), "max": max(scores),
        "grades": {g: sum(1 for d in market if d["grade"] == g) for g in "ABCD"},
    },
    "twins": {"before": next(d["score"] for d in done if d["key"] == "demo"),
              "after": next(d["score"] for d in done if d["key"] == "secure")},
    "self": next(d["score"] for d in done if d["key"] == "self"),
}

dataset = {
    "meta": {
        "title": "AppMOT Benchmark — State of Vibe-Coded App Security, выпуск №1",
        "scanner": "AppMOT v0.1 (16 чёрно-ящичных проверок, 4 категории)",
        "date": stats["scanned_at"],
        "note": "Оценки внешних сайтов — предварительные; перед публикацией по именам требуется ручная верификация (см. отчёт, раздел «Методология»).",
    },
    "stats": stats,
    "panel": [
        {
            "key": d["key"], "label": d["label"], "group": d["group"],
            "url": d.get("targetUrl", ""), "status": d.get("status"),
            "score": d.get("score"), "grade": d.get("grade"),
            "platform": d.get("platform"),
            "started_at": d.get("startedAt"),
            "results": [
                {"id": r["id"], "category": CAT_RU.get(r["category"], r["category"]),
                 "title_ru": r["title"]["ru"], "status": r["status"],
                 "severity": r["severity"], "penalty": r["penalty"],
                 "code": (r.get("finding") or {}).get("code"),
                 "evidence": (r.get("finding") or {}).get("evidence", [])}
                for r in d.get("results", [])
            ],
        }
        for d in panel
    ],
}
(OUT / "dataset.json").write_text(json.dumps(dataset, ensure_ascii=False, indent=2), encoding="utf-8")

# refresh internal summary.json
(DATA / "summary.json").write_text(
    json.dumps({"generated_at": "2026-11-12", "rebuilt_from": "per-target files", "results": panel},
               ensure_ascii=False, indent=2), encoding="utf-8")

# summary.csv
with open(OUT / "summary.csv", "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(["target", "group", "status", "grade", "score", "checks_failed_or_warned", "platform"])
    for d in panel:
        bad = sum(1 for r in d.get("results", []) if r["status"] in ("fail", "warn")) if d.get("status") == "done" else ""
        w.writerow([d["label"], d["group"], d.get("status"), d.get("grade", ""), d.get("score", ""), bad, d.get("platform") or ""])

# checks.csv (long format)
with open(OUT / "checks.csv", "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(["target", "group", "check_id", "check", "category", "status", "severity", "penalty", "code"])
    for d in panel:
        if d.get("status") != "done":
            continue
        for r in d.get("results", []):
            w.writerow([d["key"], d["group"], r["id"], CHECK_RU.get(r["id"], r["id"]),
                        CAT_RU.get(r["category"], r["category"]), r["status"], r["severity"],
                        r["penalty"], (r.get("finding") or {}).get("code") or ""])

print("dataset ->", OUT)
print("stats:", json.dumps(stats, ensure_ascii=False, indent=2))
