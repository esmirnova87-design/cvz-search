/* ЦВЗ — OCR скринов заявки (Tesseract.js, rus+eng) в браузере. */
(function (global) {
  "use strict";

  let workerPromise = null;

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
   * Цветные теги SeaTable (белый текст на цветном фоне) → чёрный текст на белом.
   * Увеличение ×2 для мелкого шрифта.
   */
  async function preprocessDataUrl(dataUrl) {
    const img = await loadImage(dataUrl);
    const scale = img.width < 1400 ? 2 : 1.5;
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
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i];
      const g = d[i + 1];
      const b = d[i + 2];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const sat = max - min;
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      let v;
      if (sat > 35) {
        // цветная плашка: светлые пиксели = буквы → чёрные, фон → белый
        v = lum > 170 ? 0 : 255;
      } else {
        v = lum > 150 ? 255 : lum < 90 ? 0 : Math.round(lum);
        // чуть усилить контраст
        v = v > 140 ? 255 : v < 110 ? 0 : v;
      }
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = 255;
    }
    ctx.putImageData(id, 0, 0);
    return canvas.toDataURL("image/png");
  }

  async function getWorker(onProgress) {
    ensureTesseract();
    if (!workerPromise) {
      workerPromise = global.Tesseract.createWorker("rus+eng", 1, {
        logger: (m) => {
          if (onProgress && m && m.status) onProgress(m);
        },
      })
        .then(async (worker) => {
          // единый блок текста (таблица)
          if (worker.setParameters) {
            await worker.setParameters({
              tessedit_pageseg_mode: "6",
              preserve_interword_spaces: "1",
            });
          }
          return worker;
        })
        .catch((err) => {
          workerPromise = null;
          throw err;
        });
    }
    return workerPromise;
  }

  /**
   * @param {string[]} dataUrls
   * @param {(info:object)=>void} [onProgress]
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
        onProgress({ phase: "preprocess", index: i + 1, total: urls.length });
      }
      let src = urls[i];
      try {
        src = await preprocessDataUrl(urls[i]);
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
  }

  global.CVZ_NEED_OCR = {
    recognizeImages,
    preprocessDataUrl,
    terminate,
  };
})(window);
