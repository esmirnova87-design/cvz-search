/* ЦВЗ — OCR скринов заявки (Tesseract.js, rus+eng) в браузере. */
(function (global) {
  "use strict";

  let workerPromise = null;
  let workerMode = "";

  function ensureTesseract() {
    if (!global.Tesseract || typeof global.Tesseract.createWorker !== "function") {
      throw new Error("OCR-библиотека не загрузилась (нужен интернет для первого раза).");
    }
  }

  function loadImage(dataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Не удалось открыть картинку"));
      img.src = dataUrl;
    });
  }

  /**
   * mode:
   * - table — Excel НЦЗ: тёмный текст на пастели (не выжигать фон)
   * - tags  — SeaTable ЯППИ: светлый текст на цветных плашках
   * - auto  — эвристика по кадру
   */
  async function preprocessDataUrl(dataUrl, mode) {
    const img = await loadImage(dataUrl);
    const scale = img.width < 1600 ? 2.2 : 1.7;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const id = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = id.data;

    let m = mode || "auto";
    if (m === "auto") {
      let pastel = 0;
      let vivid = 0;
      const step = 16 * 4;
      for (let i = 0; i < d.length; i += step) {
        const r = d[i];
        const g = d[i + 1];
        const b = d[i + 2];
        const sat = Math.max(r, g, b) - Math.min(r, g, b);
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        if (sat > 35 && lum > 170) pastel++;
        else if (sat > 50 && lum < 170) vivid++;
      }
      m = pastel >= vivid ? "table" : "tags";
    }

    for (let i = 0; i < d.length; i += 4) {
      const r = d[i];
      const g = d[i + 1];
      const b = d[i + 2];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const sat = max - min;
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      let v;
      if (m === "table") {
        // пастельная заливка → белый фон; тёмный текст → чёрный
        if (sat > 25 && lum > 150) v = 255;
        else v = lum < 135 ? 0 : 255;
      } else {
        // цветные плашки: светлые буквы → чёрные, цветной фон → белый
        if (sat > 35) v = lum > 165 ? 0 : 255;
        else v = lum > 150 ? 255 : lum < 90 ? 0 : lum > 140 ? 255 : 0;
      }
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = 255;
    }
    ctx.putImageData(id, 0, 0);
    return canvas.toDataURL("image/png");
  }

  async function getWorker(onProgress, mode) {
    ensureTesseract();
    const psm = mode === "table" ? "4" : "6";
    if (workerPromise && workerMode === psm) return workerPromise;

    if (workerPromise) {
      try {
        const old = await workerPromise;
        await old.terminate();
      } catch (_) {
        /* ignore */
      }
      workerPromise = null;
    }

    workerMode = psm;
    workerPromise = global.Tesseract.createWorker("rus+eng", 1, {
      logger: (m) => {
        if (onProgress && m && m.status) onProgress(m);
      },
    })
      .then(async (worker) => {
        if (worker.setParameters) {
          await worker.setParameters({
            tessedit_pageseg_mode: psm,
            preserve_interword_spaces: "1",
          });
        }
        return worker;
      })
      .catch((err) => {
        workerPromise = null;
        workerMode = "";
        throw err;
      });
    return workerPromise;
  }

  /**
   * @param {string[]} dataUrls
   * @param {(info:object)=>void} [onProgress]
   * @param {{mode?: string}} [opts]
   */
  async function recognizeImages(dataUrls, onProgress, opts) {
    const urls = (dataUrls || []).filter(Boolean);
    if (!urls.length) return "";
    const mode = (opts && opts.mode) || "auto";

    const worker = await getWorker((m) => {
      if (onProgress) {
        onProgress({
          phase: "engine",
          status: m.status,
          progress: typeof m.progress === "number" ? m.progress : undefined,
        });
      }
    }, mode);

    const parts = [];
    for (let i = 0; i < urls.length; i++) {
      if (onProgress) {
        onProgress({ phase: "preprocess", index: i + 1, total: urls.length });
      }
      let src = urls[i];
      try {
        src = await preprocessDataUrl(urls[i], mode);
      } catch (_) {
        src = urls[i];
      }
      if (onProgress) {
        onProgress({ phase: "image", index: i + 1, total: urls.length, progress: 0 });
      }
      const { data } = await worker.recognize(src);
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
    workerMode = "";
  }

  global.CVZ_NEED_OCR = {
    recognizeImages,
    preprocessDataUrl,
    terminate,
  };
})(window);
