#!/usr/bin/env python3
"""Merge cover + body into the final report PDF (normalize pages to A4).

Run from the repo root: python3 scripts/appmot_report_merge.py
"""
import os

os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from pypdf import PdfReader, PdfWriter

A4_W, A4_H = 595.28, 841.89

def normalize_page_to_a4(page):
    box = page.mediabox
    w, h = float(box.width), float(box.height)
    if abs(w - A4_W) > 0.3 or abs(h - A4_H) > 0.3:
        page.scale_to(A4_W, A4_H)
    return page

COVER = "scripts/report_assets/cover.pdf"
BODY = "scripts/report_assets/body.pdf"
OUT = "download/AppMOT_Security_Report_1.pdf"

writer = PdfWriter()
writer.add_page(normalize_page_to_a4(PdfReader(COVER).pages[0]))
for page in PdfReader(BODY).pages:
    writer.add_page(normalize_page_to_a4(page))
writer.add_metadata({
    "/Title": "AppMOT - Состояние безопасности vibe-coded приложений. Выпуск 1",
    "/Author": "AppMOT",
    "/Creator": "AppMOT",
    "/Subject": "Бенчмарк-отчёт: состояние безопасности vibe-coded приложений, выпуск 1",
})
writer.write(OUT)
print("final:", OUT, "pages:", len(writer.pages))
