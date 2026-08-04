/* PUBLIC RULE: never show заказчик / адрес проживания / адрес объекта to candidates or partners. */

const MAX_CHAT_DEFAULT = "https://max.ru/u/f9LHodD0cOJBDYiotyrlreRMBF60M4RCvreUWboUCVHdIqZOr7cTrxnzuuU";
const partnerCode = new URLSearchParams(location.search).get("p") || "";
const isPartnerLink = Boolean(partnerCode);
let partnerChatUrl = MAX_CHAT_DEFAULT;
let bitrixEnums = null;
let pendingApplyVacancy = null;
let pendingApplyVacancyId = null;
let pendingDetailsVacancy = null;

const priorityRegions = ["Москва", "Московская", "Санкт-Петербург", "Ленинградская"];
const HIDDEN_CITIZENS = new Set(["кавказ", "цыгане"]);

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

const peopleEl = document.getElementById("people");
const cardsEl = document.getElementById("cards");
const toast = document.getElementById("toast");
const applyModal = document.getElementById("applyModal");
const detailsModal = document.getElementById("detailsModal");

function showToast(text) {
  toast.textContent = text;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 1800);
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
  const top = priorityRegions.map((r, idx) =>
    `<label class="check"><input type="checkbox" id="region_top_${idx}" value="${r}" /> ${r}</label>`
  ).join("");
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
  if (g === "Ж") return jobsF;
  if (g === "М") return jobsM;
  return [...new Set([...jobsM, ...jobsF])];
}

function refreshJobs(person) {
  const gender = person.querySelector("[data-gender]").value;
  const box = person.querySelector("[data-jobs]");
  const prev = [...box.querySelectorAll("input:checked")].map((i) => i.value);
  renderCheckList(box, jobsForGender(gender), { checked: prev, prefix: "j" });
}

function renumberPeople() {
  [...peopleEl.querySelectorAll(".person")].forEach((box, idx) => {
    const n = idx + 1;
    box.querySelector("[data-person-label]").textContent = `Кто едет: ${n}`;
    const removeBtn = box.querySelector("[data-remove]");
    if (removeBtn) removeBtn.style.display = n === 1 ? "none" : "";
  });
}

function addPerson(preset = null) {
  personSeq += 1;
  const box = document.createElement("div");
  box.className = "person";
  box.innerHTML = `
    <div class="person-head">
      <span data-person-label>Кто едет: ${personSeq}</span>
      <button type="button" class="linkish" data-remove>убрать</button>
    </div>
    <div class="row2">
      <div class="field">
        <label class="lbl">Гражданство</label>
        <select data-citizen>
          <option value="">—</option>
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
          <option value="">—</option>
          <option>Ж</option>
          <option>М</option>
        </select>
      </div>
    </div>
    <div class="field">
      <label class="lbl">Возраст</label>
      <input type="number" data-age min="18" max="70" placeholder="—" />
    </div>
    <div class="field" style="margin-bottom:6px">
      <label class="lbl">Какие вакансии рассматриваем</label>
    </div>
    <div class="filter-tools row" style="margin-bottom:8px">
      <button type="button" class="btn btn-ghost btn-sm" data-jobs-all>Выбрать все</button>
      <button type="button" class="btn btn-ghost btn-sm" data-jobs-clear>Сбросить</button>
    </div>
    <div class="check-grid jobs" data-jobs></div>
  `;
  peopleEl.appendChild(box);

  if (preset) {
    if (preset.citizen) box.querySelector("[data-citizen]").value = preset.citizen;
    if (preset.gender) box.querySelector("[data-gender]").value = preset.gender;
    if (preset.age != null && preset.age !== "") box.querySelector("[data-age]").value = preset.age;
  }

  refreshJobs(box);
  if (preset && preset.jobs) {
    box.querySelectorAll("[data-jobs] input").forEach((inp) => {
      inp.checked = preset.jobs.includes(inp.value);
    });
  }

  box.querySelector("[data-gender]").addEventListener("change", () => refreshJobs(box));
  box.querySelector("[data-jobs-all]").addEventListener("click", () => {
    box.querySelectorAll("[data-jobs] input").forEach((i) => { i.checked = true; });
  });
  box.querySelector("[data-jobs-clear]").addEventListener("click", () => {
    box.querySelectorAll("[data-jobs] input").forEach((i) => { i.checked = false; });
  });
  box.querySelector("[data-remove]").addEventListener("click", () => {
    if (peopleEl.querySelectorAll(".person").length <= 1) return;
    box.remove();
    renumberPeople();
  });
  renumberPeople();
}

function checkedValues(root) {
  return [...root.querySelectorAll("input[type=checkbox]:checked")].map((i) => i.value);
}

function normalizeCitizen(s) {
  return String(s || "").toLowerCase().replace(/\./g, "").trim();
}

function citizenMatches(selected, vacancyCitizens) {
  if (!selected) return true;
  const sel = normalizeCitizen(selected);
  const aliases = citizenAliases[sel] || [sel];
  const vac = vacancyCitizens.map(normalizeCitizen);
  if (!vac.length) return true;
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
  const ageRaw = personEl.querySelector("[data-age]").value;
  const age = ageRaw === "" ? 0 : Number(ageRaw);
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
    shortShift: document.getElementById("shortShift").checked,
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
    if (f.shortShift && !v.short_shift) return false;
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

function chipHtml(chips) {
  return (chips || []).map((c) => {
    if (typeof c === "string") {
      const ok = /питание|проживание|семей|компенсация/.test(c);
      return `<span class="chip ${ok ? "ok" : ""}">${escapeHtml(c)}</span>`;
    }
    return `<span class="chip ${c.ok ? "ok" : ""}">${escapeHtml(c.text)}</span>`;
  }).join("");
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
      <div class="meta">${chipHtml(v.chips)}</div>
      <p class="duty">${escapeHtml(v.duty || "")}</p>
      <div class="card-actions">
        <button class="btn btn-ghost btn-sm" data-copy="${encodeURIComponent(v.copy || "")}">Скопировать</button>
        <button class="btn btn-ghost btn-sm" data-more data-id="${escapeAttr(String(v.id))}">Подробнее</button>
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
    btn.addEventListener("click", () => openDetailsModal(btn.dataset.id));
  });
}

function detailsRows(v) {
  const d = v.details || {};
  const rows = [
    ["Гражданство", d.citizens],
    ["Возраст", d.age],
    ["Потребность", d.demand],
    ["СБ", d.sb],
    ["СБ (детали)", d.sb_extra],
    ["Медкнижка", d.med],
    ["Регион", d.region],
    ["Объект", d.place],
    ["Тип", d.type],
    ["Вахта от", d.ot != null ? `${d.ot} смен` : ""],
    ["График", d.schedule],
    ["Питание", d.food],
    ["Питание (детали)", d.food_extra],
    ["Проживание", d.housing],
    ["Заселение", d.settle],
    ["Доставка", d.delivery],
    ["Оформление", d.contract],
    ["Спецодежда", d.clothes],
    ["Компенсации", d.compensation],
    ["Должность", d.jobs],
    ["Обязанности", d.duties],
    ["Ставка (нюансы)", d.rate_extra],
    ["Доп. инфа", d.extra],
    ["Соседние регионы", d.neighbors]
  ];
  return rows.filter(([, val]) => val != null && String(val).trim() !== "");
}

function openDetailsModal(vacancyId) {
  const v = allVacancies.find((x) => String(x.id) === String(vacancyId));
  if (!v) return;
  pendingDetailsVacancy = v;
  document.getElementById("detailsTitle").textContent = v.title;
  document.getElementById("detailsPay").textContent = v.pay ? `${v.pay} руб / смена` : "";
  const body = document.getElementById("detailsBody");
  body.innerHTML = detailsRows(v).map(([label, val]) => `
    <div class="field" style="margin-bottom:10px">
      <label class="lbl">${escapeHtml(label)}</label>
      <div style="white-space:pre-wrap; line-height:1.45">${escapeHtml(String(val))}</div>
    </div>
  `).join("");
  const applyBtn = document.getElementById("detailsApply");
  applyBtn.style.display = isPartnerLink ? "none" : "";
  detailsModal.classList.add("show");
}

function buildDetailsCopy(v) {
  return [`ЦВЗ | ${v.title}`, ...detailsRows(v).map(([k, val]) => `${k}: ${val}`)].join("\n");
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
  const citizens = (bitrixEnums.citizenship || []).filter((x) => !HIDDEN_CITIZENS.has(String(x.value || "").toLowerCase()));
  cit.innerHTML = `<option value="">—</option>` + citizens.map((x) =>
    `<option value="${x.id}">${escapeHtml(x.value)}</option>`
  ).join("");
  reg.innerHTML = `<option value="">—</option>` + (bitrixEnums.region || []).map((x) =>
    `<option value="${x.id}">${escapeHtml(x.value)}</option>`
  ).join("");
}

function openApplyModal(vacancyId) {
  pendingApplyVacancyId = vacancyId != null && vacancyId !== "" ? String(vacancyId) : null;
  pendingApplyVacancy = allVacancies.find((v) => String(v.id) === String(vacancyId)) || null;
  const label = document.getElementById("applyVacancyLabel");
  if (pendingApplyVacancy) label.textContent = `Вакансия: ${pendingApplyVacancy.title}`;
  else if (pendingApplyVacancyId) label.textContent = `Отклик на вакансию ID: ${pendingApplyVacancyId}`;
  else label.textContent = "Оставьте данные — создадим заявку в Битрикс.";
  applyModal.classList.add("show");
}

function phoneDigits(value) {
  let d = String(value || "").replace(/\D/g, "");
  if (d.startsWith("8")) d = "7" + d.slice(1);
  if (d && !d.startsWith("7")) d = "7" + d;
  return d.slice(0, 11);
}

function formatPhone(value) {
  const d = phoneDigits(value);
  if (!d) return "";
  let out = "+7";
  if (d.length > 1) out += " (" + d.slice(1, 4);
  if (d.length >= 4) out += ")";
  if (d.length > 4) out += " " + d.slice(4, 7);
  if (d.length > 7) out += "-" + d.slice(7, 9);
  if (d.length > 9) out += "-" + d.slice(9, 11);
  return out;
}

function isValidPhone(value) {
  const d = phoneDigits(value);
  return d.length === 11 && d.startsWith("7");
}

function bindPhoneMask() {
  const phone = document.getElementById("phone");
  phone.addEventListener("input", () => {
    const start = phone.selectionStart;
    phone.value = formatPhone(phone.value);
    try { phone.setSelectionRange(phone.value.length, phone.value.length); } catch (_) {}
    void start;
  });
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
  if (!isValidPhone(phone)) throw new Error("Введите телефон в формате +7 (999) 999-99-99");
  if (!age || !citizenId || !regionId) throw new Error("Укажите возраст, гражданство и регион");

  const vac = pendingApplyVacancy;
  const vacId = pendingApplyVacancyId || (vac ? String(vac.id) : "");
  const title = `Отклик с ЦВЗ сайта: ${fio}, ${age}`;
  const phoneNorm = "+" + phoneDigits(phone);
  const comments = [
    vacId ? `ID: ${vacId}` : "ID: не указан",
    vac ? `Вакансия: ${vac.title}` : "",
    "Источник: сайт поиска ЦВЗ",
    `ФИО: ${fio}`,
    `Телефон: ${phoneNorm}`,
    `Возраст: ${age}`,
  ].filter(Boolean).join("\n");

  const nameParts = fio.split(/\s+/).filter(Boolean);
  const contactFields = {
    OPENED: "Y",
    TYPE_ID: "CLIENT",
    SOURCE_DESCRIPTION: "Сайт ЦВЗ",
    PHONE: [{ VALUE: phoneNorm, VALUE_TYPE: "MOBILE" }]
  };
  if (cfg.assignedById) contactFields.ASSIGNED_BY_ID = cfg.assignedById;
  if (nameParts.length === 1) contactFields.NAME = nameParts[0];
  else if (nameParts.length === 2) {
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
    SOURCE_DESCRIPTION: vacId ? `Сайт ЦВЗ, ID вакансии: ${vacId}` : "Сайт ЦВЗ",
    OPENED: "Y"
  };
  if (cfg.assignedById) dealFields.ASSIGNED_BY_ID = cfg.assignedById;
  if (fields.fio) dealFields[fields.fio] = fio;
  if (fields.phone) dealFields[fields.phone] = phoneNorm;
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
  renderCards(filterVacancies());
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

function resetFilters() {
  fillRegionsFromData();
  renderCheckList(document.getElementById("typeBox"), objectTypes);
  document.getElementById("housing").checked = false;
  document.getElementById("food").checked = false;
  document.getElementById("noSb").checked = false;
  document.getElementById("noMed").checked = false;
  document.getElementById("shortShift").checked = false;
  peopleEl.innerHTML = "";
  personSeq = 0;
  addPerson();
  runSearch();
  showToast("Фильтры сброшены");
}

document.getElementById("themeToggle").addEventListener("click", () => {
  const html = document.documentElement;
  const next = html.getAttribute("data-theme") === "light" ? "dark" : "light";
  html.setAttribute("data-theme", next);
  document.getElementById("themeToggle").textContent = next === "light" ? "Тёмная тема" : "Светлая тема";
});

document.getElementById("addPerson").addEventListener("click", () => addPerson());
document.getElementById("searchBtn").addEventListener("click", () => {
  runSearch();
  cardsEl.scrollIntoView({ behavior: "smooth", block: "start" });
});
document.getElementById("resetFilters").addEventListener("click", resetFilters);
document.getElementById("copyAll").addEventListener("click", () => {
  if (!lastResults.length) {
    showToast("Нечего копировать");
    return;
  }
  copyText(lastResults.map((v) => v.copy).join("\n\n————\n\n"));
});

document.querySelectorAll("[data-select-all]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const box = document.getElementById(btn.dataset.selectAll);
    if (!box) return;
    box.querySelectorAll("input[type=checkbox]").forEach((i) => { i.checked = true; });
  });
});
document.querySelectorAll("[data-clear-box]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const box = document.getElementById(btn.dataset.clearBox);
    if (!box) return;
    box.querySelectorAll("input[type=checkbox]").forEach((i) => { i.checked = false; });
  });
});

document.getElementById("detailsClose").addEventListener("click", () => detailsModal.classList.remove("show"));
document.getElementById("detailsCopy").addEventListener("click", () => {
  if (!pendingDetailsVacancy) return;
  copyText(buildDetailsCopy(pendingDetailsVacancy));
});
document.getElementById("detailsApply").addEventListener("click", () => {
  if (!pendingDetailsVacancy) return;
  detailsModal.classList.remove("show");
  openApplyModal(pendingDetailsVacancy.id);
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

[applyModal, detailsModal].forEach((m) => m.addEventListener("click", (e) => {
  if (e.target === m) m.classList.remove("show");
}));

bindPhoneMask();

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
  } catch (_) { /* leave default */ }
}

addPerson();

Promise.all([
  fetch(`bitrix-enums.json?t=${Date.now()}`).then((r) => r.json()).then((d) => { bitrixEnums = d; fillApplySelects(); }).catch(() => {}),
  loadPartnerChat(),
  loadData()
]).catch((err) => {
  console.error(err);
  cardsEl.innerHTML = `<div class="card"><p class="duty">Ошибка загрузки: ${escapeHtml(err.message)}</p></div>`;
});
