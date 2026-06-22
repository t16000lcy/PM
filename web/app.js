const state = {
  records: [],
  filtered: [],
  selected: null,
};

const els = {
  metricRows: document.querySelector("#metricRows"),
  metricGenes: document.querySelector("#metricGenes"),
  metricCancers: document.querySelector("#metricCancers"),
  cancerFilter: document.querySelector("#cancerFilter"),
  geneFilter: document.querySelector("#geneFilter"),
  resultCount: document.querySelector("#resultCount"),
  resultCards: document.querySelector("#resultCards"),
  detailPanel: document.querySelector("#detailPanel"),
  resetFilters: document.querySelector("#resetFilters"),
  drawer: document.querySelector("#assistantDrawer"),
  assistantQuery: document.querySelector("#assistantQuery"),
  assistantSearch: document.querySelector("#assistantSearch"),
  assistantResults: document.querySelector("#assistantResults"),
};

const tierRank = { "I-A": 1, "I-B": 2, "II-C": 3, "II-D": 4 };
const cancerGroups = [
  {
    label: "乳癌",
    includes: ["Breast cancer", "Her2-receptor negative breast cancer", "Triple-receptor negative breast cancer", "Estrogen-receptor positive breast cancer"],
  },
  {
    label: "肺癌",
    includes: ["Non-small cell lung carcinoma", "Lung adenocarcinoma", "Lung cancer"],
  },
  {
    label: "大腸直腸癌",
    includes: ["Colorectal cancer", "Colorectal adenocarcinoma", "Cecum adenocarcinoma", "Rectum adenocarcinoma"],
  },
  {
    label: "攝護腺癌",
    includes: ["Prostate carcinoma", "Prostate adenocarcinoma"],
  },
  {
    label: "卵巢癌",
    includes: ["Ovarian mucinous adenocarcinoma"],
  },
  {
    label: "肝膽系統癌",
    includes: ["Hepatocellular carcinoma", "Intrahepatic cholangiocarcinoma", "Bile duct adenocarcinoma"],
  },
  {
    label: "胃腸道基質瘤",
    includes: ["Gastrointestinal stromal tumor"],
  },
];

async function init() {
  drawGeneCanvas();
  window.addEventListener("resize", drawGeneCanvas);
  wireEvents();

  const payload = await loadVariantDatabase();
  state.records = payload.records;
  state.filtered = [...state.records];

  els.metricRows.textContent = payload.metadata.publicRows.toLocaleString();
  els.metricGenes.textContent = payload.metadata.geneCount.toLocaleString();
  els.metricCancers.textContent = payload.metadata.cancerCount.toLocaleString();

  populateFilters(payload);
  applyFilters();
}

async function loadVariantDatabase() {
  const candidates = ["./data/variants.min.json", "./data/variants.json"];
  let lastError = null;
  for (const url of candidates) {
    try {
      const response = await fetch(`${url}?v=20260623-2`, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`${url} returned ${response.status}`);
      }
      const payload = await response.json();
      if (!payload.records?.length) {
        throw new Error(`${url} has no records`);
      }
      return payload;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("variant database load failed");
}

function wireEvents() {
  [els.cancerFilter, els.geneFilter].forEach((el) => {
    el.addEventListener("input", applyFilters);
  });

  els.resetFilters.addEventListener("click", () => {
    els.cancerFilter.value = "";
    els.geneFilter.value = "";
    applyFilters();
  });

  document.querySelectorAll("#openAssistantTop, #openAssistantHero, #openAssistantQuick, #openAssistantFloat").forEach((button) => {
    button.addEventListener("click", () => openAssistant());
  });

  document.querySelector("#closeAssistant").addEventListener("click", closeAssistant);
  document.querySelector("#closeAssistantBackdrop").addEventListener("click", closeAssistant);
  els.assistantSearch.addEventListener("click", () => {
    const record = findBestRecord(els.assistantQuery.value);
    renderAssistant(record, els.assistantQuery.value);
  });
  els.assistantQuery.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      const record = findBestRecord(els.assistantQuery.value);
      renderAssistant(record, els.assistantQuery.value);
    }
  });
}

function populateFilters(payload) {
  const groups = buildCancerGroups(state.records);
  groups.forEach((group) => {
    const option = document.createElement("option");
    option.value = group.key;
    option.textContent = `${group.label}（包含：${group.displayIncludes.join("、")}）`;
    els.cancerFilter.append(option);
  });

  payload.filters.genes.forEach((gene) => {
    const option = document.createElement("option");
    option.value = gene;
    option.textContent = gene;
    els.geneFilter.append(option);
  });
}

function applyFilters() {
  const cancerGroup = els.cancerFilter.value;
  const gene = els.geneFilter.value;

  state.filtered = state.records
    .filter((record) => {
      return (!cancerGroup || recordCancerGroupKey(record) === cancerGroup)
        && (!gene || record.gene === gene);
    })
    .sort((a, b) => (tierRank[a.tier] || 99) - (tierRank[b.tier] || 99) || a.gene.localeCompare(b.gene));

  renderResults();
}

function renderResults() {
  els.resultCount.textContent = `${state.filtered.length.toLocaleString()} 筆結果`;
  els.resultCards.innerHTML = "";

  if (!state.filtered.length) {
    els.resultCards.innerHTML = '<p class="no-results">找不到符合條件的 approved 資料。</p>';
    return;
  }

  state.filtered.slice(0, 120).forEach((record) => {
    const button = document.createElement("button");
    button.className = `result-card${state.selected?.id === record.id ? " is-active" : ""}`;
    button.type = "button";
    button.innerHTML = `
      <div class="meta-line">
        <span class="badge gold">${escapeHtml(record.tier || "Tier")}</span>
        <span class="badge">${escapeHtml(record.cancerTypeZh || record.cancerTypeEn || "未標示癌別")}</span>
      </div>
      <h3>${escapeHtml(record.variantDisplay || `${record.gene} ${record.variant}`)}</h3>
      <p>${escapeHtml(shortText(record.summaryProfessional || record.summaryPatient, 86))}</p>
    `;
    button.addEventListener("click", () => selectRecord(record));
    els.resultCards.append(button);
  });

  if (state.filtered.length > 120) {
    const note = document.createElement("p");
    note.className = "no-results";
    note.textContent = "僅顯示前 120 筆，請增加關鍵字縮小查詢範圍。";
    els.resultCards.append(note);
  }

  if (!state.selected && state.filtered[0]) {
    selectRecord(state.filtered[0], { preserveList: true });
  }
}

function selectRecord(record, options = {}) {
  state.selected = record;
  renderDetail(record);
  if (!options.preserveList) {
    renderResults();
  }
}

function renderDetail(record) {
  els.detailPanel.innerHTML = `
    <div class="detail-title">
      <div>
        <div class="meta-line">
          <span class="badge gold">Tier ${escapeHtml(record.tier)}</span>
          <span class="badge">${escapeHtml(record.variantType || "variant")}</span>
        </div>
        <h3>${escapeHtml(record.variantDisplay)}</h3>
        <p>${escapeHtml(record.cancerTypeZh)}｜${escapeHtml(record.cancerTypeEn)}</p>
      </div>
      <button class="primary-action" id="sendSelectedToAi" type="button">交給 AI 小助理</button>
    </div>
    <div class="detail-grid">
      ${infoCard("疾病相關用藥建議", drugList(record.diseaseRelatedDrugs))}
      ${infoCard("非疾病相關用藥建議", drugList(record.nonDiseaseRelatedDrugs))}
      ${infoCard("醫護專業摘要", escapeHtml(record.summaryProfessional || "目前無專業摘要。"), "wide")}
      ${infoCard("PMID", listText(record.pmids))}
      ${infoCard("NCT", listText(record.ncts))}
    </div>
    <div class="detail-actions">
      <button class="text-action" id="copySummary" type="button">複製摘要</button>
      <button class="text-action" id="clearSelection" type="button">清除選取</button>
    </div>
  `;

  document.querySelector("#sendSelectedToAi").addEventListener("click", () => {
    openAssistant(record);
  });
  document.querySelector("#copySummary").addEventListener("click", async () => {
    await navigator.clipboard.writeText(buildCopyText(record));
  });
  document.querySelector("#clearSelection").addEventListener("click", () => {
    state.selected = null;
    els.detailPanel.innerHTML = `
      <div class="empty-state">
        <h3>選擇一筆基因變異</h3>
        <p>左側結果會顯示癌別、基因、Tier 與用藥方向。點選後可查看醫護版摘要，或交給 AI 小助理產生六卡片說明。</p>
      </div>
    `;
    renderResults();
  });
}

function infoCard(title, body, variant = "") {
  return `
    <section class="info-card${variant ? ` ${variant}` : ""}">
      <h4>${escapeHtml(title)}</h4>
      <p>${body || "未列出"}</p>
    </section>
  `;
}

function openAssistant(record = null) {
  els.drawer.classList.add("is-open");
  els.drawer.setAttribute("aria-hidden", "false");
  if (record) {
    els.assistantQuery.value = record.variantDisplay;
    renderAssistant(record);
  } else {
    setTimeout(() => els.assistantQuery.focus(), 0);
  }
}

function closeAssistant() {
  els.drawer.classList.remove("is-open");
  els.drawer.setAttribute("aria-hidden", "true");
}

function findBestRecord(query) {
  const needle = normalize(query);
  if (!needle) return state.selected || state.records[0];

  const candidates = state.records.map((record) => {
    const exactVariant = normalize(record.variantDisplay) === needle ? 80 : 0;
    const exactGene = normalize(record.gene) === needle ? 35 : 0;
    const haystack = normalize([
      record.cancerTypeEn,
      record.cancerTypeZh,
      record.gene,
      record.variant,
      record.variantDisplay,
      record.tier,
      record.variantType,
      ...record.diseaseRelatedDrugs,
      ...record.nonDiseaseRelatedDrugs,
    ].join(" "));
    let score = exactVariant + exactGene;
    needle.split(/\s+/).forEach((token) => {
      if (token && haystack.includes(token)) score += 12;
    });
    if (haystack.includes(needle)) score += 24;
    score -= tierRank[record.tier] || 8;
    return { record, score };
  });

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.score > 0 ? candidates[0].record : null;
}

function renderAssistant(record, query = "") {
  if (!record) {
    els.assistantResults.innerHTML = `
      <p class="helper-text">找不到「${escapeHtml(query)}」相關的 approved 資料。請嘗試輸入癌別、基因名稱、變異點位或藥名。</p>
    `;
    return;
  }

  const diseaseDrugs = record.diseaseRelatedDrugs.length ? record.diseaseRelatedDrugs : ["本資料庫未列出疾病相關核准或指南建議用藥"];
  const otherDrugs = record.nonDiseaseRelatedDrugs.length ? record.nonDiseaseRelatedDrugs : ["本資料庫未列出非疾病相關或跨癌別用藥證據"];
  const meaning = record.summaryProfessional || record.summaryPatient || `${record.variantDisplay} 在 ${record.cancerTypeZh || record.cancerTypeEn} 中被資料庫列為 ${record.tier}，需搭配完整臨床資料判讀。`;

  els.assistantResults.innerHTML = `
    <div class="assistant-card-grid">
      ${assistantCard("查詢結果", `
        癌別：${escapeHtml(record.cancerTypeEn)}${record.cancerTypeZh ? `（${escapeHtml(record.cancerTypeZh)}）` : ""}<br>
        基因變異：${escapeHtml(record.variantDisplay)}<br>
        Tier：${escapeHtml(record.tier)}<br>
        變異類型：${escapeHtml(record.variantType || "variant")}
      `)}
      ${assistantCard("一、這個變異代表什麼？", escapeHtml(meaning))}
      ${assistantCard("二、證據等級", escapeHtml(tierExplanation(record.tier)))}
      ${assistantCard("三、與此癌別相關的治療方向", unorderedList(diseaseDrugs))}
      ${assistantCard("四、非本癌別或延伸證據", unorderedList(otherDrugs))}
      ${assistantCard("五、提醒", "上述內容是基於院內基因變異知識庫的整理，不代表個人治療建議。實際治療需由腫瘤科醫師依癌別、分期、病理、共變異、用藥史、NCCN/ESMO/TFDA/健保給付與病人臨床狀態判斷。")}
      ${assistantCard("六、資料來源", `
        本回答來自院內基因變異知識庫。${record.pmids.length ? `<br>PMID：${escapeHtml(record.pmids.join("; "))}` : ""}
        ${record.ncts.length ? `<br>NCT：${escapeHtml(record.ncts.join("; "))}` : ""}
      `)}
    </div>
  `;
}

function assistantCard(title, body) {
  return `
    <article class="assistant-card">
      <h3>${escapeHtml(title)}</h3>
      <p>${body}</p>
    </article>
  `;
}

function tierExplanation(tier) {
  const explanations = {
    "I-A": "Tier I-A：已獲主管機關核准用藥或專業治療指引支持，屬於較高等級的臨床處置依據。",
    "I-B": "Tier I-B：具有臨床可行性的治療證據或明確治療方向，但仍需依癌別、病人條件與給付規範判斷。",
    "II-C": "Tier II-C：屬於跨癌別、臨床試驗、早期研究或較間接的治療相關證據。",
    "II-D": "Tier II-D：臨床意義、功能影響或治療關聯仍需審慎判讀，需搭配病理、共變異、文獻與臨床脈絡確認。",
  };
  return explanations[tier] || `${tier || "Tier"}：需依資料庫原始摘要與臨床脈絡判讀。`;
}

function drawGeneCanvas() {
  const canvas = document.querySelector("#geneCanvas");
  if (!canvas) return;

  const rect = canvas.getBoundingClientRect();
  const scale = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(rect.width * scale));
  canvas.height = Math.max(1, Math.floor(rect.height * scale));

  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);
  ctx.clearRect(0, 0, rect.width, rect.height);

  const centerY = rect.height * 0.5;
  const startX = rect.width * 0.48;
  const endX = rect.width * 0.98;
  const amplitude = Math.min(90, rect.height * 0.12);
  const step = 26;

  ctx.lineWidth = 2;
  for (let x = startX; x < endX; x += step) {
    const t = (x - startX) / 64;
    const y1 = centerY + Math.sin(t) * amplitude;
    const y2 = centerY + Math.sin(t + Math.PI) * amplitude;
    ctx.strokeStyle = "rgba(44, 98, 105, 0.13)";
    ctx.beginPath();
    ctx.moveTo(x, y1);
    ctx.lineTo(x, y2);
    ctx.stroke();
    ctx.fillStyle = "rgba(44, 98, 105, 0.22)";
    ctx.beginPath();
    ctx.arc(x, y1, 4, 0, Math.PI * 2);
    ctx.arc(x, y2, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  drawWave(ctx, startX, endX, centerY, amplitude, 0, "rgba(44, 98, 105, 0.2)");
  drawWave(ctx, startX, endX, centerY, amplitude, Math.PI, "rgba(218, 123, 99, 0.18)");
}

function drawWave(ctx, startX, endX, centerY, amplitude, phase, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.beginPath();
  for (let x = startX; x <= endX; x += 4) {
    const y = centerY + Math.sin((x - startX) / 64 + phase) * amplitude;
    if (x === startX) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

function drugList(items) {
  if (!items?.length) return "未列出";
  return `<span class="drug-list">${items.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</span>`;
}

function unorderedList(items) {
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function listText(items) {
  if (!items?.length) return "未列出";
  return escapeHtml(items.join("; "));
}

function cancerValue(record) {
  return `${record.cancerTypeZh}｜${record.cancerTypeEn}`;
}

function buildCancerGroups(records) {
  const used = new Set();
  const groups = cancerGroups.map((group) => {
    const matchingRecords = records.filter((record) => group.includes.includes(record.cancerTypeEn));
    matchingRecords.forEach((record) => used.add(record.cancerTypeEn));
    return {
      key: group.label,
      label: group.label,
      displayIncludes: [...new Set(matchingRecords.map((record) => record.cancerTypeZh || record.cancerTypeEn))],
      count: matchingRecords.length,
    };
  }).filter((group) => group.count > 0);

  const otherCancers = [...new Set(records
    .filter((record) => !used.has(record.cancerTypeEn))
    .map((record) => cancerValue(record)))].sort();

  otherCancers.forEach((cancer) => {
    groups.push({
      key: cancer,
      label: cancer,
      displayIncludes: [cancer],
      count: 1,
    });
  });
  return groups;
}

function recordCancerGroupKey(record) {
  const group = cancerGroups.find((item) => item.includes.includes(record.cancerTypeEn));
  return group ? group.label : cancerValue(record);
}

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function shortText(value, length) {
  const text = String(value || "尚無摘要");
  return text.length > length ? `${text.slice(0, length)}...` : text;
}

function buildCopyText(record) {
  return [
    `癌別：${record.cancerTypeEn}（${record.cancerTypeZh}）`,
    `基因變異：${record.variantDisplay}`,
    `Tier：${record.tier}`,
    `疾病相關用藥：${record.diseaseRelatedDrugs.join("; ") || "未列出"}`,
    `非疾病相關用藥：${record.nonDiseaseRelatedDrugs.join("; ") || "未列出"}`,
    `摘要：${record.summaryProfessional || record.summaryPatient || "未列出"}`,
  ].join("\n");
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

init().catch((error) => {
  console.error(error);
  els.resultCount.textContent = "資料載入失敗";
  els.resultCards.innerHTML = '<p class="no-results">無法載入資料庫，請確認 web/data/variants.min.json 是否存在。</p>';
});
