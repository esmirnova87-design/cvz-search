// Конфиг Битрикс. ВНИМАНИЕ: на GitHub Pages файл публичный.
// Права вебхука держите минимальными; ключ можно перевыпустить в Битрикс.
window.CVZ_BITRIX = {
  webhookBase: "https://v-vahta.bitrix24.ru/rest/1/uauf8tlnd06ag6hq",
  categoryId: 0, // воронка «Соискатели»
  stageId: "NEW", // стадия «Отклики»
  assignedById: 12, // Николай Соловьев
  // воронка «От партнеров» — кандидаты фрилансеров
  freelancerCandidatesCategoryId: 14,
  fields: {
    fio: "UF_CRM_1763835920800",
    phone: "UF_CRM_1775735854411",
    citizenship: "UF_CRM_1763837083560",
    ageEnum: "UF_CRM_1763837128341",
    ageAvito: "UF_CRM_1767139395467",
    region: "UF_CRM_1763837595450",
    objectName: "UF_CRM_1779635516",
    vacancyUrl: "UF_CRM_1766655105"
  },
  dealFields: {
    freelancerSum: "UF_CRM_1779730660394", // Сумма для фрилансера
    freelancerContact: "UF_CRM_CVZ_FL_CONTACT" // ЦВЗ ID фрилансера (создано API)
  },
  contactFields: {
    passHash: "UF_CRM_CVZ_PASS_HASH",
    role: "UF_CRM_CVZ_ROLE",
    flOk: "UF_CRM_CVZ_FL_OK",
    refId: "UF_CRM_CVZ_REF_ID",
    level: "UF_CRM_CVZ_LEVEL"
  },
  roleEnum: {
    candidate: "652",
    freelancer: "654",
    admin: "656"
  },
  freelancerStages: {
    "C14:UC_Z742B3": "Направлен на объект",
    "C14:NEW": "Заселён на объект",
    "C14:UC_9K9ZRS": "Адаптирован",
    "C14:UC_HGN5T7": "Ожидаем выплат",
    "C14:PREPAYMENT_INVOIC": "Получили деньги",
    "C14:UC_7BGA0P": "Компании",
    "C14:WON": "Заплатили",
    "C14:LOSE": "Не приехал на заселение",
    "C14:UC_WNLUHZ": "Уволен",
    "C14:UC_9L2H7N": "Не устроило",
    "C14:UC_KXS65C": "Вакансия закрыта"
  }
};

// Пароль админ-инструментов (слабая защита «от случайных глаз»)
window.CVZ_PARTNERS_PASS = "cvz-partners-2026";
