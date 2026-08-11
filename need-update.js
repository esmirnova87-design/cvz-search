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
      // «1сп», «сп», «1 сем.пар»
      if (/^\d*\s*сп\b/i.test(t) || /сем\.?\s*пар/i.test(t) || /семейн/i.test(t)) return "sp";
      return "";
    }

    function coupleCount(cell) {
      const t = String(cell || "").trim();
      const m = t.match(/(\d+)\s*сп\b/i) || t.match(/(\d+)\s*сем/i);
      if (m) return parseInt(m[1], 10);
      if (/^сп\b/i.test(t) || /сем/i.test(t)) return 1;
      return 0;
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
      if (!object || !g) continue;
      if (/потребност|территориал|гражданств/i.test(object)) continue;

      const counts = { m: 0, zh: 0, sp: 0, hasM: false, hasZh: false, hasSp: false, roles: [] };
      if (g === "sp") {
        // «1сп» в столбце Пол: число пар из пола (не из «потребность» — там часто 2 человека)
        const pairs = coupleCount(genderCell) || 1;
        counts.sp = pairs;
        counts.hasSp = true;
        counts.m = pairs;
        counts.zh = pairs;
        counts.hasM = true;
        counts.hasZh = true;
      } else if (!n) {
        continue;
      } else if (g === "m") {
        counts.m = n;
        counts.hasM = true;
      } else {
        counts.zh = n;
        counts.hasZh = true;
      }
      if (vacancy && g !== "sp") {
        counts.roles.push({ count: n, title: vacancy, gender: g === "m" ? "m" : "zh" });
      }
      const need = finalizeSp(counts);
      const place = loc ? object + ", " + loc : object;
      const tag =
        g === "sp" ? counts.sp + "СП" : n + (g === "m" ? "М" : "Ж");
      items.push({
        raw: [object, tag, vacancy, loc].filter(Boolean).join(" | "),
        place,
        project: object,
        vacancy: String(vacancy || "").replace(/\s+/g, " ").trim(),
        location: loc,
        ...need,
        roles: counts.roles,
        rateHint: rateCell,
      });
    }
    if (items.length) return items;
    return parseNczLoose(raw);
  }

  /**
   * OCR-картинка таблицы НЦЗ: ищем пары «число … М|Ж» и объект слева.
   */
  function parseNczLoose(text) {
    const raw = String(text || "")
      .replace(/\u00a0/g, " ")
      .replace(/[|]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!raw) return [];

    const items = [];
    // токены: слова и отдельно М/Ж
    const tokens = raw.split(" ").filter(Boolean);
    const isJob = (t) =>
      /упаков|грузчик|сборщик|уборщ|горнич|маркир|комплект|разнораб|мойщик|фасов|корен|стикер|посуд|оператор/i.test(
        t
      );
    const isLoc = (t) =>
      /район|р-н|область|москва|ступино|бронниц|истр|внуков|серпухов|электростал|наро|пушкин|гороховец|дегунино|нижегород|рокос|люберц|сергиев/i.test(
        t
      );
    const isNoise = (t) =>
      /^(от|рф|рб|нет|да|нужна|нужен|общежитие|квартира|фикс|сделка|размер|сканер|смена|смен)$/i.test(t) ||
      /^\d{4,}$/.test(t);

    for (let i = 0; i < tokens.length; i++) {
      const g = /^[мm]$/i.test(tokens[i]) ? "m" : /^[жf]$/i.test(tokens[i]) ? "zh" : "";
      if (!g) continue;

      // ближайшее число слева (потребность), не «От 35» — берём первое 1–40 в окне
      let n = 0;
      let nAt = -1;
      for (let j = i - 1; j >= Math.max(0, i - 12); j--) {
        if (!/^\d{1,2}$/.test(tokens[j])) continue;
        const v = parseInt(tokens[j], 10);
        if (v < 1 || v > 40) continue;
        // «От 35/15» — срок вахты: если предыдущий токен «От»
        if (j > 0 && /^от$/i.test(tokens[j - 1])) continue;
        n = v;
        nAt = j;
        break;
      }
      if (!n) continue;

      // объект: кусок текста левее числа
      const left = tokens.slice(Math.max(0, nAt - 14), nAt).filter((t) => !isNoise(t) && !/^\d+$/.test(t));
      // убрать хвостики должностей справа от объекта в этом окне
      let objToks = [];
      for (let k = 0; k < left.length; k++) {
        if (isJob(left[k])) break;
        objToks.push(left[k]);
      }
      // если пусто — взять любые не-шумные
      if (objToks.length < 2) objToks = left.slice(-6);
      const object = objToks.join(" ").replace(/^\d+\s*/, "").trim();
      if (object.length < 5) continue;
      if (/потребност|территориал|гражданств|должност/i.test(object)) continue;

      let loc = "";
      const right = tokens.slice(i + 1, i + 10);
      const locHit = right.find(isLoc) || left.find(isLoc);
      if (locHit) loc = locHit;
      const vacancy = right.find(isJob) || left.find(isJob) || "";

      const counts = { m: 0, zh: 0, sp: 0, hasM: false, hasZh: false, hasSp: false, roles: [] };
      if (g === "m") {
        counts.m = n;
        counts.hasM = true;
      } else {
        counts.zh = n;
        counts.hasZh = true;
      }
      if (vacancy) counts.roles.push({ count: n, title: vacancy, gender: g });
      const need = finalizeSp(counts);
      const place = loc ? object + ", " + loc : object;
      items.push({
        raw: object + " " + n + (g === "m" ? "М" : "Ж"),
        place,
        project: object,
        vacancy: vacancy,
        location: loc,
        ...need,
        roles: counts.roles,
      });
    }

    // дедуп одинаковых сырых
    const seen = new Set();
    return items.filter((it) => {
      const k = it.raw + "|" + it.m + "|" + it.zh;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
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
        notes: [`Формат «${customer}» ещё не подключён (есть PersonalResourse, ЯППИ, НЦЗ, ЭкоСтафф, ProClever, Lime staff, Lerteco, ХХЕЛПЕР, КНК, GST GSR Фортренд).`],
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

    // Нет в заявке = очищаем М/Ж/СП (только с МАКС).
    // Защита: если заявка разобрана слишком коротко (OCR вытащил 1 строку из таблицы) —
    // автоочистку НЕ делаем, иначе обнулим весь заказчик.
    const clearCandidates = [];
    for (const r of pool) {
      if (used.has(r.id)) continue;
      if (!(r.m || r.zh || r.sp)) continue;
      clearCandidates.push(r);
    }
    const notes = [];
    const sparseApp =
      items.length < 5 || clearCandidates.length > Math.max(5, items.length * 2);
    if (sparseApp && clearCandidates.length) {
      notes.push(
        "Автоочистку НЕ делаю: в заявке всего " +
          items.length +
          " строк, а очистить пришлось бы " +
          clearCandidates.length +
          " объектов — похоже, заявка разобрана не полностью (часто OCR). Обновляю только найденное."
      );
      notes.push(
        "Не очищены (проверьте вручную при необходимости): " +
          clearCandidates
            .slice(0, 12)
            .map((r) => "ID " + r.id)
            .join(", ") +
          (clearCandidates.length > 12 ? "…" : "")
      );
    } else {
      for (const r of clearCandidates) {
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
      clearedSuggested: sparseApp ? clearCandidates : [],
      notes,
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

  /**
   * ЭкоСтафф: Telegram-список
   * `- ТЛК ДОМОДЕДОВО (АВТОЗАПЧАСТИ): 32 МУЖ`
   * `СИПИСИ: 2 ЖЕН/ 3 МУЖ`
   * Допись: `+ к потребности` + `Объект Сиписи` + `1 семейная пара` → склеится на тот же ID.
   */
  function parseEcoStaff(text) {
    const lines = String(text || "").replace(/\r\n/g, "\n").split("\n");
    const items = [];
    let lastPlace = "";
    let addMode = false;

    function normalizeNeed(s) {
      return String(s || "")
        .replace(/[🔥🆘⬇️❗️❗]/g, " ")
        .replace(/муж(?:чин[аы]?|ины)?/gi, "М")
        .replace(/жен(?:щин[аы]?|ины)?/gi, "Ж")
        .replace(/семейн\w*\s*пар[аы]?/gi, "семейных")
        .replace(/\s+/g, " ")
        .trim();
    }

    function pushPlace(place, needRaw) {
      const p = String(place || "")
        .replace(/^[-•*]\s*/, "")
        .replace(/^объект\s+/i, "")
        .replace(/\s+/g, " ")
        .trim();
      if (!p || p.length < 3) return;
      if (/потребность\s+на|к\s+потребности/i.test(p)) return;
      const counts = parseCountBlock(normalizeNeed(needRaw));
      if (!counts.hasM && !counts.hasZh && !counts.hasSp && !counts.roles.length) return;
      const need = finalizeSp(counts);
      lastPlace = p;
      items.push({
        raw: p + ": " + needRaw,
        place: p,
        project: p,
        vacancy: "",
        ...need,
        roles: counts.roles || [],
      });
    }

    for (const line0 of lines) {
      const line = line0.replace(/[🔥🆘]/g, " ").trim();
      if (!line) continue;
      if (/\+\s*к\s*потребност/i.test(line)) {
        addMode = true;
        continue;
      }
      if (/потребность\s+на\s+\d/i.test(line)) continue;

      // «Объект Сиписи» / «1 семейная пара»
      const objOnly = line.match(/^объект\s+(.+)$/i);
      if (objOnly) {
        lastPlace = objOnly[1].replace(/\s+/g, " ").trim();
        continue;
      }

      const colon = line.match(/^[-•*]?\s*(.+?)\s*:\s*(.+)$/);
      if (colon) {
        pushPlace(colon[1], colon[2]);
        continue;
      }

      // строка только с цифрами/семьями после «Объект …»
      if (lastPlace && (/^\d+\s*(?:муж|жен|м|ж|семейн)/i.test(line) || /\d+\s*семейн/i.test(line))) {
        pushPlace(lastPlace, line);
        continue;
      }

      // OCR: «ТЛК ЧЕХОВ 45 МУЖ» без двоеточия
      const bare = line.match(
        /^[-•*]?\s*(.+?)\s+(\d+\s*(?:муж|жен|м|ж)\b.*)$/i
      );
      if (bare && bare[1].length >= 3) {
        pushPlace(bare[1], bare[2]);
      }
    }

    void addMode;
    return items;
  }

  /**
   * ProClever: блоки 🔷 объект + 📍 город + строки NМ / NЖ
   */
  function parseProClever(text) {
    const lines = String(text || "")
      .replace(/\r\n/g, "\n")
      .split("\n");
    const items = [];
    let title = "";
    let loc = "";
    let vacancy = "";
    let m = 0;
    let zh = 0;
    let sp = 0;
    let hasM = false;
    let hasZh = false;
    let hasSp = false;
    let roles = [];

    function reset() {
      title = "";
      loc = "";
      vacancy = "";
      m = 0;
      zh = 0;
      sp = 0;
      hasM = false;
      hasZh = false;
      hasSp = false;
      roles = [];
    }

    function flush() {
      // без 🔷 тоже можно: остались 📍 + NМ/NЖ (обрезанный копипаст / хвост OCR)
      if ((!title && !loc) || (!hasM && !hasZh && !hasSp)) {
        reset();
        return;
      }
      const need = finalizeSp({ m, zh, sp, hasM, hasZh, hasSp, roles });
      const head = title || vacancy || "";
      const place = head && loc ? head + ", " + loc : head || loc;
      items.push({
        raw: place + " " + (need.m || "0") + "М/" + (need.zh || "0") + "Ж",
        place,
        project: title || head,
        vacancy,
        location: loc,
        ...need,
        roles,
      });
      reset();
    }

    for (const line0 of lines) {
      const line = String(line0 || "").trim();
      if (!line) continue;
      if (/рекрутер|партнер|доброе\s+утро|заявка\s+на/i.test(line)) continue;
      if (/^(москва|санкт-петербург|питер)\s*$/i.test(line)) continue;
      if (/^https?:\/\//i.test(line)) continue;

      // Сначала структура блока — иначе «СКЛАД продуктов питания» отсекается по слову «питани»
      if (/[🔷🔹◆◇♦]/u.test(line)) {
        flush();
        title = line.replace(/[🔷🔹◆◇♦]/gu, "").replace(/\s+/g, " ").trim();
        continue;
      }
      if (/📍/.test(line)) {
        // новый блок по адресу только если уже есть цифры (не сбрасывать title после 🔷)
        if (hasM || hasZh || hasSp) flush();
        loc = line.replace(/📍/g, "").replace(/\s+/g, " ").trim();
        continue;
      }
      if (/✔️|✅/.test(line)) {
        vacancy = line.replace(/[✔️✅]/g, "").replace(/\s+/g, " ").trim();
        continue;
      }

      // важно: /u — иначе суррогаты 👉 совпадают с 👨 и строки «👨 1М» отбрасываются
      if (/^(👉|🍽|❗️|❗)/u.test(line)) continue;
      if (/питани|вахта|фикс|сделка/i.test(line) && !/\d+\s*[мжМЖmfw]/i.test(line)) continue;

      if (/\d+\s*[мжМЖmfw]/i.test(line) || /\d+\s*семейн/i.test(line)) {
        const cleaned = line.replace(/[^\d\sмжМЖmfwсемейнпар.+/\\-]/gi, " ");
        const c = parseCountBlock(cleaned);
        if (c.hasM) {
          m += c.m;
          hasM = true;
        }
        if (c.hasZh) {
          zh += c.zh;
          hasZh = true;
        }
        if (c.hasSp) {
          sp += c.sp;
          hasSp = true;
        }
        roles = roles.concat(c.roles || []);
      }
    }
    flush();
    return items;
  }

  /**
   * Lime staff (Staff Lime): блоки по объектам + строки «- N мужчин/женщин/грузчиков…»
   * Один объект с разными ролями → отдельные items (доматч по должности, напр. Балашиха операторы vs грузчики).
   */
  function parseLimeStaff(text) {
    const raw = String(text || "").replace(/\r\n/g, "\n");
    const lines = raw.split("\n").map((l) => l.trimEnd());
    const items = [];
    let header = "";
    let loc = "";

    function headerLoc(h) {
      // предпочитаем «(г. Город)» / короткое имя города, не «(со всеми документами)»
      const m =
        String(h || "").match(/\(г\.?\s*([^)]+)\)/i) ||
        String(h || "").match(/\(([^)]{2,40})\)/);
      if (!m) return "";
      const city = m[1].replace(/^г\.?\s*/i, "").trim();
      if (/документ|открыт|сз|снг|рф|и\s+рб/i.test(city)) return "";
      return city;
    }

    function pushItem(place, vacancy, counts) {
      if (!counts.hasM && !counts.hasZh && !counts.hasSp) return;
      const need = finalizeSp(counts);
      items.push({
        raw: place + " | " + vacancy + " | " + (need.m || "0") + "М/" + (need.zh || "0") + "Ж",
        place,
        project: place,
        vacancy: vacancy || "",
        location: loc,
        ...need,
        roles: counts.roles || [],
      });
    }

    function parseBullet(line) {
      let t = line.replace(/^[-–—•*]\s*/, "").trim();
      if (!t || /^🔺/.test(t)) return null;
      t = t
        .replace(/мужчин[аы]?|мужик\w*|мужчин\w*/gi, "М")
        .replace(/женжин\w*|женщин[аы]?|девушек\w*|женщин\w*/gi, "Ж");
      // «20 грузчиков» / «11 упаковщиц» / «10 М с опытом оператора»
      const roleM = t.match(/(\d+)\s*(грузчик\w*|оператор\w*|водитель\w*|штабелер\w*|комплектовщик\w*)/i);
      const roleZh = t.match(/(\d+)\s*(упаковщиц\w*|маркировщиц\w*|уборщиц\w*)/i);
      if (roleM && !/\d+\s*[МЖ]/.test(t.replace(roleM[0], " "))) {
        const title = roleM[2];
        const n = parseInt(roleM[1], 10);
        const g = /упаковщиц|маркировщиц|уборщиц/i.test(title) ? "zh" : "m";
        return {
          vacancy: title,
          counts: {
            m: g === "m" ? n : 0,
            zh: g === "zh" ? n : 0,
            sp: 0,
            hasM: g === "m",
            hasZh: g === "zh",
            hasSp: false,
            roles: [{ count: n, title, gender: g }],
          },
        };
      }
      if (roleZh) {
        const title = roleZh[2];
        const n = parseInt(roleZh[1], 10);
        return {
          vacancy: title,
          counts: {
            m: 0,
            zh: n,
            sp: 0,
            hasM: false,
            hasZh: true,
            hasSp: false,
            roles: [{ count: n, title, gender: "zh" }],
          },
        };
      }
      const c = parseCountBlock(t);
      if (!c.hasM && !c.hasZh && !c.hasSp) return null;
      let vacancy = "";
      if (/оператор/i.test(t)) vacancy = "оператор линии";
      else if (/штабелер|водитель/i.test(t)) vacancy = "водитель штабелера";
      else if (/грузчик/i.test(t)) vacancy = "грузчик";
      else if (/упаков/i.test(t)) vacancy = "упаковщица";
      return { vacancy, counts: c };
    }

    function isObjectHeader(line) {
      if (/^[-–—•*🔺]/.test(line)) return false;
      if (/^заселен|ставка|питани|возраст|граждан|работ[аы]\s+на\s+ногах/i.test(line)) return false;
      if (line.length < 5) return false;
      // СНЕКИ (г. Химки) / МАРС (г. Домодедово) / БИГ косметика (Троицк)
      if (/\(г\.?\s*[^)]+\)/i.test(line)) return true;
      if (/^(снек|марс|биг|агро)/i.test(line)) return true;
      if (/производств|склад|косметич|завод|мясн/i.test(line) && /\([^)]{2,40}\)/.test(line)) return true;
      return false;
    }

    for (const line0 of lines) {
      const line = String(line0 || "").trim();
      if (!line) continue;
      if (/staff\s*lime|lime\s*staff|доброе\s+утро|потребность\s+по|остальные\s+заявки\s+на\s+стопе/i.test(line)) {
        continue;
      }
      if (/^🔺/.test(line)) continue;
      if (/^заселен/i.test(line)) continue;

      if (isObjectHeader(line)) {
        header = line.replace(/\s+/g, " ").trim();
        loc = headerLoc(header);
        continue;
      }

      if (!header) continue;
      if (!/^[-–—•*]/.test(line) && !/^\d+\s+(муж|жен|груз|упак|операт)/i.test(line)) continue;

      const parsed = parseBullet(line);
      if (!parsed) continue;
      // place: короткое имя объекта + город (без простыни про документы)
      const shortName = header.split("(")[0].trim() || header;
      const place = loc ? shortName + ", " + loc : shortName;
      pushItem(place, parsed.vacancy, parsed.counts);
    }
    return items;
  }

  /**
   * Lerteco: Excel «2026 заявка».
   * Берём только строки, где столбец Вахта = «да» (местные пока не ведём).
   * Колонки: объект | должность | потребность | … | вахта=да | …
   * Потребность: число или «N мужчин» / «N женщин».
   */
  function parseLerteco(text) {
    const raw = String(text || "").replace(/\r\n/g, "\n");
    const lines = raw.split("\n").map((l) => l.trimEnd()).filter((l) => l.trim());
    const items = [];
    let header = null;

    function splitCols(line) {
      if (line.includes("\t")) return line.split("\t").map((c) => c.replace(/\s+/g, " ").trim());
      return line.split(/\s{2,}|\s*\|\s*/).map((c) => c.replace(/\s+/g, " ").trim()).filter(Boolean);
    }

    function parseNeedGender(needCell, job) {
      let text = String(needCell || "");
      let m = 0;
      let zh = 0;
      let hasM = false;
      let hasZh = false;
      text.replace(/(\d+)\s*(мужчин\w*|муж\b|жен\w*|девуш\w*)/gi, (_, n, g) => {
        const num = parseInt(n, 10);
        if (!(num > 0)) return " ";
        if (/^жен|^девуш/i.test(g)) {
          zh += num;
          hasZh = true;
        } else {
          m += num;
          hasM = true;
        }
        return " ";
      });
      if (!hasM && !hasZh) {
        const nm = String(needCell || "").replace(/\s/g, "").match(/^(\d+)/);
        if (nm) {
          const num = parseInt(nm[1], 10);
          if (num > 0) {
            const jl = String(job || "").toLowerCase();
            if (/стикеровщиц|упаковщиц|уборщиц|женщин/.test(jl)) {
              zh = num;
              hasZh = true;
            } else {
              m = num;
              hasM = true;
            }
          }
        }
      }
      return finalizeSp({ m, zh, sp: 0, hasM, hasZh, hasSp: false, roles: [] });
    }

    for (const line of lines) {
      const cols = splitCols(line);
      if (!cols.length) continue;
      const njoin = norm(cols.join(" "));
      if (!header && /назван|объект/.test(njoin) && /потребност/.test(njoin)) {
        header = cols.map((c) => norm(c));
        continue;
      }

      let object = "";
      let job = "";
      let needCell = "";
      let vahta = "";
      let addr = "";

      if (header) {
        const io = colIdx(header, ["назван", "объект"]);
        const ij = colIdx(header, ["должност"]);
        const ineed = colIdx(header, ["потребност"]);
        const iv = colIdx(header, ["вахта"]);
        const ia = colIdx(header, ["адрес"]);
        object = io >= 0 ? cols[io] || "" : cols[0] || "";
        job = ij >= 0 ? cols[ij] || "" : "";
        needCell = ineed >= 0 ? cols[ineed] || "" : "";
        vahta = iv >= 0 ? cols[iv] || "" : "";
        addr = ia >= 0 ? cols[ia] || "" : "";
      } else {
        object = cols[0] || "";
        job = cols[1] || "";
        needCell = cols[2] || "";
        vahta = cols[3] || cols[4] || "";
        addr = cols[5] || "";
      }

      // строго вахта=да (не «нет», не пусто)
      const v = norm(vahta);
      if (v && v !== "да" && !/^да\b/.test(v)) continue;
      if (!v) {
        // без колонки вахты в короткой вставке — не берём (риск местных)
        if (header && colIdx(header, ["вахта"]) >= 0) continue;
      }

      if (!object || /назван|объект/.test(norm(object))) continue;
      const need = parseNeedGender(needCell, job);
      // даже 0 — сигналим объектом без цифр? для очистки нужен полный список вахта=да
      // items с 0 need: place only, m/zh empty — matchItems then clear others
      const place = addr ? object.split(/\n/)[0].trim() + ", " + addr.split(",")[0] : object.split(/\n/)[0].trim();
      items.push({
        raw: object + " | " + job + " | " + needCell,
        place,
        project: object.split(/\n/)[0].trim(),
        vacancy: String(job || "").replace(/\s+/g, " ").trim(),
        location: addr,
        m: need.m,
        zh: need.zh,
        sp: need.sp,
        roles: [],
        zeroNeed: !need.m && !need.zh,
      });
    }

    // убрать нулевые из «заявка» счёта для матча цифр — но оставить объекты с need
    // для очистки: объекты с need>0 в used; zeroNeed не пишем в updates как set
    return items.filter((it) => !it.zeroNeed);
  }

  /**
   * ХХЕЛПЕР: блоки «🍟 НАЗВАНИЕ» + 📍 город + 👥/👫 Потребность/Требуются NМ/NЖ/семейные.
   * Москва и Регионы в одной вставке — оба блока.
   * РУССКАРТ Яхрома и Мытищи → один ID в Sheet (сумма).
   */
  function parseXxHelper(text) {
    const lines = String(text || "")
      .replace(/\r\n/g, "\n")
      .split("\n");
    const items = [];
    let title = "";
    let loc = "";
    let vacancy = "";
    let m = 0;
    let zh = 0;
    let sp = 0;
    let hasM = false;
    let hasZh = false;
    let hasSp = false;
    let roles = [];
    let waitingNeed = false;

    const META =
      /^(📍|👥|👫|🎂|⏳|💰|🍲|🏠|👷|☀️|🏭|📦|🛡|✅|🔥|⏰)/u;

    function reset() {
      title = "";
      loc = "";
      vacancy = "";
      m = 0;
      zh = 0;
      sp = 0;
      hasM = false;
      hasZh = false;
      hasSp = false;
      roles = [];
      waitingNeed = false;
    }

    function flush() {
      if ((!title && !loc) || (!hasM && !hasZh && !hasSp)) {
        reset();
        return;
      }
      const need = finalizeSp({ m, zh, sp, hasM, hasZh, hasSp, roles });
      const place = title && loc ? title + ", " + loc : title || loc;
      items.push({
        raw: place + " " + (need.m || "0") + "М/" + (need.zh || "0") + "Ж",
        place,
        project: title,
        vacancy,
        location: loc,
        ...need,
        roles,
      });
      reset();
    }

    function addCounts(raw) {
      let s = String(raw || "")
        .replace(/потребность\s*:?/gi, " ")
        .replace(/требуются\s*:?/gi, " ")
        .replace(/мужчин\w*/gi, "М")
        .replace(/женщин\w*/gi, "Ж")
        .replace(/семейн\w*\s*пар[аы]?/gi, "семейных")
        .replace(/\//g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (!s) return false;
      const c = parseCountBlock(s);
      if (!c.hasM && !c.hasZh && !c.hasSp) return false;
      if (c.hasM) {
        m += c.m;
        hasM = true;
      }
      if (c.hasZh) {
        zh += c.zh;
        hasZh = true;
      }
      if (c.hasSp) {
        sp += c.sp;
        hasSp = true;
      }
      roles = roles.concat(c.roles || []);
      return true;
    }

    for (const line0 of lines) {
      const line = String(line0 || "").trim();
      if (!line) continue;
      if (/^https?:\/\//i.test(line)) continue;
      if (/хелпер|партнер/i.test(line) && line.length < 40) continue;
      if (/^заявка\s+(москва|регион)/i.test(line.replace(/🔥/g, "").trim())) continue;
      if (/^🔥/.test(line) && /заявка/i.test(line)) continue;

      // объект: эмодзи + название (не мета-строка)
      if (/^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(line) && !META.test(line)) {
        const name = line
          .replace(/^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\uFE0F\u200D]+/u, "")
          .replace(/\s+/g, " ")
          .trim();
        if (name && /[а-яёa-z]/i.test(name)) {
          flush();
          title = name;
          continue;
        }
      }

      if (/^📍/.test(line)) {
        loc = line.replace(/^📍/u, "").replace(/\s+/g, " ").trim();
        continue;
      }
      if (/^👷/.test(line) || /должность\s*:/i.test(line)) {
        vacancy = line
          .replace(/^👷/u, "")
          .replace(/должность\s*:?/gi, "")
          .replace(/\s+/g, " ")
          .trim();
        continue;
      }

      if (/^(🎂|⏳|💰|🍲|🏠|☀️|🏭|📦|🛡|✅)/u.test(line)) continue;
      if (/оплата|питание|проживание|возраст|вахта|судим/i.test(line) && !/\d+\s*[мжМЖ]/i.test(line) && !/семейн/i.test(line))
        continue;

      if (/потребность|требуются/i.test(line)) {
        const after = line.replace(/^.*?потребность\s*:?/i, "").replace(/^.*?требуются\s*:?/i, "").trim();
        if (after && addCounts(after)) {
          waitingNeed = false;
        } else {
          waitingNeed = true;
        }
        continue;
      }

      if (waitingNeed || /^(👥|👫)/u.test(line)) {
        const body = line.replace(/^(👥|👫)/u, "").trim();
        if (addCounts(body)) waitingNeed = false;
        continue;
      }

      if (/\d+\s*[мжМЖmfw]/i.test(line) || /\d+\s*семейн/i.test(line) || /\d+\s*муж/i.test(line)) {
        addCounts(line);
      }
    }
    flush();
    return items;
  }

  /**
   * КНК: Excel «Таблица» — колонки городов, потребность в 1–2 строках (М / Ж).
   * Вставка на сайт: TSV Город | Вакансия | Потребность (10М/5Ж).
   * «по согласованию» не считаем потребностью.
   */
  function parseKnk(text) {
    const raw = String(text || "").replace(/\r\n/g, "\n");
    const lines = raw.split("\n").map((l) => l.trimEnd()).filter((l) => l.trim());
    const items = [];
    let header = null;

    function splitCols(line) {
      if (line.includes("\t")) return line.split("\t").map((c) => c.replace(/\s+/g, " ").trim());
      return line.split(/\s{2,}|\s*\|\s*/).map((c) => c.replace(/\s+/g, " ").trim()).filter(Boolean);
    }

    function parseNeed(cell, vacancy) {
      const t = String(cell || "").trim();
      if (!t || /^0+$/.test(t) || /согласован/i.test(t)) {
        return finalizeSp({ m: 0, zh: 0, sp: 0, hasM: false, hasZh: false, hasSp: false, roles: [] });
      }
      let s = t
        .replace(/мужчин\w*/gi, "М")
        .replace(/женщин\w*/gi, "Ж")
        .replace(/муж\b/gi, "М")
        .replace(/жен\b/gi, "Ж");
      if (/^\d+$/.test(s.replace(/\s/g, ""))) {
        const n = parseInt(s, 10);
        const vac = norm(vacancy || "");
        if (/упаковщиц|уборщиц|фасов|маркиров/.test(vac) && !/грузчик|разнораб|комплект/.test(vac)) {
          return finalizeSp({ m: 0, zh: n, sp: 0, hasM: false, hasZh: true, hasSp: false, roles: [] });
        }
        return finalizeSp({ m: n, zh: 0, sp: 0, hasM: true, hasZh: false, hasSp: false, roles: [] });
      }
      const c = parseCountBlock(s.replace(/\//g, " "));
      return finalizeSp(c);
    }

    for (const line of lines) {
      const cols = splitCols(line);
      if (!cols.length) continue;
      const njoin = norm(cols.join(" "));
      if (!header && /город|объект|проект/.test(njoin) && /потребност|вакан/.test(njoin)) {
        header = cols.map((c) => norm(c));
        continue;
      }
      let city = "";
      let vacancy = "";
      let needCell = "";
      if (header) {
        const ic = colIdx(header, ["город", "объект", "проект"]);
        const iv = colIdx(header, ["вакан", "должност"]);
        const ineed = colIdx(header, ["потребност"]);
        city = ic >= 0 ? cols[ic] || "" : cols[0] || "";
        vacancy = iv >= 0 ? cols[iv] || "" : "";
        needCell = ineed >= 0 ? cols[ineed] || "" : cols[cols.length - 1] || "";
      } else {
        city = cols[0] || "";
        vacancy = cols[1] || "";
        needCell = cols[2] || cols[1] || "";
      }
      if (!city || /город|проект/.test(norm(city))) continue;
      const need = parseNeed(needCell, vacancy);
      if (!need.m && !need.zh) continue;
      items.push({
        raw: city + " | " + needCell,
        place: city + (vacancy ? ", " + vacancy : ""),
        project: city,
        vacancy: String(vacancy || "").replace(/\s+/g, " ").trim(),
        location: city,
        ...need,
        roles: [],
      });
    }
    return items;
  }

  /**
   * GST GSR Фортренд: блоки 📌 объект + буллеты с NМ/NЖ / «от 10Ж» / «10м/день».
   * Строки про оплату/вахту/питание — игнор.
   */
  function parseGsr(text) {
    const lines = String(text || "").replace(/\r\n/g, "\n").split("\n");
    const items = [];
    let title = "";
    let loc = "";
    let m = 0;
    let zh = 0;
    let sp = 0;
    let hasM = false;
    let hasZh = false;
    let hasSp = false;
    let roles = [];
    let vacancy = "";

    function reset() {
      title = "";
      loc = "";
      m = 0;
      zh = 0;
      sp = 0;
      hasM = false;
      hasZh = false;
      hasSp = false;
      roles = [];
      vacancy = "";
    }

    function flush() {
      if ((!title && !loc) || (!hasM && !hasZh && !hasSp)) {
        reset();
        return;
      }
      const need = finalizeSp({ m, zh, sp, hasM, hasZh, hasSp, roles });
      const place = title && loc ? title + ", " + loc : title || loc;
      items.push({
        raw: place + " " + (need.m || "0") + "М/" + (need.zh || "0") + "Ж",
        place,
        project: title,
        vacancy,
        location: loc,
        ...need,
        roles,
      });
      reset();
    }

    function addFromLine(line) {
      let t = String(line || "")
        .replace(/^[-–—•*📌]\s*/, "")
        .replace(/требуются\s*/gi, " ")
        .replace(/от\s+(\d+)/gi, "$1")
        .replace(/(\d+)\s*м\s*\/\s*день/gi, "$1М")
        .replace(/(\d+)\s*м\s*\/\s*ночь/gi, "$1М")
        .replace(/(\d+)\s*м\\?\s*\/\s*ж/gi, "$1М/$1Ж")
        .replace(/(\d+)\s*м\s*\\?\s*ж/gi, "$1М/$1Ж")
        .replace(/мужчин[аы]?\b/gi, "М")
        .replace(/женщин[аы]?\b/gi, "Ж")
        .replace(/человек\b/gi, "М")
        .replace(/\//g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (!t) return false;
      if (
        /оплат|ставк|фикс|руб|вахта|питани|прожива|график|вычет|смен\b|час\b/i.test(t) &&
        !/\d+\s*[мжМЖ]/i.test(t)
      )
        return false;
      const c = parseCountBlock(t);
      if (!c.hasM && !c.hasZh && !c.hasSp) return false;
      if (c.hasM) {
        m += c.m;
        hasM = true;
      }
      if (c.hasZh) {
        zh += c.zh;
        hasZh = true;
      }
      if (c.hasSp) {
        sp += c.sp;
        hasSp = true;
      }
      roles = roles.concat(c.roles || []);
      if (/сборщик|комплектов|грузчик|упаков|водитель|погруз|штабел|разнораб/i.test(t)) {
        const rm = t.match(
          /(сборщик\w*|комплектовщик\w*|грузчик\w*|упаковщик\w*|водитель\w*|погрузчик\w*|штабелер\w*|разнорабоч\w*)/i
        );
        if (rm) vacancy = vacancy || rm[1];
      }
      return true;
    }

    for (const line0 of lines) {
      const line = String(line0 || "").trim();
      if (!line) continue;
      if (/^https?:\/\//i.test(line)) continue;
      if (/^⚡️|^🔥\s*запуск|^‼️|^❗️\s*строго/i.test(line) && !/📌/.test(line)) {
        if (/усть[-\s]?луг|нпец/i.test(line)) {
          flush();
          title = "НПЕЦ";
          loc = "Усть-Луга";
        }
        continue;
      }
      if (/^усть[-\s]?луг/i.test(line) && !title) {
        title = title || "НПЕЦ";
        loc = line.split(",")[0].trim();
        continue;
      }
      if (/требуются\s+разнорабоч/i.test(line) || /разнорабочие\s*:\s*\d+/i.test(line)) {
        addFromLine(line.replace(/требуются\s+/i, ""));
        continue;
      }

      if (
        /📌/.test(line) ||
        (/^[🔥\s]*[А-ЯA-Z]/.test(line) &&
          /чай|черноголов|электрон|роквул|инструмент|яблок|спортмастер|логик|сберлог|хлебозавод|аромат|нпец/i.test(
            line
          ) &&
          line.length > 12 &&
          !/^•/.test(line))
      ) {
        flush();
        const clean = line.replace(/📌/g, "").replace(/🔥/g, " ").replace(/\s+/g, " ").trim();
        title = clean.split("(")[0].trim() || clean;
        const city = clean.match(/\(([^)]+)\)/);
        loc = city ? city[1].replace(/^общ\.?/i, "").trim() : "";
        if (
          !loc &&
          /фрязин|черноголов|усадков|железнодорож|чашников|истра|химк|руз|одинцов|котельник|луг/i.test(
            clean
          )
        ) {
          loc = clean;
        }
        continue;
      }

      if (/^🏠/.test(line)) continue;
      if (/^•|^-\s|упаковщик|водитель|комплектов|грузчик|сборщик|работник\s+линии/i.test(line)) {
        addFromLine(line);
        continue;
      }
      if (/\d+\s*[мжМЖmfw]/i.test(line) || /\d+\s*(муж|жен|человек)/i.test(line)) {
        addFromLine(line);
      }
    }
    flush();
    return items;
  }

  const customerParsers = {
    personalresourse: parsePersonalResourse,
    яппи: parseYappi,
    нцз: parseNcz,
    экостафф: parseEcoStaff,
    proclever: parseProClever,
    "lime staff": parseLimeStaff,
    limestaff: parseLimeStaff,
    lerteco: parseLerteco,
    ххелпер: parseXxHelper,
    кнк: parseKnk,
    "gst gsr фортренд": parseGsr,
    gsr: parseGsr,
    gst: parseGsr,
    фортренд: parseGsr,
  };

  global.CVZ_NEED = {
    buildPlan,
    formatNotes,
    parsePersonalResourse,
    parseYappi,
    parseNcz,
    parseEcoStaff,
    parseProClever,
    parseLimeStaff,
    parseLerteco,
    parseXxHelper,
    parseKnk,
    parseGsr,
    setAliases,
    norm,
  };
})(window);
