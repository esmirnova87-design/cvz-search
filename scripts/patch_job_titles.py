# -*- coding: utf-8 -*-
"""One-shot helpers: list headers / patch jobs when SA has Editor access."""
import json
import sys
from pathlib import Path

from google.oauth2 import service_account
from googleapiclient.discovery import build

sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parents[1]
cfg = json.loads((ROOT / "sheets-config.json").read_text(encoding="utf-8"))
sa = ROOT / "secrets" / "google-service-account.json"

UPDATES = {
    26: "водитель-тракторист (водитель спецтехники)",
    43: "водитель ВАП (водитель спецтехники)",
    52: "водитель-тракторист (водитель спецтехники) / разнорабочий",
    61: "шиповальщик (РФ!) (другая)",
    169: "сборка заказов (сборщик)",
    394: "фасовщик/упаковщик",
    444: "упаковщик/фасовщик/маркировщик",
    493: "боец скота / разнорабочий / мойщик",
    505: "ВЭШ (водитель спецтехники)",
    521: "водитель спецтехники",
    527: "ВЭШ с опытом (водитель спецтехники)",
}


def col_a1(col_idx: int) -> str:
    letters = ""
    c = col_idx
    while c:
        c, rem = divmod(c - 1, 26)
        letters = chr(65 + rem) + letters
    return letters


def main():
    write = "--write" in sys.argv
    scopes = [
        "https://www.googleapis.com/auth/spreadsheets"
        if write
        else "https://www.googleapis.com/auth/spreadsheets.readonly"
    ]
    creds = service_account.Credentials.from_service_account_file(str(sa), scopes=scopes)
    svc = build("sheets", "v4", credentials=creds, cache_discovery=False)
    sid = cfg["spreadsheetId"]
    sheet = cfg.get("sheetName") or "ПОТРЕБНОСТЬ1"

    header = (
        svc.spreadsheets()
        .values()
        .get(spreadsheetId=sid, range=f"'{sheet}'!1:1")
        .execute()
        .get("values", [[]])[0]
    )
    print("COLUMNS:")
    for i, h in enumerate(header, 1):
        print(f"  {i}\t{h}")

    job_col = header.index("Должность") + 1
    id_vals = (
        svc.spreadsheets()
        .values()
        .get(spreadsheetId=sid, range=f"'{sheet}'!A:A")
        .execute()
        .get("values", [])
    )

    planned = []
    for r_i, row in enumerate(id_vals[1:], start=2):
        if not row:
            continue
        try:
            vid = int(float(str(row[0]).replace(",", ".")))
        except ValueError:
            continue
        if vid in UPDATES:
            planned.append((r_i, vid, UPDATES[vid]))

    missing = sorted(set(UPDATES) - {v for _, v, _ in planned})
    print(f"planned updates: {len(planned)}; missing IDs in sheet: {missing}")
    for r_i, vid, val in planned:
        print(f"  ID {vid} row {r_i}: {val}")

    if not write:
        print("Dry-run only. Re-run with --write after granting Editor to service account.")
        return

    body = {
        "valueInputOption": "USER_ENTERED",
        "data": [
            {"range": f"'{sheet}'!{col_a1(job_col)}{r_i}", "values": [[val]]}
            for r_i, vid, val in planned
        ],
    }
    resp = svc.spreadsheets().values().batchUpdate(spreadsheetId=sid, body=body).execute()
    print("updated cells", resp.get("totalUpdatedCells"))


if __name__ == "__main__":
    main()
