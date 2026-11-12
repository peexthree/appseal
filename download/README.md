# AppMOT — поставка

## Выпуск 1: бенчмарк-отчёт «Состояние безопасности vibe-coded приложений» (12.11.2026)

- **AppMOT_Security_Report_1.pdf** — отчёт: панель из 13 целей (9 публичных платформ + эталон + уязвимый двойник + самопроверка), 16 проверок v0.1, классы A–D; 11 страниц, обложка Crystal Blue, кликабельное оглавление.
- **AppMOT_Report1_cover.html** — исходник обложки (HTML, Template 07) для правок и переиспользования.
- **appmot_benchmark/dataset.json** — полный датасет панели: все проверки, статусы, штрафы, коды находок и доказательства (evidence) по каждой цели.
- **appmot_benchmark/summary.csv** — одна строка на цель (класс, балл, число проблем).
- **appmot_benchmark/checks.csv** — длинный формат: строка на (цель × проверка).
- **appmot_benchmark/figures/** — Рис. 1–3 из отчёта в PNG (для соцсетей и презентаций).

## Предыдущая поставка: MVP-спецификация

- **AppMOT_MVP_spec.pdf** — концепция, спецификация, юнит-экономика, план 90 дней (13 стр., ру).
- **AppMOT_cover.html** — исходник обложки MVP-спеки.

## Запуск демо-окружения

```bash
bash scripts/start-appmot.sh        # приложение: http://127.0.0.1:3000
bash scripts/start-demo-app.sh      # уязвимый двойник: http://127.0.0.1:3210 (класс D)
bash scripts/start-secure-app.sh    # эталон: https://127.0.0.1:3211 (класс A, 100/100)
bash scripts/gen-local-certs.sh     # локальный CA для HTTPS-эталона (уже сгенерирован)
```

Повторный прогон панели: `python3 scripts/appmot_benchmark.py` (панель), затем
`python3 scripts/appmot_dataset.py` (датасет) и `python3 scripts/appmot_report_charts.py` (графики).
