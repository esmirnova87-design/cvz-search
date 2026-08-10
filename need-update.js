/* ЦВЗ — обновление потребности по заявке заказчика (PersonalResourse + каркас). */
(function (global) {
  "use strict";

  function norm(s) {
    return String(s || "")
      .toLowerCase()
      .replace(/ё/g, "е")
      .replace(/[❗️🔥⬇️]/g, " ")
      .replace(/[^\p{L}\p{N}\s+/\\-]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function tokens(s) {
    return norm(s)
      .split(" ")
      .filter((t) => t.length >= 3 && !/^\d+$/.test(t));
  }

  function shortObj(s) {
    return oneLine(s).slice(0, 42);
  }

  function oneLine(s) {
    return String(s || "").replace(/\s+/g, " ").trim();
  }

  function guessGender(title) {
    const t = norm(title);
    if (/горнич|уборщиц|помощниц|посудомо|комплектовщиц|упаковщиц/.test(t)) return "zh";
    if (/дворник|хаусмен|карщик|грузчик|охранник/.test(t)) return "m";
    return "any";
  }

  function isNoiseTitle(tl) {
    return /^(график|строгое|только|без|судимост|упаковка|до|лет|час|часов|смен|кондитер|горячий|цех|универсал|по|и|на|от|обл|область|мос|край|места|пар|сп|семейн)/i.test(
      tl
    );
  }

  /**
   * Важно: в JS \b не считает кириллицу «словом», поэтому после М/Ж границы не ставим.
   * После буквы пола ждём не-букву или конец: 15М\5Ж, 6М, 4М+1карщик.
   */
  function parseCountBlock(raw) {
    let text = String(raw || "");
    let m = 0;
    let zh = 0;
    let sp = 0;
    let hasM = false;
    let hasZh = false;
    let hasSp = false;
    const roles = [];

    text = text.replace(/приоритет/gi, " ");

    // ЯППИ: 1СЕМ.ПАР / 2 сем пар; PR: 2 семейных места; NСП
    const family =
      text.match(/(\d+)\s*сем\.?\s*пар\w*/i) ||
      text.match(/(\d+)\s*семейн\w*(?:\s*(?:места|пар[ыа])?)?/i) ||
      text.match(/(\d+)\s*сп(?=[^а-яёa-z]|$)/i);
    if (family) {
      sp = parseInt(family[1], 10);
      hasSp = true;
      m += sp;
      zh += sp;
      hasM = true;
      hasZh = true;
      text = text.replace(family[0], " ");
    }

    // «3М дворники»
    text = text.replace(/(\d+)\s*([мm])\s+([а-яёa-z]{3,}(?:\s+[а-яёa-z]{3,}){0,2})/gi, (all, n, _g, title) => {
      const first = title.trim().split(/\s+/)[0];
      if (isNoiseTitle(first)) return all;
      roles.push({ count: parseInt(n, 10), title: title.trim(), gender: "m" });
      return " ";
    });
    text = text.replace(/(\d+)\s*([жf])\s+([а-яёa-z]{3,}(?:\s+[а-яёa-z]{3,}){0,2})/gi, (all, n, _g, title) => {
      const first = title.trim().split(/\s+/)[0];
      if (isNoiseTitle(first)) return all;
      roles.push({ count: parseInt(n, 10), title: title.trim(), gender: "zh" });
      return " ";
    });

    // голые 10М / 5Ж (кириллица и латиница)
    text = text.replace(/(\d+)\s*[мm](?=[^а-яёa-z]|$)/gi, (_, n) => {
      m += parseInt(n, 10);
      hasM = true;
      return " ";
    });
    text = text.replace(/(\d+)\s*[жf](?=[^а-яёa-z]|$)/gi, (_, n) => {
      zh += parseInt(n, 10);
      hasZh = true;
      return " ";
    });

    // «5 Горничных», «1карщик»
    text = text.replace(/(\d+)\s*([а-яёa-z]{3,}(?:\s+[а-яёa-z]{3,}){0,2})/gi, (all, n, title) => {
      const t = title.trim();
      const first = t.split(/\s+/)[0];
      if (isNoiseTitle(first)) return " ";
      roles.push({ count: parseInt(n, 10), title: t, gender: guessGender(t) });
      return " ";
    });

    for (const r of roles) {
      if (r.gender === "m") {
        m += r.count;
        hasM = true;
      } else if (r.gender === "zh") {
        zh += r.count;
        hasZh = true;
      }
    }

    return { m, zh, sp, hasM, hasZh, hasSp, roles, raw: String(raw || "") };
  }

  function finalizeSp(counts) {
    let sp = "";
    if (counts.hasSp) sp = String(counts.sp);
    else if (counts.hasM && counts.hasZh) sp = "да";
    return {
      m: counts.hasM ? String(counts.m) : "",
      zh: counts.hasZh ? String(counts.zh) : "",
      sp,
    };
  }

  function parsePersonalResourse(text) {
    const lines = String(text || "").split(/\r?\n/);
    const items = [];
    for (const line of lines) {
      const clean = line.replace(/[🔥⬇️]/g, "").trim();
      if (!clean || clean.length < 8) continue;
      if (/добрый\s+день|коллеги|потребность\s+на/i.test(clean)) continue;
      if (!/[❗️❗!]/.test(line) && !/\d+\s*[мжmfw]/i.test(clean) && !/\d+\s*[А-Яа-яЁёA-Za-z]{4,}/.test(clean)) {
        continue;
      }

      const parts = clean.split(/❗️|❗|!|\uFE0F/g).map((x) => x.trim()).filter(Boolean);
      const head = (parts[0] || "").trim();
      const tail = parts.slice(1).join(" ").trim();
      if (!head) continue;

      const headNorm = head.replace(/\s+/g, " ").trim();
      let counts = parseCountBlock(tail || head);
      if (!counts.hasM && !counts.hasZh && !counts.roles.length) {
        counts = parseCountBlock(headNorm);
      }

      const need = finalizeSp(counts);
      need.rolesAny = (counts.roles || []).filter((r) => r.gender === "any");
      need.onlyRoles = !counts.hasM && !counts.hasZh && !!(counts.roles || []).length;
      need.roles = counts.roles || [];

      items.push({
        raw: clean,
        place: headNorm,
        ...need,
      });
    }
    return items;
  }

  function cleanYappiLoc(s) {
    return String(s || "")
      .replace(/^г\.?\s*/i, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function looksLikeYappiNeed(cell) {
    const t = String(cell || "");
    return /\d+\s*[мжmМЖ]/i.test(t) || /\d+\s*сем/i.test(t);
  }

  /** Починка типичного OCR: латиница вместо кириллицы в М/Ж/СЕМ.ПАР */
  function normalizeYappiOcrText(text) {
    return String(text || "")
      .replace(/\u00a0/g, " ")
      .replace(/(\d)\s*[MmМм]/g, "$1М")
      .replace(/(\d)\s*[XxЖж]/g, "$1Ж")
      .replace(/(\d)\s*[KkКк]/g, "$1Ж")
      .replace(/CEM\.?\s*PAR/gi, "СЕМ.ПАР")
      .replace(/CEM\.?\s*ПАР/gi, "СЕМ.ПАР")
      .replace(/СЕМ\s+ПАР/gi, "СЕМ.ПАР")
      .replace(/ПРИО\s*РИТЕТ/gi, "ПРИОРИТЕТ")
      .replace(/ПРИОР[И1]ТЕТ/gi, "ПРИОРИТЕТ");
  }

  /**
   * Грязный OCR: ищем NМ/NЖ/СЕМ.ПАР и тянем название проекта из текста слева.
   */
  function parseYappiLoose(text) {
    const raw = normalizeYappiOcrText(text);
    const items = [];
    const re =
      /(\d{1,2})\s*(М|Ж|СЕМ\.ПАР)(?:\s*[,/\\+]?\s*(\d{1,2})\s*(М|Ж|СЕМ\.ПАР))?(?:\s*[,/\\+]?\s*(\d{1,2})\s*(М|Ж|СЕМ\.ПАР))?/gi;
    let m;
    while ((m = re.exec(raw))) {
      const needCell = m[0];
      const counts = parseCountBlock(needCell.replace(/приоритет/gi, " "));
      if (!counts.hasM && !counts.hasZh && !counts.hasSp) continue;
      const before = raw.slice(Math.max(0, m.index - 120), m.index);
      const chunks = before
        .split(/[\n|]/)
        .map((x) => x.replace(/\s+/g, " ").trim())
        .filter(Boolean);
      let project = "";
      for (let i = chunks.length - 1; i >= 0; i--) {
        const c = chunks[i];
        if (looksLikeYappiNeed(c)) continue;
        if (/руб|смен|час|аванс|график|компенс|вакт|день|ночь|сутки|еженед/i.test(c)) continue;
        if (c.length < 3 || c.length > 90) continue;
        if (/^\d+$/.test(c)) continue;
        project = c.replace(/^\d{1,3}\s+/, "").trim();
        break;
      }
      if (!project) continue;
      const after = raw.slice(m.index + m[0].length, m.index + m[0].length + 80);
      const locM = after.match(/г\.?\s*([А-Яа-яЁёA-Za-z\-]{3,})/);
      const loc = locM ? locM[0] : "";
      const need = finalizeSp(counts);
      const place = loc ? project + ", " + cleanYappiLoc(loc) : project;
      items.push({
        raw: needCell + " @ " + project,
        place,
        project,
        vacancy: "",
        location: cleanYappiLoc(loc),
        ...need,
        roles: counts.roles || [],
      });
    }
    return items;
  }

  function colIdx(header, names) {
    for (let i = 0; i < header.length; i++) {
      const h = header[i];
      if (names.some((n) => h.includes(n))) return i;
    }
    return -1;
  }

  /**
   * ЯППИ SeaTable: ПРОЕКТ | ПОТРЕБНОСТЬ | ВАКАНСИЯ | ЛОКАЦИЯ | …
   * Вставка — табы (копипаст из таблицы) или строки «ПРОЕКТ  NМ/NЖ  …».
   * Несколько строк одного проекта оставляем отдельными: matchItems потом сольёт в один ID.
   */
  function parseYappi(text) {
    const raw = normalizeYappiOcrText(String(text || "")).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
    const items = [];

    function pushRow(project, needCell, vacancy, location) {
      const proj = String(project || "").replace(/\s+/g, " ").trim();
      if (!proj || /^#+$/.test(proj) || /^проект$/i.test(proj)) return;
      if (/потребност|ваканси|локаци|график|аванс|зарплат/i.test(proj) && proj.length < 40) return;
      if (!looksLikeYappiNeed(needCell)) return;
      const counts = parseCountBlock(needCell);
      if (!counts.hasM && !counts.hasZh && !counts.hasSp) return;
      const need = finalizeSp(counts);
      const loc = cleanYappiLoc(location);
      const place = loc ? proj + ", " + loc : proj;
      items.push({
        raw: [proj, needCell, vacancy, loc].filter(Boolean).join(" | "),
        place,
        project: proj,
        vacancy: String(vacancy || "").replace(/\s+/g, " ").trim(),
        location: loc,
        ...need,
        roles: counts.roles || [],
      });
    }

    const hasTabs = lines.some((l) => l.includes("\t"));
    if (hasTabs) {
      let header = null;
      for (const line of lines) {
        const cols = line.split("\t").map((c) => c.replace(/\s+/g, " ").trim());
        const njoin = norm(cols.join(" "));
        if (!header && /проект/.test(njoin) && /потребност/.test(njoin)) {
          header = cols.map((c) => norm(c));
          continue;
        }
        let project = "";
        let needCell = "";
        let vacancy = "";
        let location = "";
        if (header) {
          const ip = colIdx(header, ["проект"]);
          const ineed = colIdx(header, ["потребност"]);
          const iv = colIdx(header, ["ваканси"]);
          const il = colIdx(header, ["локаци"]);
          project = ip >= 0 ? cols[ip] : "";
          needCell = ineed >= 0 ? cols[ineed] : "";
          vacancy = iv >= 0 ? cols[iv] : "";
          location = il >= 0 ? cols[il] : "";
        } else {
          let start = 0;
          if (/^\d+$/.test(cols[0])) start = 1;
          project = cols[start] || "";
          needCell = cols[start + 1] || "";
          vacancy = cols[start + 2] || "";
          location = cols[start + 3] || "";
          // иногда потребность во 2-й колонке без #, но need уехала
          if (!looksLikeYappiNeed(needCell)) {
            const hit = cols.findIndex(looksLikeYappiNeed);
            if (hit > 0) {
              project = cols.slice(start, hit).join(" ").trim() || project;
              needCell = cols[hit];
              vacancy = cols[hit + 1] || vacancy;
              location = cols[hit + 2] || location;
            }
          }
        }
        pushRow(project, needCell, vacancy, location);
      }
      if (items.length) return items;
    }

    // без табов: «ПРОЕКТ … 4Ж …» или «ПРОЕКТ | 4Ж | …» или OCR (потребность на следующей строке)
    let lastProject = "";
    let lastVacancy = "";
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/проект.*потребност/i.test(line) && line.length < 80) continue;
      const pipe = line.split("|").map((x) => x.trim());
      if (pipe.length >= 2 && looksLikeYappiNeed(pipe[1])) {
        pushRow(pipe[0], pipe[1], pipe[2] || "", pipe[3] || "");
        lastProject = pipe[0];
        continue;
      }
      // почти только потребность (OCR вынес тег отдельно): «4Ж», «2Ж, 1СЕМ.ПАР», «10Ж ПРИОРИТЕТ»
      const needOnly = line.match(
        /^(\d+\s*[мжМЖmfw](?:\s*,\s*\d+\s*(?:[мжМЖmfw]|сем\.?\s*пар\w*))*(?:\s*,?\s*приоритет)?|\d+\s*сем\.?\s*пар\w*(?:\s*,?\s*приоритет)?)\s*$/i
      );
      if (needOnly && lastProject) {
        const locLine = lines[i + 1] || "";
        const loc = /^г\.?\s*/i.test(locLine) || /область|край|республик/i.test(locLine) ? locLine : "";
        pushRow(lastProject, needOnly[1], lastVacancy, loc);
        continue;
      }
      const m = line.match(
        /^(.+?)\s+(\d+\s*[мжМЖmfw](?:\s*,\s*\d+\s*(?:[мжМЖmfw]|сем\.?\s*пар\w*))*(?:\s*,?\s*приоритет)?|\d+\s*сем\.?\s*пар\w*)\b(.*)$/i
      );
      if (m) {
        const rest = (m[3] || "").trim();
        const restParts = rest.split(/\s{2,}|\t/).map((x) => x.trim()).filter(Boolean);
        pushRow(m[1], m[2], restParts[0] || "", restParts[1] || "");
        lastProject = m[1];
        lastVacancy = restParts[0] || "";
        continue;
      }
      // строка-кандидат в проект (заглавные / длинное имя без «руб»)
      if (
        line.length >= 4 &&
        line.length <= 80 &&
        !/руб|смен|час|график|аванс|зарплат|заселен|компенс/i.test(line) &&
        !looksLikeYappiNeed(line)
      ) {
        lastProject = line.replace(/^\d+\s+/, "").trim();
        lastVacancy = "";
      } else if (/упаков|уборщ|грузчик|подсоб|фасов|мойщ|комплект|монтаж|оператор|разнораб/i.test(line)) {
        lastVacancy = line;
      }
    }
    if (items.length) return items;
    return parseYappiLoose(raw);
  }

  /**
   * НЦЗ: таблица Excel/Google.
   * Потребность = число, Пол = М|Ж отдельным столбцом (не «16Ж»).
   * Один объект часто 2+ строки (разный пол/должность) → matchItems потом склеит.
   * Объединённые ячейки «Объект» — повторяем lastObject.
   */
  function parseNcz(text) {
    const raw = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
    const items = [];
    let header = null;
    let lastObject = "";
    let lastLoc = "";

    function splitCols(line) {
      if (line.includes("\t")) return line.split("\t").map((c) => c.replace(/\s+/g, " ").trim());
      // копипаст иногда через 2+ пробела
      return line.split(/\s{2,}|\s*\|\s*/).map((c) => c.replace(/\s+/g, " ").trim()).filter(Boolean);
    }

    function genderOf(cell) {
      const t = String(cell || "").trim();
      if (/^[мm]$/i.test(t) || /^муж/i.test(t)) return "m";
      if (/^[жf]$/i.test(t) || /^жен/i.test(t)) return "zh";
      return "";
    }

    function needNum(cell) {
      const m = String(cell || "").replace(/\s/g, "").match(/(\d{1,3})/);
      return m ? parseInt(m[1], 10) : 0;
    }

    for (const line of lines) {
      const cols = splitCols(line);
      if (!cols.length) continue;
      const njoin = norm(cols.join(" "));
      if (!header && /объект/.test(njoin) && /потребност/.test(njoin)) {
        header = cols.map((c) => norm(c));
        continue;
      }
      if (/^объект$/i.test(cols[0]) && cols.length < 4) continue;

      let object = "";
      let needCell = "";
      let loc = "";
      let genderCell = "";
      let vacancy = "";
      let rateCell = "";

      if (header) {
        const io = colIdx(header, ["объект"]);
        const ineed = colIdx(header, ["потребност"]);
        const il = colIdx(header, ["территориал", "локац", "город"]);
        const ig = colIdx(header, ["пол"]);
        const iv = colIdx(header, ["должност"]);
        const ir = colIdx(header, ["ставка"]);
        object = io >= 0 ? cols[io] || "" : "";
        needCell = ineed >= 0 ? cols[ineed] || "" : "";
        loc = il >= 0 ? cols[il] || "" : "";
        genderCell = ig >= 0 ? cols[ig] || "" : "";
        vacancy = iv >= 0 ? cols[iv] || "" : "";
        rateCell = ir >= 0 ? cols[ir] || "" : "";
      } else {
        // без шапки: объект | N | … | М/Ж | …
        let start = 0;
        if (/^\d+$/.test(cols[0]) && cols.length > 3) start = 1; // номер строки НЦЗ
        object = cols[start] || "";
        needCell = cols[start + 1] || "";
        // пол — короткая ячейка М/Ж
        const gi = cols.findIndex((c, idx) => idx > start && genderOf(c));
        if (gi >= 0) {
          genderCell = cols[gi];
          if (!needNum(needCell)) {
            const ni = cols.findIndex((c, idx) => idx > start && needNum(c) && !genderOf(c) && idx < gi + 3);
            if (ni >= 0) needCell = cols[ni];
          }
        }
        const locHit = cols.find((c) => /область|район|р-н|москва|г\./i.test(c) || (c.length > 4 && /ск$|ово$|ец$/i.test(c)));
        if (locHit) loc = locHit;
        const jobHit = cols.find((c) => /упаков|грузчик|сборщик|уборщ|горнич|маркир|комплект|разнораб|мойщик|фасов|корен/i.test(c));
        if (jobHit) vacancy = jobHit;
      }

      if (object && !/^-+$/.test(object) && !looksLikeYappiNeed(object) && !genderOf(object)) {
        lastObject = object;
      } else if (!object) {
        object = lastObject;
      } else {
        object = lastObject || object;
      }
      if (loc) lastLoc = loc;
      else loc = lastLoc;

      const g = genderOf(genderCell);
      let n = needNum(needCell);
      // иногда «16Ж» прямо в потребности
      if (!n && looksLikeYappiNeed(needCell)) {
        const c = parseCountBlock(needCell);
        const need = finalizeSp(c);
        if (!need.m && !need.zh) continue;
        const place = loc ? object + ", " + loc : object;
        items.push({
          raw: [object, needCell, vacancy, loc].filter(Boolean).join(" | "),
          place,
          project: object,
          vacancy: String(vacancy || "").replace(/\s+/g, " ").trim(),
          location: loc,
          ...need,
          roles: c.roles || [],
          rateHint: rateCell,
        });
        continue;
      }
      if (!object || !g || !n) continue;
      if (/потребност|территориал|гражданств/i.test(object)) continue;

      const counts = { m: 0, zh: 0, sp: 0, hasM: false, hasZh: false, hasSp: false, roles: [] };
      if (g === "m") {
        counts.m = n;
        counts.hasM = true;
      } else {
        counts.zh = n;
        counts.hasZh = true;
      }
      if (vacancy) {
        counts.roles.push({ count: n, title: vacancy, gender: g === "m" ? "m" : "zh" });
      }
      const need = finalizeSp(counts);
      const place = loc ? object + ", " + loc : object;
      items.push({
        raw: [object, n + (g === "m" ? "М" : "Ж"), vacancy, loc].filter(Boolean).join(" | "),
        place,
        project: object,
        vacancy: String(vacancy || "").replace(/\s+/g, " ").trim(),
        location: loc,
        ...need,
        roles: counts.roles,
        rateHint: rateCell,
      });
    }
    return items;
  }

  function numNeed(v) {
    const n = parseInt(String(v || "").trim(), 10);
    return Number.isFinite(n) ? n : 0;
  }

  /** Сложить две строки заявки, попавшие в один ID Sheet (Бимбо 1Ж + 8М). */
  function mergeNeedItems(a, b) {
    const m = numNeed(a.m) + numNeed(b.m);
    const zh = numNeed(a.zh) + numNeed(b.zh);
    const hasM = !!(a.m || b.m);
    const hasZh = !!(a.zh || b.zh);
    let spNum = 0;
    let hasSpNum = false;
    for (const x of [a, b]) {
      if (x.sp && x.sp !== "да" && /^\d+$/.test(String(x.sp))) {
        spNum += parseInt(x.sp, 10);
        hasSpNum = true;
      }
    }
    let sp = "";
    if (hasSpNum) sp = String(spNum);
    else if (hasM && hasZh) sp = "да";
    return {
      ...a,
      place: a.place || b.place,
      vacancy: [a.vacancy, b.vacancy].filter(Boolean).join(" + "),
      raw: (a.raw || "") + " || " + (b.raw || ""),
      m: hasM ? String(m) : "",
      zh: hasZh ? String(zh) : "",
      sp,
      roles: [].concat(a.roles || [], b.roles || []),
    };
  }

  function jobScore(vacancy, job) {
    if (!vacancy || !job) return 0;
    const j = norm(job);
    let s = 0;
    for (const t of tokens(vacancy)) {
      if (j.includes(t)) s += t.length >= 5 ? 3 : 2;
    }
    return s;
  }

  function editDistance(a, b) {
    if (a === b) return 0;
    if (Math.abs(a.length - b.length) > 2) return 99;
    const aa = a;
    const bb = b;
    const dp = Array.from({ length: aa.length + 1 }, () => []);
    for (let i = 0; i <= aa.length; i++) dp[i][0] = i;
    for (let j = 0; j <= bb.length; j++) dp[0][j] = j;
    for (let i = 1; i <= aa.length; i++) {
      for (let j = 1; j <= bb.length; j++) {
        const cost = aa[i - 1] === bb[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
      }
    }
    return dp[aa.length][bb.length];
  }

  function scoreMatch(place, row) {
    const o = norm(row.object);
    const pt = tokens(place);
    if (!pt.length || !o) return 0;

    const CITY_ALIASES = [
      ["переславль", "переяславль"],
      ["питер", "санкт-петербург", "спб"],
      ["орел", "орёл"],
      ["старотитаровская", "старотиторовская"],
    ];
    function expand(t) {
      const out = new Set([t]);
      for (const group of CITY_ALIASES) {
        if (group.some((g) => t === g || t.includes(g) || g.includes(t))) group.forEach((g) => out.add(g));
      }
      return [...out];
    }
    function tokenIn(hay, t) {
      for (const a of expand(t)) {
        if (a.length < 3) continue;
        if (hay.includes(a)) return true;
        // овощи ↔ овощей: общий корень
        if (a.length >= 4) {
          const stem = a.slice(0, Math.min(5, a.length - (a.length > 5 ? 1 : 0)));
          if (stem.length >= 4 && hay.includes(stem)) return true;
        }
        // опечатка в 1 букву (старотитаровская / старотиторовская)
        if (a.length >= 8) {
          const words = hay.split(/\s+/);
          const maxD = a.length >= 12 ? 2 : 1;
          if (words.some((w) => w.length >= 6 && editDistance(w, a) <= maxD)) return true;
        }
      }
      return false;
    }

    const generic = /производ|комбинат|фабрик|склад|отель|мяс|кондитер|пищев|завод|цех|объект|вакан/;
    const geoToks = [];
    String(place)
      .split(",")
      .forEach((seg) => {
        tokens(seg).forEach((t) => {
          if (t.length >= 4 && !generic.test(t)) geoToks.push(t);
        });
      });
    const geoHit = geoToks.some((t) => tokenIn(o, t));
    if (geoToks.length && !geoHit) return 0;

    const distinctive = pt.filter((t) =>
      /чипс|плитк|чай|фарм|наггет|крабов|бортпит|рыб|хлеб|овощ|одежд|тепловой|винзавод|ликер|кондитерк|готов/.test(t)
    );

    let score = 0;
    let hit = 0;
    for (const t of pt) {
      if (tokenIn(o, t)) {
        hit += 1;
        score += t.length >= 5 ? 3 : 2;
      }
    }
    if (hit === 0) return 0;
    if (geoHit) score += 5;
    for (const t of distinctive) {
      if (tokenIn(o, t)) score += 6;
      else score -= 4;
    }
    score += (hit / pt.length) * 4;
    return score;
  }

  let NEED_ALIASES = {};

  function setAliases(data) {
    NEED_ALIASES = data || {};
  }

  function aliasMatch(item, pool, customer) {
    const list = NEED_ALIASES[customer] || NEED_ALIASES[norm(customer)] || [];
    // place + вакансия: у НЦЗ «маркировщик» только в должности, не в объекте
    const hay = norm([item.place, item.vacancy, item.project].filter(Boolean).join(" "));
    for (const rule of list) {
      const keys = rule.all || rule.match || [];
      if (!keys.length) continue;
      if (keys.every((k) => hay.includes(norm(k)))) {
        const row = pool.find((r) => String(r.id) === String(rule.id));
        if (row) return row;
      }
    }
    return null;
  }

  function hasMax(row) {
    return !!(row && String(row.max || "").trim());
  }

  function matchItems(items, rows, customer) {
    const poolAll = rows.filter((r) => norm(r.customer) === norm(customer));
    const pool = poolAll.filter(hasMax);
    const poolNoMax = poolAll.filter((r) => !hasMax(r));
    const used = new Set();
    const matched = [];
    const ambiguous = [];
    const missing = [];
    const noMaxHits = [];

    function rankPool(list, it) {
      return list
        .map((r) => {
          let s = scoreMatch(it.place, r);
          const js = jobScore(it.vacancy, r.job);
          if (js) s += js;
          return { r, s };
        })
        .filter((x) => x.s >= 4)
        .sort((a, b) => b.s - a.s);
    }

    function takeMatch(it, row, score) {
      if (!hasMax(row)) {
        noMaxHits.push({ item: it, row });
        return;
      }
      const prev = matched.find((m) => String(m.row.id) === String(row.id));
      if (prev) {
        prev.item = mergeNeedItems(prev.item, it);
        prev.score = Math.max(prev.score || 0, score || 0);
        return;
      }
      if (used.has(row.id)) {
        ambiguous.push({
          item: it,
          candidates: [{ id: row.id, object: row.object }],
          note: "ID уже занят другой строкой заявки",
        });
        return;
      }
      used.add(row.id);
      matched.push({ item: it, row, score });
    }

    for (const it of items) {
      const forced = aliasMatch(it, poolAll, customer);
      if (forced) {
        takeMatch(it, forced, 100);
        continue;
      }

      const ranked = rankPool(pool, it);
      const top = ranked[0];
      const second = ranked[1];
      if (!top) {
        const rankedEmpty = rankPool(poolNoMax, it);
        if (rankedEmpty[0]) {
          noMaxHits.push({ item: it, row: rankedEmpty[0].r });
        } else {
          missing.push(it);
        }
        continue;
      }
      if (second && top.s - second.s < 1.5 && second.s >= 4) {
        // доматч по вакансии, если она есть
        if (it.vacancy) {
          const byJob = ranked
            .map((x) => ({ ...x, js: jobScore(it.vacancy, x.r.job) }))
            .filter((x) => x.js > 0)
            .sort((a, b) => b.js - a.js || b.s - a.s);
          if (byJob[0] && (!byJob[1] || byJob[0].js > byJob[1].js)) {
            takeMatch(it, byJob[0].r, byJob[0].s);
            continue;
          }
        }
        ambiguous.push({
          item: it,
          candidates: ranked.slice(0, 3).map((x) => ({ id: x.r.id, object: x.r.object })),
        });
        continue;
      }
      takeMatch(it, top.r, top.s);
    }
    return { matched, ambiguous, missing, noMaxHits, pool, poolAll, used };
  }

  function jobLines(job) {
    return String(job || "")
      .split(/\n+/)
      .map((x) => x.trim())
      .filter(Boolean);
  }

  function maybeUpdateJob(row, item) {
    const lines = jobLines(row.job);
    const oneGender = (item.m && !item.zh) || (!item.m && item.zh);
    if (oneGender && lines.length === 1) {
      const n = item.m || item.zh;
      const base = lines[0].replace(/\s*\d+\s*[мжmfw]?\s*$/i, "").replace(/\s+\d+\s*$/, "").trim();
      return { update_job: true, job: `${base} ${n}`.trim() };
    }
    if (item.m && item.zh && lines.length === 2) {
      const g0 = guessGender(lines[0]);
      const g1 = guessGender(lines[1]);
      if ((g0 === "m" && g1 === "zh") || (g0 === "zh" && g1 === "m")) {
        const out = lines.map((ln) => {
          const g = guessGender(ln);
          const n = g === "m" ? item.m : item.zh;
          const base = ln.replace(/\s*\d+\s*[мжmfw]?\s*$/i, "").replace(/\s+\d+\s*$/, "").trim();
          return `${base} ${n}`.trim();
        });
        return { update_job: true, job: out.join("\n") };
      }
    }
    if (item.roles && item.roles.length && lines.length) {
      let changed = false;
      let out = lines.map((ln) => {
        const nl = norm(ln);
        for (const r of item.roles) {
          const key = norm(r.title).split(" ")[0];
          if (key && nl.includes(key) && r.gender !== "any") {
            changed = true;
            const base = ln.replace(/\s*\d+\s*[мжmfw]?\s*$/i, "").replace(/\s+\d+\s*$/, "").trim();
            return `${base} ${r.count}`.trim();
          }
        }
        return ln;
      });
      const roleKeys = item.roles.map((r) => norm(r.title).split(" ")[0]).filter(Boolean);
      if (roleKeys.length && !roleKeys.some((k) => k.startsWith("горнич"))) {
        const filtered = out.filter((ln) => !/горнич/i.test(ln));
        if (filtered.length !== out.length) {
          return { update_job: true, job: filtered.join("\n") };
        }
      }
      if (changed) return { update_job: true, job: out.join("\n") };
    }
    return { update_job: false, job: row.job };
  }

  function sameNeed(a, b) {
    return String(a || "") === String(b || "");
  }

  function buildPlan(customer, text, indexRows) {
    const parser = customerParsers[norm(customer)] || null;
    if (!parser) {
      return {
        ok: false,
        notes: [`Формат «${customer}» ещё не подключён (есть PersonalResourse, ЯППИ, НЦЗ).`],
        updates: [],
        ambiguous: [],
        missing: [],
        cleared: [],
        clearedSuggested: [],
      };
    }
    const items = parser(text);
    if (!items.length) {
      return {
        ok: false,
        notes: ["Не разобрала ни одной строки заявки."],
        updates: [],
        ambiguous: [],
        missing: [],
        cleared: [],
        clearedSuggested: [],
      };
    }

    const { matched, ambiguous, missing, noMaxHits, pool, used } = matchItems(items, indexRows, customer);
    const updates = [];

    for (const { item, row } of matched) {
      const jobUpd = maybeUpdateJob(row, item);
      updates.push({
        id: row.id,
        sheetRow: row.sheetRow,
        object: row.object,
        place: item.place,
        from_m: row.m,
        from_zh: row.zh,
        from_sp: row.sp,
        m: item.m,
        zh: item.zh,
        sp: item.sp,
        update_job: jobUpd.update_job,
        job: jobUpd.job,
        from_job: row.job,
        rate: row.rate,
      });
    }

    // Нет в заявке = людей не нужно = очищаем М/Ж/СП (только строки с заполненным МАКС)
    for (const r of pool) {
      if (used.has(r.id)) continue;
      if (!(r.m || r.zh || r.sp)) continue;
      updates.push({
        id: r.id,
        sheetRow: r.sheetRow,
        object: r.object,
        place: "",
        from_m: r.m,
        from_zh: r.zh,
        from_sp: r.sp,
        m: "",
        zh: "",
        sp: "",
        update_job: false,
        job: r.job,
        from_job: r.job,
        rate: r.rate,
        clear: true,
      });
    }

    return {
      ok: true,
      customer,
      itemsCount: items.length,
      updates,
      ambiguous,
      missing,
      noMaxHits: noMaxHits || [],
      cleared: [],
      clearedSuggested: [],
      notes: [],
    };
  }

  function fmtNeed(x) {
    const bits = [];
    if (x.m) bits.push(x.m + "М");
    if (x.zh) bits.push(x.zh + "Ж");
    if (x.sp && x.sp !== "да") bits.push(x.sp + "СП");
    else if (x.sp === "да") bits.push("СП=да");
    if (bits.length) return bits.join("/");
    if (x.roles && x.roles.length) return x.roles.map((r) => r.count + " " + r.title).join("+");
    return "?";
  }

  function formatNotes(plan) {
    if (!plan) return "";
    const lines = [];
    const updates = plan.updates || [];
    const matchedUpdates = updates.filter((u) => !u.clear);
    const clearedUpdates = updates.filter((u) => u.clear);
    const changed = matchedUpdates.filter(
      (u) =>
        !sameNeed(u.from_m, u.m) ||
        !sameNeed(u.from_zh, u.zh) ||
        !sameNeed(u.from_sp, u.sp) ||
        u.update_job
    );
    const unchanged = matchedUpdates.filter(
      (u) =>
        sameNeed(u.from_m, u.m) &&
        sameNeed(u.from_zh, u.zh) &&
        sameNeed(u.from_sp, u.sp) &&
        !u.update_job
    );
    const ambiguous = plan.ambiguous || [];
    const missing = plan.missing || [];
    const noMaxHits = plan.noMaxHits || [];
    const decideCount = ambiguous.length + noMaxHits.length;
    const matchedCount = matchedUpdates.length;
    // сколько строк заявки «съелось» в матч (с учётом склейки нескольких → один ID)
    const appLines = plan.itemsCount || 0;
    const mergedAway = Math.max(0, appLines - matchedCount - decideCount - missing.length);

    lines.push("заявка: " + appLines + " строк");
    lines.push("сопоставлено: " + matchedCount + " объектов в таблице");
    lines.push("обновлено: " + changed.length);
    if (unchanged.length) lines.push("без изменений: " + unchanged.length + " (цифры уже те же)");
    if (clearedUpdates.length) lines.push("очищено: " + clearedUpdates.length + " (не было в заявке)");
    if (mergedAway > 0) {
      lines.push(
        "склеено: " +
          mergedAway +
          " строк заявки вошли в те же объекты (напр. Бимбо 1Ж+8М → один ID)"
      );
    }
    lines.push("решить: " + decideCount);
    for (const a of ambiguous) {
      const ids = (a.candidates || []).map((c) => "ID " + c.id).join(" или ");
      lines.push("• " + oneLine(a.item.place) + " — " + fmtNeed(a.item) + " → " + (ids || "?") + (a.note ? " (" + a.note + ")" : ""));
    }
    for (const n of noMaxHits) {
      lines.push(
        "• " +
          oneLine(n.item.place) +
          " — " +
          fmtNeed(n.item) +
          " → ID " +
          n.row.id +
          " " +
          shortObj(n.row.object) +
          " (МАКС пусто — не размещена в канале, не обновляю)"
      );
    }
    lines.push("новые: " + missing.length);
    for (const m of missing) {
      lines.push("• " + oneLine(m.place) + " — " + fmtNeed(m));
    }
    for (const n of plan.notes || []) {
      lines.push(n);
    }
    return lines.join("\n");
  }

  const customerParsers = {
    personalresourse: parsePersonalResourse,
    яппи: parseYappi,
    нцз: parseNcz,
  };

  global.CVZ_NEED = {
    buildPlan,
    formatNotes,
    parsePersonalResourse,
    parseYappi,
    parseNcz,
    setAliases,
    norm,
  };
})(window);
