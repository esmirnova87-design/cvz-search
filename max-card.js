(function (global) {
  "use strict";

  const W = 1080;
  const H = 1350;

  function parseMaxText(raw) {
    const text = String(raw || "")
      .replace(/\u200b/g, "")
      .replace(/\r\n/g, "\n")
      .trim();
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    let title = "";
    let place = "";
    let need = "";
    let jobs = "";
    let rate = "";

    for (const line of lines) {
      if (/^📍/.test(line) || (!title && /производство|склад|завод|фабрик|отель|комбинат/i.test(line))) {
        const body = line.replace(/^📍\s*/, "").trim();
        const parts = body.split(/\s*,\s*/).filter(Boolean);
        if (parts.length >= 3) {
          title = parts.slice(0, -2).join(", ");
          place = parts.slice(-2).join(", ");
        } else if (parts.length === 2) {
          title = parts[0];
          place = parts[1];
        } else {
          title = body;
        }
        continue;
      }
      if (/^✅/.test(line) || /\d*\s*[мжМЖ]\b/.test(line) && /разнораб|грузчик|упаков|комплект|сборщик|водитель|оператор|подсоб/i.test(line)) {
        const body = line.replace(/^✅\s*/, "").trim();
        const m = body.match(/^((?:\d+\s*[мжМЖ](?:\s*\/\s*\d+\s*[мжМЖ])?)|(?:[мжМЖ]))\s*(.*)$/i);
        if (m) {
          need = m[1].replace(/\s+/g, "").replace(/м/gi, "М").replace(/ж/gi, "Ж");
          jobs = (m[2] || "").trim();
        } else {
          need = body;
        }
        continue;
      }
      if (/^🔥/.test(line) || /^\d[\d\s]*$/.test(line.replace(/руб.*$/i, "").trim())) {
        rate = line.replace(/^🔥\s*/, "").replace(/[^\d]/g, "");
      }
    }
    return { title, place, need, jobs, rate, raw: text };
  }

  function roundRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function wrapLines(ctx, text, maxWidth) {
    const words = String(text || "").split(/\s+/).filter(Boolean);
    const lines = [];
    let cur = "";
    for (const word of words) {
      const trial = cur ? cur + " " + word : word;
      if (ctx.measureText(trial).width <= maxWidth) {
        cur = trial;
      } else {
        if (cur) lines.push(cur);
        if (ctx.measureText(word).width <= maxWidth) {
          cur = word;
        } else {
          let chunk = "";
          for (const ch of word) {
            if (ctx.measureText(chunk + ch).width <= maxWidth) chunk += ch;
            else {
              if (chunk) lines.push(chunk);
              chunk = ch;
            }
          }
          cur = chunk;
        }
      }
    }
    if (cur) lines.push(cur);
    return lines;
  }

  function formatRate(rate) {
    const n = String(rate || "").replace(/\D/g, "");
    if (!n) return "";
    return n.replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " ₽";
  }

  function formatNeed(need) {
    const s = String(need || "").trim();
    if (!s) return "";
    if (/^[МЖ]$/i.test(s)) return s.toUpperCase() === "М" ? "мужчины" : "женщины";
    return s
      .replace(/(\d+)\s*М/gi, "$1М")
      .replace(/(\d+)\s*Ж/gi, "$1Ж");
  }

  function drawCard(canvas, data) {
    const ctx = canvas.getContext("2d");
    canvas.width = W;
    canvas.height = H;

    const navy = "#072139";
    const navy2 = "#0b2f4d";
    const red = "#f11c23";
    const cream = "#fff7f2";
    const muted = "#9db0c2";

    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, navy);
    g.addColorStop(0.55, navy2);
    g.addColorStop(1, "#051828");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = "rgba(241,28,35,0.18)";
    ctx.beginPath();
    ctx.arc(920, -40, 280, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = red;
    ctx.fillRect(0, 0, 18, H);

    ctx.fillStyle = cream;
    ctx.font = "700 42px Unbounded, sans-serif";
    ctx.fillText("ЦВЗ", 72, 92);
    ctx.fillStyle = muted;
    ctx.font = "600 22px Manrope, sans-serif";
    ctx.fillText("вахта  ·  подбор персонала", 72, 132);

    ctx.strokeStyle = "rgba(255,255,255,0.14)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(72, 168);
    ctx.lineTo(W - 72, 168);
    ctx.stroke();

    const title = data.title || "Объект";
    ctx.fillStyle = cream;
    ctx.font = "700 54px Unbounded, sans-serif";
    const titleLines = wrapLines(ctx, title, W - 144);
    let y = 250;
    titleLines.slice(0, 4).forEach((ln) => {
      ctx.fillText(ln, 72, y);
      y += 68;
    });

    if (data.place) {
      y += 12;
      roundRect(ctx, 72, y - 8, W - 144, 70, 18);
      ctx.fillStyle = "rgba(255,255,255,0.08)";
      ctx.fill();
      ctx.fillStyle = "#ffb4b7";
      ctx.font = "700 32px Manrope, sans-serif";
      ctx.fillText(data.place, 96, y + 40);
      y += 110;
    } else {
      y += 40;
    }

    const needLabel = formatNeed(data.need);
    const jobs = data.jobs || "";
    roundRect(ctx, 72, y, W - 144, jobs ? 210 : 140, 24);
    ctx.fillStyle = "rgba(255,255,255,0.07)";
    ctx.fill();
    ctx.fillStyle = muted;
    ctx.font = "700 20px Manrope, sans-serif";
    ctx.fillText("НУЖНЫ", 100, y + 42);
    ctx.fillStyle = cream;
    ctx.font = "700 48px Unbounded, sans-serif";
    ctx.fillText(needLabel || "—", 100, y + 108);
    if (jobs) {
      ctx.fillStyle = "#ffb4b7";
      ctx.font = "600 30px Manrope, sans-serif";
      const jobLines = wrapLines(ctx, jobs, W - 200);
      ctx.fillText(jobLines[0] || "", 100, y + 168);
    }
    y += jobs ? 250 : 180;

    const rate = formatRate(data.rate);
    roundRect(ctx, 72, y, W - 144, 180, 24);
    ctx.fillStyle = red;
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.font = "700 22px Manrope, sans-serif";
    ctx.fillText("СТАВКА ЗА СМЕНУ", 100, y + 52);
    ctx.fillStyle = "#fff";
    ctx.font = "700 72px Unbounded, sans-serif";
    ctx.fillText(rate || "—", 100, y + 140);

    ctx.fillStyle = muted;
    ctx.font = "600 22px Manrope, sans-serif";
    ctx.fillText("Не публикуем заказчика и адрес", 72, H - 72);
  }

  async function renderToCanvas(canvas, raw) {
    const data = parseMaxText(raw);
    if (document.fonts && document.fonts.ready) {
      try {
        await document.fonts.ready;
      } catch (_e) {
        /* ignore */
      }
    }
    drawCard(canvas, data);
    return data;
  }

  function canvasPngBlob(canvas) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Не удалось собрать PNG"));
      }, "image/png");
    });
  }

  function downloadPng(canvas, filename) {
    return canvasPngBlob(canvas).then((blob) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename || "cvz-max.png";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1500);
    });
  }

  async function copyPng(canvas) {
    const blob = await canvasPngBlob(canvas);
    if (!navigator.clipboard || !window.ClipboardItem) {
      throw new Error("Копирование картинки этот браузер не умеет — скачайте PNG");
    }
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
  }

  function fileNameFrom(data) {
    const slug = String(data.place || data.title || "vacancy")
      .toLowerCase()
      .replace(/ё/g, "е")
      .replace(/[^a-zа-я0-9]+/gi, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40);
    return "cvz-max-" + (slug || "card") + ".png";
  }

  global.CVZ_MAX_CARD = {
    parseMaxText,
    renderToCanvas,
    downloadPng,
    copyPng,
    fileNameFrom,
  };
})(window);
