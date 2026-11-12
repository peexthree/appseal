#!/usr/bin/env python3
"""Merge cover + body into the final AppMOT spec PDF (normalize to A4)."""
from pypdf import PdfReader, PdfWriter

A4_W, A4_H = 595.28, 841.89

def normalize(page):
    w, h = float(page.mediabox.width), float(page.mediabox.height)
    if abs(w - A4_W) > 0.1 or abs(h - A4_H) > 0.1:
        page.scale_to(A4_W, A4_H)
        page.mediabox.lower_left = (0, 0)
        page.mediabox.upper_right = (A4_W, A4_H)
    return page

writer = PdfWriter()
writer.add_page(normalize(PdfReader("/home/z/my-project/scripts/pdf_assets/cover.pdf").pages[0]))
for page in PdfReader("/home/z/my-project/scripts/pdf_assets/body.pdf").pages:
    writer.add_page(normalize(page))

writer.add_metadata({
    "/Title": "AppMOT — техосмотр для приложений, собранных с ИИ: концепция и спецификация MVP",
    "/Author": "Z.ai",
    "/Creator": "Z.ai",
    "/Subject": "MVP: концепция, спецификация, юнит-экономика, план запуска",
})
out = "/home/z/my-project/download/AppMOT_MVP_spec.pdf"
with open(out, "wb") as f:
    writer.write(f)
print("merged:", out, "| pages:", len(writer.pages))
