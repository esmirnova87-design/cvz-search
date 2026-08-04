# -*- coding: utf-8 -*-
"""Export active vacancies for the public search site.

PUBLIC RULE: never export заказчик / адрес проживания / адрес объекта
into fields that the website shows to candidates or partners.
"""
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


def parse_food_times(food_raw, food_star):
    text = f"{food_raw} {food_star}".lower().replace("ё", "е")
    m = re.search(r"([123])\s*(раз|раза)", text)
    if m:
        return int(m.group(1))
    if "три раз" in text:
        return 3
    if "два раз" in text:
        return 2
    if "один раз" in text or "1 раз" in text:
        return 1
    return None


def parse_ot(ot_raw):
    s = norm(ot_raw)
    if not s:
        return None
    try:
        return int(float(str(s).replace(",", ".").split()[0]))
    except ValueError:
        m = re.search(r"\d{1,3}", s)
        return int(m.group()) if m else None


def has_travel_compensation(comp_raw):
    s = norm(comp_raw)
    if not s:
        return False
    low = s.lower().replace("ё", "е")
    keys = ("проезд", "билет", "такси", "дорог", "транспорт", "ж/д", "жд", "авиа", "компенс")
    return any(k in low for k in keys)


def build_chips(food, food_times, housing, sb, sp_raw, travel_comp):
    chips = []
    if food:
        if food_times in (2, 3):
            chips.append({"text": f"питание {food_times} раза", "ok": True})
        else:
            chips.append({"text": "питание", "ok": True})
    if housing:
        chips.append({"text": "проживание", "ok": True})
    if sb in ("есть", "да"):
        chips.append({"text": "СБ есть", "ok": False})
    elif sb == "нет":
        chips.append({"text": "без СБ", "ok": False})

    sp_s = norm(sp_raw)
    if sp_s:
        if sp_s.lower() == "да":
            chips.append({"text": "семейные комнаты: уточните наличие", "ok": True})
        else:
            try:
                if float(str(sp_s).replace(",", ".")) > 0:
                    chips.append({"text": "семейные комнаты: есть", "ok": True})
            except ValueError:
                if sp_s.lower() not in ("нет", "0", "-"):
                    chips.append({"text": "семейные комнаты: уточните наличие", "ok": True})

    if travel_comp:
        chips.append({"text": "компенсация проезда", "ok": True})
    return chips


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
        med = norm(row.get("Мед книжка"))
        food_raw = norm(row.get("Питание"))
        food_star = norm(row.get("Питание*"))
        housing = norm(row.get("Проживание"))
        dol = norm(row.get("Должность"))
        for_max = norm(row.get("для МАКС"))
        comp = norm(row.get("Компенсации"))
        food_times = parse_food_times(food_raw, food_star)
        ot_num = parse_ot(row.get("ОТ"))
        travel_comp = has_travel_compensation(comp)

        dol_parts = [x.strip() for x in re.split(r"[\n/;]+", dol) if x.strip()]
        dol_parts = [re.sub(r"\s+\d+$", "", p).strip() for p in dol_parts if p.strip()]
        dol_one = "/".join(dol_parts)

        max_place = ""
        if for_max:
            lines = [ln.strip() for ln in for_max.splitlines() if ln.strip()]
            pin = next((ln for ln in lines if "📍" in ln), None)
            if not pin:
                pin = next(
                    (
                        ln
                        for ln in lines
                        if not ln.startswith("http")
                        and not ln.startswith("✅")
                        and not ln.startswith("🔥")
                    ),
                    "",
                )
            max_place = pin.replace("📍", "").strip()
            max_place = re.sub(r"https?://\S+", "", max_place).strip()
            max_place = re.sub(r"\s+", " ", max_place).strip(" ·,-")

        if dol_one and max_place:
            place_part = max_place[0].lower() + max_place[1:] if len(max_place) > 1 else max_place.lower()
            title = f"{dol_one} на {place_part}"
        elif max_place:
            title = max_place
        else:
            title = dol_one
        title = re.sub(r"\s+", " ", title).strip(" ·,-")
        try:
            id_num = int(float(vid)) if isinstance(vid, (int, float)) else str(vid).strip()
        except (TypeError, ValueError):
            id_num = str(vid).strip()
        title = f"{title} (ID: {id_num})" if title else f"(ID: {id_num})"

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

        food = food_raw.lower() in ("да", "есть", "1", "yes") or food_raw.lower().startswith("да")
        if food_times:
            food = True

        graph = norm(row.get("График вахты")).replace("\n", ", ")
        copy_parts = [f"ЦВЗ | {title}"]
        if reg:
            copy_parts.append(f"Регион: {reg}")
        if rate_s:
            copy_parts.append(f"Ставка: до {rate_s} руб/смена")
        if graph:
            copy_parts.append(f"График: {graph}")
        if food_raw:
            copy_parts.append(f"Питание: {food_raw}")
        if housing:
            copy_parts.append(f"Проживание: {housing.splitlines()[0]}")

        chips = build_chips(food, food_times, bool(housing), sb, sp, travel_comp)

        place_bits = [reg]
        if tip_label.get(tip_id):
            place_bits.append(tip_label[tip_id])
        if ot_num:
            place_bits.append(f"вахта от {ot_num}")

        sp_yes = str(sp).strip().lower() == "да" if sp is not None else False
        med_l = med.lower()
        # Public details only — NO заказчик, NO addresses
        details = {
            "citizens": ", ".join(citizens),
            "age": f"{age_from}–{age_to}",
            "demand": " · ".join(
                [
                    x
                    for x in [
                        f"М: {norm(m)}" if has_demand(m) else "",
                        f"Ж: {norm(zh)}" if has_demand(zh) else "",
                        f"СП: {norm(sp)}" if (has_demand(sp) or sp_yes) else "",
                    ]
                    if x
                ]
            ),
            "sb": norm(row.get("СБ")),
            "sb_extra": norm(row.get("СБ*")),
            "med": med,
            "region": reg,
            "place": max_place,
            "type": tip_label.get(tip_id, tip_id),
            "ot": ot_num,
            "schedule": norm(row.get("График вахты")),
            "food": food_raw,
            "food_extra": food_star,
            "housing": housing,
            "settle": norm(row.get("Заселение")),
            "delivery": norm(row.get("Доставка")),
            "contract": norm(row.get("Оформление")),
            "clothes": norm(row.get("Спец одежда")),
            "compensation": comp,
            "jobs": dol_one,
            "duties": norm(row.get("Обязанности")),
            "rate_extra": norm(row.get("Ставка*")),
            "extra": norm(row.get("доп инфа")),
            "neighbors": norm(row.get("Соседние регионы*")),
        }

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
                "food_times": food_times,
                "housing": bool(housing),
                "sb": sb,
                "no_sb": sb == "нет",
                "med": med,
                "no_med": (not med) or ("не нуж" in med_l) or med_l == "нет",
                "age_from": age_from,
                "age_to": age_to,
                "citizens": citizens,
                "jobs": jobs,
                "gender_m": has_demand(m) or sp_yes or has_demand(sp),
                "gender_f": has_demand(zh) or sp_yes or has_demand(sp),
                "ot": ot_num,
                "short_shift": ot_num in (15, 21),
                "travel_comp": travel_comp,
                "sp": norm(sp),
                "details": details,
            }
        )

    payload = {"updated": "local-excel", "total": len(vacancies), "items": vacancies}
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"exported {len(vacancies)} -> {OUT}")
    print("short_shift", sum(1 for v in vacancies if v["short_shift"]))
    print("travel_comp", sum(1 for v in vacancies if v["travel_comp"]))


if __name__ == "__main__":
    main()
