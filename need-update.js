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

  function parseCountBlock(raw) {
    let text = String(raw || "");
    let m = 0;
    let zh = 0;
    let sp = 0;
    let hasM = false;
    let hasZh = false;
    let hasSp = false;
    const roles = [];

    function isNoiseTitle(tl) {
      return /^(график|строгое|только|без|судимост|упаковка|до|лет|час|часов|смен|кондитер|горячий|цех|универсал|по|и|на|от|обл|область|мос|край|места|пар|сп|семейн)$/i.test(
        tl
      );
    }

    const family = text.match(/(\d+)\s*(?:семейн\w*\s*(?:места|пар[ыа])?|сп)\b/i);
    if (family) {
      sp = parseInt(family[1], 10);
      hasSp = true;
      m += sp;
      zh += sp;
      hasM = true;
      hasZh = true;
      text = text.replace(family[0], " ");
    }

    // «3М дворники» — цифра+пол+должность
    text = text.replace(/(\d+)\s*([мжmfw])\s+([а-яёa-z]{3,}(?:\s+[а-яёa-z]{3,}){0,2})/gi, (all, n, g, title) => {
      const first = title.trim().split(/\s+/)[0];
      if (isNoiseTitle(first)) return all;
      const gender = g.toLowerCase() === "м" || g.toLowerCase() === "m" ? "m" : "zh";
      roles.push({ count: parseInt(n, 10), title: title.trim(), gender });
      return " ";
    });

    // голые 10М / 5Ж
    text = text.replace(/(\d+)\s*([мжmfw])\b/gi, (_, n, g) => {
      const num = parseInt(n, 10);
      const gl = g.toLowerCase();
      if (gl === "м" || gl === "m") {
        m += num;
        hasM = true;
      } else {
        zh += num;
        hasZh = true;
      }
      return " ";
    });

    // «5 Горничных», «1карщик», «2 хаусмена»
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

  function guessGender(title) {
    const t = norm(title);
    if (/горнич|уборщиц|помощниц|посудомо|комплектовщиц|упаковщиц/.test(t)) return "zh";
    if (/дворник|хаусмен|карщик|грузчик|охранник|повар-мужчина/.test(t)) return "m";
    // официант / повар — и М и Ж
    return "any";
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

  /** PersonalResourse daily list parser */
  function parsePersonalResourse(text) {
    const lines = String(text || "").split(/\r?\n/);
    const items = [];
    for (const line of lines) {
      const clean = line.replace(/[🔥⬇️]/g, "").trim();
      if (!clean || clean.length < 8) continue;
      if (/добрый\s+день|коллеги|потребность\s+на/i.test(clean)) continue;
      if (!/[❗️!]/.test(line) && !/\d+\s*[мжmfwмМЖ]/i.test(clean) && !/\d+\s*[А-Яа-яЁёA-Za-z]{4,}/.test(clean)) {
        continue;
      }

      const parts = clean.split(/❗️|❗|!|\uFE0F/g).map((x) => x.trim()).filter(Boolean);
      const head = (parts[0] || "").trim();
      const tail = parts.slice(1).join(" ").trim();
      if (!head) continue;

      // head: CITY, object…
      const headNorm = head.replace(/\s+/g, " ").trim();
      const counts = parseCountBlock(tail || head);
      // if counts only found in head (rare)
      if (!counts.hasM && !counts.hasZh && !counts.roles.length) {
        const alt = parseCountBlock(headNorm);
        Object.assign(counts, alt);
      }

      const need = finalizeSp(counts);
      // roles-only lines: derive M/Ж where gender known; any-gender roles → note
      if (!counts.hasM && !counts.hasZh && counts.roles.length) {
        let m = 0;
        let zh = 0;
        let onlyAny = true;
        for (const r of counts.roles) {
          if (r.gender === "m") {
            m += r.count;
            onlyAny = false;
          } else if (r.gender === "zh") {
            zh += r.count;
            onlyAny = false;
          }
        }
        need.m = m ? String(m) : "";
        need.zh = zh ? String(zh) : "";
        need.sp = need.m && need.zh ? "да" : "";
        need.rolesAny = counts.roles.filter((r) => r.gender === "any");
        need.onlyRoles = true;
      } else {
        need.rolesAny = counts.roles.filter((r) => r.gender === "any");
        need.onlyRoles = false;
      }
      need.roles = counts.roles;

      items.push({
        raw: clean,
        place: headNorm,
        ...need,
      });
    }
    return items;
  }

  function scoreMatch(place, row) {
    const p = norm(place);
    const o = norm(row.object);
    if (!p || !o) return 0;
    const pt = tokens(place);
    if (!pt.length) return 0;

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
      return expand(t).some((a) => a.length >= 3 && hay.includes(a));
    }

    const generic = /производ|комбинат|фабрик|склад|отель|мяс|кондитер|пищев|завод|цех|объект|вакан/;
    const segments = String(place).split(",");
    const geoToks = [];
    segments.forEach((seg) => {
      tokens(seg).forEach((t) => {
        if (t.length >= 4 && !generic.test(t)) geoToks.push(t);
      });
    });
    const geoHit = geoToks.some((t) => tokenIn(o, t));
    if (geoToks.length && !geoHit) return 0;

    // отличительные слова заявки должны находиться в объекте, если они есть
    const distinctive = pt.filter((t) => /чипс|плитк|чай|фарм|наггет|крабов|бортпит|рыб|хлеб|овощ|одежд|тепловой|винзавод|ликер|кондитерк/.test(t));
    if (distinctive.length && !distinctive.some((t) => tokenIn(o, t) || tokenIn(norm(row.job || ""), t))) {
      // не ноль сразу — но сильно режем, если гео совпало с другим объектом того же города
      if (!distinctive.some((t) => tokenIn(o, t))) {
        /* keep going but lower later */
      }
    }

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
      else score -= 8;
    }
    score += (hit / pt.length) * 4;
    if (hit === 1 && pt.length >= 3 && score < 6) score *= 0.5;
    return score;
  }

  function matchItems(items, rows, customer) {
    const pool = rows.filter((r) => norm(r.customer) === norm(customer));
    const used = new Set();
    const matched = [];
    const ambiguous = [];
    const missing = [];

    for (const it of items) {
      const ranked = pool
        .map((r) => ({ r, s: scoreMatch(it.place, r) }))
        .filter((x) => x.s >= 4)
        .sort((a, b) => b.s - a.s);

      const top = ranked[0];
      const second = ranked[1];
      if (!top) {
        missing.push(it);
        continue;
      }
      if (second && top.s - second.s < 1.5 && second.s >= 4) {
        ambiguous.push({
          item: it,
          candidates: ranked.slice(0, 4).map((x) => ({
            id: x.r.id,
            object: x.r.object,
            score: Math.round(x.s * 10) / 10,
          })),
        });
        continue;
      }
      if (used.has(top.r.id)) {
        ambiguous.push({
          item: it,
          candidates: ranked.slice(0, 4).map((x) => ({
            id: x.r.id,
            object: x.r.object,
            score: Math.round(x.s * 10) / 10,
          })),
          note: "Этот ID уже сопоставлен с другой строкой заявки",
        });
        continue;
      }
      used.add(top.r.id);
      matched.push({ item: it, row: top.r, score: top.s });
    }
    return { matched, ambiguous, missing, pool, used };
  }

  function jobLines(job) {
    return String(job || "")
      .split(/\n+/)
      .map((x) => x.trim())
      .filter(Boolean);
  }

  function maybeUpdateJob(row, item) {
    const lines = jobLines(row.job);
    // 1 цифра (один пол) и 1 должность
    const oneGender =
      (item.m && !item.zh) || (!item.m && item.zh);
    if (oneGender && lines.length === 1) {
      const n = item.m || item.zh;
      const base = lines[0].replace(/\s*\d+\s*[мжmfw]?\s*$/i, "").replace(/\s+\d+\s*$/, "").trim();
      return { update_job: true, job: `${base} ${n}`.trim() };
    }
    // М и Ж + ровно 2 строки, явно м и ж
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
    // роли из заявки с явным полом/цифрой — точечно для известных кейсов
    if (item.roles && item.roles.length && lines.length) {
      let changed = false;
      const out = lines.map((ln) => {
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
      // Переславль: убрать горничных если их нет в заявке
      if (item.onlyRoles || (item.roles && item.roles.length)) {
        const roleKeys = item.roles.map((r) => norm(r.title).split(" ")[0]).filter(Boolean);
        if (roleKeys.length && !roleKeys.some((k) => k.startsWith("горнич"))) {
          const filtered = out.filter((ln) => !/горнич/i.test(ln));
          if (filtered.length !== out.length) {
            return { update_job: true, job: filtered.join("\n") };
          }
        }
      }
      if (changed) return { update_job: true, job: out.join("\n") };
    }
    return { update_job: false, job: row.job };
  }

  function buildPlan(customer, text, indexRows) {
    const parser = customerParsers[norm(customer)] || null;
    const notes = [];
    if (!parser) {
      return {
        ok: false,
        notes: [`Формат заказчика «${customer}» ещё не подключён. Сейчас работает: PersonalResourse.`],
        updates: [],
        ambiguous: [],
        missing: [],
        cleared: [],
      };
    }
    const items = parser(text);
    if (!items.length) {
      return {
        ok: false,
        notes: ["Не удалось разобрать ни одной строки заявки. Проверьте текст."],
        updates: [],
        ambiguous: [],
        missing: [],
        cleared: [],
      };
    }

    const { matched, ambiguous, missing, pool, used } = matchItems(items, indexRows, customer);
    const updates = [];

    for (const { item, row } of matched) {
      const jobUpd = maybeUpdateJob(row, item);
      let m = item.m;
      let zh = item.zh;
      let sp = item.sp;

      // Дорохово-стиль: роли any (официант/повар) — подходят М и Ж; горничные уже в Ж
      if (item.rolesAny && item.rolesAny.length) {
        notes.push(
          `ID ${row.id} (${oneLine(row.object)}): роли без пола (${item.rolesAny
            .map((r) => r.count + " " + r.title)
            .join(", ")}) — по правилу подходят и М, и Ж. В шапке: М=${m || "∅"} Ж=${zh || "∅"} (только явный пол из заявки).`
        );
      }

      updates.push({
        id: row.id,
        sheetRow: row.sheetRow,
        object: row.object,
        place: item.place,
        from_m: row.m,
        from_zh: row.zh,
        from_sp: row.sp,
        m,
        zh,
        sp,
        update_job: jobUpd.update_job,
        job: jobUpd.job,
        from_job: row.job,
        rate: row.rate,
      });
    }

    // Снять потребность с объектов заказчика, которых нет в сегодняшней заявке
    const cleared = [];
    for (const r of pool) {
      if (used.has(r.id)) continue;
      const active = r.m || r.zh || r.sp;
      if (!active) continue;
      cleared.push({
        id: r.id,
        sheetRow: r.sheetRow,
        object: r.object,
        from_m: r.m,
        from_zh: r.zh,
        from_sp: r.sp,
        m: "",
        zh: "",
        sp: "",
        update_job: false,
        job: r.job,
        clear: true,
      });
    }

    for (const a of ambiguous) {
      notes.push(
        `Неоднозначно: «${a.item.place}» → ${a.candidates
          .map((c) => `ID ${c.id} (${oneLine(c.object)}, score ${c.score})`)
          .join("; ")}${a.note ? ". " + a.note : ""}`
      );
    }
    for (const m of missing) {
      notes.push(`Новая вакансия / нет в таблице: «${m.place}» → ${fmtNeed(m)}`);
    }
    for (const c of cleared) {
      notes.push(
        `В таблице есть потребность, в заявке нет: ID ${c.id} (${oneLine(c.object)}) было М=${c.from_m || "∅"} Ж=${c.from_zh || "∅"} СП=${c.from_sp || "∅"} — не снимаю автоматически, проверь.`
      );
    }

    const ok = ambiguous.length === 0;
    return {
      ok,
      customer,
      itemsCount: items.length,
      updates,
      ambiguous,
      missing,
      cleared: [], // автоснятие отключено в v1 — только сигнал в notes
      clearedSuggested: cleared,
      notes,
    };
  }

  function oneLine(s) {
    return String(s || "").replace(/\s+/g, " ").trim();
  }

  function fmtNeed(x) {
    const bits = [];
    if (x.m) bits.push(x.m + "М");
    if (x.zh) bits.push(x.zh + "Ж");
    if (x.sp && x.sp !== "да") bits.push(x.sp + "СП");
    else if (x.sp === "да") bits.push("СП=да");
    return bits.join(" / ") || "роли: " + (x.roles || []).map((r) => r.count + " " + r.title).join(", ");
  }

  function formatNotes(plan) {
    const lines = [];
    if (!plan) return "";
    if (plan.updates && plan.updates.length) {
      lines.push("Обновления:");
      for (const u of plan.updates) {
        lines.push(
          `• ID ${u.id} | ${oneLine(u.object)}\n  было: М=${u.from_m || "∅"} Ж=${u.from_zh || "∅"} СП=${u.from_sp || "∅"}\n  станет: М=${u.m || "∅"} Ж=${u.zh || "∅"} СП=${u.sp || "∅"}` +
            (u.update_job ? `\n  должность: ${oneLine(u.from_job)} → ${oneLine(u.job)}` : "")
        );
      }
    }
    if (plan.notes && plan.notes.length) {
      lines.push("");
      lines.push("Вопросы / сигналы:");
      plan.notes.forEach((n) => lines.push("• " + n));
    }
    if (!lines.length) lines.push("Нет изменений.");
    return lines.join("\n");
  }

  const customerParsers = {
    personalresourse: parsePersonalResourse,
  };

  global.CVZ_NEED = {
    buildPlan,
    formatNotes,
    parsePersonalResourse,
    norm,
  };
})(window);
