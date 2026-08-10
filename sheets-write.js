/* Google Sheets write via service account JWT (stored only in localStorage). */
(function (global) {
  "use strict";

  const LS_KEY = "cvz_sheets_sa_json";
  const SCOPE = "https://www.googleapis.com/auth/spreadsheets";

  function loadSa() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function saveSa(obj) {
    localStorage.setItem(LS_KEY, JSON.stringify(obj));
  }

  function clearSa() {
    localStorage.removeItem(LS_KEY);
  }

  function pemToArrayBuffer(pem) {
    const b64 = pem
      .replace(/-----BEGIN PRIVATE KEY-----/, "")
      .replace(/-----END PRIVATE KEY-----/, "")
      .replace(/\s+/g, "");
    const raw = atob(b64);
    const buf = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) buf[i] = raw.charCodeAt(i);
    return buf.buffer;
  }

  function b64url(bytes) {
    let s;
    if (typeof bytes === "string") s = btoa(bytes);
    else {
      let bin = "";
      const arr = new Uint8Array(bytes);
      for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
      s = btoa(bin);
    }
    return s.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  async function importPrivateKey(pem) {
    return crypto.subtle.importKey(
      "pkcs8",
      pemToArrayBuffer(pem),
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"]
    );
  }

  async function getAccessToken(sa) {
    const now = Math.floor(Date.now() / 1000);
    const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const claim = b64url(
      JSON.stringify({
        iss: sa.client_email,
        scope: SCOPE,
        aud: "https://oauth2.googleapis.com/token",
        iat: now,
        exp: now + 3600,
      })
    );
    const toSign = `${header}.${claim}`;
    const key = await importPrivateKey(sa.private_key);
    const sig = await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      key,
      new TextEncoder().encode(toSign)
    );
    const jwt = `${toSign}.${b64url(sig)}`;
    const body = new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    });
    const resp = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const data = await resp.json();
    if (!resp.ok || !data.access_token) {
      throw new Error(data.error_description || data.error || "Не удалось получить токен Google");
    }
    return data.access_token;
  }

  function colA1(colIdx) {
    let c = colIdx;
    let letters = "";
    while (c) {
      const rem = (c - 1) % 26;
      letters = String.fromCharCode(65 + rem) + letters;
      c = Math.floor((c - 1) / 26);
    }
    return letters;
  }

  async function applyPlan(plan, sheetsConfig) {
    const sa = loadSa();
    if (!sa || !sa.private_key || !sa.client_email) {
      throw new Error("Сначала загрузите ключ service account (кнопка ниже на этой вкладке).");
    }
    const token = await getAccessToken(sa);
    const sid = sheetsConfig.spreadsheetId;
    const sheet = sheetsConfig.sheetName || "ПОТРЕБНОСТЬ1";
    const headerResp = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sid}/values/'${encodeURIComponent(sheet)}'!1:1`,
      { headers: { Authorization: "Bearer " + token } }
    );
    const headerJson = await headerResp.json();
    if (!headerResp.ok) throw new Error(headerJson.error?.message || "Ошибка чтения заголовков Sheet");
    const header = (headerJson.values && headerJson.values[0]) || [];
    const headerNorm = header.map((h) => String(h == null ? "" : h).trim());
    const col = (name) => {
      const i = headerNorm.indexOf(name);
      if (i < 0) throw new Error("Нет столбца " + name);
      return i + 1;
    };
    const colM = col("М");
    const colZh = col("Ж");
    const colSp = col("СП");
    const colJob = col("Должность");

    const rows = [...(plan.updates || []), ...(plan.cleared || [])];
    const data = [];
    for (const u of rows) {
      if (!u.sheetRow) continue;
      data.push({ range: `'${sheet}'!${colA1(colM)}${u.sheetRow}`, values: [[u.m || ""]] });
      data.push({ range: `'${sheet}'!${colA1(colZh)}${u.sheetRow}`, values: [[u.zh || ""]] });
      data.push({ range: `'${sheet}'!${colA1(colSp)}${u.sheetRow}`, values: [[u.sp || ""]] });
      if (u.update_job && u.job != null) {
        data.push({ range: `'${sheet}'!${colA1(colJob)}${u.sheetRow}`, values: [[u.job]] });
      }
    }
    if (!data.length) return { updated: 0 };

    const resp = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sid}/values:batchUpdate`,
      {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ valueInputOption: "USER_ENTERED", data }),
      }
    );
    const json = await resp.json();
    if (!resp.ok) throw new Error(json.error?.message || "Ошибка записи в Sheet");
    return { updated: json.totalUpdatedCells || data.length };
  }

  global.CVZ_SHEETS_WRITE = {
    loadSa,
    saveSa,
    clearSa,
    applyPlan,
    hasSa: () => !!loadSa(),
  };
})(window);
