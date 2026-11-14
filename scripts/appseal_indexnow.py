#!/usr/bin/env python3
"""IndexNow пинг: мгновенное уведомление Bing/Яндекс/Seznam/Naver о страницах AppSeal.

Google в IndexNow не участвует - для него отдельный путь: Search Console
(sitemap + запрос индексации). Ключ лежит в public/indexnow-key.txt и должен
быть доступен по https://appseal.online/indexnow-key.txt (Vercel копирует public/).

Использование:
    python -I scripts/appseal_indexnow.py                 # пинг стандартного набора
    python -I scripts/appseal_indexnow.py --url <адрес>   # + дополнительный URL (можно несколько)
"""
import argparse
import http.client
import json
import pathlib
import sys

BASE = "https://appseal.online"
HOST = "appseal.online"
KEY_FILE = pathlib.Path(__file__).resolve().parent.parent / "public" / "indexnow-key.txt"


def main() -> int:
    parser = argparse.ArgumentParser(description="IndexNow ping for AppSeal")
    parser.add_argument("--url", action="append", default=[], help="добавить URL к пингу")
    args = parser.parse_args()

    key = KEY_FILE.read_text(encoding="utf-8").strip()
    if not key:
        print(f"Пустой ключ: {KEY_FILE}")
        return 2

    urls = [
        f"{BASE}/",
        f"{BASE}/registry",
        f"{BASE}/stats",
        f"{BASE}/legal",
        f"{BASE}/bot",
    ] + args.url

    payload = json.dumps(
        {
            "host": HOST,
            "key": key,
            "keyLocation": f"{BASE}/indexnow-key.txt",
            "urlList": urls,
        }
    ).encode("utf-8")

    conn = http.client.HTTPSConnection("api.indexnow.org", timeout=20)
    conn.request(
        "POST",
        "/indexnow",
        body=payload,
        headers={"Content-Type": "application/json; charset=utf-8"},
    )
    resp = conn.getresponse()
    body = resp.read().decode("utf-8", "replace").strip()
    print(f"HTTP {resp.status} {resp.reason}")
    if body:
        print(body[:500])
    # 200/202 = принято; 400/403/422/429 = ошибка ключа/лимита
    return 0 if resp.status in (200, 202) else 1


if __name__ == "__main__":
    sys.exit(main())
