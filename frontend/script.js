// Local testing ke liye. Deploy ke baad is ko Render wale URL se replace karna.
const API = "http://127.0.0.1:8000";

const $ = (id) => document.getElementById(id);

// Text ko HTML mein safe tareeqay se dikhane ke liye (user input par bharosa nahi)
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
    render(d);
  } catch (e) {
    out.innerHTML = `<div class="notice error">Server reachable nahi hai ya request fail hui. Backend chal raha hai?</div>`;
  } finally {
    btn.disabled = false;
    btn.textContent = "Analyze message";
  }
}

function render(d) {
  const isSpam = d.label === "spam";
  const kept = new Set(d.steps.no_stopwords);

  // Step 1: saare tokens
  const tokensHtml = d.steps.tokens.map((t) => `<span class="tok">${esc(t)}</span>`).join("");
  // Step 2: removed stopwords cut, kept green
  const stopHtml = d.steps.tokens
    .map((t) => `<span class="tok ${kept.has(t) ? "kept" : "removed"}">${esc(t)}</span>`)
    .join("");
  // Step 3: stemmed
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

    <div class="steps">
      <div class="step-card"><h4>1. Tokenization</h4><div class="tokens">${tokensHtml || "<span class='muted'>No words found</span>"}</div></div>
      <div class="step-card"><h4>2. Stopword removal (struck-through = removed)</h4><div class="tokens">${stopHtml || "-"}</div></div>
      <div class="step-card"><h4>3. Stemming</h4><div class="tokens">${stemHtml || "-"}</div></div>
    </div>`;

  // Meter animation: thori der baad width set karo taake transition chale
  requestAnimationFrame(() => {
    setTimeout(() => { $("meter").style.width = d.spam_probability + "%"; }, 60);
  });
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
  // Ctrl+Enter se bhi analyze
  ta.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.key === "Enter") predict();
  });
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

/* ---------------- Page ke hisaab se start ---------------- */
if ($("check-btn")) initAnalyzer();
if ($("metrics")) loadMetrics();