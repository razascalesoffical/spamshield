const API = location.protocol === "file:" ? "http://127.0.0.1:8000" : "";
const $ = (id) => document.getElementById(id);

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

/* ---------------- Analyzer page ---------------- */
async function predict() {
  const text = $("text").value.trim();
  const out = $("result");
  const btn = $("check-btn");
  if (!text) { out.innerHTML = `<div class="notice error">Pehle koi message likho.</div>`; return; }

  btn.disabled = true;
  btn.textContent = "Analyzing...";
  out.innerHTML = `<div class="notice"><span class="spinner"></span>Server se pooch raha hun... (pehli baar 30-50 sec lag sakte hain)</div>`;
  try {
    const r = await fetch(`${API}/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text })
    });
    if (!r.ok) throw new Error("HTTP " + r.status);
    render(text, await r.json());
  } catch (e) {
    out.innerHTML = `<div class="notice error">Server reachable nahi hai ya request fail hui. Backend chal raha hai?</div>`;
  } finally {
    btn.disabled = false;
    btn.textContent = "Analyze message";
  }
}

function highlight(text, d) {
  const stemOf = {};
  d.steps.no_stopwords.forEach((w, i) => { stemOf[w] = d.steps.stemmed[i]; });
  const scoreOf = {};
  d.explanation.forEach((e) => { if (!e.term.includes(" ")) scoreOf[e.term] = e.score; });
  const maxAbs = Math.max(0.0001, ...d.explanation.map((e) => Math.abs(e.score)));

  return text.split(/([A-Za-z]+)/).map((part) => {
    const stem = stemOf[part.toLowerCase()];
    const sc = stem !== undefined ? scoreOf[stem] : undefined;
    if (sc === undefined) return esc(part);
    const alpha = (0.18 + 0.5 * Math.min(1, Math.abs(sc) / maxAbs)).toFixed(2);
    const color = sc > 0 ? `rgba(239,68,68,${alpha})` : `rgba(34,197,94,${alpha})`;
    return `<mark style="background:${color}" title="${esc(stem)}: ${sc}">${esc(part)}</mark>`;
  }).join("");
}

function contribBars(items) {
  if (!items.length) return "<span class='muted'>Koi known word nahi mila</span>";
  const maxAbs = Math.max(...items.map((e) => Math.abs(e.score)));
  return items.map((e) => {
    const w = Math.max(4, (Math.abs(e.score) / maxAbs) * 100);
    const cls = e.score > 0 ? "pos" : "neg";
    return `<div class="crow">
      <span class="cterm">${esc(e.term)}</span>
      <div class="cbar"><div class="cfill ${cls}" style="width:${w}%"></div></div>
      <span class="cscore ${cls}">${e.score > 0 ? "+" : ""}${e.score}</span>
    </div>`;
  }).join("");
}

function render(text, d) {
  const isSpam = d.label === "spam";
  const kept = new Set(d.steps.no_stopwords);
  const tokensHtml = d.steps.tokens.map((t) => `<span class="tok">${esc(t)}</span>`).join("");
  const stopHtml = d.steps.tokens
    .map((t) => `<span class="tok ${kept.has(t) ? "kept" : "removed"}">${esc(t)}</span>`).join("");
  const stemHtml = d.steps.stemmed.map((t) => `<span class="tok">${esc(t)}</span>`).join("");

  $("result").innerHTML = `
    <div class="verdict ${isSpam ? "spam" : "ham"}">
      <div class="verdict-top">
        <div class="verdict-icon">${isSpam ? "🚫" : "✅"}</div>
        <div><h2>${isSpam ? "SPAM" : "HAM (safe)"}</h2><p>Confidence: ${d.confidence}%</p></div>
      </div>
      <div class="meter"><div class="meter-fill" id="meter"></div></div>
      <div class="meter-label"><span>Spam probability</span><span>${d.spam_probability}%</span></div>
    </div>
    <div class="step-card">
      <h4>Why this verdict? <span class="muted">(red = pushes toward spam, green = toward ham)</span></h4>
      <div class="msg-box">${highlight(text, d)}</div>
      <div class="contrib">${contribBars(d.explanation)}</div>
    </div>
    <div class="steps">
      <div class="step-card"><h4>1. Tokenization</h4><div class="tokens">${tokensHtml || "<span class='muted'>No words found</span>"}</div></div>
      <div class="step-card"><h4>2. Stopword removal (struck-through = removed)</h4><div class="tokens">${stopHtml || "-"}</div></div>
      <div class="step-card"><h4>3. Stemming</h4><div class="tokens">${stemHtml || "-"}</div></div>
    </div>`;
  requestAnimationFrame(() => {
    setTimeout(() => { $("meter").style.width = d.spam_probability + "%"; }, 60);
  });
}

async function loadTopWords() {
  const box = $("topwords");
  try {
    const r = await fetch(`${API}/top-words`);
    if (!r.ok) throw new Error();
    const d = await r.json();
    const col = (title, items, cls) => {
      const maxAbs = Math.max(...items.map((i) => Math.abs(i.weight)));
      return `<div class="tw-col"><h3>${title}</h3>${items.map((i) => `
        <div class="crow">
          <span class="cterm">${esc(i.term)}</span>
          <div class="cbar"><div class="cfill ${cls}" style="width:${(Math.abs(i.weight) / maxAbs) * 100}%"></div></div>
          <span class="cscore ${cls}">${i.weight > 0 ? "+" : ""}${i.weight}</span>
        </div>`).join("")}</div>`;
    };
    box.innerHTML = `<div class="tw-grid">${col("Top spam words", d.spam, "pos")}${col("Top ham words", d.ham, "neg")}</div>`;
  } catch (e) {
    $("topwords-section").style.display = "none";
  }
}

function initAnalyzer() {
  const ta = $("text");
  ta.addEventListener("input", () => { $("count").textContent = ta.value.length + " characters"; });
  $("check-btn").addEventListener("click", predict);
  $("clear-btn").addEventListener("click", () => {
    ta.value = ""; $("count").textContent = "0 characters"; $("result").innerHTML = ""; ta.focus();
  });
  document.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      ta.value = chip.dataset.text;
      $("count").textContent = ta.value.length + " characters";
      predict();
    });
  });
  ta.addEventListener("keydown", (e) => { if (e.ctrlKey && e.key === "Enter") predict(); });
  loadTopWords();
}

/* ---------------- Metrics page ---------------- */
const COLORS = ["#f59e0b", "#818cf8", "#22c55e", "#ef4444"];

function rocChart(d) {
  const W = 440, H = 380, m = { l: 46, r: 14, t: 14, b: 44 };
  const pw = W - m.l - m.r, ph = H - m.t - m.b;
  const x = (v) => m.l + v * pw, y = (v) => m.t + (1 - v) * ph;
  const ticks = [0, 0.25, 0.5, 0.75, 1];

  const grid = ticks.map((t) => `
    <line x1="${x(0)}" y1="${y(t)}" x2="${x(1)}" y2="${y(t)}" stroke="rgba(255,255,255,0.08)"/>
    <line x1="${x(t)}" y1="${y(0)}" x2="${x(t)}" y2="${y(1)}" stroke="rgba(255,255,255,0.08)"/>
    <text x="${m.l - 8}" y="${y(t) + 4}" text-anchor="end" font-size="11" fill="#8b90a8">${t}</text>
    <text x="${x(t)}" y="${y(0) + 18}" text-anchor="middle" font-size="11" fill="#8b90a8">${t}</text>`).join("");

  const names = Object.keys(d.roc);
  const paths = names.map((n, i) => {
    const pts = d.roc[n].fpr.map((f, k) => `${x(f).toFixed(1)},${y(d.roc[n].tpr[k]).toFixed(1)}`).join(" ");
    return `<polyline points="${pts}" fill="none" stroke="${COLORS[i % 4]}" stroke-width="2.2" stroke-linejoin="round"/>`;
  }).join("");

  const legend = names.map((n, i) => `
    <span class="lg"><i style="background:${COLORS[i % 4]}"></i>${esc(n)} (AUC ${d.models[n].auc})</span>`).join("");

  return `
    <svg viewBox="0 0 ${W} ${H}" class="roc-svg" role="img" aria-label="ROC curves">
      ${grid}
      <line x1="${x(0)}" y1="${y(0)}" x2="${x(1)}" y2="${y(1)}" stroke="#8b90a8" stroke-dasharray="5 5"/>
      ${paths}
      <text x="${m.l + pw / 2}" y="${H - 6}" text-anchor="middle" font-size="12" fill="#8b90a8">False Positive Rate</text>
      <text x="14" y="${m.t + ph / 2}" text-anchor="middle" font-size="12" fill="#8b90a8" transform="rotate(-90 14 ${m.t + ph / 2})">True Positive Rate</text>
    </svg>
    <div class="legend">${legend}</div>`;
}

function cmHtml(cm) {
  return `
    <div class="h"></div><div class="h">Predicted Ham</div><div class="h">Predicted Spam</div>
    <div class="h">Actual Ham</div><div class="good"><b>${cm[0][0]}</b>correct</div><div class="bad"><b>${cm[0][1]}</b>false alarm</div>
    <div class="h">Actual Spam</div><div class="bad"><b>${cm[1][0]}</b>missed</div><div class="good"><b>${cm[1][1]}</b>caught</div>`;
}

async function loadMetrics() {
  const box = $("metrics");
  box.innerHTML = `<div class="notice"><span class="spinner"></span>Loading metrics...</div>`;
  try {
    const r = await fetch(`${API}/metrics`);
    if (!r.ok) throw new Error("HTTP " + r.status);
    const d = await r.json();
    const deployed = d.best_model;
    const overall = d.overall_best || deployed;
    const dm = d.models[deployed];
    const pct = (v) => (v * 100).toFixed(2) + "%";

    const rows = Object.entries(d.models).map(([name, m]) => {
      const tags = (name === overall ? " ⭐" : "") + (name === deployed ? " <span class='tag'>deployed</span>" : "");
      return `<tr>
        <td style="text-align:left">${esc(name)}${tags}</td>
        <td>${pct(m.accuracy)}</td><td>${pct(m.precision)}</td><td>${pct(m.recall)}</td>
        <td class="${name === overall ? "best" : ""}">${pct(m.f1)}</td>
        <td>${m.auc ?? "-"}</td>
        <td>${m.cv_f1_mean !== undefined ? (m.cv_f1_mean * 100).toFixed(1) + " ± " + (m.cv_f1_std * 100).toFixed(1) : "-"}</td>
      </tr>`;
    }).join("");

    const options = Object.keys(d.models).map((n) =>
      `<option value="${esc(n)}" ${n === deployed ? "selected" : ""}>${esc(n)}</option>`).join("");

    box.innerHTML = `
      <div class="stat-grid">
        <div class="stat"><b>${esc(deployed)}</b><span>Deployed model</span></div>
        <div class="stat"><b>${pct(dm.accuracy)}</b><span>Accuracy</span></div>
        <div class="stat"><b>${dm.auc ?? "-"}</b><span>ROC AUC</span></div>
        <div class="stat"><b>${d.train_size} / ${d.test_size}</b><span>Train / Test</span></div>
      </div>

      <h3 class="ctr">Model comparison</h3>
      <div class="table-wrap">
        <table>
          <tr><th style="text-align:left">Model</th><th>Accuracy</th><th>Precision</th><th>Recall</th><th>F1</th><th>AUC</th><th>5-fold CV F1</th></tr>
          ${rows}
        </table>
      </div>
      <p class="muted ctr">⭐ best F1 on test set. Deployed model is chosen for explainability (word-level coefficients).</p>

      <div class="two-col">
        <div class="card-block">
          <h3 class="ctr">ROC curves</h3>
          ${d.roc ? rocChart(d) : "<p class='muted'>ROC data nahi mila. train.py dobara chalao.</p>"}
        </div>
        <div class="card-block">
          <h3 class="ctr">Confusion matrix</h3>
          <div class="ctr"><select id="cm-select">${options}</select></div>
          <div class="cm" id="cm">${cmHtml(dm.confusion_matrix)}</div>
        </div>
      </div>`;

    $("cm-select").addEventListener("change", (e) => {
      $("cm").innerHTML = cmHtml(d.models[e.target.value].confusion_matrix);
    });
  } catch (e) {
    box.innerHTML = `<div class="notice error">Metrics load nahi hue. Backend chal raha hai?</div>`;
  }
}

if ($("check-btn")) initAnalyzer();
if ($("metrics")) loadMetrics();