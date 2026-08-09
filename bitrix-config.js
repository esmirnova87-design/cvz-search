// Конфиг Битрикс. ВНИМАНИЕ: на GitHub Pages файл публичный.
// Права вебхука держите минимальными; ключ можно перевыпустить в Битрикс.
window.CVZ_BITRIX = {
  webhookBase: "https://v-vahta.bitrix24.ru/rest/1/uauf8tlnd06ag6hq",
  categoryId: 0, // воронка «Соискатели»
  stageId: "NEW", // стадия «Отклики»
  assignedById: 12, // Николай Соловьев
  fields: {
    fio: "UF_CRM_1763835920800",
    phone: "UF_CRM_1775735854411",
    citizenship: "UF_CRM_1763837083560",
    ageEnum: "UF_CRM_1763837128341",
    ageAvito: "UF_CRM_1767139395467", // «Возраст от авито» — сюда число возраста
    region: "UF_CRM_1763837595450",
    objectName: "UF_CRM_1779635516",
    vacancyUrl: "UF_CRM_1766655105"
  }
};

// Пароль админ-инструментов / бывш. partners (слабая защита «от случайных глаз»)
window.CVZ_PARTNERS_PASS = "cvz-partners-2026";
