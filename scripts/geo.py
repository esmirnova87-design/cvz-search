# -*- coding: utf-8 -*-
"""Locality -> lat/lng for map pins (city level only, never street addresses)."""
import json
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CACHE_PATH = ROOT / "data" / "geo-cache.json"

# Approximate city centers (public settlements). Enough for vacancy map pins.
CITY_COORDS = {
    "москва": (55.7558, 37.6173),
    "санкт-петербург": (59.9343, 30.3351),
    "спб": (59.9343, 30.3351),
    "пушкино": (55.9908, 37.8475),
    "домодедово": (55.4363, 37.7667),
    "дмитров": (56.3440, 37.5204),
    "дорохово": (55.5480, 36.3740),
    "истра": (55.9143, 36.8603),
    "балашиха": (55.7963, 37.9382),
    "чехов": (55.1477, 37.4773),
    "калуга": (54.5138, 36.2612),
    "химки": (55.8881, 37.4305),
    "солнечногорск": (56.1851, 36.9773),
    "мытищи": (55.9104, 37.7365),
    "раменское": (55.5669, 38.2303),
    "новомосковск": (54.0109, 38.2846),
    "черноголовка": (56.0075, 38.3795),
    "наро-фоминск": (55.3875, 36.7330),
    "островцы": (55.6000, 37.9000),
    "чашниково": (56.0330, 37.1670),
    "подольск": (55.4312, 37.5458),
    "троицк": (55.4850, 37.3070),
    "набережные челны": (55.7435, 52.3959),
    "королев": (55.9142, 37.8250),
    "королёв": (55.9142, 37.8250),
    "череповец": (59.1229, 37.9031),
    "ковров": (56.3572, 41.3170),
    "благовещенск": (50.2907, 127.5272),  # Амурская; Башкортостан has same name — override by region
    "зеленоград": (55.9870, 37.1940),
    "большая мурта": (56.9990, 93.1480),
    "михнево": (55.1220, 37.9530),
    "кашира": (54.8444, 38.1570),
    "щёлково": (55.9150, 37.9720),
    "щелково": (55.9150, 37.9720),
    "электросталь": (55.7896, 38.4467),
    "переяславль": (56.7380, 38.8560),
    "переславль-залесский": (56.7380, 38.8560),
    "переславль": (56.7380, 38.8560),
    "новоминская": (46.3000, 38.9500),
    "раменский": (55.5669, 38.2303),
    "софьино": (55.4800, 38.1800),
    "котельники": (55.6600, 37.8630),
    "руза": (55.7010, 36.1960),
    "лобня": (56.0120, 37.4740),
    "серпухов": (54.9130, 37.4110),
    "заволжский": (56.8500, 41.0500),
    # Успенское (Одинцовский р-н, МО) — не путать с одноимёнными на юге РФ
    "успенск": (55.7280, 37.0900),
    "успенское": (55.7280, 37.0900),
    "чебоксары": (56.1439, 47.2489),
    "шарапово": (55.6500, 37.0800),
    "муслюмово": (55.3000, 53.2000),
    "торбеево": (54.0730, 43.2450),
    "гороховец": (56.2020, 42.6940),
    "егорьевск": (55.3830, 39.0290),
    "конаково": (56.7000, 36.7700),
    "внуково": (55.6000, 37.2800),
    "орехово-зуево": (55.8067, 38.9618),
    "великий новгород": (58.5228, 31.2698),
    "владимир": (56.1296, 40.4066),
    "орёл": (52.9703, 36.0635),
    "орел": (52.9703, 36.0635),
    "елизаветовка": (47.1200, 39.3500),
    "тула": (54.1931, 37.6173),
    "сергиев посад": (56.3100, 38.1320),
    "краснознаменск": (55.5990, 37.0390),
    "пермь": (58.0105, 56.2502),
    "первоуральск": (56.9080, 59.9430),
    "павлово": (55.9680, 43.0900),
    "фрязино": (55.9606, 38.0456),
    "шахты": (47.7085, 40.2149),
    "ногинск": (55.8660, 38.4440),
    "лыткарино": (55.5770, 37.9080),
    "звенигород": (55.7330, 36.8550),
    "данков": (53.2500, 39.1500),
    "чульман": (56.8500, 124.9000),
    "венев": (54.3500, 38.2700),
    "кучино": (55.7500, 37.9600),
    "старый оскол": (51.2967, 37.8417),
    "гагарин": (55.5529, 35.0),
    "смоленская": (54.7826, 32.0453),
    "белгородская": (50.5997, 36.5983),
    "домодедово аэропорт": (55.4100, 37.9000),
    "калининград": (54.7104, 20.4522),
    "краснодар": (45.0355, 38.9753),
    "воронеж": (51.6720, 39.1843),
    "ярославль": (57.6261, 39.8845),
    "тверь": (56.8587, 35.9176),
    "рязань": (54.6292, 39.7363),
    "липецк": (52.6031, 39.5708),
    "нижний новгород": (56.2965, 43.9361),
    "казань": (55.7961, 49.1064),
    "уфа": (54.7388, 55.9721),
    "екатеринбург": (56.8389, 60.6057),
    "красноярск": (56.0153, 92.8932),
    "ростов-на-дону": (47.2357, 39.7015),
    "самара": (53.1959, 50.1002),
    "вологда": (59.2239, 39.8839),
    "саранск": (54.1874, 45.1839),
}

REGION_COORDS = {
    "московская": (55.75, 37.0),
    "москва": (55.7558, 37.6173),
    "ленинградская": (59.9, 30.5),
    "санкт-петербург": (59.9343, 30.3351),
    "тульская": (54.2, 37.6),
    "калужская": (54.5, 36.3),
    "тверская": (57.0, 35.5),
    "владимирская": (56.1, 40.4),
    "ярославская": (57.6, 39.9),
    "рязанская": (54.6, 39.7),
    "нижегородская": (56.3, 43.9),
    "вологодская": (59.2, 39.9),
    "воронежская": (51.7, 39.2),
    "липецкая": (52.6, 39.6),
    "белгородская": (50.6, 36.6),
    "смоленская": (54.8, 32.0),
    "краснодарский край": (45.0, 39.0),
    "красноярский край": (56.0, 93.0),
    "свердловская": (56.8, 60.6),
    "челябинская": (55.2, 61.4),
    "татарстан": (55.8, 49.1),
    "башкортостан": (54.7, 56.0),
    "республика башкортостан": (54.7, 56.0),
    "мордовия": (54.2, 45.2),
    "чувашия": (56.1, 47.2),
    "ростовская": (47.2, 39.7),
}


def _norm_key(s):
    s = (s or "").lower().replace("ё", "е").strip()
    s = re.sub(r"\s+", " ", s)
    return s


def extract_locality(place, region=""):
    """City/settlement from public place string — never a street address."""
    p = re.sub(r"https?://\S+", "", norm_place(place)).strip()
    if not p:
        return (region or "").strip()

    # "Москва (м.Озерная)" -> Москва
    p = re.sub(r"\([^)]*\)", " ", p)
    p = re.sub(r"\s+", " ", p).strip(" ·,-")

    parts = [x.strip() for x in re.split(r"[,;/]", p) if x.strip()]
    skip = re.compile(
        r"область|край|респ|округ|производство|склад|завод|комбинат|фабрик|"
        r"отель|парк|агро|цех|участок|молокозавод|мясокомбинат|птицефабрик|"
        r"водонагрев|морепродукт|корпоративн|готов",
        re.I,
    )
    for cand in reversed(parts):
        c = re.sub(r"^(г\.|пгт\.?|пос\.|п\.|с\.|дер\.|д\.)\s*", "", cand, flags=re.I).strip()
        c = re.sub(r"\s+", " ", c)
        if len(c) < 2:
            continue
        if skip.search(c) and len(parts) > 1:
            continue
        return c
    # last resort: region
    return (region or parts[-1] if parts else "").strip()


def norm_place(v):
    if v is None:
        return ""
    return str(v).strip()


def load_cache():
    if CACHE_PATH.exists():
        try:
            return json.loads(CACHE_PATH.read_text(encoding="utf-8"))
        except Exception:
            return {}
    return {}


def save_cache(cache):
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    CACHE_PATH.write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8")


def lookup_static(locality, region=""):
    key = _norm_key(locality)
    reg = _norm_key(region)

    # special: Благовещенск in Bashkortostan vs Amur
    if "благовещенск" in key and ("башк" in reg or "башкортостан" in reg):
        return 55.0490, 55.9560, "Благовещенск (Башкортостан)"

    # Успенск/Успенское в МО vs одноимённые на юге
    if ("успенск" in key) and ("москов" in reg or reg == "москва"):
        return 55.7280, 37.0900, locality

    hit = None
    if key in CITY_COORDS:
        lat, lng = CITY_COORDS[key]
        hit = (lat, lng, locality)
    else:
        key2 = re.sub(r"\s+(район|р-н)$", "", key).strip()
        if key2 in CITY_COORDS:
            lat, lng = CITY_COORDS[key2]
            hit = (lat, lng, locality)
        else:
            for city, (lat, lng) in CITY_COORDS.items():
                if city in key or key in city:
                    hit = (lat, lng, locality)
                    break

    if hit:
        lat, lng, label = hit
        # Sanity: МО/Москва не могут оказаться на юге/сибири из-за тёзок
        if ("москов" in reg or reg == "москва") and not (54.2 <= lat <= 57.0 and 35.0 <= lng <= 40.5):
            if reg in REGION_COORDS:
                rlat, rlng = REGION_COORDS["московская" if "москов" in reg else "москва"]
                return rlat, rlng, locality
        return hit

    if reg in REGION_COORDS:
        lat, lng = REGION_COORDS[reg]
        return lat, lng, region or locality

    for rk, (lat, lng) in REGION_COORDS.items():
        if rk in reg or reg in rk:
            return lat, lng, region or locality

    return None


def nominatim_geocode(locality, region="", cache=None, sleep=1.1):
    """Optional online geocode; results cached. City-level query only."""
    if cache is None:
        cache = {}
    q_key = _norm_key(f"{locality}|{region}")
    if q_key in cache and cache[q_key]:
        c = cache[q_key]
        return c["lat"], c["lng"], c.get("label") or locality

    query = ", ".join([x for x in [locality, region, "Россия"] if x])
    params = urllib.parse.urlencode(
        {"q": query, "format": "json", "limit": 1, "countrycodes": "ru"}
    )
    url = f"https://nominatim.openstreetmap.org/search?{params}"
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "CVZ-vacancy-map/1.0 (internal prototype)"},
    )
    try:
        time.sleep(sleep)
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        if not data:
            cache[q_key] = None
            return None
        lat = float(data[0]["lat"])
        lng = float(data[0]["lon"])
        label = data[0].get("display_name", locality).split(",")[0]
        cache[q_key] = {"lat": lat, "lng": lng, "label": label}
        return lat, lng, label
    except Exception:
        return None


def geocode(place, region="", cache=None, use_network=False):
    """Return (lat, lng, geo_label) or None. Never uses street addresses."""
    locality = extract_locality(place, region)
    if not locality and not region:
        return None

    hit = lookup_static(locality, region)
    if hit:
        return hit

    if cache is None:
        cache = load_cache()
    q_key = _norm_key(f"{locality}|{region}")
    if q_key in cache and cache[q_key]:
        c = cache[q_key]
        return c["lat"], c["lng"], c.get("label") or locality

    if use_network and locality:
        hit = nominatim_geocode(locality, region, cache=cache)
        if hit:
            save_cache(cache)
            return hit

    # last: region only
    hit = lookup_static(region, region)
    if hit:
        return hit
    return None
