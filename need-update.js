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

    const family = text.match(/(\d+)\s*семейн\w*(?:\s*(?:места|пар[ыа])?)?/i) || text.match(/(\d+)\s*сп\b/i);
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
    const place = norm(item.place);
    for (const rule of list) {
      const keys = rule.all || rule.match || [];
      if (!keys.length) continue;
      if (keys.every((k) => place.includes(norm(k)))) {
        const row = pool.find((r) => String(r.id) === String(rule.id));
        if (row) return row;
      }
    }
    return null;
  }

  function matchItems(items, rows, customer) {
    const pool = rows.filter((r) => norm(r.customer) === norm(customer));
    const used = new Set();
    const matched = [];
    const ambiguous = [];
    const missing = [];

    for (const it of items) {
      const forced = aliasMatch(it, pool, customer);
      if (forced) {
        if (used.has(forced.id)) {
          ambiguous.push({
            item: it,
            candidates: [{ id: forced.id, object: forced.object }],
            note: "ID из правила уже занят",
          });
          continue;
        }
        used.add(forced.id);
        matched.push({ item: it, row: forced, score: 100 });
        continue;
      }

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
          candidates: ranked.slice(0, 3).map((x) => ({ id: x.r.id, object: x.r.object })),
        });
        continue;
      }
      if (used.has(top.r.id)) {
        ambiguous.push({
          item: it,
          candidates: ranked.slice(0, 3).map((x) => ({ id: x.r.id, object: x.r.object })),
          note: "ID уже занят другой строкой заявки",
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
        notes: [`Формат «${customer}» ещё не подключён (есть PersonalResourse).`],
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

    const { matched, ambiguous, missing, pool, used } = matchItems(items, indexRows, customer);
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

    // Нет в заявке = людей не нужно = очищаем М/Ж/СП автоматически
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
    const changed = updates.filter(
      (u) =>
        !sameNeed(u.from_m, u.m) ||
        !sameNeed(u.from_zh, u.zh) ||
        !sameNeed(u.from_sp, u.sp) ||
        u.update_job
    );
    const ambiguous = plan.ambiguous || [];
    const missing = plan.missing || [];

    lines.push("заявка: " + (plan.itemsCount || 0));
    lines.push("обновлено: " + changed.length);
    lines.push("решить: " + ambiguous.length);
    for (const a of ambiguous) {
      const ids = (a.candidates || []).map((c) => "ID " + c.id).join(" или ");
      lines.push("• " + oneLine(a.item.place) + " — " + fmtNeed(a.item) + " → " + (ids || "?") + (a.note ? " (" + a.note + ")" : ""));
    }
    lines.push("новые: " + missing.length);
    for (const m of missing) {
      lines.push("• " + oneLine(m.place) + " — " + fmtNeed(m));
    }
    return lines.join("\n");
  }

  const customerParsers = {
    personalresourse: parsePersonalResourse,
  };

  global.CVZ_NEED = {
    buildPlan,
    formatNotes,
    parsePersonalResourse,
    setAliases,
    norm,
  };
})(window);
