# -*- coding: utf-8 -*-
import json
import re
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parents[1]
XLSX = ROOT / "data" / "Для сотрудников подбора.xlsx"
OUT = ROOT / "vacancies.json"


def has_demand(v):
    if v is None:
        return False
    if isinstance(v, (int, float)):
        return float(v) > 0
    s = str(v).strip().lower()
    if s in ("да", "пс"):
        return True
    try:
        return float(s.replace(",", ".")) > 0
    except ValueError:
        return False


def norm(v):
    if v is None:
        return ""
    if isinstance(v, float) and v == int(v):
        return str(int(v))
    return str(v).strip()


def main():
    wb = openpyxl.load_workbook(XLSX, data_only=True)
    ws = wb["ПОТРЕБНОСТЬ1"]
    headers = [c.value for c in ws[1]]
    while headers and headers[-1] is None:
        headers.pop()

    zh_key = next((h for h in headers if h and str(h).strip() == "Ж"), None)

    tip_map = {
        "пищ": "пищ",
        "не пищ": "не пищ",
        "непищ": "не пищ",
        "склад": "склад",
        "отель": "отель",
        "стройка": "стройка",
        "тепл": "тепл",
        "теплицы": "тепл",
        "тт": "ТТ",
        "ферма": "ферма",
        "фер": "ферма",
    }
    tip_label = {
        "пищ": "пищевое",
        "не пищ": "не пищевое",
        "склад": "склад",
        "отель": "отель",
        "стройка": "стройка",
        "тепл": "теплицы",
        "ТТ": "торговая точка",
        "ферма": "ферма",
    }

    vacancies = []
    for r in range(2, ws.max_row + 1):
        row = {headers[i]: ws.cell(r, i + 1).value for i in range(len(headers))}
        m = row.get("М")
        zh = row.get(zh_key) if zh_key else None
        sp = row.get("СП")
        if not (has_demand(m) or has_demand(zh) or has_demand(sp)):
            continue
        vid = row.get("ID")
        if vid is None:
            continue

        tip_raw = re.sub(r"\s+", " ", norm(row.get("Тип")).lower())
        tip_id = tip_map.get(tip_raw, tip_raw)
        sb = norm(row.get("СБ")).lower()
        med = norm(row.get("Мед книжка")).lower()
        food_raw = norm(row.get("Питание")).lower()
        housing = norm(row.get("Проживание"))
        dol = norm(row.get("Должность"))
        obj = norm(row.get("Объект"))

        dol_parts = [x.strip() for x in re.split(r"[\n/;]+", dol) if x.strip()]
        dol_one = "/".join(dol_parts)
        obj_one = ", ".join([x.strip() for x in obj.splitlines() if x.strip()])
        title = f"{dol_one} на {obj_one}" if dol_one and obj_one else (dol_one or obj_one)
        title = re.sub(r"\s+", " ", title).strip(" ·,-")

        try:
            age_from = int(float(row.get("от") or 18))
        except (TypeError, ValueError):
            age_from = 18
        try:
            age_to = int(float(row.get("до") or 70))
        except (TypeError, ValueError):
            age_to = 70

        citizen_raw = norm(row.get("гр-во"))
        citizens = [c.strip() for c in re.split(r"[\n,;/]+", citizen_raw) if c.strip()]
        jobs = [re.sub(r"\s+\d+$", "", j.strip().lower()).strip() for j in dol_parts]

        rate = row.get("Ставка макс")
        if isinstance(rate, (int, float)):
            rate_s = str(int(rate)) if float(rate) == int(rate) else str(rate)
        else:
            nums = re.findall(r"\d{3,5}", norm(rate))
            rate_s = nums[0] if nums else (norm(rate).split("\n")[0][:20] if rate else "")

        reg = norm(row.get("Регион")).replace(" область", "").replace("Область", "").strip()
        if reg in ("СПб", "СПБ"):
            reg = "Санкт-Петербург"

        photo = norm(row.get("фото"))
        if photo and not photo.startswith("http"):
            photo = ""

        graph = norm(row.get("График вахты")).replace("\n", ", ")
        copy_parts = [f"ЦВЗ | {title}"]
        if reg:
            copy_parts.append(f"Регион: {reg}")
        if rate_s:
            copy_parts.append(f"Ставка: до {rate_s} руб/смена")
        if graph:
            copy_parts.append(f"График: {graph}")
        if row.get("Питание") is not None and norm(row.get("Питание")):
            copy_parts.append(f"Питание: {norm(row.get('Питание'))}")
        if housing:
            copy_parts.append(f"Проживание: {housing.splitlines()[0]}")

        food = food_raw in ("да", "есть", "1", "yes") or food_raw.startswith("да")
        chips = []
        if food:
            chips.append("питание")
        if housing:
            chips.append("проживание")
        if sb in ("есть", "да"):
            chips.append("СБ есть")
        elif sb == "нет":
            chips.append("без СБ")
        ot = norm(row.get("ОТ"))
        if ot:
            chips.append(f"вахта от {ot}")

        place_bits = [reg]
        if tip_label.get(tip_id):
            place_bits.append(tip_label[tip_id])
        if ot:
            place_bits.append(f"вахта от {ot}")

        sp_yes = str(sp).strip().lower() == "да" if sp is not None else False
        vacancies.append(
            {
                "id": int(float(vid)) if isinstance(vid, (int, float)) else vid,
                "title": title,
                "place": " · ".join([b for b in place_bits if b]),
                "pay": rate_s,
                "photo": photo,
                "chips": chips,
                "duty": norm(row.get("Обязанности"))[:280],
                "copy": "\n".join(copy_parts),
                "region": reg,
                "type": tip_id,
                "food": food,
                "housing": bool(housing),
                "sb": sb,
                "no_sb": sb == "нет",
                "med": med,
                "no_med": (not med) or ("не нуж" in med) or med == "нет",
                "age_from": age_from,
                "age_to": age_to,
                "citizens": citizens,
                "jobs": jobs,
                "gender_m": has_demand(m) or sp_yes or has_demand(sp),
                "gender_f": has_demand(zh) or sp_yes or has_demand(sp),
            }
        )

    payload = {"updated": "local-excel", "total": len(vacancies), "items": vacancies}
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"exported {len(vacancies)} -> {OUT}")
    regs = sorted({v["region"] for v in vacancies if v["region"]}, key=lambda x: x.lower())
    print("regions:", regs)
    print("types:", sorted({v["type"] for v in vacancies}))


if __name__ == "__main__":
    main()
