const API = location.protocol === "file:" ? "http://127.0.0.1:8000" : "";
const $ = (id) => document.getElementById(id);

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}
function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
async function errText(r) {
  try { const j = await r.json(); if (typeof j.detail === "string") return j.detail; } catch (e) {}
  return "HTTP " + r.status;
}

/* ---------------- Theme toggle ---------------- */
function applyTheme(t) {
  document.documentElement.setAttribute("data-theme", t);
  const b = $("theme-btn");
  if (b) b.textContent = t === "light" ? "🌙 Dark" : "☀️ Light";
}
function initTheme() {
  applyTheme(lsGet("ss-theme") || "dark");
  const b = $("theme-btn");
  if (b) b.addEventListener("click", () => {
    const next = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
    lsSet("ss-theme", next);
    applyTheme(next);
  });
}

/* ---------------- Analyzer ---------------- */
let last = null;
const threshold = () => parseInt($("thr").value, 10) / 100;

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
      body: JSON.stringify({ text, threshold: threshold() })
    });
    if (!r.ok) throw new Error(await errText(r));
    const d = await r.json();
    last = { text, d };
    render(text, d);
    addHistory(text, d);
  } catch (e) {
    const msg = e.message && e.message.indexOf("Rate limit") === 0
      ? e.message : "Server reachable nahi hai ya request fail hui. Backend chal raha hai?";
    out.innerHTML = `<div class="notice error">${esc(msg)}</div>`;
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
      <div class="meter-label"><span>Spam probability (threshold ${Math.round(d.threshold * 100)}%)</span><span>${d.spam_probability}%</span></div>
    </div>

    <div class="result-actions">
      <button class="btn-ghost btn-small" id="copy-btn" type="button">📋 Copy result</button>
      <span class="muted" id="copy-msg"></span>
      <span class="spacer"></span>
      <span class="muted">Wrong result?</span>
      <button class="btn-ghost btn-small" id="fb-btn" type="button">Mark as ${isSpam ? "HAM" : "SPAM"}</button>
      <span class="muted" id="fb-msg"></span>
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

  $("copy-btn").addEventListener("click", copyResult);
  $("fb-btn").addEventListener("click", sendFeedback);
  requestAnimationFrame(() => {
    setTimeout(() => { const m = $("meter"); if (m) m.style.width = d.spam_probability + "%"; }, 60);
  });
}

async function copyResult() {
  if (!last) return;
  const { text, d } = last;
  const top = d.explanation.slice(0, 5).map((e) => `${e.term} (${e.score > 0 ? "+" : ""}${e.score})`).join(", ");
  const s = `SpamShield: ${d.label.toUpperCase()} | spam probability ${d.spam_probability}% | threshold ${Math.round(d.threshold * 100)}%\nMessage: ${text}\nTop words: ${top || "-"}`;
  let ok = false;
  try { await navigator.clipboard.writeText(s); ok = true; }
  catch (e) {
    try {
      const ta = document.createElement("textarea");
      ta.value = s; document.body.appendChild(ta); ta.select();
      ok = document.execCommand("copy"); ta.remove();
    } catch (e2) {}
  }
  $("copy-msg").textContent = ok ? "Copied!" : "Copy failed";
}

async function sendFeedback() {
  if (!last) return;
  const btn = $("fb-btn");
  btn.disabled = true;
  try {
    const r = await fetch(`${API}/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: last.text.slice(0, 2000),
        predicted: last.d.label,
        correct: last.d.label === "spam" ? "ham" : "spam"
      })
    });
    if (!r.ok) throw new Error(await errText(r));
    $("fb-msg").textContent = "Thanks, saved!";
  } catch (e) {
    $("fb-msg").textContent = "Could not send";
    btn.disabled = false;
  }
}

/* ---------------- History (browser mein, server pe nahi) ---------------- */
const HKEY = "ss-history";
function getHistory() {
  try { const a = JSON.parse(lsGet(HKEY) || "[]"); return Array.isArray(a) ? a : []; }
  catch (e) { return []; }
}
function addHistory(text, d) {
  let h = getHistory().filter((x) => x.text !== text);
  h.unshift({ text: text.slice(0, 300), label: d.label, prob: d.spam_probability });
  h = h.slice(0, 10);
  lsSet(HKEY, JSON.stringify(h));
  renderHistory();
}
function renderHistory() {
  const sec = $("history-section");
  const h = getHistory();
  if (!h.length) { sec.style.display = "none"; return; }
  sec.style.display = "";
  $("history-list").innerHTML = h.map((x, i) => {
    const cls = x.label === "spam" ? "spam" : "ham";
    return `<button class="hist-item" type="button" data-i="${i}">
      <span class="pill ${cls}">${cls.toUpperCase()}</span>
      <span class="hist-text">${esc(x.text)}</span>
      <span class="muted">${Number(x.prob) || 0}%</span>
    </button>`;
  }).join("");
  document.querySelectorAll(".hist-item").forEach((b) => {
    b.addEventListener("click", () => {
      const x = getHistory()[Number(b.dataset.i)];
      if (!x) return;
      $("text").value = x.text;
      $("count").textContent = x.text.length + " characters";
      predict();
      $("analyzer").scrollIntoView({ behavior: "smooth" });
    });
  });
}

/* ---------------- Batch ---------------- */
const MAXB = 200;
let lastBatch = null;

function firstField(line) {
  if (line[0] === '"') {
    let out = "", i = 1;
    while (i < line.length) {
      if (line[i] === '"') { if (line[i + 1] === '"') { out += '"'; i += 2; continue; } break; }
      out += line[i++];
    }
    return out;
  }
  const m = line.search(/[,\t]/);
  return m === -1 ? line : line.slice(0, m);
}
const batchLines = () => $("batch-text").value.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
function updateBatchCount() {
  const n = batchLines().length;
  $("batch-count").textContent = n + (n === 1 ? " message" : " messages");
}
function readBatchFile(file) {
  const rd = new FileReader();
  rd.onload = () => {
    let lines = String(rd.result).split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
      .map(firstField).map((s) => s.trim()).filter(Boolean);
    if (lines.length && ["text", "message", "sms", "v2", "review", "content"].includes(lines[0].toLowerCase())) lines.shift();
    let note = "";
    if (lines.length > MAXB) { note = `File mein ${lines.length} messages the, sirf pehle ${MAXB} use hue.`; lines = lines.slice(0, MAXB); }
    $("batch-text").value = lines.join("\n");
    updateBatchCount();
    $("batch-result").innerHTML = note ? `<div class="notice">${esc(note)}</div>` : "";
  };
  rd.readAsText(file);
}

async function runBatch() {
  const out = $("batch-result");
  let lines = batchLines();
  if (!lines.length) { out.innerHTML = `<div class="notice error">Pehle kuch messages likho ya file upload karo.</div>`; return; }
  let note = "";
  if (lines.length > MAXB) { note = `Sirf pehle ${MAXB} messages check hue.`; lines = lines.slice(0, MAXB); }

  const btn = $("batch-btn");
  btn.disabled = true; btn.textContent = "Checking...";
  out.innerHTML = `<div class="notice"><span class="spinner"></span>${lines.length} messages check ho rahe hain...</div>`;
  try {
    const r = await fetch(`${API}/predict-batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texts: lines, threshold: threshold() })
    });
    if (!r.ok) throw new Error(await errText(r));
    lastBatch = await r.json();
    renderBatch(lastBatch, note);
  } catch (e) {
    const msg = e.message && e.message.indexOf("Rate limit") === 0
      ? e.message : "Batch check fail hua. Backend chal raha hai?";
    out.innerHTML = `<div class="notice error">${esc(msg)}</div>`;
  } finally {
    btn.disabled = false; btn.textContent = "Check all";
  }
}

function renderBatch(d, note) {
  const rows = d.results.map((r, i) => {
    const cls = r.label === "spam" ? "spam" : "ham";
    const short = r.text.length > 90 ? r.text.slice(0, 90) + "..." : r.text;
    return `<tr>
      <td>${i + 1}</td>
      <td class="msg-cell" title="${esc(r.text)}">${esc(short)}</td>
      <td><span class="pill ${cls}">${cls.toUpperCase()}</span></td>
      <td>${r.spam_probability}%</td>
    </tr>`;
  }).join("");

  $("batch-result").innerHTML = `
    ${note ? `<div class="notice">${esc(note)}</div>` : ""}
    <div class="stat-grid batch-stats">
      <div class="stat"><b>${d.count}</b><span>Checked</span></div>
      <div class="stat"><b class="t-spam">${d.spam}</b><span>Spam</span></div>
      <div class="stat"><b class="t-ham">${d.ham}</b><span>Ham</span></div>
      <div class="stat"><b>${Math.round(d.threshold * 100)}%</b><span>Threshold</span></div>
    </div>
    <div class="table-wrap">
      <table class="batch-table">
        <tr><th>#</th><th style="text-align:left">Message</th><th>Verdict</th><th>Spam %</th></tr>
        ${rows}
      </table>
    </div>
    <button id="batch-dl" class="btn-ghost" type="button">⬇ Download results (CSV)</button>`;
  $("batch-dl").addEventListener("click", downloadBatch);
}

function csvCell(s) {
  s = String(s);
  if (/^[=+\-@]/.test(s)) s = "'" + s;      // spreadsheet formula injection se bachao
  return '"' + s.replace(/"/g, '""') + '"';
}
function downloadBatch() {
  if (!lastBatch) return;
  const rows = ["text,label,spam_probability"].concat(
    lastBatch.results.map((r) => [csvCell(r.text), r.label, r.spam_probability].join(",")));
  const blob = new Blob([rows.join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "spamshield-batch.csv";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ---------------- Top words ---------------- */
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
  $("thr").addEventListener("input", () => { $("thr-val").textContent = $("thr").value + "%"; });
  $("thr").addEventListener("change", () => { if ($("text").value.trim()) predict(); });
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

  $("hist-clear").addEventListener("click", () => { lsSet(HKEY, "[]"); renderHistory(); });
  renderHistory();

  $("batch-text").addEventListener("input", updateBatchCount);
  $("batch-file").addEventListener("change", (e) => { if (e.target.files[0]) readBatchFile(e.target.files[0]); e.target.value = ""; });
  $("batch-btn").addEventListener("click", runBatch);
  $("batch-clear").addEventListener("click", () => {
    $("batch-text").value = ""; updateBatchCount(); $("batch-result").innerHTML = ""; lastBatch = null;
  });

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
    <line x1="${x(0)}" y1="${y(t)}" x2="${x(1)}" y2="${y(t)}" stroke="currentColor" stroke-opacity="0.12"/>
    <line x1="${x(t)}" y1="${y(0)}" x2="${x(t)}" y2="${y(1)}" stroke="currentColor" stroke-opacity="0.12"/>
    <text x="${m.l - 8}" y="${y(t) + 4}" text-anchor="end" font-size="11" fill="currentColor" fill-opacity="0.6">${t}</text>
    <text x="${x(t)}" y="${y(0) + 18}" text-anchor="middle" font-size="11" fill="currentColor" fill-opacity="0.6">${t}</text>`).join("");

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
      <line x1="${x(0)}" y1="${y(0)}" x2="${x(1)}" y2="${y(1)}" stroke="currentColor" stroke-opacity="0.5" stroke-dasharray="5 5"/>
      ${paths}
      <text x="${m.l + pw / 2}" y="${H - 6}" text-anchor="middle" font-size="12" fill="currentColor" fill-opacity="0.6">False Positive Rate</text>
      <text x="14" y="${m.t + ph / 2}" text-anchor="middle" font-size="12" fill="currentColor" fill-opacity="0.6" transform="rotate(-90 14 ${m.t + ph / 2})">True Positive Rate</text>
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

/* ---------------- Start ---------------- */
initTheme();
if ($("check-btn")) initAnalyzer();
if ($("metrics")) loadMetrics();