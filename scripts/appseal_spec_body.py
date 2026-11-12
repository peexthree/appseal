#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""AppSeal MVP spec — body PDF (ReportLab, Russian, Template 07 Crystal Blue body palette)."""
import os
import sys
import hashlib

HERE = os.path.dirname(os.path.abspath(__file__))

# optional: skill assets dir via env (unused by default; reportlab does the work)
PDF_SKILL_DIR = os.environ.get("APPSEAL_PDF_SKILL_DIR", "")
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

# ------------------------------------------------------------------
# Page geometry
# ------------------------------------------------------------------
MARGIN = 0.9 * inch
PAGE_W, PAGE_H = A4
AVAIL_W = PAGE_W - 2 * MARGIN
AVAIL_H = PAGE_H - 2 * MARGIN
H1_THRESHOLD = AVAIL_H * 0.25
MAX_KEEP_HEIGHT = PAGE_H * 0.4

OUT_DIR = os.path.join(HERE, "pdf_assets")
BODY_PDF = os.path.join(OUT_DIR, "body.pdf")

DOC_TITLE = "AppSeal — техосмотр для приложений, собранных с ИИ"

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
                             spaceAfter=5)
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
            self.notify("TOCEntry", (level, text, self.page, key))


def on_page(canvas, doc):
    canvas.saveState()
    # header: doc title + accent rule
    canvas.setFont("FreeSerif", 7.5)
    canvas.setFillColor(TEXT_MUTED)
    canvas.drawString(MARGIN, PAGE_H - 0.55 * inch, DOC_TITLE)
    canvas.setStrokeColor(ACCENT)
    canvas.setLineWidth(1.2)
    canvas.line(MARGIN, PAGE_H - 0.62 * inch, PAGE_W - MARGIN, PAGE_H - 0.62 * inch)
    # footer: author + page number (TOC page = i, body arabic resets to 1)
    canvas.setStrokeColor(BORDER)
    canvas.setLineWidth(0.6)
    canvas.line(MARGIN, 0.62 * inch, PAGE_W - MARGIN, 0.62 * inch)
    canvas.setFont("FreeSerif", 7.5)
    canvas.setFillColor(TEXT_MUTED)
    canvas.drawString(MARGIN, 0.45 * inch, "AppSeal · MVP v1.0 · ноябрь 2026")
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
    key = "h_" + hashlib.sha256(text.encode()).hexdigest()[:8]
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
        data.append([c if isinstance(c, (Paragraph, Image)) else Paragraph(str(c), S["cell"]) for c in row])
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


def callout(big, label):
    c = Table([[Paragraph(f"<b>{big}</b>", S["stat"])], [Paragraph(label, S["statL"])]],
              colWidths=[190])
    c.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), CARD_BG),
        ("BOX", (0, 0), (-1, -1), 1, ACCENT),
        ("TOPPADDING", (0, 0), (-1, 0), 10),
        ("BOTTOMPADDING", (0, 1), (-1, 1), 10),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    return c


def code_block(lines):
    rows = [[Paragraph(ln.replace(" ", " "), S["code"])] for ln in lines]
    t = Table(rows, colWidths=[AVAIL_W * 0.92], hAlign="CENTER")
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), SECTION_BG),
        ("LINEBEFORE", (0, 0), (0, -1), 2.2, ACCENT),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 2.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5),
    ]))
    return t


# ==================================================================
# TOC page
# ==================================================================
story.append(Paragraph("<b>Содержание</b>", S["tocTitle"]))
toc = TableOfContents()
toc.levelStyles = [S["toc0"], S["toc1"]]
story.append(toc)
story.append(PageBreak())

# ==================================================================
# 1. Проблема и окно возможностей
# ==================================================================
h1(1, "Проблема и окно возможностей")

p("За 2025–2026 годы создание программного обеспечения перестало быть узким местом. "
  "Инструменты вайб-кодинга — Lovable, Replit, Bolt.new, v0, Base44 — позволили человеку без "
  "инженерного образования собрать работающее приложение за вечер по описанию на естественном "
  "языке. Результат налицо: только за первое полугодие 2026 года в App Store и Google Play вышло "
  "около 1,3 млн новых приложений, значительная часть которых создана людьми, впервые написавшими "
  "софт в жизни. Производственный цикл «идея → прототип → публикация» сжался с месяцев до дней.", "lead")

p("Но за скорость генерации не успели ни проверка, ни сопровождение. Бенчмарк Veracode 2026 года по "
  "более чем сотне языковых моделей показывает: 45% сгенерированного ИИ кода не проходит тесты "
  "безопасности, и этот показатель практически не меняется четыре года подряд. Внутреннее "
  "исследование ICSE-SEIP'26 фиксирует, что 68% вайб-кодеров описывают собственный код как "
  "«быстрый, но дырявый», а 36% вообще пропускают этап контроля качества. Массовый скан более "
  "380 000 публичных приложений, опубликованный на платформах Lovable, Replit, Base44 и Netlify, "
  "обнаружил утечку чувствительных данных примерно в 40% случаев.")

add_chart(os.path.join(OUT_DIR, "chart_problem.png"),
          "Рис. 1. Качество и доверие к ИИ-сгенерированному коду по данным независимых исследований 2026 года")

p("Классические вендоры безопасности (Snyk, Veracode, Sonar) продают сложные корпоративные "
  "платформы командам с CI/CD и выделенными инженерами. Новая аудитория — учитель, собравший "
  "сервис записи на приём, маркетолог с лид-магнитом, соло-фаундер микросервиса — у них просто "
  "не покупает: у неё нет ни бюджета на SAST-платформу, ни специалиста, который её настроит. "
  "Возникла структурная дыра: софта стало больше, чем когда-либо, а инструмента доверия для "
  "его длинного хвоста не существует.")

story.append(Spacer(1, 6))
row = Table([[callout("45%", "кода ИИ не проходит security-тесты"),
              callout("40%", "вайб-кодед приложений сливают данные"),
              callout("12–24 мес", "окно до выхода гигантов в нишу")]],
            colWidths=[AVAIL_W / 3] * 3, hAlign="CENTER")
row.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                         ("ALIGN", (0, 0), (-1, -1), "CENTER")]))
story.append(row)
story.append(Spacer(1, 12))

p("Отсюда тезис, на котором строится весь продукт: когда создание обесценилось, ценность переехала "
  "на этап «после создания» — доверие, отбор, сопровождение и ответственность. AppSeal занимает "
  "именно эту позицию. Окно возможностей ограничено: как только категория станет очевидной, её "
  "смогут закрыть платформы-конструкторы (но им мешает конфликт интересов) или корпоративные "
  "вендоры (но им мешает цена и канал продаж). Первые 12–24 месяца — период, когда независимый "
  "игрок может стать стандартом де-факто, как это произошло с SSL-замком и звёздными рейтингами.")

# ==================================================================
# 2. Продукт
# ==================================================================
h1(2, "Продукт: как работает AppSeal")

p("AppSeal — «техосмотр» для приложений, собранных с помощью ИИ. Пользователь вводит адрес живого "
  "сайта; внешний, черноящичный движок за 20–40 секунд прогоняет 16 автоматических проверок по "
  "четырём категориям и выдаёт оценку A–D, объяснение каждой проблемы человеческим языком, "
  "доказательства (что именно было найдено и где) и бейдж, который можно вставить на сайт. "
  "Ничего не нужно устанавливать, доступ к коду не нужен — скан видит ровно то, что видит любой "
  "посетитель браузера.")

h2("2.1. Три шага пользователя")
bullets([
    "<b>Ввод адреса.</b> Единственное, что нужно от пользователя — публичный URL приложения. "
    "Регистрация отложена до момента, когда человек захочет сохранить отчёт или получить бейдж.",
    "<b>Скан.</b> Движок загружает главную страницу и клиентские скрипты, проверяет общедоступные "
    "пути (.env, .git, админки, бэкапы), заголовки ответов, TLS-сертификат, CORS, признаки "
    "брошенного проекта. Прогресс отображается в реальном времени.",
    "<b>Отчёт и действия.</b> Оценка A–D с кольцевым индикатором, сгруппированные находки с "
    "доказательствами, скачиваемый PDF и код бейджа. Каждый проваленный пункт сформулирован так, "
    "чтобы его можно было отдать ИИ-агенту на исправление в той же вайб-кодинг-сессии.",
])

h2("2.2. Оценка A–D")
p("Итоговый балл начинается со 100 и уменьшается на вес каждой проблемы: критическая — до 40 "
  "пунктов, высокая — до 25, средняя — до 8, низкая — до 5. Действуют потолки: любая критическая "
  "находка ограничивает оценку значением 44 (диапазон D), высокая — значением 74 (максимум B). "
  "Границы оценок: A — от 85, B — от 70, C — от 45, D — ниже. Механика повторяет логику "
  "SSL Labs: простая буква, за которой просматривается воспроизводимая методика.")

h2("2.3. Бейдж доверия")
p("Бейдж — вирусный контур продукта. SVG-изображение с оценкой и датой скана вставляется на "
  "лендинг приложения и кликается через к актуальному отчёту. Каждое приложение, повесившее "
  "бейдж, рекламирует AppSeal; каждая оценка в дикой природе повышает узнаваемость категории. "
  "Позже бейджи образуют публичный реестр — каталог проверенных приложений, который становится "
  "естественным местом «отбора» в затопленном рынке.")

h2("2.4. Демо-режим")
p("Для мгновенной демонстрации ценности в продукт встроен скан намеренно дырявого демо-приложения "
  "(отдельный мини-сервис на порту 3210): открытые .env и .git, ключи API в клиентском коде, "
  "панель администратора без защиты, бэкап базы по прямой ссылке, заглушки и ошибки в разметке. "
  "Демо-скан стабильно показывает оценку D с шестью провалами и восемью предупреждениями — "
  "идеальный первый показ для потенциального пользователя или инвестора.")

# ==================================================================
# 3. Рынок, конкуренты и ров
# ==================================================================
h1(3, "Рынок, конкуренты и ров")

h2("3.1. Оценка объёма рынка")
p("Точные цифры здесь — предмет отдельного исследования, поэтому приводим консервативную воронку "
  "оценок (данные о длине хвоста — из отчётов платформ и App Store; конверсии — оценочные):")

add_table(
    ["Сегмент", "Оценка объёма", "Комментарий"],
    [
        ["Вайб-кодеры, запустившие живое приложение (мир)", "5–10 млн человек",
         "платформы-конструкторы отчитываются о десятках миллионов проектов; живых — существенно меньше"],
        ["Приложения с реальными пользователями/деньгами", "1,5–3 млн",
         "нижняя граница длинного хвоста микрософта"],
        ["Платящая аудитория при конверсии 2–4% и ARPU $15–19/мес", "$60–140 млн ARR",
         "только подписки Pro; tier Platform и страховка — сверх этого"],
    ],
    [0.34, 0.22, 0.44],
    "Табл. 1. Оценка TAM/SAM/SOM (эстиматы, консервативный сценарий)",
)

h2("3.2. Конкурентное поле")
add_table(
    ["Игрок", "Что делает", "Почему не закрывает нишу"],
    [
        ["Snyk, Veracode, Sonar", "корпоративный SAST/SCA, интеграция с CI/CD, продажа инженерным командам",
         "цена и сложность; у вайб-кодера нет ни CI/CD, ни инженера; сегмент не окупает их модель продаж"],
        ["Vanta, Drata", "автоматизация комплаенса SOC 2 / ISO 27001 для B2B SaaS",
         "комплаенс начинается от $5k/год и адресован компаниям с корпоративными заказчиками, а не микроприложениям"],
        ["Lovable, Replit, Base44", "платформы, на которых собирают приложения; добавляют базовые security-фичи",
         "конфликт интересов: монетизируют объём публикаций, а не их качество; знак качества от автора багги-кода не работает"],
        ["Сканеры SSL Labs / SecurityHeaders", "точечные бесплатные проверки одного аспекта",
         "нет интегральной оценки, нет отчёта для неспециалиста, нет бейджа и мониторинга; это функции, а не продукт"],
    ],
    [0.20, 0.38, 0.42],
    "Табл. 2. Конкуренты и структурные причины, по которым ниша остаётся свободной",
)

h2("3.3. Ров")
p("Защитность AppSeal строится на трёх слоях. <b>Нейтральность:</b> независимая третья сторона, не "
  "зарабатывающая на генерации кода, — единственный, кому можно доверить знак качества; это "
  "позиция, недоступная платформам в принципе. <b>Данные:</b> каждый скан пополняет датасет "
  "«платформа × типовые ошибки» — публичный рейтинг платформ по безопасности их сборок становится "
  "цитируемым активом и бесплатным PR-мотором. <b>Сетевой эффект бейджа:</b> чем больше сайтов "
  "носят бейдж, тем выше доверие к нему и тем дороже отказ платформам-конструкторам от "
  "white-label интеграции.")

# ==================================================================
# 4. Архитектура MVP
# ==================================================================
h1(4, "Архитектура MVP")

p("MVP собран как один Next.js 16 (App Router, TypeScript) проект: клиентский интерфейс, "
  "API-роуты и движок сканера живут в одном приложении, что позволяет запуститься силами одного "
  "разработчика и упростить деплой. Движок полностью асинхронный: POST-запрос создаёт запись "
  "скана и запускает работу в фоне, клиент опрашивает статус — поэтому долгие проверки не "
  "блокируют соединение и масштабируются горизонтально.")

add_chart(os.path.join(OUT_DIR, "diagram.png"),
          "Рис. 2. Компоненты MVP и поток данных: UI → API-роуты → движок → цели скана", max_h=230)

h2("4.1. Принципы движка")
bullets([
    "<b>Черный ящик.</b> Только внешние HTTP-запросы, никаких эксплойтов и агрессивных техник: "
    "то же, что делает любой посетитель сайта за пять минут ручной проверки.",
    "<b>Ограниченный бюджет.</b> Таймауты 5–12 секунд на запрос, не более 600 КБ на ответ, "
    "конкурентность 4, суммарно ~40 запросов на скан; нагрузка на цель сопоставима с одним "
    "нетерпеливым посетителем.",
    "<b>Без хранения секретов.</b> Найденные ключи маскируются до записи в отчёт; полные значения "
    "не сохраняются и не показываются даже владельцу.",
    "<b>Локализуемость.</b> Каждая проверка возвращает объяснения сразу на двух языках (RU/EN) — "
    "отчёт генерируется на языке интерфейса пользователя.",
])

add_table(
    ["Компонент", "Технология", "Назначение и путь в коде"],
    [
        ["Интерфейс", "Next.js 16, React 19, Tailwind 4, shadcn/ui",
         "лендинг, ввод URL, прогресс, отчёт — src/app/page.tsx, src/components/report-view.tsx"],
        ["API-роуты", "Route Handlers (Node runtime)",
         "POST /api/scan, GET /api/scan/[id], GET /api/badge, GET /api/report — src/app/api/"],
        ["Движок сканера", "TypeScript, fetch + node:tls",
         "16 проверок в 4 модулях, оркестратор, грейдер — src/lib/scanner/"],
        ["Хранилище", "JSON-файл на скан",
         "db/scans/*.json; при росте заменяется на Postgres/Redis без изменения контракта"],
        ["PDF-генератор", "pdf-lib + fontkit, DejaVu",
         "двухстраничный отчёт с кириллицей — src/lib/scanner/report-pdf.ts"],
        ["Демо-цель", "bun mini-service :3210",
         "намеренно дырявое приложение для демонстрации — mini-services/demo-app/"],
    ],
    [0.18, 0.30, 0.52],
    "Табл. 3. Состав MVP и соответствие файлам репозитория",
)

p("Осознанные ограничения MVP: очередь сканов в памяти одного процесса, отсутствие аккаунтов и "
  "биллинга, ручной запуск демо-сервиса. Все три точки спроектированы как сменные модули — "
  "контракт API и формат записи скана не меняются при переходе на Postgres и платёжный шлюз.", "body")

# ==================================================================
# 5. Каталог проверок
# ==================================================================
h1(5, "Каталог проверок движка v1")

p("Шестнадцать проверок сгруппированы в четыре категории, выбранные по данным реальных сканов "
  "вайб-кодед приложений: они покрывают и самые дорогие ошибки (утечка ключей, открытая база), и "
  "самые частые признаки недостроенности (заглушки, битые ссылки). Вес в скобках — вычитаемые "
  "баллы при провале; «warn» означает частичное нарушение и пропорциональное снижение.")

add_table(
    ["ID", "Проверка", "Метод", "Сев."],
    [
        ["env_exposure", "Файл .env доступен из сети", "GET /.env, /.env.local, /.env.* и разбор содержимого", "crit · 40"],
        ["git_exposure", "Каталог .git скачивается", "GET /.git/HEAD, поиск «ref: refs/»", "crit · 35"],
        ["secrets_in_source", "Ключи API в HTML и JS-бандлах", "загрузка до 6 бандлов, сигнатуры OpenAI/AWS/Stripe/Google/SendGrid, приватные ключи, generic-паттерн", "crit · 40"],
        ["baas_open_read", "Firebase/Supabase читается анонимно", "извлечение projectId из JS, GET /.json у RTDB, REST Supabase", "crit · 35"],
        ["source_maps", "Source maps в продакшене", "HEAD на *.js.map у подключенных бандлов", "low · 3"],
        ["security_headers", "CSP, HSTS, X-Frame-Options и др.", "разбор заголовков главного ответа", "med · до 19"],
        ["cors_wildcard", "CORS открыт для любого Origin", "запрос с Origin evil.example, разбор ACAO/ACAC", "med–high · 8–15"],
        ["cookie_flags", "Cookie без HttpOnly/Secure/SameSite", "разбор Set-Cookie главного ответа", "med · до 9"],
        ["tls_cert", "Сертификат истёк / истекает / нет HTTPS", "TLS-рукопожатие (node:tls), срок действия в днях", "crit–high · 15–35"],
        ["admin_exposure", "Админ-панель на стандартных путях", "GET /admin, /wp-admin, /dashboard и др.; маркеры панелей", "high · 15"],
        ["backup_files", "Дампы БД и бэкапы по прямым ссылкам", "GET /backup.zip, /dump.sql, /db.sqlite3 и др., контроль размера", "crit · 40"],
        ["debug_endpoints", "Отладочные эндпоинты отвечают", "GET /api/debug, /debug/vars, /actuator/env, JSON-ответ", "med · 8"],
        ["placeholder_content", "Заглушки (lorem ipsum, Coming soon)", "паттерны по разметке главной", "low · 4"],
        ["rendered_errors", "«undefined»/«NaN» в разметке", "очистка script/style, поиск артефактов", "low · 5"],
        ["broken_links", "Битые внутренние ссылки", "извлечение до 8 ссылок, HEAD с fallback GET", "med · 8"],
        ["meta_health", "Пустые title/description", "разбор head главной страницы", "low · 3"],
    ],
    [0.185, 0.27, 0.40, 0.145],
    "Табл. 4. Каталог проверок v1: 16 пунктов, четыре категории, веса для итогового балла",
)

p("Проверка платформы-конструктора (Lovable, Replit, Bolt, Framer, v0/Vercel, Base44) выполняется "
  "в каждом скане как информационная: она питает будущий рейтинг платформ и не влияет на оценку.")

# ==================================================================
# 6. API-спецификация
# ==================================================================
h1(6, "API-спецификация")

p("Контракт минималистичен и уже реализован в MVP; он же станет основой Platform-тарифа. Все "
  "ответы — JSON, кроме бейджа (SVG) и отчёта (PDF). Аутентификация в MVP отсутствует, в "
  "продакшене — Bearer-токен и rate limit на IP/токен.")

add_table(
    ["Метод и путь", "Назначение", "Ответ"],
    [
        ["POST /api/scan", "старт скана: {url, lang: ru|en}", "{id} — идентификатор для опроса"],
        ["GET /api/scan/{id}", "статус и результат: прогресс, стадия, затем оценка, находки с доказательствами", "ScanResult JSON"],
        ["GET /api/badge?id={id}", "SVG-бейдж с оценкой; theme=light|dark", "image/svg+xml, кэш 5 минут"],
        ["GET /api/report?id={id}", "PDF-отчёт на языке скана", "application/pdf, вложение"],
    ],
    [0.26, 0.42, 0.32],
    "Табл. 5. Эндпоинты MVP",
)

story.append(Spacer(1, 4))
story.append(code_block([
    "$ curl -s -X POST localhost:3000/api/scan \\",
    "    -H 'content-type: application/json' \\",
    "    -d '{\"url\": \"demo://app\", \"lang\": \"ru\"}'",
    "{\"id\": \"mwcgym4s-7l7ou6\"}",
    "",
    "# через 15–40 секунд:",
    "$ curl -s localhost:3000/api/scan/mwcgym4s-7l7ou6 | jq '{status, grade, score}'",
    "{\"status\": \"done\", \"grade\": \"D\", \"score\": 0}",
]))
story.append(Spacer(1, 10))

p("Поля результата спроектированы под три потребителя: человек (title/detail на двух языках, "
  "группировка по категориям), ИИ-агент (стабильные id проверок, машинные коды находок, "
  "доказательства в текстовом виде — достаточные для автофикса) и будущий реестр бейджей "
  "(host, score, grade, timestamp). Это позволит позже открывать API для платформ без ломающих "
  "изменений.")

# ==================================================================
# 7. Юнит-экономика
# ==================================================================
h1(7, "Юнит-экономика")

h2("7.1. Тарифная сетка")
add_table(
    ["Тариф", "Цена", "Что входит", "Роль в воронке"],
    [
        ["Free", "$0", "1 полный скан в день, оценка, отчёт, бейдж, PDF",
         "активация категории, вирусный контур бейджа"],
        ["Pro", "$19/мес", "безлимит сканов, недельный мониторинг, автоперепроверка после релиза, бейдж со свежей датой",
         "основная выручка; отвечает страху «мой проект заброшен и протух»"],
        ["Platform", "от $499/мес", "API, white-label бейджи, массовый скан каталога, SLA",
         "продажа платформам-конструкторам и хостингам; 2–3 контракта закрывают годовой runway"],
    ],
    [0.13, 0.14, 0.43, 0.30],
    "Табл. 6. Тарифы (цены — гипотеза для тестирования, валюта USD)",
)

h2("7.2. Экономика скана и подписчика (оценки)")
p("Серверная стоимость одного скана складывается из вычислений (20–40 HTTP-запросов, до 3 МБ "
  "трафика, 20–40 секунд CPU-времени с ожиданиями по таймаутам) и оценивается в $0,01–0,02 при "
  "запуске на одной VPS за $40–60/мес; после перехода на бессерверные воркеры — в пределах "
  "$0,03. Даже при безлимитном Pro тарифе активный пользователь генерирует в среднем 15–25 сканов "
  "в месяц, то есть маржинальная стоимость обслуживания Pro-подписчика — около $0,30–0,50 в месяц "
  "против $19 выручки. Стоимость привлечения через контент-луп (публичные отчёты-рейтинги, "
  "бейджи, SEO) на старте близка к нулю в деньгах, но требует 10–15 часов контент-работы в "
  "неделю; платный канал допустим при CAC не выше $40–45, что даёт LTV/CAC не хуже 3 при "
  "годовом удержании Pro около 60%. Все цифры — эстиматы для проверки на первых 100 клиентах.")

add_chart(os.path.join(OUT_DIR, "chart_mrr.png"),
          "Рис. 3. Прогноз MRR на 12 месяцев (модель: запуск платных подписок в мес. 3, +60 Pro/мес, "
          "2 контракта Platform с мес. 8–10; все допущения — эстиматы)", max_h=215)

p("Модель на рис. 3 консервативна: она не включает разовые отчёты-аудиты для агентств ($150–300 "
  "за шт., отдельная продуктовая гипотеза) и эффект вирусного бейджа. Ключевое допущение — "
  "темп +60 Pro в месяц; его реалистичность проверяется на этапе 90-дневного плана (глава 8). "
  "Точка безубыточности по постоянным расходам (~$500/мес: VPS, домены, почта, мониторинг) "
  "достигается на 25–30 Pro-подписках.")

# ==================================================================
# 8. План 90 дней
# ==================================================================
h1(8, "План первых 90 дней")

p("План устроен по принципу «каждая неделя производит проверяемый артефакт». Успех этапа "
  "определяется не количеством фич, а первыми подписками: цель 90 дней — 20–30 Pro-подписчиков "
  "и один пилюльный кейс с публичным рейтингом платформ.")

add_table(
    ["Недели", "Фокус", "Результат на выходе"],
    [
        ["1–2", "доводка движка и UI MVP",
         "стабильные 16 проверок, полировка отчёта, обработка ошибок сети, деплой на домен"],
        ["3–4", "публичный отчёт-рейтинг №1",
         "скан 300–500 приложений из публичных галерей платформ; публикация «State of Vibe-Coded App Security»; PR-рассылка"],
        ["5–6", "запуск на сообщества",
         "Show HN, Product Hunt, сабреддиты r/SideProject и r/vibecoding; сбор первых 500 Free-пользователей"],
        ["7–8", "бейдж и ретеншн",
         "витрина бейджей, еженедельные письма «что изменилось в вашем приложении», метрики D7"],
        ["9–10", "включение биллинга Pro",
         "Stripe, лимиты Free, Early-bird $9/мес для первых 100; цель — первые 10 платящих"],
        ["11–13", "исходящие для Platform",
         "питч 20 платформам-конструкторам и хостингам с данными рейтинга; цель — 1 пилот white-label"],
    ],
    [0.12, 0.26, 0.62],
    "Табл. 7. 90-дневный план запуска",
)

p("Главный риск плана — застрять в разработке. Поэтому недели 3–4 intentionally переносят фокус с "
  "кода на данные: публичный отчёт является одновременно и маркетингом, и валидацией спроса — "
  "по количеству переходов с отчёта на сканы видно, конвертирует ли тема.")

# ==================================================================
# 9. Roadmap 12 месяцев
# ==================================================================
h1(9, "Дорожная карта на 12 месяцев")

p("Эволюция продукта движется от «одноразового осмотру» к «непрерывному доверию» — каждый этап "
  "монетизируется независимо и расширяет ров предыдущего.")

add_table(
    ["Период", "Этап", "Что появляется", "Метрика успеха"],
    [
        ["Мес 1–3", "Техосмотр", "скан по URL, оценка A–D, PDF, бейдж, Free/Pro",
         "1 000 сканов, 20–30 Pro"],
        ["Мес 4–6", "Мониторинг", "еженедельные перепроверки, письма об изменениях, история оценок",
         "отток Pro ниже 5%/мес"],
        ["Мес 7–8", "Автофикс-агент", "готовые патчи для типовых провалов: заголовки, правила Firebase, .env",
         "30% провалов закрываются одним кликом"],
        ["Мес 9–10", "Реестр бейджей", "публичный каталог проверенных приложений, страница платформы в рейтинге",
         "5 000 живых бейджей"],
        ["Мес 11–12", "Страховая обвязка", "гарантия «если протекло аттестованное приложение — платим мы» со страховым партнёром",
         "подписан пилот со страховщиком/брокером"],
    ],
    [0.13, 0.18, 0.45, 0.24],
    "Табл. 8. Дорожная карта: бейдж → мониторинг → автофикс → реестр → страховка → API для платформ",
)

p("Страховой этап — стратегическая вершина: он превращает оценку AppSeal из справки в финансовый "
  "инструмент и создаёт эффект Vanta-модели, когда аттестация оплачивает себя экономией на "
  "премии. Параллельно с месяца 9 открывается Platform API: контракты с платформами дают "
  "многократный скачок объёма сканов и данных без роста CAC.")

# ==================================================================
# 10. Риски
# ==================================================================
h1(10, "Риски и митигации")

add_table(
    ["Риск", "Вероятность", "Митигация"],
    [
        ["Платформа-конструктор выпускает встроенный «trust score»", "средняя",
         "нейтральность: оценка от вендора генерации не воспринимается как независимая; фокус на кросс-платформенности и реестре"],
        ["Юридические претензии за сканирование сайтов", "низкая",
         "только публичные страницы, щадящая нагрузка, robots-этика, прозрачный юзер-агент, opt-out по письму"],
        ["Найденные секреты становятся источником утечки через сам сервис", "средняя",
         "маскирование до записи, без хранения полных значений, шифрование хранилища, короткий ретеншн"],
        ["Низкая платёжеспособность аудитории", "средняя",
         "сдвиг выручки в Platform-контракты и страховку; Free-тариф остаётся маркетингом, а не бизнесом"],
        ["Ложные срабатывания подрывают доверие к оценке", "средняя",
         "режим «подтверди находку» с ручной проверкой спорных кейсов, публикация методики каждой проверки"],
        ["Окно закрывается быстрее 12 месяцев", "низкая",
         "скорость: публичные данные и бейдж-сеть нельзя воспроизвести за квартал; при необходимости — M&A-исход"],
    ],
    [0.30, 0.14, 0.56],
    "Табл. 9. Реестр рисков MVP",
)

p("Итог: MVP уже реализован и проверен на живых сайтах и демо-цели; всё перечисленное выше — "
  "не теория, а описание работающего прототипа и план его превращения в бизнес. Следующий "
  "шаг — недели 3–4 плана: публичный отчёт-рейтинг, который за один ход даёт данные, прессу "
  "и первый поток пользователей.")

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
    subject="MVP: концепция, спецификация, юнит-экономика, план запуска",
)
doc.multiBuild(story, onFirstPage=on_page, onLaterPages=on_page)
print("body built:", BODY_PDF)
