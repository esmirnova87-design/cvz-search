# -*- coding: utf-8 -*-
"""Apply need-update plan JSON to ПОТРЕБНОСТЬ1 (M / Ж / СП / optionally Должность).

Usage:
  python scripts/apply_need_updates.py path/to/plan.json --dry-run
  python scripts/apply_need_updates.py path/to/plan.json --write
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

from google.oauth2 import service_account
from googleapiclient.discovery import build

sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parents[1]
cfg = json.loads((ROOT / "sheets-config.json").read_text(encoding="utf-8"))
SA = ROOT / "secrets" / "google-service-account.json"


def col_a1(col_idx: int) -> str:
    letters = ""
    c = col_idx
    while c:
        c, rem = divmod(c - 1, 26)
        letters = chr(65 + rem) + letters
    return letters


def sheets_service(write: bool):
    scopes = [
        "https://www.googleapis.com/auth/spreadsheets"
        if write
        else "https://www.googleapis.com/auth/spreadsheets.readonly"
    ]
    creds = service_account.Credentials.from_service_account_file(str(SA), scopes=scopes)
    return build("sheets", "v4", credentials=creds, cache_discovery=False)


def main() -> None:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    write = "--write" in sys.argv
    if not args:
        raise SystemExit("Usage: apply_need_updates.py plan.json [--write]")
    plan = json.loads(Path(args[0]).read_text(encoding="utf-8"))
    updates = plan.get("updates") or []
    if not updates:
        print("No updates in plan")
        return

    svc = sheets_service(write)
    sid = cfg["spreadsheetId"]
    sheet = cfg.get("sheetName") or "ПОТРЕБНОСТЬ1"
    header = (
        svc.spreadsheets()
        .values()
        .get(spreadsheetId=sid, range=f"'{sheet}'!1:1")
        .execute()
        .get("values", [[]])[0]
    )
    # normalize header cells
    header_norm = [str(h).strip() if h is not None else "" for h in header]

    def col(name: str) -> int:
        try:
            return header_norm.index(name) + 1
        except ValueError as e:
            raise SystemExit(f"Column not found: {name}") from e

    col_m, col_zh, col_sp, col_job = col("М"), col("Ж"), col("СП"), col("Должность")
    data = []
    for u in updates:
        r = u.get("sheetRow")
        if not r:
            print("skip (no sheetRow):", u.get("id"), u.get("object"))
            continue
        print(
            f"ID {u.get('id')} row {r}: M {u.get('from_m')!r}->{u.get('m')!r} "
            f"Ж {u.get('from_zh')!r}->{u.get('zh')!r} СП {u.get('from_sp')!r}->{u.get('sp')!r}"
        )
        data.append({"range": f"'{sheet}'!{col_a1(col_m)}{r}", "values": [[u.get("m", "")]]})
        data.append({"range": f"'{sheet}'!{col_a1(col_zh)}{r}", "values": [[u.get("zh", "")]]})
        data.append({"range": f"'{sheet}'!{col_a1(col_sp)}{r}", "values": [[u.get("sp", "")]]})
        if u.get("job") is not None and u.get("update_job"):
            data.append(
                {"range": f"'{sheet}'!{col_a1(col_job)}{r}", "values": [[u.get("job")]]}
            )
            print(f"  job -> {u.get('job')!r}")

    if not write:
        print(f"Dry-run: {len(updates)} row updates, {len(data)} cells. Re-run with --write.")
        return

    resp = (
        svc.spreadsheets()
        .values()
        .batchUpdate(
            spreadsheetId=sid,
            body={"valueInputOption": "USER_ENTERED", "data": data},
        )
        .execute()
    )
    print("updated cells", resp.get("totalUpdatedCells"))


if __name__ == "__main__":
    main()
