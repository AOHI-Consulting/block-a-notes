/* Study: learn each LDD class from the exam notes. A class opens with its story, then one topic at a
   time: the idea in plain words, a hotel scene, the usual mix-up, how it comes up in the exam and where
   to look it up, next to the exam notes for that topic. Then you explain the class's likely questions
   in your own words and check yourself with its drill (the same drill and scores as Practise). The
   content arrives encrypted (study.enc) and opens with the group code, like the practice questions.
   Progress stays on this device. Addresses: #/study, #/study/c6, #/study/c6/t/3, #/study/c6/explain,
   #/study/c6/check, #/study/cards. */

const Study = (() => {
  const K = () => Practise.kit;
  const T = { data: null, loading: null, failed: "", filter: "all", keys: null };
  const first = (n) => 8 + 4 * n, lastp = (n) => 11 + 4 * n;   // class N's pages in the exam notes PDF

  async function load() {
    if (T.data) return T.data;
    if (!T.loading) T.loading = K().openBox("study.enc").then((d) => (T.data = d)).catch((e) => {
      T.loading = null; T.failed = e && e.name === "OperationError" ? "key" : "net"; throw e;
    });
    return T.loading;
  }

  /* ---------- progress on this device ---------- */
  const get = (k) => store.get("study:" + k) || {};
  function update(k, fn) { const v = get(k); fn(v); store.set("study:" + k, v); }
  const readOf = (n) => get("read")[n] || {};
  const explainOf = (n) => get("explain")[n] || {};
  const drillOf = (n) => (K().content()?.drill || []).filter((q) => q.classes.includes(n));
  function prog(n) {
    const c = T.data.classes[n], r = readOf(n), x = explainOf(n), st = store.get("drill:stats") || {}, qs = drillOf(n);
    return {
      known: c.cards.filter((_, i) => r[i] === 1).length, cards: c.cards.length,
      done: c.likely.filter((_, i) => x[i]?.mark).length, likely: c.likely.length,
      right: qs.filter((q) => st[q.id]?.right).length, missed: qs.filter((q) => st[q.id] && !st[q.id].right).length,
      fresh: qs.filter((q) => !st[q.id]).length, drill: qs.length,
    };
  }

  /* ---------- builders ---------- */
  const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);
  function rich(tag, cls, text) {   // plain text with **bold**
    const p = el(tag, cls);
    String(text || "").split(/\*\*(.+?)\*\*/).forEach((part, i) => p.append(i % 2 ? el("b", null, part) : document.createTextNode(part)));
    return p;
  }
  function link(text, href, cls, ic, icAfter) {
    const a = el("a", "btn " + (cls || "")); a.href = href;
    if (ic && !icAfter) a.append(K().icon(ic));
    a.append(document.createTextNode(text));
    if (ic && icAfter) a.append(K().icon(ic));
    return a;
  }
  function meter(label, a, b) {
    const m = el("div", "st-meter"), t = el("div", "st-track"), i = el("i");
    i.style.width = pct(a, b) + "%"; t.append(i);
    m.append(el("span", null, label), t, el("span", "v", a + "/" + b));
    return m;
  }
  function sec(cls, title, ic, text) {
    const s = el("section", "st-sec " + cls), h = el("h3");
    if (ic) h.append(K().icon(ic));
    h.append(document.createTextNode(title));
    s.append(h, rich("p", null, text));
    return s;
  }
  // The exam notes as they are in the PDF; their slide and page chips open the slide or the book page.
  function notesDoc(html, n) {
    const d = el("div", "sdoc"); d.innerHTML = html;   // our own exam notes, built from the parts
    d.querySelectorAll("table").forEach((t) => { const w = el("div", "tw"); t.replaceWith(w); w.append(t); });
    if (!K().slideReady()) return d;
    d.querySelectorAll(".r").forEach((r) => {
      const t = r.textContent, s = t.match(/^(?:Class (\d) · )?slides? (\d+)/), b = t.match(/^(?:Gillingham )?pp?\. (\d+)/);
      if (!s && !b) return;
      const open = () => (s ? K().openSlide(+(s[1] || n), +s[2]) : K().openBook(+b[1]));
      r.classList.add("go"); r.tabIndex = 0; r.setAttribute("role", "button");
      r.title = s ? "Open this slide" : "Open this page of the book";
      r.addEventListener("click", open);
      r.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
    });
    return d;
  }
  const classChip = (n) => K().chip(n);

  /* ---------- render ---------- */
  async function render(box, seg) {
    T.keys = null;
    if (!T.data) {
      const at = location.hash;
      box.append(el("p", "loading", "Opening the study notes…"));
      try { await load(); }
      catch (e) {
        box.textContent = "";
        const g = el("div", "gate");
        g.append(el("b", null, T.failed === "key" ? "The study notes don't open with this link" : "Can't load the study notes"),
          el("p", null, T.failed === "key" ? "Ask Antonis for the current invitation link." : "Check your internet connection and reload the page."));
        box.append(g); return;
      }
      if (location.hash !== at) return;   // you moved on while it opened
      box.textContent = "";
    }
    const w = el("div", "study"); box.append(w);
    const m = /^c(\d)$/.exec(seg[0] || "");
    if (seg[0] === "cards") renderCards(w);
    else if (m && T.data.classes[m[1]]) { store.set("study:last", seg.join("/")); renderClass(w, +m[1], seg.slice(1)); }
    else renderHome(w);
  }

  function whereLabel(path) {
    const m = /^c(\d)(?:\/(t|explain|check)(?:\/(\d+|done))?)?$/.exec(path || "");
    if (!m || !T.data.classes[m[1]]) return null;
    const c = T.data.classes[m[1]];
    const step = !m[2] ? "The story" : m[2] === "explain" ? "Explain" : m[2] === "check" ? "Check"
      : m[3] && m[3] !== "done" && c.cards[+m[3] - 1] ? "Topic " + m[3] + ": " + c.cards[+m[3] - 1].title : "Topics";
    return { n: +m[1], text: "Class " + m[1] + " · " + c.name, step };
  }

  function renderHome(w) {
    const hero = el("section", "st-hero");
    hero.append(el("p", "kicker", "Study · Digital Developments for the Hotel Industry"), el("h1", null, "Understand each class"),
      el("p", "lede", "Start a class with its story. Then take its topics one at a time: the idea in plain words, a hotel example, the usual mix-up, and where to look it up in the slides and the book. Then answer its likely questions in your own words, and check yourself with its drill."));
    w.append(hero);
    const last = whereLabel(store.get("study:last"));
    if (last) {
      const box = el("div", "panel st-continue"), t = el("div", "t");
      t.append(el("span", "kicker", "Carry on where you were"), el("b", null, last.text), el("span", "small", last.step));
      box.append(t, link("Continue", "#/study/" + store.get("study:last"), "primary", "arrow", true));
      w.append(box);
    }
    const s1 = el("section", "sect");
    s1.append(K().h2("Classes", "story → topics → explain → check"));
    const grid = el("div", "st-grid");
    for (let n = 1; n <= 9; n++) {
      const c = T.data.classes[n], p = prog(n), a = el("a", "panel st-tile");
      a.href = "#/study/c" + n; a.style.setProperty("--cc", "var(--c" + n + ")");
      const th = el("div", "th"); th.append(classChip(n), el("b", null, c.name));
      const ms = el("div", "st-meters");
      ms.append(meter("Topics", p.known, p.cards), meter("Explain", p.done, p.likely), meter("Drill", p.right, p.drill));
      a.append(th, el("p", "ln", c.line), ms);
      if (!c.story.length) a.append(el("span", "st-state", "Exam notes only, explanations coming"));
      grid.append(a);
    }
    s1.append(grid); w.append(s1);

    const s2 = el("section", "sect");
    s2.append(K().h2("Frameworks A–Z", "every framework in the exam notes, as flashcards"));
    const fl = get("flash"), known = T.data.frameworks.filter((f) => fl[f.name]?.k).length;
    const a = el("a", "panel st-tile st-wide"); a.href = "#/study/cards";
    const th = el("div", "th"); th.append(el("b", null, "Framework flashcards"));
    const ms = el("div", "st-meters"); ms.append(meter("Known", known, T.data.frameworks.length));
    a.append(th, el("p", "ln", "Read the name, say what it means and when you'd use it for a hotel, then turn the card. Exam notes pp. 5–11."), ms);
    s2.append(a); w.append(s2);
  }

  /* ---------- one class ---------- */
  let refreshSteps = () => {};
  function renderClass(w, n, rest) {
    const c = T.data.classes[n];
    w.style.setProperty("--cc", "var(--c" + n + ")");
    const step = ["t", "explain", "check"].includes(rest[0]) ? rest[0] : "";
    const head = el("div", "st-head");
    const cr = el("nav", "crumbs"), back = el("a"); back.href = "#/study"; back.append(K().icon("back"), document.createTextNode("Study")); cr.append(back);
    const h1 = el("h1"); h1.append(document.createTextNode(c.name));
    const kick = el("div", "st-kick"); kick.append(classChip(n), el("span", "kicker", c.kicker + " · exam notes pp. " + first(n) + "–" + lastp(n)));
    head.append(cr, kick, h1, el("p", "line", c.line));
    const nav = el("nav", "st-steps"); nav.setAttribute("aria-label", "Steps");
    const counts = () => { const p = prog(n); return ["read first", p.known + "/" + p.cards + " known", p.done + "/" + p.likely + " done", p.right + "/" + p.drill + " right"]; };
    const smalls = [];
    [["", "Story"], ["t", "Topics"], ["explain", "Explain"], ["check", "Check"]].forEach(([k, l], j) => {
      const a = el("a", "st-step"); a.href = "#/study/c" + n + (k ? "/" + k : "");
      if (k === step) a.setAttribute("aria-current", "step");
      const sm = el("small", null, counts()[j]); smalls.push(sm);
      a.append(el("b", null, (j + 1) + " · " + l), sm); nav.append(a);
    });
    refreshSteps = () => { const cs = counts(); smalls.forEach((sm, j) => (sm.textContent = cs[j])); };
    head.append(nav); w.append(head);
    if (step === "t") renderTopic(w, n, rest[1]);
    else if (step === "explain") renderExplain(w, n);
    else if (step === "check") renderCheck(w, n);
    else renderStory(w, n);
  }

  function renderStory(w, n) {
    const c = T.data.classes[n], r = readOf(n);
    if (c.story.length) {
      const s = el("article", "panel st-story");
      s.append(el("p", "kicker", "The story of this class"));
      c.story.forEach((t) => s.append(rich("p", null, t)));
      w.append(s);
    } else {
      const s = el("div", "panel st-box"); s.append(el("p", "small", "The plain-words explanations for this class aren't in yet. Its exam notes are all here: start with the topics."));
      w.append(s);
    }
    const ex = el("details", "st-notes"); ex.open = !c.story.length;
    const sum = el("summary"); sum.append(document.createTextNode("In one line, and what he stressed"), el("small", null, "exam notes p. " + first(n)));
    ex.append(sum, notesDoc(c.intro, n)); w.append(ex);
    const s2 = el("section", "sect");
    s2.append(K().h2("Topics", "one at a time; mark the ones you can explain"));
    const list = el("div", "panel st-trows");
    c.cards.forEach((k, i) => {
      const a = el("a", "st-trow"); a.href = "#/study/c" + n + "/t/" + (i + 1);
      a.append(el("span", "n", String(i + 1)), el("span", "t", k.title),
        r[i] === 1 ? el("span", "st-state ok", "Can explain") : r[i] === 0 ? el("span", "st-state no", "Not yet") : el("span"));
      list.append(a);
    });
    s2.append(list);
    const next = c.cards.findIndex((_, i) => r[i] !== 1);
    const btns = el("div", "btns");
    if (next < 0) btns.append(link("Go to Explain", "#/study/c" + n + "/explain", "primary", "arrow", true));
    else btns.append(link(next === 0 && r[0] == null ? "Start with topic 1" : "Continue with topic " + (next + 1), "#/study/c" + n + "/t/" + (next + 1), "primary", "arrow", true));
    s2.append(btns); w.append(s2);
  }

  function renderTopic(w, n, which) {
    const c = T.data.classes[n], r = readOf(n);
    if (which === "done") return topicsDone(w, n);
    let i = parseInt(which, 10) - 1;
    if (!(i >= 0 && i < c.cards.length)) { i = Math.max(0, c.cards.findIndex((_, k) => r[k] !== 1)); history.replaceState(null, "", "#/study/c" + n + "/t/" + (i + 1)); store.set("study:last", "c" + n + "/t/" + (i + 1)); }
    const card = c.cards[i], x = card.x, to = (k) => "#/study/c" + n + "/t/" + (k + 1);
    const dots = el("nav", "st-dots"); dots.setAttribute("aria-label", "Topics");
    c.cards.forEach((k, j) => {
      const d = el("a", "st-dot" + (r[j] === 1 ? " ok" : r[j] === 0 ? " no" : ""), String(j + 1)); d.href = to(j); d.title = k.title;
      if (j === i) d.setAttribute("aria-current", "page");
      dots.append(d);
    });
    w.append(dots);
    const art = el("article", "panel st-topic");
    const hd = el("header"); hd.append(el("p", "kicker", "Topic " + (i + 1) + " of " + c.cards.length), el("h2", null, card.title));
    art.append(hd);
    if (x) {
      art.append(sec("plain", "In plain words", "", x.plain), sec("hotel", "Picture it in a hotel", "", x.hotel),
        sec("mix", "Easy to mix up", "", x.mixup), sec("exam", "How it comes up in the exam", "", x.exam));
      const say = el("div", "st-say");
      const a = rich("p", "a", x.ask.a); a.hidden = true;
      const show = K().button("Show the answer", "small", () => { a.hidden = !a.hidden; show.lastChild.textContent = a.hidden ? "Show the answer" : "Hide the answer"; }, "eye");
      say.append(el("p", "kicker", "Say it out loud, then check"), rich("p", "q", x.ask.q), show, a);
      art.append(say);
      const refs = K().sourcesLine(x.refs);
      if (refs) art.append(refs);
    }
    const nd = el("details", "st-notes"); nd.open = !x || !!store.get("study:notesOpen");
    const sum = el("summary"); sum.append(document.createTextNode("Your exam notes for this topic"), el("small", null, "exam notes pp. " + first(n) + "–" + lastp(n)));
    nd.append(sum, notesDoc(card.html, n));
    if (x) nd.addEventListener("toggle", () => store.set("study:notesOpen", nd.open));
    art.append(nd);
    const rate = el("div", "st-rate");
    rate.append(el("p", null, "Could you explain this to a classmate, with a hotel example?"));
    const mark = (v) => {
      update("read", (s) => { (s[n] = s[n] || {})[i] = v; });
      const rr = readOf(n), after = c.cards.findIndex((_, k) => k > i && rr[k] !== 1), any = c.cards.findIndex((_, k) => rr[k] !== 1);
      location.hash = after >= 0 ? to(after) : any >= 0 && any !== i ? to(any) : "#/study/c" + n + "/t/done";
    };
    const no = K().button("Not yet", "", () => mark(0)), yes = K().button("I can explain this", "primary", () => mark(1), "check");
    if (r[i] === 0) no.classList.add("on"); if (r[i] === 1) yes.classList.add("on");
    rate.append(no, yes);
    art.append(rate);
    w.append(art);
    const nav = el("div", "st-nav");
    const prev = i > 0 ? link("Previous", to(i - 1), "ghost small", "back") : el("span");
    const next = i < c.cards.length - 1 ? link("Next topic", to(i + 1), "ghost small", "next", true) : link("Done with the topics", "#/study/c" + n + "/t/done", "ghost small", "next", true);
    nav.append(prev, el("span", "hint", "← → to move between topics"), next);
    w.append(nav);
    T.keys = (e) => {
      if (e.key === "ArrowRight") location.hash = i < c.cards.length - 1 ? to(i + 1) : "#/study/c" + n + "/t/done";
      else if (e.key === "ArrowLeft" && i > 0) location.hash = to(i - 1);
      else return false;
    };
  }

  function topicsDone(w, n) {
    const c = T.data.classes[n], r = readOf(n);
    const ok = c.cards.filter((_, k) => r[k] === 1).length, left = c.cards.length - ok;
    const d = el("div", "panel st-done");
    d.append(el("p", "kicker", "Topics"), el("p", "st-stat", ok + " / " + c.cards.length),
      el("h2", null, left ? left + (left > 1 ? " topics" : " topic") + " to look at again" : "You can explain every topic"));
    if (left) {
      const ul = el("ul", "st-left");
      c.cards.forEach((k, j) => { if (r[j] !== 1) { const li = el("li"), a = el("a", null, k.title); a.href = "#/study/c" + n + "/t/" + (j + 1); li.append(a); ul.append(li); } });
      d.append(ul);
    }
    const btns = el("div", "btns");
    if (left) btns.append(link("Go through them again", "#/study/c" + n + "/t/" + (c.cards.findIndex((_, k) => r[k] !== 1) + 1), "", "reset"));
    btns.append(link("Go to Explain", "#/study/c" + n + "/explain", "primary", "arrow", true));
    d.append(btns); w.append(d);
  }

  function renderExplain(w, n) {
    const c = T.data.classes[n];
    w.append(el("p", "small st-intro", "Answer each question in your own words first: a few bullets, with a framework and a hotel example. Then open how your notes answer it, and mark yourself honestly. In the exam this is your route: the question type on p. 3, the class's likely questions on p. " + lastp(n) + ", evidence from the case, then the p. 3 recipe."));
    c.likely.forEach((q, i) => {
      const st = explainOf(n)[i] || {};
      const save = (fn) => update("explain", (s) => { s[n] = s[n] || {}; s[n][i] = s[n][i] || {}; fn(s[n][i]); });
      const card = el("article", "panel st-q");
      const ask = el("p", "ask"); ask.innerHTML = q.ask;   // from our notes
      const ta = el("textarea"); ta.placeholder = "Your answer, before you look"; ta.value = st.text || "";
      ta.setAttribute("aria-label", "Your answer");
      let tm = null;
      ta.addEventListener("input", () => { clearTimeout(tm); tm = setTimeout(() => save((s) => (s.text = ta.value)), 300); });
      const how = el("div", "st-how"); how.hidden = !st.shown;
      how.append(el("p", "kicker", "How your notes answer it · exam notes p. " + lastp(n)), notesDoc(q.html, n));
      const marks = el("div", "st-marks"); marks.hidden = !st.shown;
      marks.append(el("span", "small", "How did you do?"));
      [["got", "Got it", "m-got"], ["part", "Partly", "m-part"], ["miss", "Missed it", "m-miss"]].forEach(([k, l, cls]) => {
        const b = el("button", "st-mark " + cls, l); b.type = "button"; b.setAttribute("aria-pressed", String(st.mark === k));
        b.addEventListener("click", () => {
          save((s) => (s.mark = k)); refreshSteps();
          marks.querySelectorAll(".st-mark").forEach((m) => m.setAttribute("aria-pressed", String(m === b)));
        });
        marks.append(b);
      });
      const show = K().button(st.shown ? "Hide how to answer" : "Show how to answer", "small", () => {
        const on = how.hidden; save((s) => (s.shown = on)); how.hidden = marks.hidden = !on;
        show.lastChild.textContent = on ? "Hide how to answer" : "Show how to answer";
      }, "eye");
      card.append(el("p", "kicker", "Likely question " + (i + 1) + " of " + c.likely.length), ask, ta, show, how, marks);
      w.append(card);
    });
    const nav = el("div", "st-nav");
    nav.append(link("Topics", "#/study/c" + n + "/t", "ghost small", "back"), link("Go to Check", "#/study/c" + n + "/check", "primary", "arrow", true));
    w.append(nav);
  }

  // Check runs the Practise drill on this class's questions, so the scores are the same everywhere.
  function renderCheck(w, n) {
    const qs = drillOf(n), p = prog(n), st = store.get("drill:stats") || {};
    const from = "study/c" + n + "/check";
    const box = el("div", "panel st-check");
    box.append(el("p", "kicker", "Check yourself"), el("h2", null, qs.length + " drill questions on this class"));
    const nums = el("div", "st-nums");
    [[p.right, "right"], [p.missed, "to retry"], [p.fresh, "not tried yet"]].forEach(([v, l]) => { const d = el("div"); d.append(el("b", null, String(v)), el("span", null, l)); nums.append(d); });
    const bar = el("div", "st-track"); const f = el("i"); f.style.width = pct(p.right, p.drill) + "%"; bar.append(f);
    box.append(nums, bar);
    const rank = (q) => (!st[q.id] ? 0 : !st[q.id].right ? 1 : 2);
    const order = (list) => list.map((q) => [rank(q), Math.random(), q]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map((x) => x[2]);
    const btns = el("div", "btns");
    btns.append(K().button(Math.min(5, qs.length) + " questions", "primary", () => K().startDrill(order(qs).slice(0, 5), from), "play"));
    if (qs.length > 5) btns.append(K().button("All " + qs.length, "", () => K().startDrill(order(qs), from)));
    if (p.missed) btns.append(K().button(p.missed === 1 ? "The one you missed" : "The " + p.missed + " you missed", "", () => K().startDrill(order(qs.filter((q) => st[q.id] && !st[q.id].right)), from), "reset"));
    box.append(btns, el("p", "small", "New questions come first, then the ones you missed. Each answer says why, with the slide or page to look it up. The scores are shared with the drill on Practise."));
    w.append(box);
    const more = el("div", "panel st-box");
    const mocks = { 1: "Mock A", 3: "Mock A", 4: "Mock A", 2: "Mock B", 5: "Mock B", 6: "Mock B", 7: "Mock C", 8: "Mock C", 9: "Mock C" };
    more.append(el("p", "kicker", "Then"), el("p", null, "Try this class on a case: " + mocks[n] + " covers it, and his trial exam covers every class."));
    const mb = el("div", "btns"); mb.append(link("Open Practise", "#/practise", "small", "arrow", true));
    const nx = n < 9 ? n + 1 : null;
    if (nx) mb.append(link("Next class: " + T.data.classes[nx].name, "#/study/c" + nx, "ghost small", "next", true));
    more.append(mb); w.append(more);
  }

  /* ---------- flashcards ---------- */
  function refOf(f) {
    let m;
    if (f.c >= 1 && (m = f.ref.match(/^slides? (\d+)(?:[–-](\d+))?/))) return { src: "C" + f.c + " S" + m[1] + (m[2] ? "-" + m[2] : "") };
    if ((m = f.ref.match(/^(?:Gillingham )?(pp?\. \d+(?:[–-]\d+)?)/))) return { src: m[1].replace("–", "-"), cls: f.c };
    return { text: f.c === 0 ? "General strategy · " + (f.ref || "his trial exam") : "Class " + f.c + (f.ref ? " · " + f.ref : "") };
  }
  function renderCards(w) {
    const FW = T.data.frameworks, fl = get("flash");
    const head = el("div", "st-head");
    const cr = el("nav", "crumbs"), back = el("a"); back.href = "#/study"; back.append(K().icon("back"), document.createTextNode("Study")); cr.append(back);
    head.append(cr, el("p", "kicker", "Frameworks A–Z · exam notes pp. 5–11"), el("h1", null, "Framework flashcards"),
      el("p", "line", "Read the name. Say what it means and when you'd use it for a hotel. Then turn the card. Cards you don't know come back a few cards later. You don't have to memorise them: recognise them and know where to look."));
    w.append(head);
    const filters = el("div", "st-filters");
    [["all", "All"], ["new", "Not known yet"], ...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => ["c" + n, n === 0 ? "General" : "Class " + n])].forEach(([k, l]) => {
      const b = el("button", "st-fchip", l); b.type = "button"; b.setAttribute("aria-pressed", String(T.filter === k));
      b.addEventListener("click", () => { T.filter = k; K().render(); });
      filters.append(b);
    });
    w.append(filters);
    const pool = FW.filter((f) => T.filter === "all" ? true : T.filter === "new" ? !fl[f.name]?.k : f.c === +T.filter.slice(1));
    const deck = pool.map((f) => [Math.random(), f]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
    const stage = el("div", "st-stage"); w.append(stage);
    let known = 0, turned = false, turn = null;
    function show() {
      stage.textContent = ""; turned = false;
      if (!deck.length) {
        const d = el("div", "panel st-done");
        d.append(el("p", "kicker", "Deck done"), el("h2", null, pool.length ? "You went through all " + pool.length + " cards" : "No cards here"), el("p", "small", known + " known on the first go this round."));
        const b = el("div", "btns"); b.append(K().button("Shuffle again", "primary", () => K().render(), "reset"), K().button("Only the ones not known yet", "", () => { T.filter = "new"; K().render(); }));
        d.append(b); stage.append(d); return;
      }
      const f = deck[0], card = el("article", "panel st-flash"); card.style.setProperty("--cc", f.c ? "var(--c" + f.c + ")" : "var(--accent)");
      const top = el("div", "st-ftop"); top.append(f.c ? classChip(f.c) : el("span", "chip", "General"), el("span", "kicker", deck.length + " left"));
      const backSide = el("div", "st-back"); backSide.hidden = true;
      const r = refOf(f);
      backSide.append(el("p", "gist", f.gist));
      if (r.src) {
        const line = K().sourcesLine([r.src]);
        if (line) backSide.append(line);
        if (f.c) backSide.append(el("p", "small", "Class " + f.c + ": " + T.data.classes[f.c].name));
      } else backSide.append(el("p", "small", r.text));
      const row = el("div", "btns");
      const tb = K().button("Turn the card", "primary", () => turn()), again = K().button("Again", "", () => answer(false)), knew = K().button("Knew it", "primary", () => answer(true), "check");
      again.hidden = knew.hidden = true;
      row.append(tb, again, knew);
      turn = () => { turned = true; backSide.hidden = false; tb.hidden = true; again.hidden = knew.hidden = false; knew.focus(); };
      card.append(top, el("p", "name", f.name), backSide, row);
      const hint = el("p", "hint"); hint.append(el("kbd", null, "Space"), document.createTextNode(" turn · "), el("kbd", null, "1"), document.createTextNode(" again · "), el("kbd", null, "2"), document.createTextNode(" knew it"));
      stage.append(card, hint);
    }
    function answer(ok) {
      const f = deck.shift();
      update("flash", (s) => { const v = (s[f.name] = s[f.name] || { k: 0, a: 0 }); if (ok) v.k++; else v.a++; });
      if (ok) known++; else deck.splice(Math.min(3, deck.length), 0, f);
      show();
    }
    T.keys = (e) => {
      if (e.key === " " && !turned && deck.length) turn();
      else if (turned && e.key === "1") answer(false);
      else if (turned && e.key === "2") answer(true);
      else return false;
    };
    show();
  }

  document.addEventListener("keydown", (e) => {
    if (!T.keys || S.tab !== "study" || document.body.classList.contains("slideview-open")) return;
    const t = e.target, tag = t && t.tagName;
    if (tag === "TEXTAREA" || tag === "INPUT" || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === " " && (tag === "BUTTON" || tag === "A" || tag === "SUMMARY")) return;
    if (T.keys(e) !== false) e.preventDefault();
  });

  return { render };
})();

window.Study = Study;
