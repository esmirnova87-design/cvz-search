const MAX_CHAT_DEFAULT = "https://max.ru/u/f9LHodD0cOJBDYiotyrlreRMBF60M4RCvreUWboUCVHdIqZOr7cTrxnzuuU";
const partnerCode = new URLSearchParams(location.search).get("p") || "";
const isPartnerLink = Boolean(partnerCode);
let partnerChatUrl = MAX_CHAT_DEFAULT;
let bitrixEnums = null;
let pendingApplyVacancy = null;
let pendingApplyVacancyId = null;

const priorityRegions = ["Москва", "Московская", "Санкт-Петербург", "Ленинградская"];

const objectTypes = [
  { id: "пищ", label: "Пищевое производство" },
  { id: "не пищ", label: "Не пищевое производство" },
  { id: "склад", label: "Склад" },
  { id: "отель", label: "Отель / санаторий" },
  { id: "стройка", label: "Стройка" },
  { id: "тепл", label: "Теплицы" },
  { id: "ТТ", label: "Торговая точка" },
  { id: "ферма", label: "Ферма" }
];

const jobsM = [
  "грузчик", "разнорабочий", "комплектовщик", "комплектовщик с тсд", "упаковщик",
  "сборщик", "оператор линии", "фасовщик", "укладчик", "мойщик", "транспортировщик",
  "работник склада", "водитель вэш", "водитель вап", "водитель ричтрака",
  "водитель погрузчика", "водитель штабелера", "подсобный рабочий", "слесарь",
  "повар", "уборщик", "маркировщик", "вэш", "вап", "ричтрак"
];

const jobsF = [
  "упаковщица", "упаковщик", "комплектовщик", "комплектовщик с тсд", "оператор линии",
  "фасовщица", "уборщица", "мойщица", "горничная", "повар", "помощник повара",
  "маркировщица", "стикеровщица", "сортировщица", "швея", "официант", "работник линии", "уборка"
];

const citizenAliases = {
  россия: ["россия", "рф"],
  беларусь: ["беларусь", "рб", "белоруссия"],
  казахстан: ["казахстан", "кз"],
  киргизия: ["киргизия", "кыргызстан", "кргз", "кг"],
  армения: ["армения", "ам"],
  узбекистан: ["узбекистан", "уз"],
  таджикистан: ["таджикистан", "тдж"],
  азербайджан: ["азербайджан", "аз"],
  молдова: ["молдова", "мд"]
};

let allVacancies = [];
let lastResults = [];
let personSeq = 0;
let pendingCitizenPerson = null;

const peopleEl = document.getElementById("people");
const cardsEl = document.getElementById("cards");
const toast = document.getElementById("toast");
const docsModal = document.getElementById("docsModal");
const applyModal = document.getElementById("applyModal");

function showToast(text) {
  toast.textContent = text;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 1600);
}

async function copyText(text) {
  const clean = text
    .split("\n")
    .filter((line) => !/^потребность\s*:/i.test(line.trim()))
    .join("\n");
  try {
    await navigator.clipboard.writeText(clean);
  } catch (_) {
    const ta = document.createElement("textarea");
    ta.value = clean;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
  showToast("Скопировано для пересылки");
}

function renderCheckList(container, items, { checked = [], prefix = "" } = {}) {
  container.innerHTML = items.map((item, idx) => {
    const value = typeof item === "string" ? item : item.id;
    const label = typeof item === "string" ? item : item.label;
    const isChecked = checked.includes(value);
    const id = `${container.id}_${prefix}${idx}`;
    return `<label class="check"><input type="checkbox" id="${id}" value="${value}" ${isChecked ? "checked" : ""} /> ${label}</label>`;
  }).join("");
}

function fillRegionsFromData() {
  const fromData = [...new Set(allVacancies.map((v) => v.region).filter(Boolean))];
  if (!fromData.includes("Москва")) fromData.push("Москва");
  const rest = fromData
    .filter((r) => !priorityRegions.includes(r))
    .sort((a, b) => a.localeCompare(b, "ru", { sensitivity: "base" }));

  const regionBox = document.getElementById("regionBox");
  const top = priorityRegions.map((r, idx) => {
    const checked = r === "Московская" ? "checked" : "";
    return `<label class="check"><input type="checkbox" id="region_top_${idx}" value="${r}" ${checked} /> ${r}</label>`;
  }).join("");
  const restHtml = rest.map((r, idx) =>
    `<label class="check"><input type="checkbox" id="region_az_${idx}" value="${r}" /> ${r}</label>`
  ).join("");
  regionBox.innerHTML = `
    <div class="hint" style="margin:0 0 6px">Часто выбирают</div>
    ${top}
    <div class="hint" style="margin:10px 0 6px">Все регионы (А–Я)</div>
    ${restHtml}
  `;
}

function jobsForGender(g) {
  return g === "Ж" ? jobsF : jobsM;
}

function refreshJobs(person) {
  const gender = person.querySelector("[data-gender]").value;
  const box = person.querySelector("[data-jobs]");
  const prev = [...box.querySelectorAll("input:checked")].map((i) => i.value);
  renderCheckList(box, jobsForGender(gender), { checked: prev, prefix: "j" });
}

function setDocsLine(person, state) {
  const line = person.querySelector("[data-docs-line]");
  const citizen = person.querySelector("[data-citizen]").value;
  const show = citizen !== "Россия";
  line.classList.toggle("show", show);
  const cb = line.querySelector("input");
  if (!show) {
    cb.checked = false;
    cb.indeterminate = false;
    person.dataset.docs = "";
    return;
  }
  if (state === "yes") {
    cb.checked = true;
    cb.indeterminate = false;
    person.dataset.docs = "yes";
  } else if (state === "no") {
    cb.checked = false;
    cb.indeterminate = false;
    person.dataset.docs = "no";
  } else {
    cb.checked = false;
    cb.indeterminate = true;
    person.dataset.docs = "";
  }
}

function openDocsModal(person) {
  pendingCitizenPerson = person;
  docsModal.querySelectorAll('input[name="docsHave"]').forEach((r) => { r.checked = false; });
  docsModal.classList.add("show");
}

function addPerson(preset = null) {
  personSeq += 1;
  const n = personSeq;
  const box = document.createElement("div");
  box.className = "person";
  box.dataset.docs = "";
  box.innerHTML = `
    <div class="person-head">
      <span>Кто едет: ${n}</span>
      <button type="button" class="linkish" data-remove>убрать</button>
    </div>
    <div class="row2">
      <div class="field">
        <label class="lbl">Гражданство</label>
        <select data-citizen>
          <option>Россия</option>
          <option>Беларусь</option>
          <option>Казахстан</option>
          <option>Киргизия</option>
          <option>Армения</option>
          <option>Узбекистан</option>
          <option>Таджикистан</option>
          <option>Азербайджан</option>
          <option>Молдова</option>
        </select>
      </div>
      <div class="field">
        <label class="lbl">Пол</label>
        <select data-gender>
          <option>Ж</option>
          <option>М</option>
        </select>
      </div>
    </div>
    <div class="field">
      <label class="lbl">Возраст</label>
      <input type="number" data-age min="18" max="70" value="30" />
    </div>
    <div class="docs-line" data-docs-line>
      <label class="check"><input type="checkbox" data-docs-cb /> Все документы в наличии</label>
    </div>
    <div class="field" style="margin-bottom:6px">
      <label class="lbl">Какие вакансии рассматриваем</label>
    </div>
    <div class="check-grid jobs" data-jobs></div>
  `;
  peopleEl.appendChild(box);

  if (preset) {
    box.querySelector("[data-citizen]").value = preset.citizen || "Россия";
    box.querySelector("[data-gender]").value = preset.gender || "Ж";
    box.querySelector("[data-age]").value = preset.age || 30;
  }

  refreshJobs(box);
  if (preset && preset.jobs) {
    box.querySelectorAll("[data-jobs] input").forEach((inp) => {
      inp.checked = preset.jobs.includes(inp.value);
    });
  }
  if (preset && preset.citizen && preset.citizen !== "Россия") {
    setDocsLine(box, preset.docs || "");
  }

  const citizenSelect = box.querySelector("[data-citizen]");
  citizenSelect.addEventListener("change", () => {
    if (citizenSelect.value !== "Россия") openDocsModal(box);
    else setDocsLine(box, null);
  });
  box.querySelector("[data-docs-cb]").addEventListener("change", (e) => {
    box.dataset.docs = e.target.checked ? "yes" : "no";
    e.target.indeterminate = false;
  });
  box.querySelector("[data-gender]").addEventListener("change", () => refreshJobs(box));
  box.querySelector("[data-remove]").addEventListener("click", () => {
    if (peopleEl.querySelectorAll(".person").length <= 1) return;
    box.remove();
  });
}

function checkedValues(root) {
  return [...root.querySelectorAll("input[type=checkbox]:checked")].map((i) => i.value);
}

function normalizeCitizen(s) {
  return String(s || "").toLowerCase().replace(/\./g, "").trim();
}

function citizenMatches(selected, vacancyCitizens) {
  const sel = normalizeCitizen(selected);
  const aliases = citizenAliases[sel] || [sel];
  const vac = vacancyCitizens.map(normalizeCitizen);
  if (!vac.length) return true;
  // "кто угодно" / снг broad
  if (vac.some((c) => c.includes("кто угодно") || c === "снг" || c.includes("еаэс"))) return true;
  return aliases.some((a) => vac.some((c) => c === a || c.includes(a) || a.includes(c)));
}

function jobMatches(selectedJobs, vacancyJobs) {
  if (!selectedJobs.length) return true;
  const vac = vacancyJobs.map((j) => j.toLowerCase());
  return selectedJobs.some((sj) => {
    const s = sj.toLowerCase();
    return vac.some((vj) => vj.includes(s) || s.includes(vj));
  });
}

function regionMatches(selectedRegions, vacRegion) {
  if (!selectedRegions.length) return true;
  const expanded = new Set(selectedRegions);
  if (expanded.has("Москва")) expanded.add("Московская");
  if (expanded.has("Московская")) expanded.add("Москва");
  return expanded.has(vacRegion);
}

function personFits(personEl, v) {
  const gender = personEl.querySelector("[data-gender]").value;
  const age = Number(personEl.querySelector("[data-age]").value || 0);
  const citizen = personEl.querySelector("[data-citizen]").value;
  const jobs = checkedValues(personEl.querySelector("[data-jobs]"));

  if (gender === "М" && !v.gender_m) return false;
  if (gender === "Ж" && !v.gender_f) return false;
  if (age && (age < v.age_from || age > v.age_to)) return false;
  if (!citizenMatches(citizen, v.citizens || [])) return false;
  if (!jobMatches(jobs, v.jobs || [])) return false;
  return true;
}

function getFilters() {
  return {
    regions: checkedValues(document.getElementById("regionBox")),
    types: checkedValues(document.getElementById("typeBox")),
    housing: document.getElementById("housing").checked,
    food: document.getElementById("food").checked,
    noSb: document.getElementById("noSb").checked,
    noMed: document.getElementById("noMed").checked,
    people: [...peopleEl.querySelectorAll(".person")]
  };
}

function filterVacancies() {
  const f = getFilters();
  return allVacancies.filter((v) => {
    if (!regionMatches(f.regions, v.region)) return false;
    if (f.types.length && !f.types.includes(v.type)) return false;
    if (f.housing && !v.housing) return false;
    if (f.food && !v.food) return false;
    if (f.noSb && !v.no_sb) return false;
    if (f.noMed && !v.no_med) return false;
    // все кто едет должны подходить к вакансии
    if (f.people.length && !f.people.every((p) => personFits(p, v))) return false;
    return true;
  });
}

function renderCount(n, total) {
  let msg = `подходят ${n} из базы в ${total}`;
  if (n >= 0 && n <= 5) {
    msg += ` <em>(измените параметры поиска для большего количества вариантов)</em>`;
  }
  document.getElementById("countLabel").innerHTML = msg;
}

function renderCards(list) {
  lastResults = list;
  renderCount(list.length, allVacancies.length);
  if (!list.length) {
    cardsEl.innerHTML = `<div class="card"><p class="duty">По выбранным параметрам вариантов нет. Снимите часть фильтров или расширьте регионы.</p></div>`;
    return;
  }
  cardsEl.innerHTML = list.map((v, i) => `
    <article class="card" style="animation-delay:${Math.min(i, 12) * 0.03}s">
      <div class="card-top">
        <div>
          <h3 class="role">${escapeHtml(v.title)}</h3>
          <p class="place">${escapeHtml(v.place || "")}</p>
        </div>
        <div class="pay">
          <strong>${escapeHtml(String(v.pay || "—"))}</strong>
          <span>руб / смена</span>
        </div>
      </div>
      <div class="meta">
        ${(v.chips || []).map((c) => `<span class="chip ${/питание|проживание|семей/.test(c) ? "ok" : ""}">${escapeHtml(c)}</span>`).join("")}
      </div>
      <p class="duty">${escapeHtml(v.duty || "")}</p>
      <div class="card-actions">
        <button class="btn btn-ghost btn-sm" data-copy="${encodeURIComponent(v.copy || "")}">Скопировать</button>
        <button class="btn btn-ghost btn-sm" data-more>Подробнее</button>
        ${v.photo
          ? `<a class="btn btn-ghost btn-sm" href="${escapeAttr(v.photo)}" target="_blank" rel="noopener">Фото</a>`
          : `<button class="btn btn-ghost btn-sm" disabled title="Фото пока нет">Фото</button>`}
        ${isPartnerLink ? "" : `<button class="btn btn-primary btn-sm" data-apply data-id="${escapeAttr(String(v.id))}">Откликнуться</button>`}
        <a class="btn btn-ghost btn-sm" href="${escapeAttr(partnerChatUrl)}" target="_blank" rel="noopener">Задать вопрос в чате</a>
      </div>
    </article>
  `).join("");

  cardsEl.querySelectorAll("[data-copy]").forEach((btn) => {
    btn.addEventListener("click", () => copyText(decodeURIComponent(btn.dataset.copy || "")));
  });
  cardsEl.querySelectorAll("[data-apply]").forEach((btn) => {
    btn.addEventListener("click", () => openApplyModal(btn.dataset.id));
  });
  cardsEl.querySelectorAll("[data-more]").forEach((btn) => {
    btn.addEventListener("click", () => showToast("Подробнее — скоро"));
  });
}

function ageToBitrixId(age) {
  const n = Number(age);
  if (!n) return "";
  if (n < 30) return "126";
  if (n < 40) return "128";
  if (n < 55) return "130";
  return "132";
}

function fillApplySelects() {
  if (!bitrixEnums) return;
  const cit = document.getElementById("applyCitizen");
  const reg = document.getElementById("applyRegion");
  cit.innerHTML = `<option value="">—</option>` + bitrixEnums.citizenship.map((x) =>
    `<option value="${x.id}">${escapeHtml(x.value)}</option>`
  ).join("");
  reg.innerHTML = `<option value="">—</option>` + bitrixEnums.region.map((x) =>
    `<option value="${x.id}">${escapeHtml(x.value)}</option>`
  ).join("");
  // default Россия / Москва if present
  const ru = [...cit.options].find((o) => o.textContent === "Россия");
  if (ru) cit.value = ru.value;
  const mo = [...reg.options].find((o) => /Московская/.test(o.textContent));
  if (mo) reg.value = mo.value;
}

function openApplyModal(vacancyId) {
  pendingApplyVacancyId = vacancyId != null && vacancyId !== "" ? String(vacancyId) : null;
  pendingApplyVacancy = allVacancies.find((v) => String(v.id) === String(vacancyId)) || null;
  const label = document.getElementById("applyVacancyLabel");
  if (pendingApplyVacancy) {
    label.textContent = `Вакансия: ${pendingApplyVacancy.title}`;
  } else if (pendingApplyVacancyId) {
    label.textContent = `Отклик на вакансию ID: ${pendingApplyVacancyId}`;
  } else {
    label.textContent = "Оставьте данные — создадим заявку в Битрикс.";
  }
  applyModal.classList.add("show");
}

async function sendBitrixDeal() {
  const cfg = window.CVZ_BITRIX;
  if (!cfg || !cfg.webhookBase) throw new Error("Не настроен Битрикс");

  const fio = document.getElementById("fio").value.trim();
  const phone = document.getElementById("phone").value.trim();
  const age = document.getElementById("applyAge").value.trim();
  const citizenId = document.getElementById("applyCitizen").value;
  const regionId = document.getElementById("applyRegion").value;
  if (!fio || !phone) throw new Error("Укажите ФИО и телефон");
  if (!age || !citizenId || !regionId) throw new Error("Укажите возраст, гражданство и регион");

  const vac = pendingApplyVacancy;
  const vacId = pendingApplyVacancyId || (vac ? String(vac.id) : "");
  const title = `Отклик с ЦВЗ сайта: ${fio}, ${age}`;
  const comments = [
    vacId ? `ID: ${vacId}` : "ID: не указан",
    vac ? `Вакансия: ${vac.title}` : "",
    "Источник: сайт поиска ЦВЗ",
    `ФИО: ${fio}`,
    `Телефон: ${phone}`,
    `Возраст: ${age}`,
  ].filter(Boolean).join("\n");

  const nameParts = fio.split(/\s+/).filter(Boolean);
  const contactFields = {
    OPENED: "Y",
    TYPE_ID: "CLIENT",
    SOURCE_DESCRIPTION: "Сайт ЦВЗ",
    PHONE: [{ VALUE: phone, VALUE_TYPE: "MOBILE" }]
  };
  if (nameParts.length === 1) {
    contactFields.NAME = nameParts[0];
  } else if (nameParts.length === 2) {
    contactFields.LAST_NAME = nameParts[0];
    contactFields.NAME = nameParts[1];
  } else {
    contactFields.LAST_NAME = nameParts[0];
    contactFields.NAME = nameParts[1];
    contactFields.SECOND_NAME = nameParts.slice(2).join(" ");
  }

  const contactRes = await fetch(`${cfg.webhookBase}/crm.contact.add.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fields: contactFields })
  }).then((r) => r.json());
  if (contactRes.error) throw new Error(contactRes.error_description || contactRes.error);
  const contactId = contactRes.result;
  if (!contactId) throw new Error("Не удалось создать контакт");

  const fields = cfg.fields || {};
  const dealFields = {
    TITLE: title,
    CATEGORY_ID: cfg.categoryId,
    STAGE_ID: cfg.stageId,
    CONTACT_ID: contactId,
    COMMENTS: comments,
    SOURCE_DESCRIPTION: "Сайт ЦВЗ",
    OPENED: "Y"
  };
  if (fields.fio) dealFields[fields.fio] = fio;
  if (fields.phone) dealFields[fields.phone] = phone;
  if (fields.citizenship) dealFields[fields.citizenship] = citizenId;
  if (fields.ageEnum) dealFields[fields.ageEnum] = ageToBitrixId(age);
  if (fields.ageAvito) dealFields[fields.ageAvito] = String(age);
  if (fields.region) dealFields[fields.region] = regionId;
  if (fields.objectName && vac) dealFields[fields.objectName] = vac.title;
  if (fields.vacancyUrl) dealFields[fields.vacancyUrl] = location.href.split("?")[0];

  const dealRes = await fetch(`${cfg.webhookBase}/crm.deal.add.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fields: dealFields })
  }).then((r) => r.json());
  if (dealRes.error) throw new Error(dealRes.error_description || dealRes.error);

  const dealId = dealRes.result;
  // явное привязывание контакта к сделке
  if (dealId && contactId) {
    await fetch(`${cfg.webhookBase}/crm.deal.contact.add.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: dealId, fields: { CONTACT_ID: contactId, IS_PRIMARY: "Y" } })
    }).catch(() => {});
  }
  return dealId;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(s) {
  return String(s).replace(/"/g, "&quot;");
}

function runSearch() {
  const results = filterVacancies();
  renderCards(results);
}

async function loadData() {
  cardsEl.innerHTML = `<div class="card"><p class="duty">Загружаем вакансии из таблицы…</p></div>`;
  const res = await fetch(`vacancies.json?t=${Date.now()}`);
  if (!res.ok) throw new Error("Не удалось загрузить vacancies.json");
  const data = await res.json();
  allVacancies = data.items || [];
  fillRegionsFromData();
  renderCheckList(document.getElementById("typeBox"), objectTypes);
  runSearch();
}

document.getElementById("themeToggle").addEventListener("click", () => {
  const html = document.documentElement;
  const next = html.getAttribute("data-theme") === "light" ? "dark" : "light";
  html.setAttribute("data-theme", next);
  document.getElementById("themeToggle").textContent = next === "light" ? "Тёмная тема" : "Светлая тема";
});

document.getElementById("addPerson").addEventListener("click", () => addPerson({ gender: "М", age: 30 }));
document.getElementById("searchBtn").addEventListener("click", () => {
  runSearch();
  cardsEl.scrollIntoView({ behavior: "smooth", block: "start" });
});

function resetFilters() {
  fillRegionsFromData();
  renderCheckList(document.getElementById("typeBox"), objectTypes);
  document.getElementById("housing").checked = true;
  document.getElementById("food").checked = true;
  document.getElementById("noSb").checked = false;
  document.getElementById("noMed").checked = false;
  peopleEl.innerHTML = "";
  personSeq = 0;
  addPerson({ citizen: "Россия", gender: "Ж", age: 30 });
  runSearch();
  showToast("Фильтры сброшены");
}

document.getElementById("resetFilters").addEventListener("click", resetFilters);
document.getElementById("copyAll").addEventListener("click", () => {
  if (!lastResults.length) {
    showToast("Нечего копировать");
    return;
  }
  copyText(lastResults.map((v) => v.copy).join("\n\n————\n\n"));
});

document.getElementById("docsCancel").addEventListener("click", () => {
  if (pendingCitizenPerson) {
    pendingCitizenPerson.querySelector("[data-citizen]").value = "Россия";
    setDocsLine(pendingCitizenPerson, null);
  }
  docsModal.classList.remove("show");
  pendingCitizenPerson = null;
});
document.getElementById("docsOk").addEventListener("click", () => {
  const chosen = docsModal.querySelector('input[name="docsHave"]:checked');
  if (!chosen) {
    showToast("Выберите да или нет");
    return;
  }
  if (pendingCitizenPerson) setDocsLine(pendingCitizenPerson, chosen.value);
  docsModal.classList.remove("show");
  pendingCitizenPerson = null;
});

document.getElementById("applyCancel").addEventListener("click", () => applyModal.classList.remove("show"));
document.getElementById("applySend").addEventListener("click", async () => {
  const btn = document.getElementById("applySend");
  btn.disabled = true;
  try {
    await sendBitrixDeal();
    applyModal.classList.remove("show");
    document.getElementById("fio").value = "";
    document.getElementById("phone").value = "";
    document.getElementById("applyAge").value = "";
    showToast("Заявка принята, напишем в MAX/позвоним");
  } catch (err) {
    console.error(err);
    showToast(err.message || "Ошибка отправки");
  } finally {
    btn.disabled = false;
  }
});

[docsModal, applyModal].forEach((m) => m.addEventListener("click", (e) => {
  if (e.target === m) m.classList.remove("show");
}));

async function loadPartnerChat() {
  if (!isPartnerLink) {
    partnerChatUrl = MAX_CHAT_DEFAULT;
    return;
  }
  try {
    const res = await fetch(`partners-data.json?t=${Date.now()}`);
    if (!res.ok) return;
    const data = await res.json();
    const found = (data.items || []).find((p) => p.code === partnerCode && p.active !== false);
    if (found && found.maxUrl) partnerChatUrl = found.maxUrl;
  } catch (_) {
    /* leave default */
  }
}

addPerson({ citizen: "Россия", gender: "Ж", age: 30 });

Promise.all([
  fetch(`bitrix-enums.json?t=${Date.now()}`).then((r) => r.json()).then((d) => { bitrixEnums = d; fillApplySelects(); }).catch(() => {}),
  loadPartnerChat(),
  loadData()
]).catch((err) => {
  console.error(err);
  cardsEl.innerHTML = `<div class="card"><p class="duty">Ошибка загрузки: ${escapeHtml(err.message)}</p></div>`;
});
