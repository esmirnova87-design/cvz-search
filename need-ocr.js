/* ЦВЗ — OCR скринов заявки (Tesseract.js, rus+eng) в браузере. */
(function (global) {
  "use strict";

  let workerPromise = null;

  function ensureTesseract() {
    if (!global.Tesseract || typeof global.Tesseract.createWorker !== "function") {
      throw new Error("OCR-библиотека не загрузилась (нужен интернет для первого раза).");
    }
  }

  async function getWorker(onProgress) {
    ensureTesseract();
    if (!workerPromise) {
      workerPromise = global.Tesseract.createWorker("rus+eng", 1, {
        logger: (m) => {
          if (onProgress && m && m.status) onProgress(m);
        },
      }).catch((err) => {
        workerPromise = null;
        throw err;
      });
    }
    return workerPromise;
  }

  /**
   * @param {string[]} dataUrls
   * @param {(info:{phase:string,index?:number,total?:number,progress?:number,status?:string})=>void} [onProgress]
   * @returns {Promise<string>}
   */
  async function recognizeImages(dataUrls, onProgress) {
    const urls = (dataUrls || []).filter(Boolean);
    if (!urls.length) return "";

    const worker = await getWorker((m) => {
      if (onProgress) {
        onProgress({
          phase: "engine",
          status: m.status,
          progress: typeof m.progress === "number" ? m.progress : undefined,
        });
      }
    });

    const parts = [];
    for (let i = 0; i < urls.length; i++) {
      if (onProgress) {
        onProgress({ phase: "image", index: i + 1, total: urls.length, progress: 0 });
      }
      const { data } = await worker.recognize(urls[i]);
      const text = String((data && data.text) || "").trim();
      if (text) parts.push(text);
    }
    return parts.join("\n\n");
  }

  async function terminate() {
    if (!workerPromise) return;
    try {
      const w = await workerPromise;
      await w.terminate();
    } catch (_) {
      /* ignore */
    }
    workerPromise = null;
  }

  global.CVZ_NEED_OCR = {
    recognizeImages,
    terminate,
  };
})(window);
