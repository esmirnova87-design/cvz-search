# -*- coding: utf-8 -*-
"""Audit Должность for ALL rows that have МАКС link (not only active demand)."""
import json
import re
import sys
from pathlib import Path

from google.oauth2 import service_account
from googleapiclient.discovery import build

sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parents[1]
cfg = json.loads((ROOT / "sheets-config.json").read_text(encoding="utf-8"))
sa = ROOT / "secrets" / "google-service-account.json"

VOCAB = [
    "арматурщик", "бетонщик", "боец скота", "водитель спецтехники", "гладильщица", "горничная",
    "грузчик", "дворник", "животновод", "жиловщик", "каменщик", "карщик", "кассир", "кладовщик",
    "комплектовщик", "кондитер", "коренщица", "котломойщик", "кухонный работник", "маляр",
    "маркировщик", "мойщик", "монолитчик", "монтажник", "мясник", "наборщик", "навесчик", "наладчик",
    "обвальщик", "оператор линии", "оператор", "отлов птиц", "официант", "пайщик", "повар",
    "подсобный рабочий", "помощник кондитера", "помощник повара", "посудомойщица", "протирщик",
    "птицевод", "работник зала", "работник линии", "работник склада", "работник теплиц",
    "разборщик", "раздельщик", "разнорабочий", "рыбообработчик", "сборщик", "сварщик", "сканировщик",
    "слесарь", "стикеровщик", "транспортировщик", "уборщица", "укладчик", "упаковщик", "фасовщик",
    "формовщик", "хаусмен", "цветовод", "швея", "другая",
    # gender/alias forms
    "упаковщица", "фасовщица", "маркировщица", "стикеровщица", "мойщица", "уборщик",
    "комплектовщица", "сканировщица", "наборщица", "ричтрак", "штабелер", "погрузчик",
    "электропогрузчик", "электроштабелер", "автопогрузчик", "вап", "вэш",
]

SUGGEST = [
    (r"высотн|штабл|ричтрак|вап|вэш|linde|погрузчик|электропогруз|электроштаб|автопогруз|тракторист", "водитель спецтехники"),
    (r"сборк[аи] заказ", "сборщик"),
    (r"маркер|стикер|маркировк", "маркировщик"),
    (r"комплект|сборщик|наборщ|сканир|тсд", "комплектовщик"),
    (r"упаков", "упаковщик"),
    (r"фасов", "фасовщик"),
    (r"уклад", "укладчик"),
    (r"грузч|транспортир", "грузчик"),
    (r"кладов", "кладовщик"),
    (r"разнораб|подсобн|работник склада", "разнорабочий"),
    (r"убор", "уборщица"),
    (r"мойк[аи]|мойщ|котломой|протир|дворник|посудомо", "мойщик"),
    (r"горнич", "горничная"),
    (r"официант", "официант"),
    (r"повар|кондитер|кухн", "повар"),
    (r"оператор линии|работник линии", "оператор линии"),
    (r"оператор", "оператор (оборудования)"),
    (r"швея", "швея"),
    (r"кассир|работник зала", "кассир"),
    (r"бетон|арматур|каменщ|маляр|монтаж|монолит|свар|слесар|налад|пайщ|формов", "бетонщик"),
    (r"убойн|бо[еи]ц|жилов|навес|обваль|мясник", "боец скота"),
    (r"птиц|животн|отлов", "птицевод"),
    (r"рыб|раздел|разбор", "рыбообработчик"),
    (r"тепл|цветовод", "работник теплиц"),
    (r"хаусмен", "хаусмен"),
    (r"гладил", "гладильщица"),
    (r"торгов(ого|ый) зал|работник зала|сотрудник торгового", "работник зала"),
    (r"уход\w* за цвет|цветовод", "цветовод"),
    (r"^сборк[аи]$|сборк[аи]\b", "сборщик"),
    (r"сортиров", "комплектовщик"),
    (r"самосвал", "другая"),
]


def norm(s: str) -> str:
    s = str(s or "").lower().replace("ё", "е")
    s = re.sub(r"[^a-zа-я0-9/\s\-()]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def has_vocab(text: str) -> bool:
    blob = norm(text)
    return any(w and w in blob for w in (norm(v) for v in VOCAB))


def suggest_for(part: str) -> str:
    n = norm(part)
    for pat, label in SUGGEST:
        if re.search(pat, n):
            return label
    return "другая"


def propose(jobs: str) -> str:
    raw = (jobs or "").strip()
    if not raw:
        return "(другая)"
    parts = [p.strip() for p in re.split(r"[\n]+", raw) if p.strip()]
    if len(parts) == 1 and "/" in parts[0]:
        # keep slash groups as separate only if whole line has no vocab
        if has_vocab(parts[0]):
            return raw
        chunks = [c.strip() for c in parts[0].split("/") if c.strip()]
        out = []
        for c in chunks:
            if has_vocab(c):
                out.append(c)
            else:
                lab = suggest_for(c)
                # if already same word, just replace with dictionary form
                if norm(c).startswith(norm(lab)) or norm(lab) in norm(c):
                    out.append(lab if len(c) < len(lab) + 3 else f"{c}")
                else:
                    out.append(f"{c} ({lab})" if "(" not in c else f"{c}")
        return "/".join(out)
    out = []
    for p in parts:
        if has_vocab(p):
            out.append(p)
        else:
            lab = suggest_for(p)
            if "(" in p:
                out.append(p if has_vocab(p) else f"{p}")
                if not has_vocab(p):
                    out[-1] = f"{p} ({lab})" if f"({lab})" not in p else p
            else:
                out.append(f"{p} ({lab})")
    return "\n".join(out)


def main():
    creds = service_account.Credentials.from_service_account_file(
        str(sa), scopes=["https://www.googleapis.com/auth/spreadsheets.readonly"]
    )
    svc = build("sheets", "v4", credentials=creds, cache_discovery=False)
    sid = cfg["spreadsheetId"]
    sheet = cfg.get("sheetName") or "ПОТРЕБНОСТЬ1"

    rows = (
        svc.spreadsheets()
        .values()
        .get(spreadsheetId=sid, range=f"'{sheet}'")
        .execute()
        .get("values", [])
    )
    if not rows:
        raise SystemExit("empty sheet")
    header = rows[0]
    # normalize header keys
    hmap = {str(h).strip(): i for i, h in enumerate(header) if h}

    def cell(row, name, default=""):
        i = hmap.get(name)
        if i is None:
            return default
        return row[i] if i < len(row) else default

    # find МАКС column (exact or contains)
    max_key = "МАКС" if "МАКС" in hmap else next((k for k in hmap if "макс" in k.lower()), None)
    job_key = "Должность"
    id_key = "ID"
    print("MAX col:", max_key, "job col:", job_key)
    print("headers with МП/фикс:", [k for k in hmap if "мп" in k.lower() or "фикс" in k.lower() or "местн" in k.lower()])

    with_max = 0
    miss = []
    for r_i, row in enumerate(rows[1:], start=2):
        max_val = str(cell(row, max_key) or "").strip()
        if not max_val:
            continue
        with_max += 1
        jobs = str(cell(row, job_key) or "").strip()
        vid = cell(row, id_key)
        try:
            vid = int(float(str(vid).replace(",", ".")))
        except Exception:
            pass
        if has_vocab(jobs):
            continue
        miss.append((r_i, vid, jobs, propose(jobs), max_val[:60]))

    print(f"rows with МАКС: {with_max}; without dictionary hit: {len(miss)}")
    out_path = ROOT / "data" / "job-vocab-miss-with-max.txt"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    lines = []
    for r_i, vid, jobs, prop, mx in miss:
        block = f"ID {vid} | row {r_i}\n  сейчас: {jobs or '(пусто)'}\n  новое:  {prop}\n"
        print(block)
        lines.append(block)
    out_path.write_text("\n".join(lines), encoding="utf-8")
    print("saved", out_path)


if __name__ == "__main__":
    main()
