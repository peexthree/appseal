#!/usr/bin/env python3
"""Screenshot the architecture diagram HTML to PNG at 2x (300dpi print quality)."""
import asyncio
import os
import pathlib
from playwright.async_api import async_playwright

HERE = pathlib.Path(__file__).resolve().parent
ASSETS = HERE / "pdf_assets"

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page(
            viewport={"width": 1240, "height": 620}, device_scale_factor=2
        )
        await page.goto((ASSETS / "diagram.html").as_uri())
        await page.wait_for_timeout(400)
        body = await page.query_selector("body")
        await body.screenshot(path=str(ASSETS / "diagram.png"))
        await browser.close()
        print("diagram.png saved")

asyncio.run(main())
