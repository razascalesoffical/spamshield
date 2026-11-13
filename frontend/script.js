// file:// se kholo to local backend, deploy pe same server (khali)
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

  if (!text) {
    out.innerHTML = `<div class="notice error">Pehle koi message likho.</div>`;
    return;
  }

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
    const d = await r.json();
    render(text, d);
  } catch (e) {
    out.innerHTML = `<div class="notice error">Server reachable nahi hai ya request fail hui. Backend chal raha hai?</div>`;
  } finally {
    btn.disabled = false;
    btn.textContent = "Analyze message";
  }
}

// Original message mein har word ko uske score ke hisaab se rang do
function highlight(text, d) {
  // no_stopwords[i] aur stemmed[i] ek hi word hain: word -> stem
  const stemOf = {};
  d.steps.no_stopwords.forEach((w, i) => { stemOf[w] = d.steps.stemmed[i]; });

  // stem -> score (sirf single words; bigrams ka space hota hai)
  const scoreOf = {};
  d.explanation.forEach((e) => { if (!e.term.includes(" ")) scoreOf[e.term] = e.score; });

  const maxAbs = Math.max(0.0001, ...d.explanation.map((e) => Math.abs(e.score)));

  return text.split(/([A-Za-z]+)/).map((part) => {
    const low = part.toLowerCase();
    const stem = stemOf[low];
    const sc = stem !== undefined ? scoreOf[stem] : undefined;
    if (sc === undefined) return esc(part);
    const strength = Math.min(1, Math.abs(sc) / maxAbs);
    const alpha = (0.18 + 0.5 * strength).toFixed(2);
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
    .map((t) => `<span class="tok ${kept.has(t) ? "kept" : "removed"}">${esc(t)}</span>`)
    .join("");
  const stemHtml = d.steps.stemmed.map((t) => `<span class="tok">${esc(t)}</span>`).join("");

  $("result").innerHTML = `
    <div class="verdict ${isSpam ? "spam" : "ham"}">
      <div class="verdict-top">
        <div class="verdict-icon">${isSpam ? "🚫" : "✅"}</div>
        <div>
          <h2>${isSpam ? "SPAM" : "HAM (safe)"}</h2>
          <p>Confidence: ${d.confidence}%</p>
        </div>
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
  ta.addEventListener("input", () => {
    $("count").textContent = ta.value.length + " characters";
  });
  $("check-btn").addEventListener("click", predict);
  $("clear-btn").addEventListener("click", () => {
    ta.value = "";
    $("count").textContent = "0 characters";
    $("result").innerHTML = "";
    ta.focus();
  });
  document.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      ta.value = chip.dataset.text;
      $("count").textContent = ta.value.length + " characters";
      predict();
    });
  });
  ta.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.key === "Enter") predict();
  });
  loadTopWords();
}

/* ---------------- Metrics page ---------------- */
async function loadMetrics() {
  const box = $("metrics");
  box.innerHTML = `<div class="notice"><span class="spinner"></span>Loading metrics...</div>`;
  try {
    const r = await fetch(`${API}/metrics`);
    if (!r.ok) throw new Error("HTTP " + r.status);
    const d = await r.json();
    const best = d.models[d.best_model];
    const cm = best.confusion_matrix;

    const rows = Object.entries(d.models).map(([name, m]) => `
      <tr>
        <td style="text-align:left">${esc(name)}${name === d.best_model ? " ⭐" : ""}</td>
        <td>${(m.accuracy * 100).toFixed(2)}%</td>
        <td>${(m.precision * 100).toFixed(2)}%</td>
        <td>${(m.recall * 100).toFixed(2)}%</td>
        <td class="${name === d.best_model ? "best" : ""}">${(m.f1 * 100).toFixed(2)}%</td>
      </tr>`).join("");

    box.innerHTML = `
      <div class="stat-grid">
        <div class="stat"><b>${esc(d.best_model)}</b><span>Best model</span></div>
        <div class="stat"><b>${(best.accuracy * 100).toFixed(1)}%</b><span>Accuracy</span></div>
        <div class="stat"><b>${d.train_size}</b><span>Training messages</span></div>
        <div class="stat"><b>${d.test_size}</b><span>Test messages</span></div>
      </div>

      <h3 style="text-align:center">Model comparison</h3>
      <div class="table-wrap">
        <table>
          <tr><th style="text-align:left">Model</th><th>Accuracy</th><th>Precision</th><th>Recall</th><th>F1</th></tr>
          ${rows}
        </table>
      </div>

      <h3 style="text-align:center">Confusion matrix (${esc(d.best_model)})</h3>
      <div class="cm">
        <div class="h"></div><div class="h">Predicted Ham</div><div class="h">Predicted Spam</div>
        <div class="h">Actual Ham</div><div class="good"><b>${cm[0][0]}</b>correct</div><div class="bad"><b>${cm[0][1]}</b>false alarm</div>
        <div class="h">Actual Spam</div><div class="bad"><b>${cm[1][0]}</b>missed</div><div class="good"><b>${cm[1][1]}</b>caught</div>
      </div>`;
  } catch (e) {
    box.innerHTML = `<div class="notice error">Metrics load nahi hue. Backend chal raha hai?</div>`;
  }
}

if ($("check-btn")) initAnalyzer();
if ($("metrics")) loadMetrics();