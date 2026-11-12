#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""AppMOT Benchmark Report #1 — body PDF (ReportLab, Russian, Template 07 Crystal Blue)."""
import os
import sys
import hashlib

HERE = os.path.dirname(os.path.abspath(__file__))

# optional: skill assets dir via env (unused by default; reportlab does the work)
PDF_SKILL_DIR = os.environ.get("APPMOT_PDF_SKILL_DIR", "")
if PDF_SKILL_DIR:
    sys.path.insert(0, os.path.join(PDF_SKILL_DIR, "scripts"))

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle,
    Image, KeepTogether, CondPageBreak, HRFlowable,
)
from reportlab.platypus.tableofcontents import TableOfContents
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import registerFontFamily
from PIL import Image as PILImage

# ------------------------------------------------------------------
# Fonts (allowed set only; FreeSerif carries full Cyrillic)
# ------------------------------------------------------------------
FONT_DIR = "/usr/share/fonts"
pdfmetrics.registerFont(TTFont("NotoSerifSC", f"{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Regular.ttf"))
pdfmetrics.registerFont(TTFont("NotoSerifSC-Bold", f"{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Bold.ttf"))
pdfmetrics.registerFont(TTFont("Noto Sans SC", f"{FONT_DIR}/truetype/chinese/NotoSansSC-Regular.ttf"))
pdfmetrics.registerFont(TTFont("Noto Sans SC Bold", f"{FONT_DIR}/truetype/chinese/NotoSansSC-Bold.ttf"))
pdfmetrics.registerFont(TTFont("SarasaMonoSC", f"{FONT_DIR}/truetype/chinese/SarasaMonoSC-Regular.ttf"))
pdfmetrics.registerFont(TTFont("FreeSerif", f"{FONT_DIR}/truetype/freefont/FreeSerif.ttf"))
pdfmetrics.registerFont(TTFont("FreeSerif-Bold", f"{FONT_DIR}/truetype/freefont/FreeSerifBold.ttf"))
pdfmetrics.registerFont(TTFont("FreeSerif-Italic", f"{FONT_DIR}/truetype/freefont/FreeSerifItalic.ttf"))
pdfmetrics.registerFont(TTFont("FreeSerif-BoldItalic", f"{FONT_DIR}/truetype/freefont/FreeSerifBoldItalic.ttf"))
pdfmetrics.registerFont(TTFont("DejaVuSans", f"{FONT_DIR}/truetype/dejavu/DejaVuSansMono.ttf"))

registerFontFamily("NotoSerifSC", normal="NotoSerifSC", bold="NotoSerifSC-Bold")
registerFontFamily("Noto Sans SC", normal="Noto Sans SC", bold="Noto Sans SC Bold")
registerFontFamily("FreeSerif", normal="FreeSerif", bold="FreeSerif-Bold",
                   italic="FreeSerif-Italic", boldItalic="FreeSerif-BoldItalic")
registerFontFamily("DejaVuSans", normal="DejaVuSans", bold="DejaVuSans")

from pdf import install_font_fallback  # noqa: E402
install_font_fallback()

# ------------------------------------------------------------------
# Template 07 Crystal Blue — fixed body palette (see typesetting/cover.md)
# ------------------------------------------------------------------
PAGE_BG      = colors.HexColor("#f5f8fc")   # XL
SECTION_BG   = colors.HexColor("#edf2f9")   # XL
CARD_BG      = colors.HexColor("#e4ecf5")   # L
TABLE_STRIPE = colors.HexColor("#eef3fa")   # L
HEADER_FILL  = colors.HexColor("#1a4a7a")   # M
BORDER       = colors.HexColor("#c0d0e2")   # S
ACCENT       = colors.HexColor("#2d7ab3")   # XS
TEXT_PRIMARY = colors.HexColor("#142840")
TEXT_MUTED   = colors.HexColor("#5a7a96")

TABLE_HEADER_COLOR = HEADER_FILL
TABLE_ROW_EVEN = colors.white
TABLE_ROW_ODD = TABLE_STRIPE

# product grade colors (functional state colors — same as in figures and the app badges)
GRADE_C = {"A": colors.HexColor("#10b981"), "B": colors.HexColor("#84cc16"),
           "C": colors.HexColor("#f59e0b"), "D": colors.HexColor("#ef4444")}

# ------------------------------------------------------------------
# Page geometry
# ------------------------------------------------------------------
MARGIN = 0.9 * inch
PAGE_W, PAGE_H = A4
AVAIL_W = PAGE_W - 2 * MARGIN
AVAIL_H = PAGE_H - 2 * MARGIN
H1_THRESHOLD = AVAIL_H * 0.25
MAX_KEEP_HEIGHT = PAGE_H * 0.4

OUT_DIR = os.path.join(HERE, "report_assets")
BODY_PDF = os.path.join(OUT_DIR, "body.pdf")
FIG = lambda n: os.path.join(OUT_DIR, n)

DOC_TITLE = "AppMOT — Состояние безопасности vibe-coded приложений. Выпуск 1"

# ------------------------------------------------------------------
# Styles
# ------------------------------------------------------------------
S = {}
S["body"] = ParagraphStyle("Body", fontName="FreeSerif", fontSize=10.5, leading=17,
                           alignment=TA_JUSTIFY, textColor=TEXT_PRIMARY, spaceAfter=8)
S["lead"] = ParagraphStyle("Lead", parent=S["body"], fontSize=11.5, leading=19,
                           textColor=TEXT_PRIMARY, spaceAfter=10)
S["h1"] = ParagraphStyle("H1", fontName="FreeSerif-Bold", fontSize=22, leading=27,
                         textColor=HEADER_FILL, spaceBefore=6, spaceAfter=4)
S["h2"] = ParagraphStyle("H2", fontName="FreeSerif-Bold", fontSize=15, leading=20,
                         textColor=TEXT_PRIMARY, spaceBefore=14, spaceAfter=6)
S["h3"] = ParagraphStyle("H3", fontName="FreeSerif-Bold", fontSize=11.5, leading=16,
                         textColor=TEXT_PRIMARY, spaceBefore=10, spaceAfter=4)
S["bullet"] = ParagraphStyle("Bullet", parent=S["body"], leftIndent=16, bulletIndent=4,
                             spaceAfter=5, bulletFontName="FreeSerif", bulletFontSize=10.5)
S["quote"] = ParagraphStyle("Quote", fontName="FreeSerif-Italic", fontSize=10.5, leading=17,
                            leftIndent=24, textColor=TEXT_MUTED, spaceBefore=6, spaceAfter=10)
S["caption"] = ParagraphStyle("Caption", fontName="FreeSerif", fontSize=8.5, leading=12,
                              alignment=TA_CENTER, textColor=TEXT_MUTED)
S["cell"] = ParagraphStyle("Cell", fontName="FreeSerif", fontSize=9, leading=12.5,
                           alignment=TA_LEFT, textColor=TEXT_PRIMARY)
S["cellC"] = ParagraphStyle("CellC", parent=S["cell"], alignment=TA_CENTER)
S["cellH"] = ParagraphStyle("CellH", fontName="FreeSerif-Bold", fontSize=9.2, leading=12.5,
                            alignment=TA_LEFT, textColor=colors.white)
S["cellHC"] = ParagraphStyle("CellHC", parent=S["cellH"], alignment=TA_CENTER)
S["code"] = ParagraphStyle("Code", fontName="DejaVuSans", fontSize=7.8, leading=11.5,
                           textColor=TEXT_PRIMARY, alignment=TA_LEFT)
S["stat"] = ParagraphStyle("Stat", fontName="FreeSerif-Bold", fontSize=20, leading=24,
                           textColor=ACCENT, alignment=TA_CENTER)
S["statL"] = ParagraphStyle("StatL", fontName="FreeSerif", fontSize=8.5, leading=11.5,
                            textColor=TEXT_MUTED, alignment=TA_CENTER)
S["toc0"] = ParagraphStyle("TOC0", fontName="FreeSerif-Bold", fontSize=11.5, leading=20,
                           leftIndent=6, textColor=TEXT_PRIMARY)
S["toc1"] = ParagraphStyle("TOC1", fontName="FreeSerif", fontSize=10, leading=16,
                           leftIndent=26, textColor=TEXT_MUTED)
S["tocTitle"] = ParagraphStyle("TOCTitle", fontName="FreeSerif-Bold", fontSize=18, leading=24,
                               textColor=HEADER_FILL, spaceAfter=14)

# ------------------------------------------------------------------
# Doc template with TOC + header/footer
# ------------------------------------------------------------------
class TocDocTemplate(SimpleDocTemplate):
    def afterFlowable(self, flowable):
        if hasattr(flowable, "bookmark_name"):
            level = getattr(flowable, "bookmark_level", 0)
            text = getattr(flowable, "bookmark_text", "")
            key = getattr(flowable, "bookmark_key", "")
            # TOC must show the number printed in the footer (body arabic = doc.page - 1,
            # because page 1 is the TOC itself and displays roman "i")
            self.notify("TOCEntry", (level, text, self.page - 1, key))


def on_page(canvas, doc):
    canvas.saveState()
    canvas.setFont("FreeSerif", 7.5)
    canvas.setFillColor(TEXT_MUTED)
    canvas.drawString(MARGIN, PAGE_H - 0.55 * inch, DOC_TITLE)
    canvas.setStrokeColor(ACCENT)
    canvas.setLineWidth(1.2)
    canvas.line(MARGIN, PAGE_H - 0.62 * inch, PAGE_W - MARGIN, PAGE_H - 0.62 * inch)
    canvas.setStrokeColor(BORDER)
    canvas.setLineWidth(0.6)
    canvas.line(MARGIN, 0.62 * inch, PAGE_W - MARGIN, 0.62 * inch)
    canvas.setFont("FreeSerif", 7.5)
    canvas.setFillColor(TEXT_MUTED)
    canvas.drawString(MARGIN, 0.45 * inch, "AppMOT · Benchmark v0.1 · 12 ноября 2026")
    if doc.page == 1:
        num = "i"
    else:
        num = str(doc.page - 1)
    canvas.drawRightString(PAGE_W - MARGIN, 0.45 * inch, num)
    canvas.restoreState()


# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------
story = []

def add_heading(text, style, level=0):
    key = "h_" + hashlib.md5(text.encode()).hexdigest()[:8]
    p = Paragraph(f'<a name="{key}"/><b>{text}</b>', style)
    p.bookmark_name = key
    p.bookmark_level = level
    p.bookmark_text = text
    p.bookmark_key = key
    return p


def h1(num, text):
    story.append(CondPageBreak(H1_THRESHOLD))
    story.append(Spacer(1, 10))
    story.append(KeepTogether([
        add_heading(f"{num}. {text}", S["h1"], level=0),
        HRFlowable(width="100%", color=ACCENT, thickness=1.6, spaceBefore=2, spaceAfter=12),
    ]))


def h2(text):
    story.append(add_heading(text, S["h2"], level=1))


def p(text, style="body"):
    # bind em-dash to the preceding word: never allow a line to start with «—»
    text = text.replace(" — ", "\u00a0— ")
    story.append(Paragraph(text, S[style]))


def bullets(items):
    for it in items:
        story.append(Paragraph(it, S["bullet"], bulletText="•"))


def safe_keep(elements):
    total = 0
    for el in elements:
        w, h = el.wrap(AVAIL_W, PAGE_H)
        total += h
    if total <= MAX_KEEP_HEIGHT:
        story.append(KeepTogether(elements))
    else:
        story.append(KeepTogether(elements[:2]))
        for el in elements[2:]:
            story.append(el)


def make_table(head, rows, ratios, header_align="C", repeat=True):
    assert abs(sum(ratios) - 1.0) < 0.01, "ratios must sum to 1"
    col_w = [r * AVAIL_W for r in ratios]
    assert sum(col_w) <= AVAIL_W + 0.5, "table wider than available width"
    ha = S["cellHC"] if header_align == "C" else S["cellH"]
    data = [[Paragraph(f"<b>{h}</b>", ha) for h in head]]
    for row in rows:
        data.append([c if isinstance(c, (Paragraph, Image)) else
                     Paragraph(str(c).replace(" — ", "\u00a0— "), S["cell"]) for c in row])
    t = Table(data, colWidths=col_w, hAlign="CENTER", repeatRows=1 if repeat else 0)
    style = [
        ("BACKGROUND", (0, 0), (-1, 0), TABLE_HEADER_COLOR),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("GRID", (0, 0), (-1, -1), 0.5, BORDER),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 5.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5.5),
    ]
    for i in range(1, len(data)):
        style.append(("BACKGROUND", (0, i), (-1, i), TABLE_ROW_EVEN if i % 2 == 1 else TABLE_ROW_ODD))
    t.setStyle(TableStyle(style))
    return t


def add_table(head, rows, ratios, caption=None):
    story.append(Spacer(1, 10))
    t = make_table(head, rows, ratios)
    if caption:
        cap = Paragraph(caption, S["caption"])
        if len(rows) <= 12:
            safe_keep([t, Spacer(1, 6), cap])
        else:
            story.append(t)
            story.append(Spacer(1, 6))
            story.append(cap)
    else:
        story.append(t)
    story.append(Spacer(1, 12))


def fit_image(path, max_w, max_h):
    im = PILImage.open(path)
    ow, oh = im.size
    rw = max_w / ow if ow > max_w else 1.0
    rh = max_h / oh if oh > max_h else 1.0
    r = min(rw, rh)
    return Image(path, width=ow * r, height=oh * r)


def add_chart(path, caption, max_h=250):
    img = fit_image(path, AVAIL_W, max_h)
    story.append(Spacer(1, 14))
    safe_keep([img, Spacer(1, 8), Paragraph(caption, S["caption"])])
    story.append(Spacer(1, 16))


def callout(big, label, w=110):
    c = Table([[Paragraph(f"<b>{big}</b>", S["stat"])], [Paragraph(label, S["statL"])]],
              colWidths=[w])
    c.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), CARD_BG),
        ("BOX", (0, 0), (-1, -1), 1, ACCENT),
        ("TOPPADDING", (0, 0), (-1, 0), 10),
        ("BOTTOMPADDING", (0, 1), (-1, 1), 10),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    return c


def kpi_row(items):
    """One single table: 4 card columns + 3 transparent gap columns.
    A single centered table (not nested per-card tables) — keeps QA happy."""
    n = len(items)
    gap = 10
    card_w = (AVAIL_W - gap * (n - 1)) / n
    col_w, top, bot = [], [], []
    for i in range(n):
        big, lab = items[i]
        col_w.append(card_w)
        top.append(Paragraph(f"<b>{big}</b>", S["stat"]))
        bot.append(Paragraph(lab, S["statL"]))
        if i < n - 1:
            col_w.append(gap)
            top.append("")
            bot.append("")
    data = [top, bot]
    t = Table(data, colWidths=col_w, hAlign="CENTER")
    style = [
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
    ]
    for i in range(n):
        c = i * 2  # card columns are 0, 2, 4, 6 (gaps between)
        style.append(("BACKGROUND", (c, 0), (c, 1), CARD_BG))
        style.append(("BOX", (c, 0), (c, 1), 1, ACCENT))
        style.append(("TOPPADDING", (c, 0), (c, 0), 10))
        style.append(("BOTTOMPADDING", (c, 1), (c, 1), 10))
    t.setStyle(TableStyle(style))
    return t


def grade_p(g, txt=""):
    color = GRADE_C[g].hexval()[2:]
    label = txt or g
    return Paragraph(f'<b><font color="#{color}">{label}</font></b>', S["cellC"])


# ==================================================================
# TOC page
# ==================================================================
story.append(Paragraph("<b>Содержание</b>", S["tocTitle"]))
toc = TableOfContents()
toc.levelStyles = [S["toc0"], S["toc1"]]
story.append(toc)
story.append(PageBreak())

# ==================================================================
# 1. Резюме для руководителя
# ==================================================================
h1(1, "Резюме для руководителя")

p("Код теперь пишет каждый — а проверяет его по-прежнему почти никто. Пока генерация "
  "приложений ускоряется, зона создания становится всё более безопасной сама по себе: "
  "платформы выкатывают исправления и разумные дефолты. Но между «приложение собрано» и "
  "«приложению можно доверять» по-прежнему пусто. Этот отчёт — первый регулярный срез "
  "этой пустоты: что видит независимый чёрный ящик, когда смотрит на живые приложения "
  "так, как на них смотрел бы злоумышленник.", "lead")

p("12 ноября 2026 года мы прогнали через сканер AppMOT v0.1 панель из 13 целей: девять "
  "крупных публичных платформ, «уязвимый двойник», собранный по лекалам типичной ночи "
  "с вайб-кодингом, его «вылеченная» версия и мы сами. Сканер делает 16 чёрно-ящичных "
  "проверок в четырёх категориях: секреты и утечки, заголовки и TLS, админки и доступ, "
  "живость и контент. Каждой цели присваивается балл 0–100 и класс A–D; одна находка "
  "критического уровня автоматически опускает потолок оценки до 44 баллов.")

story.append(Spacer(1, 6))
story.append(kpi_row([
    ("76,1", "средний балл по рынку (9 платформ)"),
    ("4/9", "платформ с классом A"),
    ("7/12", "целей без полного набора заголовков"),
    ("0 → 100", "кейс «до/после» за часы работы"),
]))
story.append(Spacer(1, 12))

p("Главные выводы выпуска. Первый: даже у компаний с профессиональными командами "
  "безопасности гигиена веб-слоя проседает — больше половины панели теряет баллы на "
  "защитных заголовках, и только четыре платформы из девяти доходят до класса A. "
  "Второй: дистанция между «опасно» и «отлично» измеряется часами, а не месяцами, — "
  "наш собственный кейс показывает подъём с 0 до 100 баллов без единой строчки "
  "переписанного бизнес-кода, одной конфигурацией. Третий: автоматический сканер "
  "нуждается в честной дисциплине публикации — мы нашли у самих себя три режима ложных "
  "срабатываний и вынесли их в отдельный раздел вместе с планом уточнения; доверие к "
  "оценке важнее красивых цифр.")

h2("Как читать оценки")

add_table(
    ["Правило", "Значение"],
    [
        ["Стартовый балл", "100"],
        ["Провал или предупреждение проверки", "минус штраф проверки (3–40 баллов)"],
        ["Любая находка уровня critical", "потолок оценки 44 балла (не выше C)"],
        ["Любая находка уровня high", "потолок оценки 74 балла (не выше B)"],
        ["Класс A", "85–100 баллов; класс B — 70–84; класс C — 45–69; класс D — ниже 45"],
    ],
    [0.44, 0.56],
    "Табл. 1. Правила оценки v0.1 (шкала с потолками)",
)

p("Панель намеренно смешанная. Три собственных цели дают калибровку: «модель "
  "вайб-кода» показывает дно, «эталон» — потолок, самопроверка AppMOT — как выглядит "
  "обычный dev-инстанс до продакшена. Публичные платформы — это не рейтинг их "
  "инженерных команд, а нижний срез их веб-слоя, который видит внешний наблюдатель; "
  "этот срез и есть то, что видят и пользователи, и злоумышленники.")

# ==================================================================
# 2. Результаты панели
# ==================================================================
h1(2, "Результаты панели")

p("Полная картина выпуска — ниже. Класс раскрашен по продуктовой шкале AppMOT: "
  "A — отлично, B — хорошо, C — требует доработки, D — опасно. Комментарий объясняет, "
  "из чего набран или потерян балл; спорные находки помечены как кандидаты на ложные "
  "срабатывания и разобраны в разделе 6.", "lead")

add_table(
    ["Цель", "Группа", "Класс", "Балл", "Комментарий"],
    [
        ["FreshBite — уязвимый двойник", "модель", grade_p("D"), "0",
         "дно шкалы: .env, .git и бэкап в открытом доступе, ключи в HTML, админка без защиты (Lovable)"],
        ["FreshBite hardened — эталон", "модель", grade_p("A"), "100",
         "потолок шкалы: TLS+HSTS, CSP, Basic-auth на админке, чистый клиентский код — 16 из 16"],
        ["AppMOT — самопроверка (dev)", "модель", grade_p("C"), "62",
         "http без TLS, нет CSP, dev source maps; сканер поймал «lorem ipsum» в списке наших же проверок"],
        ["cloudflare.com", "рынок", grade_p("A"), "100", "идеальный срез: все 16 проверок пройдены"],
        ["anthropic.com", "рынок", grade_p("A"), "98", "не хватает только Referrer-Policy"],
        ["railway.app", "рынок", grade_p("A"), "92", "часть защитных заголовков отсутствует"],
        ["render.com", "рынок", grade_p("A"), "87",
         "source maps и cookie-флаги; живой TLS и заголовки удерживают класс A"],
        ["fly.io", "рынок", grade_p("B"), "80",
         "доки-строки под «секрет», source maps, часть заголовков, мета-теги"],
        ["vercel.com", "рынок", grade_p("B"), "74",
         "cookie без флагов, CORS «*» на главной, /admin отдаёт 200"],
        ["huggingface.co", "рынок", grade_p("C"), "66",
         "catch-all роутинг: /wp-admin/ возвращает страницу модели; заголовков нет"],
        ["netlify.com", "рынок", grade_p("D"), "44",
         "заголовков нет; находка «секреты в коде» — вероятно, строки документации (см. §6)"],
        ["mistral.ai", "рынок", grade_p("D"), "44",
         "source maps открыты; «секрет» — строка из бандла Astro, кандидат на ложное срабатывание"],
        ["openai.com", "рынок", Paragraph("<b>н/д</b>", S["cellC"]), "н/д",
         "скан заблокирован WAF (403): в панель не входит"],
    ],
    [0.26, 0.09, 0.08, 0.08, 0.49],
    "Табл. 2. Панель выпуска №1: 13 целей, 12 отсканировано, 1 заблокирован WAF",
)

add_chart(FIG("fig1_panel.png"),
          "Рис. 1. Баллы панели по классам: модели (серые подписи) и публичные платформы; "
          "openai.com исключён — скан заблокирован WAF",
          max_h=336)

h2("Кто теряет баллы и на чём")

p("Верхняя группа не удивляет: Cloudflare и Anthropic подходят к срезу с почти идеальной "
  "конфигурацией — это компании, для которых безопасность и есть продукт. Интереснее "
  "середина и низ. Netlify и Mistral получили класс D не потому, что у них дыры, а потому, "
  "что их маркетинговые страницы и бандлы содержат строки, похожие на секреты, а защитных "
  "заголовков нет. Мы помечаем эти случаи как кандидатов на ложное срабатывание, но "
  "убираем их из оценки только после ручной верификации — таков регламент выпуска.")

p("Отдельного внимания заслуживает OpenAI: единственная цель панели, где сканер получил "
  "403 на первом же запросе. Это честный результат бенчмарка, а не сбой: периметр WAF "
  "не отличил нашего робота от вредоносного. Для методологии это нижняя граница "
  "применимости чёрно-ящичных сканов: часть цели просто недоступна для наблюдения, "
  "и честнее вывести её из панели, чем рисовать «0 баллов за блокировку».")

# ==================================================================
# 3. Частота проблем по проверкам
# ==================================================================
h1(3, "Частота проблем по проверкам")

p("Если свести все 15 сработавших проверок по всем 12 отсканированным целям, картина "
  "получается такой:", "lead")

add_chart(FIG("fig2_checks.png"),
          "Рис. 2. Число целей (из 12), где сработала проверка; «прочие» — .env, .git, "
          "бэкапы, debug-эндпоинты, битые ссылки и ошибки в разметке (по одной цели)",
          max_h=336)

h2("Топ-4 и цена каждой ошибки")

p("<b>Защитные заголовки — 7 целей из 12.</b> Самая частая и самая дешёвая проблема "
  "выпуска. CSP, X-Content-Type-Options, X-Frame-Options и Referrer-Policy ставятся "
  "одним блоком конфигурации за вечер, но их отсутствие открывает кликджекинг, "
  "MIME-sniffing и часть XSS-векторов. Ни одна модельная цель и меньше половины "
  "рыночных не закрыли этот список полностью.")

p("<b>Секреты в клиентском коде — 5 целей.</b> Формально самая дорогая находка (штраф "
  "40, потолок 44): всё, что видно браузеру, видно и злоумышленнику. В панели почти все "
  "случаи — строки из документации и маркетинга, а не живые ключи; но для vibe-coded "
  "приложений картина обратная — живые ключи в HTML там скорее правило, чем исключение. "
  "Проверка уже спасает: она единственная, которая у модели-двойника сработала вместе "
  "с .env и .git в категории «секреты».")

p("<b>Source maps — 4 цели.</b> Публичные .map-файлы отдают исходники вместе с "
  "комментариями и путями. Не критично, но это бесплатная разведка для атакующего и "
  "маркер «сборка не для продакшена». Закрывается флагом сборки.")

p("<b>Cookie-флаги и админки — по 3 цели.</b> Cookie без HttpOnly/Secure/SameSite "
  "отдают сессию скриптам и CSRF; админка, отвечающая 200 на стандартных путях без "
  "IP-ограничений, — приглашение к перебору. Обе проблемы лечатся конфигурацией и "
  "штатными средствами платформы.")

p("Общий знаменатель топ-4: ни одна из проблем не требует переписывать приложение. "
  "Все четыре — вопрос конфигурации деплоя и гигиены сборки. Это и есть продуктовая "
  "идея AppMOT в одном абзаце: найти за минуту то, что чинится за вечер, пока "
  "это не нашёл кто-то другой.")

# ==================================================================
# 4. Кейс FreshBite: до и после
# ==================================================================
h1(4, "Кейс FreshBite: до и после")

p("Чтобы показать дистанцию между «опасно» и «отлично», мы построили один и тот же "
  "вымышленный продукт — ночную доставку еды FreshBite — в двух состояниях. «До» "
  "собран по лекалам типичной ночи с вайб-кодингом: работает, но .env и .git "
  "выложены в корень, ключи зашиты в HTML, админка открыта паролем без ограничений, "
  "на главной «coming soon» и «lorem ipsum». «После» — те же маршруты и тот же "
  "продукт, но прод-конфигурация: TLS с валидной цепочкой и HSTS, полный набор "
  "заголовков, Basic-auth перед админкой, чистый клиентский код.", "lead")

add_chart(FIG("fig3_twins.png"),
          "Рис. 3. Число сработавших проверок по категориям: FreshBite до лечения (D, 0/100) "
          "и FreshBite hardened (A, 100/100)",
          max_h=240)

add_table(
    ["Проверка", "FreshBite «до»", "Эталон «после»"],
    [
        ["Файл .env доступен из сети", "fail · критично (−40)", "pass — 404"],
        ["Папка .git доступна из сети", "fail · критично (−35)", "pass — 404"],
        ["Секреты в клиентском коде", "fail · критично (−40)", "pass — чистый бандл"],
        ["BaaS-база открыта на чтение", "pass", "pass"],
        ["Source maps", "pass", "pass — не публикуем"],
        ["Защитные заголовки", "warn (−16)", "pass — CSP, HSTS, nosniff, frame-ancestors"],
        ["CORS для любого источника", "warn (−8)", "pass — заголовков CORS нет"],
        ["Cookie без флагов", "warn (−6)", "pass — HttpOnly, Secure, SameSite=Strict"],
        ["HTTPS / TLS", "fail · high (−15)", "pass — сертификат, 900 дней"],
        ["Админка без защиты", "warn (−15)", "pass — 401, Basic-auth"],
        ["Бэкапы по прямой ссылке", "fail · критично (−40)", "pass — 404"],
        ["Debug-эндпоинты", "warn (−8)", "pass — 401, за авторизацией"],
        ["Заглушки на страницах", "warn (−4)", "pass — живой контент"],
        ["Ошибки в разметке", "warn (−5)", "pass"],
        ["Битые внутренние ссылки", "fail (−8)", "pass — все разделы живы"],
        ["Meta-теги", "warn (−3)", "pass — title и description"],
    ],
    [0.34, 0.33, 0.33],
    "Табл. 3. Матрица «до/после»: все 16 проверок, штрафы и что именно изменилось",
)

p("Итоговая дистанция: 0 против 100 баллов, D против A. Важно, что между состояниями "
  "нет ни одной строчки нового бизнес-кода: та же логика, те же маршруты, тот же "
  "продукт. Изменились сертификат, заголовки, флаги cookie, права на служебные пути "
  "и дисциплина сборки. По нашей оценке это вечер работы для одного человека или "
  "одна итерация автоматического фикса, который мы готовим для Pro-тарифа.")

p("Для рынка это главный вывод выпуска: типичное vibe-coded приложение не обречено "
  "на класс D — оно просто ещё не прошло техосмотр. Порог входа в класс A находится "
  "не в инженерных знаниях, а в списке из шестнадцати пунктов, которые можно "
  "проверять автоматически. Смысл «техосмотра» ровно в этом: превратить невидимую "
  "ответственность в видимый чек-лист.")

# ==================================================================
# 5. Самопроверка AppMOT
# ==================================================================
h1(5, "Самопроверка AppMOT: C, 62 из 100")

p("Мы просканировали собственный лендинг — dev-инстанс, на котором работаем каждый "
  "день. Оценка: C, 62 балла. Разбор без скидок:", "lead")

bullets([
    "<b>Нет HTTPS (−15).</b> dev-сервер слушает http: весь трафик ходит открытым текстом. В проде за прокси с TLS это уходит первым.",
    "<b>Нет защитных заголовков (−16).</b> Ни CSP, ни nosniff, ни frame-ancestors — тот же пункт, что у 7 целей из 12 в разделе 3.",
    "<b>Dev source maps (−3).</b> Карты исходников доступны в разработке; в проде Chromium их не публикует.",
    "<b>«lorem ipsum» (−4).</b> Наш любимый: на лендинге есть раздел «Заглушки и lorem ipsum» — список того, что мы ищем. Сканер честно нашёл заглушку в описании поиска заглушек.",
])

p("Мы намеренно не подгоняли результат. C — честная оценка типичного dev-инстанса: "
  "три из четырёх замечаний закрываются прод-деплоем с TLS и заголовками ещё до "
  "первого пользователя, и это отчасти сама мораль выпуска — половина «плохих» "
  "оценок в дикой природе ставится приложениям, которые просто ещё не доехали до "
  "продакшена. Когда AppMOT переедет в прод за прокси с TLS, мы опубликуем "
  "повторную самопроверку в выпуске №2 — вместе с бейджем, как у всех.")

p("Сканер, поймавший сам себя, — это не курьёз, а рабочий момент дисциплины: "
  "автоматическая оценка работает только тогда, когда ей не делают исключений. "
  "Мы не стали исключать и «lorem ipsum»: правильное уточнение правила — "
  "контекстный фильтр для описаний проверок, а не точечное исключение для себя "
  "любимых. Оно уже в плане v0.2.")

# ==================================================================
# 6. Методология, точность и этика
# ==================================================================
h1(6, "Методология, точность и этика")

h2("Известные режимы ложных срабатываний")

p("Сканер v0.1 — набор эвристик по внешним признакам, и у него есть честно "
  "задокументированные слепые зоны. В этом выпуске мы нашли три:", "lead")

add_table(
    ["Цель", "Что увидел сканер", "Вероятная причина", "Что делаем"],
    [
        ["netlify.com, mistral.ai",
         "«секреты в клиентском коде»: строки вида sk-… в HTML и бандлах",
         "примеры и фрагменты документации в маркетинге совпадают с сигнатурами живых ключей",
         "энтропийный порог и контекст-фильтры в v0.2; до верификации находка остаётся в оценке"],
        ["huggingface.co",
         "«админка доступна»: /admin и /wp-admin/ отвечают 200",
         "catch-all роутинг: любой путь возвращает страницу сущности, а не 404",
         "детектор soft-404 в v0.2: сравнение тела ответа с телом главной и 404"],
        ["AppMOT (мы сами)",
         "«заглушки»: «lorem ipsum» на лендинге",
         "упоминание искомого паттерна в описании самой проверки",
         "исключать вхождения внутри описаний проверок и тегов code, а не руками"],
    ],
    [0.18, 0.28, 0.30, 0.24],
    "Табл. 4. Ложные срабатывания выпуска №1 и план уточнения",
)

h2("План v0.2")

bullets([
    "Контекст-фильтр для сигнатур секретов: игнорировать вхождения внутри кодовых примеров, документации и описаний самих проверок.",
    "Энтропийный порог: строка должна выглядеть как сгенерированный ключ, а не как слово из маркетинга.",
    "Детектор soft-404: статус 200 с телом главной страницы не считается «страница существует».",
    "Публичный реестр находок с ручной верификацией по имени: спорные случаи проверяет человек до публикации.",
])

h2("Этика публикации")

p("Правило выпуска простое: <b>агрегаты публикуем сразу, имена — только после "
  "ручной верификации и уведомления вендора.</b> Соревновательный рынок безопасности "
  "стимулирует публиковать чужие провалы громко и быстро; мы идём другим путём, "
  "потому что продукт продаёт доверие, а не страх. Найденная и подтверждённая "
  "проблема сообщается владельцу до публикации; отказ от публикации по запросу "
  "вендора фиксируется в реестре открыто. Сканер ходит только по публичным "
  "страницам, не эксплуатирует найденное, поддерживает щадящую нагрузку и opt-out "
  "по письму — этот же регламент описан в юридическом разделе спецификации MVP.")

# ==================================================================
# 7. Выводы и следующие шаги
# ==================================================================
h1(7, "Выводы и следующие шаги")

p("Выпуск №1 фиксирует три вещи. Рынок: гигиена веб-слоя проседает даже у сильных "
  "игроков — больше половины панели без полного набора заголовков, и только четыре "
  "платформы из девяти в классе A. Продукт: дистанция между D и A — часы "
  "конфигурации, а не месяцы инженерии; кейс FreshBite прошёл её без единой новой "
  "строчки бизнес-кода. Дисциплина: автоматической оценке нужна ручная верификация "
  "по именам и открытый реестр собственных ошибок — иначе оценка сама превращается "
  "в вайб.", "lead")

p("Что дальше. Выпуск №2 (декабрь 2026) расширит панель до 25–30 целей, добавит "
  "категорию «реальные vibe-coded приложения» с согласия их авторов и опубликует "
  "первый публичный срез уже с верифицированными находками. Параллельно выходит "
  "сканер v0.2 с контекст-фильтрами и детектором soft-404, а Pro-тариф получает "
  "автофикс топ-3 проблем из этого выпуска: заголовки, cookie-флаги и скрытие "
  "source maps — всё, что чинится конфигом, будет чиниться одним нажатием.")

p("Если вы собираете приложения с помощью ИИ — пришлите нам URL. Первый техосмотр "
  "бесплатный, отчёт приходит минутой позже, а класс A — это вопрос одного вечера "
  "из списка выше. Проверим и вас, и нас: следующая самопроверка AppMOT выйдет в "
  "выпуске №2 — уже из продакшена.")

# ==================================================================
# Build
# ==================================================================
doc = TocDocTemplate(
    BODY_PDF,
    pagesize=A4,
    leftMargin=MARGIN, rightMargin=MARGIN,
    topMargin=MARGIN, bottomMargin=MARGIN,
    title=DOC_TITLE,
    author="Z.ai",
    creator="Z.ai",
    subject="Бенчмарк-отчёт: состояние безопасности vibe-coded приложений, выпуск 1",
)
doc.multiBuild(story, onFirstPage=on_page, onLaterPages=on_page)
print("body built:", BODY_PDF)
