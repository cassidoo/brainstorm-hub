// Renderer for the brainstorm-hub canvas iframe.
// Returns a single self-contained HTML document (inline CSS + JS). The page
// talks to the extension only over ordinary HTTP to the loopback server, and
// listens on an SSE stream (/events) for live refreshes.

const ACCENT = "#ff54a0";

export function renderHtml() {
    return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Brainstorm Hub</title>
<style>
  :root { --accent: ${ACCENT}; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--background-color-default, #ffffff);
    color: var(--text-color-default, #1f2328);
    font-family: var(--font-sans, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
    font-size: var(--text-body-medium, 14px);
    line-height: var(--leading-body-medium, 20px);
  }
  a { color: var(--accent); }
  .wrap { max-width: 820px; margin: 0 auto; padding: 20px 18px 60px; }
  header.top {
    display: flex; align-items: center; gap: 10px;
    padding-bottom: 14px; margin-bottom: 18px;
    border-bottom: 1px solid var(--border-color-default, #d0d7de);
  }
  .spark {
    width: 28px; height: 28px; border-radius: 8px; flex: none;
    background: var(--accent);
    display: grid; place-items: center; color: #fff; font-size: 16px;
  }
  header.top h1 {
    margin: 0; font-size: var(--text-title-large, 22px);
    font-weight: var(--font-weight-semibold, 600);
  }
  header.top .sub { margin: 0; color: var(--text-color-muted, #59636e); font-size: 12px; }
  button {
    font: inherit; cursor: pointer; border-radius: 8px;
    border: 1px solid var(--border-color-default, #d0d7de);
    background: var(--background-color-default, #fff);
    color: var(--text-color-default, #1f2328);
    padding: 8px 14px; transition: background .12s, border-color .12s, opacity .12s;
  }
  button:hover:not(:disabled) { border-color: var(--accent); }
  button:disabled { opacity: .5; cursor: not-allowed; }
  button.primary {
    background: var(--accent); border-color: var(--accent); color: #fff; font-weight: 600;
  }
  button.primary:hover:not(:disabled) { filter: brightness(0.95); }
  .toolbar { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin-bottom: 18px; }
  .toolbar .grow { flex: 1; }

  .banner {
    display: none; align-items: center; gap: 12px;
    background: color-mix(in srgb, var(--accent) 12%, transparent);
    border: 1px solid var(--accent);
    border-radius: 10px; padding: 12px 14px; margin-bottom: 18px;
  }
  .banner.show { display: flex; }
  .banner .dot {
    width: 9px; height: 9px; border-radius: 50%; background: var(--accent); flex: none;
    animation: pulse 1.3s ease-in-out infinite;
  }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.3} }
  .banner .txt { flex: 1; }
  .banner .txt strong { display: block; }
  .banner .txt span { color: var(--text-color-muted, #59636e); font-size: 12px; }

  .grid { display: grid; gap: 12px; }
  .card {
    text-align: left; width: 100%;
    border: 1px solid var(--border-color-default, #d0d7de); border-radius: 12px;
    padding: 16px; background: var(--background-color-default, #fff);
  }
  .card:hover { border-color: var(--accent); }
  .card h3 { margin: 0 0 4px; font-size: 16px; font-weight: 600; }
  .card .meta { color: var(--text-color-muted, #59636e); font-size: 12px; }

  .empty {
    text-align: center; color: var(--text-color-muted, #59636e);
    padding: 48px 20px; border: 1px dashed var(--border-color-default, #d0d7de); border-radius: 12px;
  }
  .empty .spark { margin: 0 auto 12px; width: 40px; height: 40px; font-size: 22px; }

  .doc { line-height: 1.6; }
  .doc h1 { font-size: 24px; border-bottom: 2px solid var(--accent); padding-bottom: 8px; }
  .doc h2 { font-size: 18px; margin-top: 24px; }
  .doc h3 { font-size: 15px; }
  .doc code {
    font-family: var(--font-mono, "SFMono-Regular", Consolas, monospace);
    background: color-mix(in srgb, var(--accent) 10%, transparent);
    padding: 1px 5px; border-radius: 4px; font-size: 12px;
  }
  .doc pre { background: var(--background-color-muted, #f6f8fa); padding: 12px; border-radius: 8px; overflow: auto; }
  .doc pre code { background: none; padding: 0; }
  .doc blockquote {
    margin: 0; padding-left: 14px; border-left: 3px solid var(--accent);
    color: var(--text-color-muted, #59636e);
  }
  .doc ul, .doc ol { padding-left: 22px; }
  .back { background: none; border: none; color: var(--accent); padding: 0 0 14px; }
  .hidden { display: none !important; }
  .toast {
    position: fixed; bottom: 18px; left: 50%; transform: translateX(-50%);
    background: var(--accent); color: #fff; padding: 10px 16px; border-radius: 8px;
    font-size: 13px; opacity: 0; transition: opacity .2s; pointer-events: none;
  }
  .toast.show { opacity: 1; }
</style>
</head>
<body>
<div class="wrap">
  <header class="top">
    <div class="spark">&#10024;</div>
    <div>
      <h1>Brainstorm Hub</h1>
      <p class="sub">Think out loud. Keep the good ideas.</p>
    </div>
  </header>

  <!-- Interview-in-progress banner -->
  <div class="banner" id="banner">
    <span class="dot"></span>
    <div class="txt">
      <strong>Brainstorm in progress</strong>
      <span>When you're done talking it through, save it as an idea.</span>
    </div>
    <button class="primary" id="finishBtn">Finish &amp; save idea</button>
  </div>

  <!-- Dashboard view -->
  <section id="dashboard">
    <div class="toolbar">
      <div class="grow"></div>
      <button class="primary" id="newBtn">+ New idea</button>
    </div>
    <div class="grid" id="ideaList"></div>
  </section>

  <!-- Idea detail view -->
  <section id="ideaView" class="hidden">
    <button class="back" id="backBtn">&larr; All ideas</button>
    <div class="toolbar">
      <div class="grow"></div>
      <button class="primary" id="riffBtn">Riff on this idea</button>
    </div>
    <article class="doc" id="ideaDoc"></article>
  </section>
</div>
<div class="toast" id="toast"></div>

<script>
(function () {
  var state = "idle";        // idle | interviewing | finishing | saving
  var currentIdeaId = null;  // set when viewing an idea

  var els = {
    banner: document.getElementById("banner"),
    finishBtn: document.getElementById("finishBtn"),
    newBtn: document.getElementById("newBtn"),
    riffBtn: document.getElementById("riffBtn"),
    backBtn: document.getElementById("backBtn"),
    dashboard: document.getElementById("dashboard"),
    ideaView: document.getElementById("ideaView"),
    ideaList: document.getElementById("ideaList"),
    ideaDoc: document.getElementById("ideaDoc"),
    toast: document.getElementById("toast"),
  };

  // --- helpers ---------------------------------------------------------
  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  // Minimal, HTML-escaping markdown -> HTML. Raw HTML in the source is escaped
  // first, so idea files can never inject markup/script into this page.
  function md(src) {
    var lines = String(src).replace(/\\r\\n?/g, "\\n").split("\\n");
    var out = [], i = 0;
    function inline(t) {
      t = esc(t);
      t = t.replace(/\`([^\`]+)\`/g, function (_, c) { return "<code>" + c + "</code>"; });
      t = t.replace(/\\*\\*([^*]+)\\*\\*/g, "<strong>$1</strong>");
      t = t.replace(/(^|[^*])\\*([^*]+)\\*/g, "$1<em>$2</em>");
      t = t.replace(/\\[([^\\]]+)\\]\\(([^)]+)\\)/g, function (_, txt, url) {
        if (!/^https?:/i.test(url)) return txt;
        return '<a href="' + esc(url) + '" target="_blank" rel="noopener">' + txt + "</a>";
      });
      return t;
    }
    while (i < lines.length) {
      var line = lines[i];
      var h = /^(#{1,6})\\s+(.*)$/.exec(line);
      if (h) { var n = h[1].length; out.push("<h" + n + ">" + inline(h[2]) + "</h" + n + ">"); i++; continue; }
      if (/^\\s*\`\`\`/.test(line)) {
        i++; var buf = [];
        while (i < lines.length && !/^\\s*\`\`\`/.test(lines[i])) { buf.push(esc(lines[i])); i++; }
        i++; out.push("<pre><code>" + buf.join("\\n") + "</code></pre>"); continue;
      }
      if (/^\\s*>/.test(line)) {
        var q = [];
        while (i < lines.length && /^\\s*>/.test(lines[i])) { q.push(inline(lines[i].replace(/^\\s*>\\s?/, ""))); i++; }
        out.push("<blockquote>" + q.join("<br>") + "</blockquote>"); continue;
      }
      if (/^\\s*[-*+]\\s+/.test(line)) {
        var ul = [];
        while (i < lines.length && /^\\s*[-*+]\\s+/.test(lines[i])) { ul.push("<li>" + inline(lines[i].replace(/^\\s*[-*+]\\s+/, "")) + "</li>"); i++; }
        out.push("<ul>" + ul.join("") + "</ul>"); continue;
      }
      if (/^\\s*\\d+\\.\\s+/.test(line)) {
        var ol = [];
        while (i < lines.length && /^\\s*\\d+\\.\\s+/.test(lines[i])) { ol.push("<li>" + inline(lines[i].replace(/^\\s*\\d+\\.\\s+/, "")) + "</li>"); i++; }
        out.push("<ol>" + ol.join("") + "</ol>"); continue;
      }
      if (/^\\s*$/.test(line)) { i++; continue; }
      var para = [];
      while (i < lines.length && !/^\\s*$/.test(lines[i]) && !/^(#{1,6})\\s/.test(lines[i]) &&
             !/^\\s*[-*+]\\s/.test(lines[i]) && !/^\\s*\\d+\\.\\s/.test(lines[i]) &&
             !/^\\s*>/.test(lines[i]) && !/^\\s*\`\`\`/.test(lines[i])) { para.push(inline(lines[i])); i++; }
      out.push("<p>" + para.join(" ") + "</p>");
    }
    return out.join("\\n");
  }

  function showToast(msg) {
    els.toast.textContent = msg;
    els.toast.classList.add("show");
    setTimeout(function () { els.toast.classList.remove("show"); }, 2200);
  }

  function busy() { return state === "finishing" || state === "saving"; }

  function applyState() {
    els.banner.classList.toggle("show", state === "interviewing" || busy());
    els.finishBtn.disabled = state !== "interviewing";
    els.finishBtn.textContent = state === "finishing" ? "Saving…" : "Finish & save idea";
    els.newBtn.disabled = busy() || state === "interviewing";
    els.riffBtn.disabled = busy() || state === "interviewing";
  }

  function post(path, body) {
    return fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    }).then(function (r) {
      if (r.status === 409) { showToast("Hang on — finish the current step first."); return null; }
      return r.json().catch(function () { return {}; });
    }).catch(function () { showToast("Something went wrong."); return null; });
  }

  // --- views -----------------------------------------------------------
  function loadList() {
    return fetch("/api/ideas").then(function (r) { return r.json(); }).then(function (data) {
      var ideas = (data && data.ideas) || [];
      if (!ideas.length) {
        els.ideaList.innerHTML =
          '<div class="empty"><div class="spark">&#10024;</div>' +
          "<p><strong>No ideas yet.</strong></p>" +
          "<p>Start a brainstorm and your finished ideas show up here.</p></div>";
        return;
      }
      els.ideaList.innerHTML = ideas.map(function (it) {
        return '<button class="card" data-id="' + esc(it.id) + '">' +
          "<h3>" + esc(it.title) + "</h3>" +
          '<div class="meta">' + esc(it.created || "") + "</div></button>";
      }).join("");
      Array.prototype.forEach.call(els.ideaList.querySelectorAll(".card"), function (c) {
        c.addEventListener("click", function () { openIdea(c.getAttribute("data-id")); });
      });
    });
  }

  function openIdea(id) {
    return fetch("/api/ideas/" + encodeURIComponent(id)).then(function (r) {
      if (!r.ok) { showToast("Couldn't open that idea."); return null; }
      return r.json();
    }).then(function (data) {
      if (!data) return;
      currentIdeaId = id;
      els.ideaDoc.innerHTML = md(data.content || "");
      els.dashboard.classList.add("hidden");
      els.ideaView.classList.remove("hidden");
      try { history.replaceState(null, "", "?ideaId=" + encodeURIComponent(id)); } catch (e) {}
    });
  }

  function showDashboard() {
    currentIdeaId = null;
    els.ideaView.classList.add("hidden");
    els.dashboard.classList.remove("hidden");
    try { history.replaceState(null, "", location.pathname); } catch (e) {}
    loadList();
  }

  // --- events ----------------------------------------------------------
  els.newBtn.addEventListener("click", function () { post("/api/new-idea"); });
  els.riffBtn.addEventListener("click", function () {
    if (currentIdeaId) post("/api/riff", { ideaId: currentIdeaId });
  });
  els.finishBtn.addEventListener("click", function () { post("/api/finish"); });
  els.backBtn.addEventListener("click", showDashboard);

  // Live updates over SSE: state changes + idea-list refreshes.
  try {
    var es = new EventSource("/events");
    es.addEventListener("state", function (e) {
      try { state = JSON.parse(e.data).state || "idle"; } catch (x) {}
      applyState();
    });
    es.addEventListener("ideas", function () {
      if (els.dashboard.classList.contains("hidden")) return;
      loadList();
    });
    es.addEventListener("saved", function (e) {
      var t = "";
      try { t = JSON.parse(e.data).title || ""; } catch (x) {}
      showToast(t ? 'Saved "' + t + '"' : "Idea saved");
      showDashboard();
    });
  } catch (e) {}

  // --- boot ------------------------------------------------------------
  fetch("/api/state").then(function (r) { return r.json(); }).then(function (d) {
    state = (d && d.state) || "idle"; applyState();
  });
  var initial = new URLSearchParams(location.search).get("ideaId");
  if (initial) { openIdea(initial); } else { loadList(); }
})();
</script>
</body>
</html>`;
}
