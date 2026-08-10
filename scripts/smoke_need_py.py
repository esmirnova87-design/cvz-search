# -*- coding: utf-8 -*-
"""Minimal Python mirror to smoke-test PR count parsing + matching."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parents[1]


def norm(s: str) -> str:
    s = (s or "").lower().replace("ё", "е")
    s = re.sub(r"[❗️🔥⬇️]", " ", s)
    s = re.sub(r"[^\w\s+/\\-]", " ", s, flags=re.U)
    return re.sub(r"\s+", " ", s).strip()


def tokens(s: str):
    return [t for t in norm(s).split() if len(t) >= 3 and not t.isdigit()]


def guess_gender(title: str) -> str:
    t = norm(title)
    if re.search(r"горнич|уборщиц|помощниц|посудомо|комплектовщиц|упаковщиц", t):
        return "zh"
    if re.search(r"дворник|хаусмен|карщик|грузчик|охранник", t):
        return "m"
    return "any"


def is_noise(tl: str) -> bool:
    return bool(
        re.match(
            r"^(график|строгое|только|без|судимост|упаковка|до|лет|час|часов|смен|кондитер|горячий|цех|универсал|по|и|на|от|обл|область|мос|край|места|пар|сп|семейн)$",
            tl,
            re.I,
        )
    )


def parse_counts(raw: str):
    text = raw
    m = zh = sp = 0
    has_m = has_zh = has_sp = False
    roles = []

    fam = re.search(r"(\d+)\s*(?:семейн\w*\s*(?:места|пар[ыа])?|сп)\b", text, re.I)
    if fam:
        sp = int(fam.group(1))
        has_sp = has_m = has_zh = True
        m += sp
        zh += sp
        text = text.replace(fam.group(0), " ", 1)

    def gen_role(mo):
        n, g, title = mo.group(1), mo.group(2), mo.group(3)
        first = title.strip().split()[0]
        if is_noise(first):
            return mo.group(0)
        gender = "m" if g.lower() in ("м", "m") else "zh"
        roles.append({"count": int(n), "title": title.strip(), "gender": gender})
        return " "

    text = re.sub(r"(\d+)\s*([мжmfw])\s+([а-яёa-z]{3,}(?:\s+[а-яёa-z]{3,}){0,2})", gen_role, text, flags=re.I)

    def bare(mo):
        nonlocal m, zh, has_m, has_zh
        n = int(mo.group(1))
        g = mo.group(2).lower()
        if g in ("м", "m"):
            m += n
            has_m = True
        else:
            zh += n
            has_zh = True
        return " "

    text = re.sub(r"(\d+)\s*([мжmfw])\b", bare, text, flags=re.I)

    def role(mo):
        n, title = mo.group(1), mo.group(2).strip()
        first = title.split()[0]
        if is_noise(first):
            return " "
        roles.append({"count": int(n), "title": title, "gender": guess_gender(title)})
        return " "

    text = re.sub(r"(\d+)\s*([а-яёa-z]{3,}(?:\s+[а-яёa-z]{3,}){0,2})", role, text, flags=re.I)

    for r in roles:
        if r["gender"] == "m":
            m += r["count"]
            has_m = True
        elif r["gender"] == "zh":
            zh += r["count"]
            has_zh = True

    out_sp = str(sp) if has_sp else ("да" if has_m and has_zh else "")
    return {
        "m": str(m) if has_m else "",
        "zh": str(zh) if has_zh else "",
        "sp": out_sp,
        "roles": roles,
    }


def score(place, obj):
    p, o = norm(place), norm(obj)
    pt = tokens(place)
    if not pt:
        return 0
    aliases = [
        ["переславль", "переяславль"],
        ["питер", "санкт-петербург", "спб"],
        ["орел", "орёл"],
        ["старотитаровская", "старотиторовская"],
    ]

    def expand(t):
        out = {t}
        for g in aliases:
            if any(t == x or t in x or x in t for x in g):
                out.update(g)
        return out

    def token_in(hay, t):
        return any(len(a) >= 3 and a in hay for a in expand(t))

    city_tok = tokens(place.split(",")[0])
    city_hit = False
    if city_tok:
        city_hit = any(token_in(o, t) for t in city_tok)
        if not city_hit and len(city_tok[0]) >= 4 and not re.search(r"област|край|район|^мос$", city_tok[0]):
            return 0
    score_v = 0
    hit = 0
    for t in pt:
        if token_in(o, t):
            hit += 1
            score_v += 3 if len(t) >= 5 else 2
    if hit == 0:
        return 0
    if city_hit:
        score_v += 5
    score_v += (hit / len(pt)) * 4
    return score_v


def main():
    sample = (ROOT / "data" / "_sample_pr.txt").read_text(encoding="utf-8")
    idx = json.loads((ROOT / "potrebnost-index.json").read_text(encoding="utf-8"))
    pool = [r for r in idx["rows"] if "personal" in r["customer"].lower().replace(" ", "")]
    items = []
    for line in sample.splitlines():
        clean = re.sub(r"[🔥⬇️]", "", line).strip()
        if not clean or len(clean) < 8:
            continue
        if re.search(r"добрый\s+день|коллеги|потребность\s+на", clean, re.I):
            continue
        if "❗️" not in line and "!" not in line and not re.search(r"\d+\s*[мжМЖ]", clean):
            continue
        parts = re.split(r"[❗️❗!\uFE0F]+", clean)
        parts = [p.strip() for p in parts if p.strip()]
        head = parts[0] if parts else ""
        tail = " ".join(parts[1:]).strip()
        if not head:
            continue
        # если хвост пуст, а в head остались цифры М/Ж — вытащим
        if not tail and re.search(r"\d+\s*[мжМЖ]", head):
            m2 = re.search(r"\d+\s*[мжМЖ]", head)
            # keep as is; parse_counts on head
            pass
        c = parse_counts(tail or head)
        items.append({"place": re.sub(r"\s+", " ", head), **c})

    print("ITEMS", len(items))
    for it in items:
        print(f"  {it['place'][:50]} -> M={it['m']} Ж={it['zh']} СП={it['sp']}")

    used = set()
    for it in items:
        ranked = sorted(((score(it["place"], r["object"]), r) for r in pool), key=lambda x: -x[0])
        ranked = [(s, r) for s, r in ranked if s >= 4]
        if not ranked:
            print("MISSING", it["place"])
            continue
        if len(ranked) > 1 and ranked[0][0] - ranked[1][0] < 1.5:
            print("AMB", it["place"], "->", [r["id"] for _, r in ranked[:3]])
            continue
        r = ranked[0][1]
        if r["id"] in used:
            print("AMB used", it["place"], r["id"])
            continue
        used.add(r["id"])
        print(f"OK ID{r['id']} {it['m']}/{it['zh']}/{it['sp']} <- {r['object'][:40].replace(chr(10),' / ')}")


if __name__ == "__main__":
    main()
