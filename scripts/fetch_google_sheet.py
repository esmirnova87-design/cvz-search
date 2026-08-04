# -*- coding: utf-8 -*-
"""Download the ЦВЗ Google Sheet as xlsx for export_vacancies.py.

Primary (simple): spreadsheet shared as «Anyone with the link → Viewer»
  python scripts/fetch_google_sheet.py

Optional (private): service account JSON shared on the sheet
  set GOOGLE_SERVICE_ACCOUNT_FILE=path/to.json
  or place file at secrets/google-service-account.json
"""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONFIG_PATH = ROOT / "sheets-config.json"
OUT_XLSX = ROOT / "data" / "google-potrebnost.xlsx"
DEFAULT_SA = ROOT / "secrets" / "google-service-account.json"


def load_config():
    cfg = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    sid = cfg.get("spreadsheetId") or cfg.get("spreadsheet_id")
    if not sid:
        raise SystemExit("sheets-config.json: missing spreadsheetId")
    return cfg


def download_public_xlsx(spreadsheet_id: str, dest: Path) -> None:
    """Works when sheet is shared: Anyone with the link can view."""
    url = f"https://docs.google.com/spreadsheets/d/{spreadsheet_id}/export?format=xlsx"
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "CVZ-sheet-sync/1.0"},
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        data = resp.read()
        ctype = (resp.headers.get("Content-Type") or "").lower()
    if len(data) < 1000 or "html" in ctype:
        raise RuntimeError(
            "Google вернул не Excel. Обычно таблица закрыта для анонимного доступа. "
            "Откройте доступ: «Настройки доступа → Все, у кого есть ссылка → Читатель»."
        )
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)


def download_via_service_account(spreadsheet_id: str, dest: Path, sa_path: Path) -> None:
    """Private sheets: share the spreadsheet with the service account email."""
    try:
        from google.oauth2 import service_account
        from googleapiclient.discovery import build
    except ImportError as e:
        raise SystemExit(
            "Нужны пакеты: pip install google-auth google-api-python-client\n" + str(e)
        ) from e

    scopes = ["https://www.googleapis.com/auth/drive.readonly"]
    creds = service_account.Credentials.from_service_account_file(str(sa_path), scopes=scopes)
    drive = build("drive", "v3", credentials=creds, cache_discovery=False)
    request = drive.files().export_media(
        fileId=spreadsheet_id,
        mimeType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
    data = request.execute()
    if not data or len(data) < 1000:
        raise RuntimeError("Пустой ответ Drive export")
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)


def resolve_sa_path() -> Path | None:
    env = os.environ.get("GOOGLE_SERVICE_ACCOUNT_FILE") or os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
    if env and Path(env).exists():
        return Path(env)
    if DEFAULT_SA.exists():
        return DEFAULT_SA
    return None


def fetch(dest: Path | None = None) -> Path:
    cfg = load_config()
    sid = cfg["spreadsheetId"]
    dest = dest or OUT_XLSX
    sa = resolve_sa_path()

    errors = []
    if sa:
        try:
            print(f"fetch via service account: {sa.name}")
            download_via_service_account(sid, dest, sa)
            print(f"saved {dest} ({dest.stat().st_size} bytes)")
            return dest
        except Exception as e:
            errors.append(f"service account: {e}")
            print(f"service account failed: {e}")

    try:
        print("fetch via public link export…")
        download_public_xlsx(sid, dest)
        print(f"saved {dest} ({dest.stat().st_size} bytes)")
        return dest
    except urllib.error.HTTPError as e:
        errors.append(f"public export HTTP {e.code}")
    except Exception as e:
        errors.append(f"public export: {e}")

    msg = (
        "Не удалось скачать Google-таблицу.\n"
        + "\n".join(f"- {x}" for x in errors)
        + "\n\nСделайте одно из двух:\n"
        "1) Быстро: в таблице «Настройки доступа» → «Все, у кого есть ссылка» → Читатель\n"
        "2) Безопаснее: service account JSON в secrets/google-service-account.json "
        "и доступ к таблице на email из JSON (client_email).\n"
    )
    raise SystemExit(msg)


if __name__ == "__main__":
    fetch()
