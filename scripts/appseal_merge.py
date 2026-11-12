#!/usr/bin/env python3
"""Merge cover + body into the final AppSeal spec PDF (normalize to A4).

Run from the repo root: python3 scripts/appseal_merge.py
"""
import os

os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from pypdf import PdfReader, PdfWriter

A4_W, A4_H = 595.28, 841.89

def normalize(page):
    w, h = float(page.mediabox.width), float(page.mediabox.height)
    if abs(w - A4_W)  > 0.1 or abs(h - A4_H) > 0.1:
        page.scale_to(A4_W, A4_H)
        page.mediabox.lower_left = (0, 0)
        page.mediabox.upper_right = (A4_W, A4_H)
    return page

writer = PdfWriter()
writer.add_page(normalize(PdfReader("scripts/pdf_assets/cover.pdf").pages[0]))
for page in PdfReader("scripts/pdf_assets/body.pdf").pages:
    writer.add_page(normalize(page))

writer.add_metadata({
    "/Title": "AppSeal - техосмотр для приложений, собранных с ИИ: концепция и спецификация MVP",
    "/Author": "AppSeal",
    "/Creator": "AppSeal",
    "/Subject": "MVP: концепция, спецификация, юнит-экономика, план запуска",
})
out = "download/AppSeal_MVP_spec.pdf"
writer.write(out)
print("merged:", out, "| pages:", len(writer.pages))
