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
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700;12..96,800&display=swap" rel="stylesheet" />
<style>
  :root {
    --accent: #ff54a0;
    --accent-strong: #d61f6f;
    --accent-deep: #b81a5e;
    --violet: #7c3aed;
    --bg: #fdf2f8;
    --surface: #ffffff;
    --ink: #2b1d28;
    --muted: #7a4d63;
    --border: #f6d9e8;
    --border-strong: #efc2dc;
    --radius: 16px;
    --radius-sm: 11px;
    --shadow-sm: 0 1px 2px rgba(43,29,40,.05), 0 2px 6px rgba(214,31,111,.06);
    --shadow-md: 0 6px 18px rgba(214,31,111,.12), 0 2px 6px rgba(43,29,40,.05);
    --shadow-lg: 0 16px 44px rgba(214,31,111,.22);
    --ring: 0 0 0 3px rgba(255,84,160,.40);
    --ease: cubic-bezier(.22,1,.36,1);
    --z-toast: 60;
    --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Inter, sans-serif;
    --font-display: "Bricolage Grotesque", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    --font-mono: "SFMono-Regular", Consolas, monospace;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--bg);
    color: var(--ink);
    font-family: var(--font-sans);
    font-size: 14px;
    line-height: 20px;
    -webkit-font-smoothing: antialiased;
  }
  a { color: var(--accent-strong); }
  .wrap { max-width: 760px; margin: 0 auto; padding: 18px 16px 64px; }

  /* --- Header (dark slate app bar) --- */
  header.top {
    display: flex; align-items: center; gap: 13px;
    padding: 17px 20px; margin-bottom: 22px;
    background: #17121b;
    border: 1px solid #2c2430;
    border-radius: var(--radius);
    box-shadow: var(--shadow-sm);
  }
  .spark {
    flex: none; display: grid; place-items: center; line-height: 1;
    font-size: 22px;
  }
  header.top .brand { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
  header.top h1 {
    margin: 0; font-family: var(--font-display);
    font-size: 20px; font-weight: 700; letter-spacing: -0.015em; line-height: 1.12;
    color: #fff;
  }
  header.top h1 .dot { color: var(--accent); margin-left: 1px; }
  header.top .sub { margin: 0; color: #c4b2bf; font-size: 12.5px; font-weight: 500; }

  /* --- Buttons --- */
  button {
    font: inherit; font-weight: 600; cursor: pointer; border-radius: var(--radius-sm);
    border: 1px solid var(--border-strong);
    background: var(--surface);
    color: var(--ink);
    padding: 9px 15px;
    box-shadow: var(--shadow-sm);
    transition: transform .18s var(--ease), box-shadow .18s var(--ease),
                border-color .18s var(--ease), background .18s var(--ease);
  }
  button:hover:not(:disabled) { transform: translateY(-1px); border-color: var(--accent); box-shadow: var(--shadow-md); }
  button:active:not(:disabled) { transform: translateY(0); }
  button:focus-visible { outline: none; box-shadow: var(--ring); }
  button:disabled { opacity: .5; cursor: not-allowed; box-shadow: none; }
  button.primary {
    background: var(--accent-strong); border-color: transparent; color: #fff;
  }
  button.primary:hover:not(:disabled) { background: var(--accent-deep); }
  #refreshBtn { background: var(--surface); color: var(--accent-strong); }
  #refreshBtn:hover:not(:disabled) { color: var(--accent-deep); }

  .toolbar { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin-bottom: 18px; }
  .toolbar .grow { flex: 1; }

  /* --- Interview banner --- */
  .banner {
    display: none; align-items: center; gap: 12px;
    background:
      linear-gradient(135deg, rgba(255,84,160,.12), rgba(124,58,237,.10));
    border: 1px solid var(--border-strong);
    border-radius: var(--radius); padding: 13px 15px; margin-bottom: 18px;
    box-shadow: var(--shadow-sm);
  }
  .banner.show { display: flex; }
  .banner .dot {
    width: 10px; height: 10px; border-radius: 50%; background: var(--accent-strong); flex: none;
    box-shadow: 0 0 0 0 rgba(214,31,111,.45);
    animation: pulse 1.4s ease-in-out infinite;
  }
  @keyframes pulse {
    0% { box-shadow: 0 0 0 0 rgba(214,31,111,.45); opacity: 1; }
    70% { box-shadow: 0 0 0 8px rgba(214,31,111,0); opacity: .7; }
    100% { box-shadow: 0 0 0 0 rgba(214,31,111,0); opacity: 1; }
  }
  .banner .txt { flex: 1; }
  .banner .txt strong { display: block; color: var(--ink); }
  .banner .txt span { color: var(--muted); font-size: 12px; }

  /* --- Idea grid --- */
  .grid { display: grid; gap: 13px; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); }
  .card {
    position: relative; overflow: hidden;
    text-align: left; width: 100%; font: inherit; color: inherit;
    border: 1px solid var(--border); border-radius: var(--radius);
    padding: 17px 18px 15px; background: var(--surface); cursor: pointer;
    box-shadow: var(--shadow-sm);
    transition: transform .2s var(--ease), box-shadow .2s var(--ease), border-color .2s var(--ease);
    animation: cardIn .45s var(--ease);
  }
  .card::before {
    content: ""; position: absolute; top: 16px; right: 16px;
    width: 10px; height: 10px; border-radius: 50%;
    background: var(--dot, var(--accent));
    box-shadow: 0 0 0 4px color-mix(in srgb, var(--dot, var(--accent)) 18%, transparent);
    transition: transform .2s var(--ease);
  }
  .card:nth-child(4n+1) { --dot: #ff54a0; }
  .card:nth-child(4n+2) { --dot: #7c3aed; }
  .card:nth-child(4n+3) { --dot: #f59e0b; }
  .card:nth-child(4n+4) { --dot: #06b6d4; }
  .card:nth-child(1) { animation-delay: .02s; }
  .card:nth-child(2) { animation-delay: .06s; }
  .card:nth-child(3) { animation-delay: .10s; }
  .card:nth-child(4) { animation-delay: .14s; }
  .card:nth-child(5) { animation-delay: .18s; }
  .card:nth-child(6) { animation-delay: .22s; }
  .card:hover { transform: translateY(-3px); box-shadow: var(--shadow-lg); border-color: var(--border-strong); }
  .card:hover::before { transform: scale(1.3); }
  .card:focus-visible { outline: none; box-shadow: var(--ring); }
  .card h3 {
    margin: 0 0 6px; padding-right: 20px; font-family: var(--font-display);
    font-size: 16px; font-weight: 700; letter-spacing: -0.01em; color: var(--ink);
    text-wrap: balance;
  }
  .card .meta { color: var(--muted); font-size: 12px; font-weight: 500; }

  /* --- Empty state --- */
  .empty {
    grid-column: 1 / -1;
    text-align: center; color: var(--muted);
    padding: 46px 24px; background: var(--surface);
    border: 1.5px dashed var(--border-strong); border-radius: var(--radius);
    box-shadow: var(--shadow-sm);
  }
  .empty .spark { margin: 0 auto 14px; font-size: 50px; animation: float 3.2s ease-in-out infinite; }
  .empty strong { display: block; color: var(--ink); font-family: var(--font-display); font-size: 17px; font-weight: 700; margin-bottom: 4px; }
  .empty p { margin: 4px 0; }

  /* --- Idea document --- */
  .doc { line-height: 1.65; }
  .doc h1 { font-family: var(--font-display); font-size: 25px; font-weight: 800; letter-spacing: -0.02em; border-bottom: 2px solid var(--accent); padding-bottom: 10px; text-wrap: balance; }
  .doc h2 { font-family: var(--font-display); font-size: 18px; font-weight: 700; margin-top: 26px; }
  .doc h3 { font-size: 15px; }
  .doc code {
    font-family: var(--font-mono);
    background: color-mix(in srgb, var(--accent) 12%, transparent);
    color: var(--accent-deep);
    padding: 1px 5px; border-radius: 5px; font-size: 12px;
  }
  .doc pre { background: #fff4fa; border: 1px solid var(--border); padding: 12px; border-radius: 10px; overflow: auto; }
  .doc pre code { background: none; padding: 0; color: inherit; }
  .doc blockquote {
    margin: 0; padding: 10px 14px; border-radius: 10px;
    background: color-mix(in srgb, var(--accent) 8%, transparent);
    color: var(--muted);
  }
  .doc ul, .doc ol { padding-left: 22px; }
  .back {
    display: inline-flex; align-items: center; gap: 4px;
    background: none; border: none; box-shadow: none; color: var(--accent-strong);
    padding: 4px 0 14px; font-weight: 600;
  }
  .back:hover:not(:disabled) { transform: none; color: var(--accent-deep); }
  .hidden { display: none !important; }

  /* --- Toast --- */
  .toast {
    position: fixed; bottom: 18px; left: 50%; transform: translateX(-50%) translateY(8px);
    z-index: var(--z-toast);
    background: var(--accent-strong); color: #fff; padding: 11px 17px; border-radius: var(--radius-sm);
    font-size: 13px; font-weight: 600; box-shadow: var(--shadow-lg);
    opacity: 0; transition: opacity .2s var(--ease), transform .2s var(--ease); pointer-events: none;
  }
  .toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }

  @keyframes cardIn { from { opacity: 0; transform: translateY(10px) scale(.98); } to { opacity: 1; transform: none; } }
  @keyframes float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-7px); } }

  @media (prefers-reduced-motion: reduce) {
    *, *::before { animation: none !important; transition: none !important; }
    .card { opacity: 1; transform: none; }
  }
</style>
</head>
<body>
<div class="wrap">
  <header class="top">
    <div class="brand">
      <h1>Brainstorm Hub<span class="dot" aria-hidden="true">.</span></h1>
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
      <button id="refreshBtn" title="Refresh the ideas list">&#8635; Refresh</button>
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
    refreshBtn: document.getElementById("refreshBtn"),
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
          '<div class="empty"><div class="spark">🧠</div>' +
          "<strong>Nothing here yet — but that's the fun part.</strong>" +
          "<p>Kick off a brainstorm and your finished ideas land here, ready to revisit.</p></div>";
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
  els.refreshBtn.addEventListener("click", function () {
    loadList().then(function () { showToast("Refreshed"); });
  });
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
