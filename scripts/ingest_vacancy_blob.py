# -*- coding: utf-8 -*-
"""Parse vacancy draft (JSON or labeled text) and append a row to ПОТРЕБНОСТЬ1.

Usage:
  python scripts/ingest_vacancy_blob.py path/to/draft.json --dry-run
  python scripts/ingest_vacancy_blob.py path/to/draft.json --write
  python scripts/ingest_vacancy_blob.py --text-file blob.txt --dry-run

Draft JSON keys = sheet column headers (partial OK). Extra keys ignored.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

from google.oauth2 import service_account
from googleapiclient.discovery import build

sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parents[1]
cfg = json.loads((ROOT / "sheets-config.json").read_text(encoding="utf-8"))
SA = ROOT / "secrets" / "google-service-account.json"

# Defaults from project rules (chat Jul 31)
DEFAULTS = {
    "от": "18",
    "ОТ": "30",
    "График вахты": "6/1, 7/0 от 30 смен",
}

CITIZENSHIP_RF = "Россия"
CITIZENSHIP_EAEU = "\n".join(
    [
        "Россия",
        "Беларусь",
        "Армения",
        "Казахстан",
        "Киргизия",
        "Таджикистан",
        "Узбекистан",
        "Молдова",
        "Азербайджан",
    ]
)

LABEL_ALIASES = {
    "заказчик": "Заказчик",
    "гр-во": "гр-во",
    "гражданство": "гр-во",
    "от": "от",
    "до": "до",
    "регион": "Регион",
    "питание": "Питание",
    "питание*": "Питание*",
    "тип": "Тип",
    "от смен": "ОТ",
    "мин смен": "ОТ",
    "сб": "СБ",
    "сб*": "СБ*",
    "сп": "СП",
    "м": "М",
    "ж": "Ж",
    "должность": "Должность",
    "ставка": "Ставка макс",
    "ставка макс": "Ставка макс",
    "ставка*": "Ставка*",
    "объект": "Объект",
    "оформление": "Оформление",
    "график": "График вахты",
    "график вахты": "График вахты",
    "обязанности": "Обязанности",
    "спец одежда": "Спец одежда",
    "со": "Спец одежда",
    "мед книжка": "Мед книжка",
    "лмк": "Мед книжка",
    "проживание": "Проживание",
    "заселение": "Заселение",
    "доставка": "Доставка",
    "компенсации": "Компенсации",
    "доп инфа": "доп инфа",
    "для макс": "для МАКС",
    "макс текст": "для МАКС",
    "адрес проживания": "Адрес проживания",
    "адрес объекта": "Адрес объекта",
    "мп": "МП",
    "фикс/сделка": "фикс/сделка",
    "руб": "РУБ",
}


def col_a1(col_idx: int) -> str:
    letters = ""
    c = col_idx
    while c:
        c, rem = divmod(c - 1, 26)
        letters = chr(65 + rem) + letters
    return letters


def expand_citizenship(raw: str) -> str:
    s = (raw or "").strip().lower().replace("ё", "е")
    if not s:
        return ""
    if s in ("рф", "россия"):
        return CITIZENSHIP_RF
    if any(k in s for k in ("снг", "еаэс", "еaes", "рнс", "все")):
        return CITIZENSHIP_EAEU
    return raw.strip()


def parse_labeled_text(text: str) -> dict:
    """Parse 'Поле: значение' blocks and light emoji shorthand."""
    draft: dict[str, str] = {}
    # labeled lines
    for m in re.finditer(
        r"(?im)^([A-Za-zА-Яа-яЁё0-9* /\-]{1,40})\s*:\s*(.+?)(?=\n[A-Za-zА-Яа-яЁё0-9* /\-]{1,40}\s*:|\Z)",
        text,
        flags=re.S,
    ):
        key = m.group(1).strip().lower()
        val = m.group(2).strip()
        col = LABEL_ALIASES.get(key)
        if col:
            draft[col] = val

    # emoji / shorthand blocks often used in customer blasts
    loc = re.search(r"📍\s*(.+)", text)
    if loc and "для МАКС" not in draft:
        draft.setdefault("Объект", loc.group(1).strip())
        draft.setdefault("для МАКС", f"📍{loc.group(1).strip()}")

    demand = re.search(
        r"(?:✅|потребн\w*|нужн\w*)\s*(\d+)\s*([мжМЖ])\b(?:\s*[+/и&\-]?\s*(\d+)\s*([мжМЖ]))?",
        text,
        flags=re.I,
    )
    if demand:
        n1, g1 = int(demand.group(1)), demand.group(2).upper()
        draft[g1] = str(n1)
        if demand.group(3):
            n2, g2 = int(demand.group(3)), demand.group(4).upper()
            draft[g2] = str(n2)

    job = re.search(
        r"(?:✅[^\n]*?\d+\s*[мжМЖ]\s+)([^\n🔥]+)|(?:должност\w*[:\s]+)([^\n]+)",
        text,
        flags=re.I,
    )
    if job and "Должность" not in draft:
        draft["Должность"] = (job.group(1) or job.group(2) or "").strip(" /")

    rate = re.search(r"(?:🔥|ставк\w*[:\s]*)\s*(\d{3,5})", text, flags=re.I)
    if rate and "Ставка макс" not in draft:
        draft["Ставка макс"] = rate.group(1)

    if "гр-во" in draft:
        draft["гр-во"] = expand_citizenship(draft["гр-во"])

    return draft


def load_draft(argv: list[str]) -> dict:
    if "--text-file" in argv:
        i = argv.index("--text-file")
        path = Path(argv[i + 1])
        return parse_labeled_text(path.read_text(encoding="utf-8-sig"))
    paths = [a for a in argv[1:] if not a.startswith("-")]
    if not paths:
        raise SystemExit("Передайте draft.json или --text-file blob.txt")
    path = Path(paths[0])
    raw = path.read_text(encoding="utf-8-sig")
    if path.suffix.lower() == ".json":
        data = json.loads(raw)
        if not isinstance(data, dict):
            raise SystemExit("JSON должен быть объектом {столбец: значение}")
        if "гр-во" in data:
            data["гр-во"] = expand_citizenship(str(data["гр-во"]))
        return {str(k): ("" if v is None else str(v)) for k, v in data.items()}
    return parse_labeled_text(raw)


def apply_defaults(draft: dict) -> dict:
    out = dict(draft)
    for k, v in DEFAULTS.items():
        if not str(out.get(k, "")).strip():
            out[k] = v
    # СП = да if both M and F demand and СП empty
    m = str(out.get("М", "")).strip()
    zh = str(out.get("Ж", "")).strip()
    sp = str(out.get("СП", "")).strip()
    if m and zh and not sp:
        out["СП"] = "да"
    return out


def sheets_service(write: bool):
    scopes = [
        "https://www.googleapis.com/auth/spreadsheets"
        if write
        else "https://www.googleapis.com/auth/spreadsheets.readonly"
    ]
    creds = service_account.Credentials.from_service_account_file(str(SA), scopes=scopes)
    return build("sheets", "v4", credentials=creds, cache_discovery=False)


def next_id_and_headers(svc):
    sid = cfg["spreadsheetId"]
    sheet = cfg.get("sheetName") or "ПОТРЕБНОСТЬ1"
    header = (
        svc.spreadsheets()
        .values()
        .get(spreadsheetId=sid, range=f"'{sheet}'!1:1")
        .execute()
        .get("values", [[]])[0]
    )
    id_vals = (
        svc.spreadsheets()
        .values()
        .get(spreadsheetId=sid, range=f"'{sheet}'!A:A")
        .execute()
        .get("values", [])
    )
    max_id = 0
    last_row = 1
    for i, row in enumerate(id_vals[1:], start=2):
        if not row or not str(row[0]).strip():
            continue
        last_row = i
        try:
            max_id = max(max_id, int(float(str(row[0]).replace(",", "."))))
        except ValueError:
            continue
    return sheet, header, max_id + 1, last_row


def neighbor_regions(svc, sheet: str, region: str, header: list) -> str:
    if not region.strip():
        return ""
    try:
        col = header.index("Соседние регионы*") + 1
        reg_col = header.index("Регион") + 1
    except ValueError:
        return ""
    # sample a few rows with same region
    data = (
        svc.spreadsheets()
        .values()
        .get(spreadsheetId=cfg["spreadsheetId"], range=f"'{sheet}'!A2:{col_a1(max(col, reg_col))}400")
        .execute()
        .get("values", [])
    )
    want = region.strip().lower()
    for row in data:
        while len(row) < max(col, reg_col):
            row.append("")
        if str(row[reg_col - 1]).strip().lower() == want and str(row[col - 1]).strip():
            return str(row[col - 1]).strip()
    return ""


def build_row(header: list, draft: dict, new_id: int) -> list:
    row = [""] * len(header)
    mapping = apply_defaults(draft)
    mapping["ID"] = str(new_id)
    for i, h in enumerate(header):
        key = str(h).strip() if h is not None else ""
        if key in mapping and str(mapping[key]).strip() != "":
            row[i] = mapping[key]
    return row


def main():
    write = "--write" in sys.argv
    draft = load_draft(sys.argv)
    svc = sheets_service(write)
    sheet, header, new_id, last_row = next_id_and_headers(svc)

    if "Соседние регионы*" not in draft and draft.get("Регион"):
        nr = neighbor_regions(svc, sheet, draft["Регион"], header)
        if nr:
            draft["Соседние регионы*"] = nr

    row = build_row(header, draft, new_id)
    preview = {header[i]: row[i] for i in range(len(header)) if row[i]}
    print(json.dumps({"new_id": new_id, "filled": preview, "missing_notes": []}, ensure_ascii=False, indent=2))

    if not write:
        print("Dry-run only. Re-run with --write to append.")
        return

    # Append
    end_col = col_a1(len(header))
    resp = (
        svc.spreadsheets()
        .values()
        .append(
            spreadsheetId=cfg["spreadsheetId"],
            range=f"'{sheet}'!A:{end_col}",
            valueInputOption="USER_ENTERED",
            insertDataOption="INSERT_ROWS",
            body={"values": [row]},
        )
        .execute()
    )
    print("appended", resp.get("updates", {}).get("updatedRange"), "ID", new_id)
    print(
        "Дальше вручную во вкладке «Фриланс»: протянуть строку и указать этот ID "
        "(формулы подтянут поля; голубые шапки — копировать)."
    )


if __name__ == "__main__":
    main()
