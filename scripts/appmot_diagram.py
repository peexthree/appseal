#!/usr/bin/env python3
"""Screenshot the architecture diagram HTML to PNG at 2x (300dpi print quality)."""
import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page(
            viewport={"width": 1240, "height": 620}, device_scale_factor=2
        )
        await page.goto("file:///home/z/my-project/scripts/pdf_assets/diagram.html")
        await page.wait_for_timeout(400)
        body = await page.query_selector("body")
        await body.screenshot(path="/home/z/my-project/scripts/pdf_assets/diagram.png")
        await browser.close()
        print("diagram.png saved")

asyncio.run(main())
