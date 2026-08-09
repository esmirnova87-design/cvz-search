# -*- coding: utf-8 -*-
"""Find vacancy objects whose Должность doesn't match the public job dictionary."""
import json
import re
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parents[1]

VOCAB = [
    "арматурщик",
    "бетонщик",
    "боец скота",
    "водитель спецтехники",
    "гладильщица",
    "горничная",
    "грузчик",
    "дворник",
    "животновод",
    "жиловщик",
    "каменщик",
    "карщик",
    "кассир",
    "кладовщик",
    "комплектовщик",
    "кондитер",
    "коренщица",
    "котломойщик",
    "кухонный работник",
    "маляр",
    "маркировщик",
    "мойщик",
    "монолитчик",
    "монтажник",
    "мясник",
    "наборщик",
    "навесчик",
    "наладчик",
    "обвальщик",
    "оператор линии",
    "оператор",
    "отлов птиц",
    "официант",
    "пайщик",
    "повар",
    "подсобный рабочий",
    "помощник кондитера",
    "помощник повара",
    "посудомойщица",
    "протирщик",
    "птицевод",
    "работник зала",
    "работник линии",
    "работник склада",
    "работник теплиц",
    "разборщик",
    "раздельщик",
    "разнорабочий",
    "рыбообработчик",
    "сборщик",
    "сварщик",
    "сканировщик",
    "слесарь",
    "стикеровщик",
    "транспортировщик",
    "уборщица",
    "укладчик",
    "упаковщик",
    "фасовщик",
    "формовщик",
    "хаусмен",
    "цветовод",
    "швея",
    "другая",
    # common gender/alias forms in the sheet
    "упаковщица",
    "фасовщица",
    "маркировщица",
    "стикеровщица",
    "мойщица",
    "уборщик",
    "комплектовщица",
    "сканировщица",
    "наборщица",
    "ричтрак",
    "штабелер",
    "погрузчик",
    "электропогрузчик",
    "электроштабелер",
    "автопогрузчик",
]

# suggested mapping: keyword-ish fragment -> dictionary label to append in parentheses
SUGGEST = [
    (r"высотн|штабл|ричтрак|вап|вэш|linde|погрузчик|электропогруз|электроштаб|автопогруз", "водитель спецтехники (автопогрузчик/электроштабелер/ричтрак)"),
    (r"сборк[аи] заказ", "комплектовщик"),
    (r"маркер|стикер|маркировк", "маркировщик"),
    (r"комплект|сборщик|наборщ|сканир|тсд", "комплектовщик"),
    (r"упаков", "упаковщик"),
    (r"фасов", "фасовщик"),
    (r"уклад", "укладчик"),
    (r"грузч", "грузчик"),
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
    (r"убойн|бо[еи]ц|жилов|навес|обваль|мясник|колбасн", "боец скота"),
    (r"птиц|животн|отлов", "птицевод"),
    (r"рыб|раздел|разбор", "рыбообработчик"),
    (r"тепл|цветовод", "работник теплиц"),
    (r"хаусмен", "хаусмен"),
    (r"гладил", "гладильщица"),
    (r"тракторист", "другая"),
    (r"^водитель$|водитель\b", "водитель спецтехники (автопогрузчик/электроштабелер/ричтрак)"),
]


def norm(s: str) -> str:
    s = str(s or "").lower().replace("ё", "е")
    s = re.sub(r"[^a-zа-я0-9/\s\-()]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def suggest_for(text: str) -> str:
    n = norm(text)
    for pat, label in SUGGEST:
        if re.search(pat, n):
            return label
    return "другая"


def propose_new(jobs_field: str, jobs_list: list[str]) -> str:
    raw = jobs_field.strip() if jobs_field else " / ".join(jobs_list)
    if not raw:
        return f"(другая)"
    # if multi-line / multi-role, annotate each line/part without a vocab hit
    parts = re.split(r"[\n/]+", raw)
    parts = [p.strip() for p in parts if p.strip()]
    out = []
    vocab_n = [norm(v) for v in VOCAB]
    for p in parts:
        pn = norm(p)
        if any(w and w in pn for w in vocab_n):
            out.append(p)
        else:
            label = suggest_for(p)
            # avoid double parentheses if already has them
            if "(" in p and ")" in p:
                out.append(f"{p} [{label}]")
            else:
                out.append(f"{p} ({label})")
    return "\n".join(out) if "\n" in raw else " / ".join(out)


def main():
    data = json.loads((ROOT / "vacancies.json").read_text(encoding="utf-8"))
    by_obj = {}
    for v in data["items"]:
        oid = v.get("object_id")
        jobs = v.get("jobs") or []
        details_jobs = (v.get("details") or {}).get("jobs") or ""
        by_obj[oid] = {
            "id": oid,
            "jobs_field": details_jobs,
            "jobs_list": jobs,
            "title": v.get("title") or "",
        }

    vocab_n = [norm(v) for v in VOCAB]
    miss = []
    ok = 0
    for oid, row in sorted(by_obj.items(), key=lambda x: int(x[0]) if str(x[0]).isdigit() else 0):
        blob = norm(row["jobs_field"] + " " + " ".join(row["jobs_list"]) + " " + row["title"])
        if any(w and w in blob for w in vocab_n):
            ok += 1
        else:
            miss.append(row)

    print(f"objects total {len(by_obj)}; matched {ok}; miss {len(miss)}")
    print("--- ID | текущее | предложение ---")
    for m in miss:
        current = m["jobs_field"] or " / ".join(m["jobs_list"]) or "(пусто)"
        proposed = propose_new(m["jobs_field"], m["jobs_list"])
        print(f"ID {m['id']}")
        print(f"  сейчас: {current}")
        print(f"  новое:  {proposed}")
        print()


if __name__ == "__main__":
    main()
