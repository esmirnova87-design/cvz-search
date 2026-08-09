/* Shared Bitrix helpers for ЦВЗ (public webhook — password only as SHA-256 hash). */
(function (global) {
  const SALT = "cvz-lk-v1";

  function cfg() {
    return global.CVZ_BITRIX || {};
  }

  async function bitrix(method, params) {
    const base = cfg().webhookBase;
    if (!base) throw new Error("Не настроен Битрикс");
    const res = await fetch(`${base}/${method}.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params || {})
    }).then((r) => r.json());
    if (res.error) throw new Error(res.error_description || res.error);
    return res.result;
  }

  function phoneDigits(value) {
    let d = String(value || "").replace(/\D/g, "");
    if (d.length === 11 && d.startsWith("8")) d = "7" + d.slice(1);
    if (d.length === 10) d = "7" + d;
    return d;
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

  function phoneNorm(value) {
    return "+" + phoneDigits(value);
  }

  async function sha256Hex(text) {
    const data = new TextEncoder().encode(String(text));
    const buf = await crypto.subtle.digest("SHA-256", data);
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  async function hashPassword(phone, password) {
    return sha256Hex(`${SALT}|${phoneDigits(phone)}|${password}`);
  }

  function splitFio(fio) {
    const parts = String(fio || "").trim().split(/\s+/).filter(Boolean);
    if (parts.length === 1) return { NAME: parts[0] };
    if (parts.length === 2) return { LAST_NAME: parts[0], NAME: parts[1] };
    return {
      LAST_NAME: parts[0],
      NAME: parts[1],
      SECOND_NAME: parts.slice(2).join(" ")
    };
  }

  function fioFromContact(c) {
    return [c.LAST_NAME, c.NAME, c.SECOND_NAME].filter(Boolean).join(" ").trim();
  }

  function contactFieldsMap() {
    return (cfg().contactFields || {});
  }

  function roleEnumId(role) {
    const map = (cfg().roleEnum || {});
    return map[role] || map.candidate;
  }

  function roleFromEnumId(id) {
    const map = cfg().roleEnum || {};
    const sid = String(id || "");
    for (const [k, v] of Object.entries(map)) {
      if (String(v) === sid) return k;
    }
    return "candidate";
  }

  async function findContactByPhone(phone) {
    const p = phoneNorm(phone);
    const list = await bitrix("crm.contact.list", {
      filter: { PHONE: p },
      select: [
        "ID", "NAME", "LAST_NAME", "SECOND_NAME", "PHONE",
        contactFieldsMap().passHash,
        contactFieldsMap().role,
        contactFieldsMap().flOk,
        contactFieldsMap().refId,
        contactFieldsMap().level
      ].filter(Boolean)
    });
    if (list && list.length) return list[0];
    // fallback duplicate finder
    try {
      const dup = await bitrix("crm.duplicate.findbycomm", {
        entity_type: "CONTACT",
        type: "PHONE",
        values: [p]
      });
      const ids = (dup && dup.CONTACT) || [];
      if (ids.length) {
        return bitrix("crm.contact.get", { id: ids[0] });
      }
    } catch (_) {}
    return null;
  }

  function readContactMeta(c) {
    const f = contactFieldsMap();
    const fl = c[f.flOk];
    const flOk = fl === true || fl === "1" || fl === 1 || fl === "Y";
    return {
      contactId: String(c.ID),
      fio: fioFromContact(c),
      phone: phoneNorm((c.PHONE && c.PHONE[0] && c.PHONE[0].VALUE) || ""),
      passHash: c[f.passHash] || "",
      role: roleFromEnumId(c[f.role]),
      flOk,
      refId: c[f.refId] || "",
      level: Number(c[f.level] || 0) || 0
    };
  }

  async function registerContact({ fio, phone, password, role, refId }) {
    if (!isValidPhone(phone)) throw new Error("Телефон в формате +7 (999) 999-99-99");
    if (!password || password.length < 4) throw new Error("Пароль от 4 символов");
    const existing = await findContactByPhone(phone);
    const f = contactFieldsMap();
    const hash = await hashPassword(phone, password);
    const wantRole = role === "admin" ? "admin" : "candidate";

    if (existing) {
      const meta = readContactMeta(existing);
      if (meta.passHash) throw new Error("Этот телефон уже зарегистрирован — войдите");
      const fields = {
        ...splitFio(fio),
        [f.passHash]: hash,
        [f.role]: roleEnumId(wantRole),
        [f.level]: meta.level || 0
      };
      if (refId && f.refId) fields[f.refId] = String(refId);
      if (cfg().assignedById) fields.ASSIGNED_BY_ID = cfg().assignedById;
      await bitrix("crm.contact.update", { id: existing.ID, fields });
      const updated = await bitrix("crm.contact.get", { id: existing.ID });
      return readContactMeta(updated);
    }

    const fields = {
      ...splitFio(fio),
      OPENED: "Y",
      TYPE_ID: "CLIENT",
      SOURCE_DESCRIPTION: "Регистрация ЛК ЦВЗ",
      PHONE: [{ VALUE: phoneNorm(phone), VALUE_TYPE: "MOBILE" }],
      [f.passHash]: hash,
      [f.role]: roleEnumId(wantRole),
      [f.level]: 0
    };
    if (refId && f.refId) fields[f.refId] = String(refId);
    if (cfg().assignedById) fields.ASSIGNED_BY_ID = cfg().assignedById;
    const id = await bitrix("crm.contact.add", { fields });
    const c = await bitrix("crm.contact.get", { id });
    return readContactMeta(c);
  }

  async function loginContact({ phone, password }) {
    if (!isValidPhone(phone)) throw new Error("Телефон в формате +7 (999) 999-99-99");
    const existing = await findContactByPhone(phone);
    if (!existing) throw new Error("Контакт не найден — зарегистрируйтесь");
    const meta = readContactMeta(existing);
    if (!meta.passHash) throw new Error("Пароль ещё не задан — зарегистрируйтесь с этим телефоном");
    const hash = await hashPassword(phone, password);
    if (hash !== meta.passHash) throw new Error("Неверный пароль");
    return meta;
  }

  async function setFreelancerOk(contactId, ok) {
    const f = contactFieldsMap();
    await bitrix("crm.contact.update", {
      id: contactId,
      fields: {
        [f.flOk]: ok ? 1 : 0,
        [f.role]: ok ? roleEnumId("freelancer") : roleEnumId("candidate")
      }
    });
  }

  async function listFreelancerDeals(freelancerContactId) {
    const f = cfg().dealFields || {};
    const cat = cfg().freelancerCandidatesCategoryId;
    const filter = { CATEGORY_ID: cat };
    if (f.freelancerContact) filter[f.freelancerContact] = String(freelancerContactId);
    const select = [
      "ID", "TITLE", "STAGE_ID", "CONTACT_ID", "OPPORTUNITY", "CURRENCY_ID", "DATE_MODIFY",
      f.freelancerSum, f.freelancerContact
    ].filter(Boolean);
    let deals = await bitrix("crm.deal.list", {
      filter,
      select,
      order: { DATE_MODIFY: "DESC" },
      start: 0
    });
    // if UF filter empty (old deals), filter client-side by UF
    if (f.freelancerContact) {
      deals = (deals || []).filter((d) => String(d[f.freelancerContact] || "") === String(freelancerContactId));
    }
    return deals || [];
  }

  function stageName(stageId) {
    const map = cfg().freelancerStages || {};
    return map[stageId] || stageId;
  }

  global.CVZ_BX = {
    bitrix,
    phoneDigits,
    formatPhone,
    isValidPhone,
    phoneNorm,
    hashPassword,
    findContactByPhone,
    registerContact,
    loginContact,
    readContactMeta,
    setFreelancerOk,
    listFreelancerDeals,
    stageName,
    splitFio,
    fioFromContact
  };
})(window);
