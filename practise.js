/* Practice for the LDD exam: the lecturer's trial exam, mock exams in the same format, a quick
   multiple-choice drill and a searchable topic index. The questions arrive encrypted
   (content.enc) and open with the group code from the invitation link, so the public repository
   holds nothing readable. Progress stays on this device; an open answer reaches the group only
   when you share it. Every view has its own address (#/practise/mock-c/a/3), so Back works. */

const Practise = (() => {
  const EXAM_AT = new Date("2026-10-30T11:00:00+01:00");
  const LETTERS = ["A", "B", "C", "D", "E"];
  const CLASS_NAMES = {
    1: "Customer experience", 2: "Mobility & supply chain", 3: "Future of work", 4: "Payments",
    5: "Platforms & ecosystems", 6: "Smart buildings", 7: "Data & AI", 8: "Resilience", 9: "Transformation & tech stack",
  };
  const P = {
    content: null, loading: null, failed: "",
    view: { tab: "practise", name: "home" },
    answers: new Map(), answersAt: new Map(),
    drill: null, idx: null, tq: "", tclass: 0,
    timerTick: null, drawer: false,
  };
  const root = () => $("#practise");

  /* ---------- small builders ---------- */
  const NS = "http://www.w3.org/2000/svg";
  const ICONS = {
    back: "M15 18l-6-6 6-6", next: "M9 6l6 6-6 6", check: "M5 12.5l4.5 4.5L19 7.5", x: "M6 6l12 12M18 6L6 18",
    clock: "M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z", search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4",
    sun: "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
    moon: "M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z", star: "M12 3l2.3 5.4 5.7.6-4.3 3.9 1.3 5.6L12 15.6 7 18.5l1.3-5.6L4 9l5.7-.6z",
    book: "M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5zM4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5", doc: "M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6",
    arrow: "M5 12h14M13 6l6 6-6 6", play: "M8 5v14l11-7z", reset: "M4 12a8 8 0 1 0 2.3-5.7M4 4v4h4",
    eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
    eyeoff: "M9.9 9.9a3 3 0 1 0 4.2 4.2M10.7 5.1A10.4 10.4 0 0 1 12 5c7 0 10 7 10 7a13.2 13.2 0 0 1-1.7 2.7M6.6 6.6A13.5 13.5 0 0 0 2 12s3 7 10 7a9.7 9.7 0 0 0 5.4-1.6M2 2l20 20",
  };
  function icon(name) {
    const s = document.createElementNS(NS, "svg"); s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("aria-hidden", "true");
    s.setAttribute("fill", "none"); s.setAttribute("stroke", "currentColor"); s.setAttribute("stroke-width", "1.9");
    s.setAttribute("stroke-linecap", "round"); s.setAttribute("stroke-linejoin", "round");
    const p = document.createElementNS(NS, "path"); p.setAttribute("d", ICONS[name]); s.append(p); return s;
  }
  function button(text, cls, fn, ic, icAfter) {
    const b = el("button", "btn " + (cls || "")); b.type = "button";
    if (ic && !icAfter) b.append(icon(ic));
    b.append(document.createTextNode(text));
    if (ic && icAfter) b.append(icon(ic));
    if (fn) b.addEventListener("click", fn);
    return b;
  }
  function textBtn(text, fn, cls) { const b = el("button", "tbtn" + (cls ? " " + cls : ""), text); b.type = "button"; b.addEventListener("click", fn); return b; }
  function chip(c) { const s = el("span", "chip", "C" + c); s.style.setProperty("--cc", "var(--c" + c + ")"); s.title = "Class " + c + ": " + (CLASS_NAMES[c] || ""); return s; }
  function chips(classes) { const w = el("span", "chips"); (classes || []).forEach((c) => w.append(chip(c))); return w; }
  // References are stored as short codes ("C7 S43", "C4 0:48", "p. 212", "Key Q3") and shown in plain words.
  // Students only have the slides, the book and the trial exam, so anything from a class itself is
  // shown as that class's transcript, without times.
  const BOOK_CH = [[5, "new landscape"], [23, "technology divide"], [37, "foundation"], [55, "PMS hub"], [71, "marketing"], [93, "revenue management"],
    [117, "sustainability & IoT"], [135, "operations & security"], [149, "guest communication"], [165, "fintech"], [181, "guest experience"], [197, "AI"],
    [219, "tech marketplace"], [237, "the future"]];
  function sourceLabel(s) {
    let m;
    if ((m = s.match(/^C(\d) S(\d+)(?:[–-](\d+))?$/))) return "Class " + m[1] + " slides · " + (m[3] ? "slides " + m[2] + "–" + m[3] : "slide " + m[2]);
    if ((m = s.match(/^C(\d)(?:[ab]| pt\d)?(?: \d:\d\d.*)?$/))) return "Class " + m[1] + " transcript";
    if ((m = s.match(/^pp?\. (\d+)(?:[–-](\d+))?$/))) {
      const ch = BOOK_CH.reduce((f, c, i) => (+m[1] >= c[0] ? i : f), 0);
      return "Gillingham " + s + " (ch. " + (ch + 1) + ", " + BOOK_CH[ch][1] + ")";
    }
    if ((m = s.match(/^Key Q?(\w+)$/))) return "His answer key · " + (/^\d+$/.test(m[1]) ? "Q" : "") + m[1];
    if ((m = s.match(/^Demo Q(\d+)$/))) return "His trial exam · Q" + m[1];
    if (/^Exhibit \d+$/.test(s)) return "The case · " + s;
    return s.replace(/^C(\d) reading$/, "Class $1 reading").replace(/\bC(\d) reading\b/, "class $1 reading");
  }
  const sourceLabels = (list) => [...new Set((list || []).map(sourceLabel))];
  function sourcesLine(list) {
    if (!list || !list.length) return null;
    const p = el("div", "srcs");
    const lab = el("span", "srclab"); lab.append(icon("book"), document.createTextNode("Look it up")); p.append(lab);
    const seen = new Set();
    list.forEach((s) => {
      const t = sourceLabel(s), m = s.match(/^C(\d) S(\d+)/), pg = s.match(/^pp?\. (\d+)/);
      if (seen.has(t)) return; seen.add(t);
      const target = m && SL.manifest?.classes?.[m[1]] ? ["c" + m[1], +m[2], "Open this slide"]
        : pg && SL.manifest?.book ? ["book", +pg[1] + (SL.manifest.book.offset || 0), "Open this page of the book"] : null;
      if (target) {
        const b = el("button", "src link", t); b.type = "button"; b.title = target[2];
        b.addEventListener("click", () => openDoc(target[0], target[1]));
        p.append(b);
      } else p.append(el("span", "src", t));
    });
    return p;
  }
  function panel(cls) { return el("div", "panel " + (cls || "")); }
  // Two-step reset: the first press asks ("Press again to clear"), the second clears; it calms down after 4 s.
  function resetButton(label, onConfirm, asText) {
    const b = asText ? el("button", "tbtn", label) : button(label, "ghost small", null, "reset");
    b.type = "button";
    const say = (t) => { if (asText) b.textContent = t; else b.lastChild.textContent = t; };
    let t = null;
    b.addEventListener("click", () => {
      if (b.classList.contains("armed")) { clearTimeout(t); onConfirm(); return; }
      b.classList.add("armed"); say("Press again to clear");
      t = setTimeout(() => { b.classList.remove("armed"); say(label); }, 4000);
    });
    return b;
  }
  function h2(text, small) { const h = el("h2", "h2", text); if (small) h.append(el("small", null, small)); return h; }
  const xColor = (ex) => "var(--x-" + ex.id + ", var(--accent))";
  const exLabel = (ex) => ex.kind === "demo" ? "His trial exam" : ex.title;
  const pct = (a, b) => b ? Math.round(100 * a / b) : 0;
  function band(p) { return p >= 85 ? ["Excellent", "good"] : p >= 70 ? ["Good", "good"] : p >= 55 ? ["Pass", ""] : ["Below pass", "bad"]; }

  /* ---------- local progress ---------- */
  const key = (id) => "px:" + id;
  function prog(id) {
    const p = store.get(key(id)) || {};
    p.mode = p.mode === "exam" ? "exam" : "practise";
    p.mcq = p.mcq || {}; p.checked = p.checked || {}; p.open = p.open || {};
    return p;
  }
  const saveProg = (id, p) => store.set(key(id), p);
  function resetExam(ex) {
    store.del(key(ex.id));
    const l = store.get("last"); if (l && l.id === ex.id) store.del("last");
    go("practise/" + ex.id + "/case");
  }

  /* ---------- content ---------- */
  const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  async function loadContent() {
    if (P.content) return P.content;
    if (P.loading) return P.loading;
    P.loading = (async () => {
      const r = await fetch("content.enc?v=" + (document.body.dataset.v || ""), { cache: "no-cache" });
      if (!r.ok) throw new Error("fetch " + r.status);
      const box = await r.json();
      const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(S.g), "PBKDF2", false, ["deriveKey"]);
      const k = await crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt: b64(box.salt), iterations: box.iter },
        base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
      const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64(box.iv) }, k, b64(box.data));
      P.content = JSON.parse(new TextDecoder().decode(plain));
      await slideManifest();
      return P.content;
    })();
    try { return await P.loading; }
    catch (e) { P.loading = null; P.failed = e && e.name === "OperationError" ? "key" : "net"; throw e; }
  }
  const exams = () => (P.content?.exams || []);
  const examById = (id) => exams().find((x) => x.id === id);
  const partsOf = (ex) => ex.open.flatMap((o) => o.parts.map((pt) => ({ o, pt, k: o.id + pt.id })));

  /* ---------- scoring ---------- */
  function shownA(p, q) { return !!p.finishedA || (p.mode !== "exam" && !!p.checked[q.id]); }
  function score(ex, p) {
    let a = 0, aDone = 0, answered = 0;
    ex.mcq.forEach((q) => {
      if (p.mcq[q.id]) answered++;
      if (p.finishedA || p.checked[q.id]) { aDone++; if (p.mcq[q.id] === q.answer) a += 4; }
    });
    let b = 0, bDone = 0, parts = 0, partsDone = 0, written = 0;
    partsOf(ex).forEach(({ pt, k }) => {
      parts++;
      const st = p.open[k];
      if (st && (st.text || "").trim()) written++;
      if (st && st.marked) { partsDone++; bDone += pt.points; b += (st.ticks || []).reduce((s, i) => s + (pt.guide[i]?.pts || 0), 0); }
    });
    return { a, aDone, answered, b, bDone, parts, partsDone, written };
  }

  /* ---------- routing ---------- */
  function parse() {
    const h = decodeURIComponent(location.hash.replace(/^#\/?/, ""));
    const seg = h.split("/").filter(Boolean);
    if (seg[0] === "notes") return { tab: "notes" };
    if (seg[0] === "topics") return { tab: "topics", name: "topics" };
    if (seg[0] === "slides") return { tab: "slides", name: "slides" };
    if (seg[0] === "drill") return { tab: "practise", name: "drill" };
    if (seg[0] === "practise" && seg[1]) {
      const sec = ["case", "a", "b", "score"].includes(seg[2]) ? seg[2] : "case";
      return { tab: "practise", name: "exam", id: seg[1], sec, n: parseInt(seg[3], 10) || 0 };
    }
    return { tab: "practise", name: "home" };
  }
  function go(path) {
    const h = "#/" + path;
    if (location.hash === h) route(); else location.hash = h;
  }
  function route() {
    const r = parse();
    clearInterval(P.timerTick);
    closeDrawer(); closeSlides();
    showTab(r.tab);
    if (r.tab === "notes") return;
    const prev = P.view;
    P.view = r;
    if (r.name === "exam") store.set("last", { path: location.hash.slice(2), id: r.id, sec: r.sec });
    document.getElementById("page").classList.toggle("wide", r.name === "exam");
    render();
    const same = prev && prev.name === r.name && prev.id === r.id && prev.sec === r.sec && prev.n === r.n;
    if (!same) window.scrollTo({ top: 0 });
  }

  /* ---------- header bits ---------- */
  function untilExam() {
    const ms = EXAM_AT - Date.now();
    if (ms <= 0) return null;
    return { d: Math.floor(ms / 86400000), h: Math.floor(ms % 86400000 / 3600000), m: Math.floor(ms % 3600000 / 60000) };
  }
  // Some people find a ticking countdown stressful: they can hide it (card and header chip) on their device.
  const countdownOff = () => !!store.get("countdown:off");
  function tickClock() {
    const u = untilExam(), c = $("#clock");
    if (!u || countdownOff()) { c.hidden = true; return; }
    c.hidden = false;
    $("#clockv").textContent = u.d ? u.d + "d " + u.h + "h" : u.h + "h " + u.m + "m";
  }
  function isDark() {
    const t = document.documentElement.dataset.theme;
    return t ? t === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
  }
  function paintTheme() { const b = $("#theme"); b.textContent = ""; b.append(icon(isDark() ? "sun" : "moon")); b.title = isDark() ? "Light mode" : "Dark mode"; }

  /* ---------- home ---------- */
  function renderHome(box) {
    const hero = el("section", "hero");
    const ht = el("div", "hero-text");
    ht.append(el("p", "kicker", "Digital Developments · individual exam"), el("h1", null, "Practise for Friday's exam"),
      el("p", "lede", "A quick drill by class with no case to read, his trial exam with his answer key, and three mock exams in the same format. Every answer tells you where to look it up."));
    const resume = el("div", "resume");
    const last = store.get("last");
    const lastEx = last && examById(last.id);
    if (lastEx) {
      const where = { case: "the case", a: "Section A", b: "Section B", score: "your score" }[last.sec] || "the case";
      resume.append(button("Continue " + (lastEx.kind === "demo" ? "his trial exam" : lastEx.title) + " · " + where, "primary", () => go(last.path), "play"));
    } else resume.append(button("Start with his trial exam", "primary", () => go("practise/demo/case"), "play"));
    resume.append(button("Find a topic", "ghost", () => go("topics"), "search"));
    ht.append(resume);
    const cd = panel("count");
    const u = untilExam(), calm = countdownOff();
    const ctop = el("div", "ctop");
    ctop.append(el("p", "kicker", !u ? "Exam day" : calm ? "The exam" : "The exam starts in"));
    if (u) {
      const tg = button(calm ? "Show countdown" : "Hide", "ghost small", () => { store.set("countdown:off", !calm); tickClock(); render(); }, calm ? "eye" : "eyeoff");
      tg.title = calm ? "Show the days and hours until the exam" : "Hide the countdown here and in the top bar, on this device";
      ctop.append(tg);
    }
    cd.append(ctop);
    if (u && !calm) {
      const big = el("div", "big");
      [[u.d, "days"], [u.h, "hours"], [u.m, "min"]].forEach(([v, l]) => { const s = el("span", null, String(v)); s.append(el("small", null, l)); big.append(s); });
      cd.append(big);
    } else cd.append(el("div", "big calm", "Friday 30 October"));
    const when = el("p", "when"); when.append(el("b", null, u && !calm ? "Fri 30 Oct, 11:00–14:00" : "11:00–14:00"), document.createTextNode(" · room opens 10:30, last entry 11:20 · one PDF of notes, max 20 MB"));
    cd.append(when);
    hero.append(ht, cd);
    box.append(hero);

    const tiles = el("section", "tiles");
    [["Section A", "12 multiple choice", "4 points each, 48 in total · about 30 minutes"],
      ["Section B", "2 open questions", "25 + 27 points, with parts a–d · about 75 minutes each"],
      ["Grade", "Pass at 55", "70 good · 85 excellent · his trial-exam scale"]].forEach(([k, v, s]) => {
      const t = panel("tile"); t.append(el("p", "kicker", k), el("div", "val", v), el("p", null, s)); tiles.append(t);
    });
    box.append(tiles);

    const mk = panel("marks");
    mk.append(h2("How he marks the open questions", "from his answer key and the class 8 rubric"));
    const ol = el("ol");
    [["Use a course concept", "From the lectures or Gillingham, named and used accurately."],
      ["Apply it to the case", "Use the case's numbers, people and exhibits as evidence."],
      ["Make a justified choice", "Show judgement: decide, and say why."]].forEach(([b, s]) => { const li = el("li"); const d = el("div"); d.append(el("b", null, b), el("span", null, s)); li.append(d); ol.append(li); });
    mk.append(ol);
    const n1 = el("p", "note"); n1.append(icon("star"), el("span", null, "A purely descriptive answer, or one that only restates the case, earns at most half the points. In his trial exam the right multiple-choice option was also the most complete one, joining technology with the business, data, people or governance. Don't count on it; read every option."));
    mk.append(n1);
    box.append(mk);

    const xs = el("section", "sect");
    xs.append(h2("Full exams", "a case, 12 multiple choice and 2 open questions"));
    const grid = el("div", "xgrid");
    exams().forEach((ex) => {
      const p = prog(ex.id), s = score(ex, p);
      const c = el("button", "xcard"); c.type = "button"; c.style.setProperty("--x", xColor(ex));
      c.addEventListener("click", () => { const l = store.get("last"); go(l && l.id === ex.id ? l.path : "practise/" + ex.id + "/case"); });
      const row = el("div", "row");
      const started = s.answered || s.aDone || s.written || s.partsDone;
      const done = s.aDone === 12 && s.partsDone === s.parts;
      const total = s.a + s.b, max = s.aDone * 4 + s.bDone;
      row.append(el("span", "tag", exLabel(ex)), el("span", "state" + (done ? " done" : started ? " on" : ""), done ? total + " / 100" : started ? "In progress" : "Not started"));
      c.append(row, el("h3", null, ex.company), el("p", null, ex.tagline));
      const xp = el("div", "xprog");
      const bar = el("div", "bar"); const fill = el("i"); fill.style.width = pct(s.aDone + s.partsDone, 12 + s.parts) + "%"; bar.append(fill);
      const meta = el("div", "meta"); meta.append(el("span", null, "A " + s.aDone + "/12 · B " + s.partsDone + "/" + s.parts), el("span", null, max ? pct(total, max) + "% so far" : ""));
      xp.append(bar, meta);
      c.append(chips(ex.focus), xp);
      grid.append(c);
    });
    xs.append(grid);
    box.append(xs);

    const ds = el("section", "sect");
    ds.append(h2("Quick drill", "no case to read: pick classes, pick a length, go"));
    const db = panel("drillbox");
    const pool = P.content.drill || [];
    const stats = store.get("drill:stats") || {};
    const chosen = new Set(store.get("drill:classes") || []);
    const ct = el("div", "ctiles");
    for (let c = 1; c <= 9; c++) {
      const qs = pool.filter((q) => q.classes.includes(c));
      const seen = qs.filter((q) => stats[q.id]), right = seen.filter((q) => stats[q.id].right).length, missed = seen.length - right;
      const b = el("button", "ctile"); b.type = "button"; b.style.setProperty("--cc", "var(--c" + c + ")");
      b.setAttribute("aria-pressed", String(chosen.has(c)));
      const t = el("span", "t", CLASS_NAMES[c]);
      t.append(el("small", null, plural(qs.length, "question") + (seen.length ? " · " + right + " right" + (missed ? " · " + missed + " to retry" : "") : "")));
      const mb = el("span", "mb"); mb.title = right + " of " + qs.length + " right last time";
      const mf = el("i"); mf.style.width = pct(right, qs.length) + "%"; mb.append(mf);
      b.append(el("span", "n", String(c)), t, el("span", "ck"), mb);
      b.addEventListener("click", () => { chosen.has(c) ? chosen.delete(c) : chosen.add(c); b.setAttribute("aria-pressed", String(chosen.has(c))); store.set("drill:classes", [...chosen]); paintFoot(); });
      ct.append(b);
    }
    // The foot always says exactly how many questions a round will have: a class with 8 questions
    // offers "5" and "All 8", never a 10 it can't fill.
    const df = el("div", "drillfoot");
    const paintFoot = () => {
      df.textContent = "";
      const s = drillSettings(), inClasses = drillPool({ ...s, mode: "mix" }, stats);
      const nNew = inClasses.filter((q) => !stats[q.id]).length, nMissed = inClasses.filter((q) => stats[q.id] && !stats[q.id].right).length;
      if ((s.mode === "new" && !nNew) || (s.mode === "missed" && !nMissed)) { s.mode = "mix"; store.set("drill:mode", "mix"); }
      const avail = drillPool(s, stats).length, n = s.size ? Math.min(s.size, avail) : avail;
      const which = el("div", "seg"); which.setAttribute("aria-label", "Which questions");
      [["mix", "Mixed", "New and missed questions first, then the rest", 0], ["new", "New", "Only questions you haven't answered yet", nNew], ["missed", "Missed", "Only questions you got wrong last time", nMissed]].forEach(([m, l, tip, k]) => {
        const b = el("button", null, l); b.type = "button"; b.title = tip; b.setAttribute("aria-pressed", String(s.mode === m));
        if (m !== "mix") { b.append(el("span", "cnt", String(k))); b.disabled = !k; }
        b.addEventListener("click", () => { store.set("drill:mode", m); paintFoot(); });
        which.append(b);
      });
      const len = el("div", "seg"); len.setAttribute("aria-label", "How many questions");
      [...DRILL_SIZES.filter((z) => z < avail), 0].forEach((z) => {
        const b = el("button", null, z ? String(z) : "All " + avail); b.type = "button";
        b.setAttribute("aria-pressed", String(z ? s.size === z : !s.size || s.size >= avail));
        b.addEventListener("click", () => { store.set("drill:size", z); paintFoot(); });
        len.append(b);
      });
      const line = el("p", "small");
      line.append(el("b", null, chosen.size ? [...chosen].sort((a, b) => a - b).map((c) => CLASS_NAMES[c]).join(", ") : "All classes"),
        document.createTextNode(" · " + plural(inClasses.length, "question") + (nNew < inClasses.length ? ", " + nNew + " new" : "")));
      if (chosen.size) line.append(document.createTextNode(" · "), textBtn("clear", () => { store.set("drill:classes", []); render(); }));
      if (inClasses.some((q) => stats[q.id])) line.append(document.createTextNode(" · "), resetButton(chosen.size ? "reset progress" : "reset all progress", () => {
        const st = store.get("drill:stats") || {}; inClasses.forEach((q) => delete st[q.id]); store.set("drill:stats", st); render();
      }, true));
      const opts = el("div", "drillopts");
      const g1 = el("div", "grp"); g1.append(el("span", "kicker", "Questions"), which);
      const g2 = el("div", "grp"); g2.append(el("span", "kicker", "Length"), len);
      const start = button(n ? "Start " + plural(n, "question") : "Nothing to drill", "primary", () => startDrill(), "play");
      start.disabled = !n;
      opts.append(g1, g2, start);
      df.append(line, opts);
    };
    paintFoot();
    db.append(ct, df);
    ds.append(db);
    box.insertBefore(ds, tiles);   // the drill comes first: it's the everyday way to practise

    box.append(el("p", "foot", "Your answers and scores stay on this device. An open answer reaches the group only when you press Share. Built " + (P.content.built ? new Date(P.content.built).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "") + " from the class slides, the class transcripts and Gillingham; the mocks are practice material written by Claude, not by the lecturer."));
  }

  /* ---------- exam shell ---------- */
  function renderExam(box) {
    const ex = examById(P.view.id);
    if (!ex) { go("practise"); return; }
    const p = prog(ex.id), s = score(ex, p);
    box.style.setProperty("--x", xColor(ex));

    const head = el("div", "xhead");
    const cr = el("nav", "crumbs"); const a = el("a"); a.href = "#/practise"; a.append(icon("back"), document.createTextNode("All exams")); cr.append(a, el("span", null, "/"), el("span", null, exLabel(ex)));
    head.append(cr);
    const tt = el("div", "xtitle");
    const lft = el("div", "lft"); lft.append(el("span", "tag", exLabel(ex)), el("h1", null, ex.company));
    const rgt = el("div", "rgt");
    const mode = el("div", "seg"); mode.setAttribute("aria-label", "Mode");
    [["practise", "Practise", "Check each answer as you go"], ["exam", "Exam", "Answers and marking guides stay hidden until you finish; 3-hour timer"]].forEach(([m, l, t]) => {
      const b = el("button", null, l); b.type = "button"; b.title = t; b.setAttribute("aria-pressed", String(p.mode === m));
      b.addEventListener("click", () => { const q = prog(ex.id); q.mode = m; if (m === "exam" && !q.timerStart) q.timerStart = Date.now(); saveProg(ex.id, q); render(); });
      mode.append(b);
    });
    const timer = el("span", "timer"); timer.id = "xtimer"; timer.hidden = true;
    rgt.append(timer);
    if (s.answered || s.aDone || s.written || s.partsDone || p.timerStart) rgt.append(resetButton("Start again", () => resetExam(ex)));
    rgt.append(mode);
    tt.append(lft, rgt);
    head.append(tt);
    box.append(head);

    const bar = el("div", "secbar");
    const nav = el("nav", "seg"); nav.setAttribute("aria-label", "Sections");
    const secs = [["case", "Case", ""], ["a", "Section A", (p.mode === "exam" && !p.finishedA ? s.answered : s.aDone) + "/12"], ["b", "Section B", s.partsDone + "/" + s.parts], ["score", "Score", ""]];
    secs.forEach(([k, l, c]) => {
      const b = el("button", null, l); b.type = "button";
      if (c) b.append(el("span", "cnt", c));
      if (P.view.sec === k) b.setAttribute("aria-current", "page");
      b.addEventListener("click", () => go("practise/" + ex.id + "/" + k + (k === "a" ? "/" + (p.atA || 1) : k === "b" ? "/" + (p.atB || 1) : "")));
      nav.append(b);
    });
    bar.append(nav);
    box.append(bar);
    tickTimer(ex.id);

    const wide = window.matchMedia("(min-width: 1180px)").matches;
    const inQ = P.view.sec === "a" || P.view.sec === "b";
    const body = el("div", "xbody" + (wide && inQ ? " split" : ""));
    if (wide && inQ) { const side = panel("caseside"); side.setAttribute("aria-label", "The case"); side.append(caseView(ex, true)); body.append(side); }
    const main = el("div", "xmain");
    if (P.view.sec === "case") main.append(caseView(ex, false));
    else if (P.view.sec === "a") renderSectionA(main, ex);
    else if (P.view.sec === "b") renderSectionB(main, ex);
    else renderScore(main, ex);
    body.append(main);
    box.append(body);

    if (!wide && inQ) {
      const fab = el("button", "fab"); fab.type = "button"; fab.append(icon("doc"), document.createTextNode("Case"));
      fab.addEventListener("click", () => openDrawer(ex));
      box.append(fab);
    }
  }

  function openDrawer(ex) {
    const d = el("div", "drawer"); d.setAttribute("role", "dialog"); d.setAttribute("aria-label", "The case");
    const dh = el("div", "dh"); dh.append(el("b", null, ex.company + " · the case"));
    const close = button("Close", "small", () => { d.remove(); P.drawer = false; document.body.style.overflow = ""; }, "x");
    dh.append(close);
    const db = el("div", "db"); db.append(caseView(ex, true));
    d.append(dh, db);
    document.body.append(d); document.body.style.overflow = "hidden"; P.drawer = d;
    close.focus();
  }
  function closeDrawer() { if (P.drawer) { P.drawer.remove(); P.drawer = false; document.body.style.overflow = ""; } }

  function tickTimer(id) {
    const t = $("#xtimer"); if (!t) return;
    const upd = () => {
      const p = prog(id);
      if (p.mode !== "exam" || !p.timerStart || p.finishedB) { t.hidden = true; return; }
      t.hidden = false;
      const left = p.timerStart + 3 * 3600000 - Date.now(), s = Math.max(0, Math.floor(left / 1000));
      t.textContent = ""; t.append(icon("clock"), document.createTextNode((left <= 0 ? "Time's up " : "") + Math.floor(s / 3600) + ":" + String(Math.floor(s % 3600 / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0")));
      t.classList.toggle("late", left < 15 * 60000);
    };
    upd(); P.timerTick = setInterval(upd, 1000);
  }

  function caseView(ex, compact) {
    const art = el("article", "case" + (compact ? "" : " full panel"));
    if (!compact) art.append(el("p", "kicker", "The case · read it first"));
    art.append(el("h2", null, ex.case.title));
    if (ex.case.note) art.append(el("p", "casenote", ex.case.note));
    if (!compact && ex.instructions) {
      const ins = el("div", "instr");
      ins.append(el("p", "kicker", "Instructions"));
      const ul = el("ul"); ex.instructions.forEach((x) => ul.append(el("li", null, x)));
      ins.append(ul); art.append(ins);
    }
    ex.case.blocks.forEach((b) => {
      if (b.h) art.append(el("h4", null, b.h));
      else if (b.p) art.append(el("p", "cp", b.p));
      else if (b.table) {
        const exh = el("div", "exhibit");
        if (b.table.caption) exh.append(el("div", "cap", b.table.caption));
        const wrap = el("div", "twrap"); const tb = el("table");
        const thead = el("thead"); const tr = el("tr"); b.table.head.forEach((h) => tr.append(el("th", null, h))); thead.append(tr);
        const tbody = el("tbody"); b.table.rows.forEach((r) => { const rr = el("tr"); r.forEach((c, i) => rr.append(el(i === 0 ? "th" : "td", null, c))); tbody.append(rr); });
        tb.append(thead, tbody); wrap.append(tb); exh.append(wrap); art.append(exh);
      }
    });
    if (!compact) {
      const nx = el("div", "btns"); nx.style.marginTop = "10px";
      nx.append(button("Start Section A", "primary", () => go("practise/" + ex.id + "/a/" + (prog(ex.id).atA || 1)), "arrow", true));
      art.append(nx);
      if (ex.origin) art.append(el("p", "origin", ex.origin));
    }
    return art;
  }

  /* ---------- section A: one question at a time ---------- */
  function qState(p, q) {
    if (shownA(p, q)) return p.mcq[q.id] === q.answer ? "ok" : "no";
    return p.mcq[q.id] ? "ans" : "";
  }
  function qmap(items, cur, stateOf, onPick, label) {
    const m = el("div", "qmap");
    if (label) m.append(el("span", "lab", label));
    items.forEach((it, i) => {
      const b = el("button", "qd " + stateOf(it), it.label || String(i + 1)); b.type = "button";
      b.setAttribute("aria-current", String(i === cur)); b.setAttribute("aria-label", "Question " + (it.label || i + 1));
      b.addEventListener("click", () => onPick(i)); m.append(b);
    });
    return m;
  }

  function renderSectionA(main, ex) {
    const p = prog(ex.id);
    const n = Math.min(12, P.view.n || p.atA || 1), i = n - 1, q = ex.mcq[i];
    if (p.atA !== n) { p.atA = n; saveProg(ex.id, p); }
    const examMode = p.mode === "exam";
    const shown = shownA(p, q);

    const top = panel("secfoot");
    top.append(qmap(ex.mcq, i, (x) => qState(p, x), (k) => go("practise/" + ex.id + "/a/" + (k + 1)), "Section A"));
    const s = score(ex, p);
    if (examMode && !p.finishedA) top.append(button("Finish Section A", "primary small", () => finishA(ex), "check"));
    else top.append(el("span", "tally", s.a + " / 48" + (s.aDone < 12 ? " · " + s.aDone + " of 12 checked" : "")));
    main.append(top);

    main.append(questionCard({
      q, num: "Question " + n + " of 12", points: "4 points", name: ex.id + "-" + q.id,
      picked: p.mcq[q.id], shown,
      onPick: (L) => { const pp = prog(ex.id); pp.mcq[q.id] = L; saveProg(ex.id, pp); render(); },
      onCheck: examMode ? null : () => { const pp = prog(ex.id); pp.checked[q.id] = true; saveProg(ex.id, pp); render(); },
      prev: n > 1 ? () => go("practise/" + ex.id + "/a/" + (n - 1)) : null,
      next: n < 12 ? () => go("practise/" + ex.id + "/a/" + (n + 1)) : () => go("practise/" + ex.id + "/b/" + (p.atB || 1)),
      nextLabel: n < 12 ? "Next" : "Section B",
      note: examMode && !p.finishedA ? "Exam mode: the answers appear when you finish Section A." : "",
    }));
  }

  function finishA(ex) { const pp = prog(ex.id); pp.finishedA = true; saveProg(ex.id, pp); render(); }

  /* A multiple-choice card, shared by the exams and the drill. */
  let keyTarget = null;
  function questionCard(o) {
    const card = panel("qcard");
    const top = el("div", "qtop"); top.append(el("span", "qn", o.num));
    const r = el("span"); if (o.points === "") r.append(chips(o.q.classes)); else r.append(el("span", "qp", o.points));
    top.append(r);
    card.append(top, el("p", "stem", o.q.stem));
    const opts = el("div", "opts"); opts.setAttribute("role", "radiogroup");
    o.q.options.forEach((t, i) => {
      const L = LETTERS[i];
      const lab = el("label", "opt" + (o.shown ? " locked" : ""));
      const inp = el("input"); inp.type = "radio"; inp.name = o.name; inp.value = L; inp.checked = o.picked === L; inp.disabled = !!o.shown;
      inp.addEventListener("change", () => o.onPick(L));
      lab.append(inp, el("span", "ol", L), el("span", "ot", t));
      if (o.shown) { if (L === o.q.answer) lab.classList.add("right"); else if (o.picked === L) lab.classList.add("wrong"); }
      opts.append(lab);
    });
    card.append(opts);
    if (o.shown) card.append(feedback(o.q, o.picked));
    const foot = el("div", "qfoot");
    const prev = button("Previous", "ghost small", o.prev, "back"); prev.disabled = !o.prev;
    const mid = el("div", "mid");
    const hint = el("span", "hint", o.note || "");
    let check = null;
    if (o.onCheck && !o.shown) {
      check = button("Check", "primary", () => { if (!o.picked) { hint.textContent = "Pick an answer first."; hint.classList.add("warn"); return; } o.onCheck(); }, "check");
      mid.append(check);
    }
    mid.append(hint);
    const next = button(o.nextLabel || "Next", o.shown || !o.onCheck ? "primary small" : "ghost small", o.next, "next", true); next.disabled = !o.next;
    foot.append(prev, mid, next);
    card.append(foot);
    const keys = el("div", "keys"); keys.append(el("kbd", null, "A"), document.createTextNode("–"), el("kbd", null, "E"), document.createTextNode(" choose ·"), el("kbd", null, "Enter"), document.createTextNode(o.onCheck ? " check ·" : " next ·"), el("kbd", null, "←"), el("kbd", null, "→"), document.createTextNode(" move"));
    card.append(keys);
    keyTarget = { pick: (L) => { if (!o.shown) o.onPick(L); }, enter: () => { if (check) check.click(); else if (o.next) o.next(); }, prev: o.prev, next: o.next };
    return card;
  }

  function feedback(q, picked) {
    const ok = picked === q.answer;
    const f = el("div", "fb " + (ok ? "ok" : "no"));
    const h = el("p", "fbhead"); h.append(icon(ok ? "check" : "x"), document.createTextNode(ok ? "Right: " + q.answer : picked ? "Not quite. You picked " + picked + "; the answer is " + q.answer + "." : "Not answered. The answer is " + q.answer + "."));
    f.append(h);
    if (q.concept) f.append(el("p", "concept", q.concept));
    f.append(el("p", null, q.why));
    const s = sourcesLine(q.sources); if (s) f.append(s);
    return f;
  }

  /* ---------- section B: one part at a time ---------- */
  function renderSectionB(main, ex) {
    const p = prog(ex.id);
    const parts = partsOf(ex);
    const n = Math.min(parts.length, P.view.n || p.atB || 1), i = n - 1, cur = parts[i];
    if (p.atB !== n) { p.atB = n; saveProg(ex.id, p); }
    const examMode = p.mode === "exam", locked = examMode && !p.finishedB;

    const top = panel("secfoot");
    const st = (x) => { const v = p.open[x.k] || {}; return v.marked ? "ok" : (v.text || "").trim() ? "ans" : ""; };
    top.append(qmap(parts.map((x) => ({ ...x, label: x.k })), i, st, (k) => go("practise/" + ex.id + "/b/" + (k + 1)), "Section B"));
    if (locked) top.append(button("Finish Section B", "primary small", () => { const pp = prog(ex.id); pp.finishedB = true; saveProg(ex.id, pp); render(); }, "check"));
    else { const s = score(ex, p); top.append(el("span", "tally", s.b + " / " + (s.bDone || 52) + (s.partsDone < s.parts ? " · " + s.partsDone + " of " + s.parts + " marked" : ""))); }
    main.append(top);
    main.append(partView(ex, cur, n, parts.length, locked));
    loadAnswers(ex.id);
  }

  function partView(ex, cur, n, total, locked) {
    const { o, pt, k } = cur, qkey = ex.id + ":" + k;
    const card = panel("pcard"); card.dataset.qkey = qkey;
    const top = el("div", "qtop"); top.append(el("span", "qn", "Question " + o.id + " · " + o.title), el("span", "qp", "Part " + pt.id + " · " + pt.points + " of " + o.points + " points"));
    card.append(top);
    if (o.intro) { const qi = el("p", "qintro"); qi.append(el("b", null, "Situation: "), document.createTextNode(o.intro)); card.append(qi); }
    card.append(el("p", "prompt", pt.prompt));
    const st = prog(ex.id).open[k] || {};
    const ta = el("textarea", "ans"); ta.value = st.text || "";
    ta.placeholder = "Your answer. Name the framework, apply it to the case's facts, then make a choice.";
    ta.setAttribute("aria-label", "Your answer to " + k);
    const meta = el("div", "ameta"); const wc = el("span", null, plural(words(ta.value), "word")); meta.append(wc, el("span", null, "Saved on this device"));
    let t = null;
    const paintMap = () => {
      const v = prog(ex.id).open[k] || {}, qd = document.querySelector("#practise .qmap .qd[aria-current='true']");
      if (qd) qd.className = "qd " + (v.marked ? "ok" : (v.text || "").trim() ? "ans" : "");
    };
    ta.addEventListener("input", () => {
      wc.textContent = plural(words(ta.value), "word"); autoGrow(ta);
      clearTimeout(t); t = setTimeout(() => { const pp = prog(ex.id); pp.open[k] = { ...(pp.open[k] || {}), text: ta.value }; saveProg(ex.id, pp); shareState(); paintMap(); }, 400);
    });
    requestAnimationFrame(() => autoGrow(ta));
    card.append(ta, meta);

    const tools = el("div", "ptools");
    const guideBtn = button(st.shown && !locked ? "Hide marking guide" : "Show marking guide", "small", null, "check");
    guideBtn.disabled = locked; if (locked) guideBtn.title = "Opens when you finish Section B (exam mode)";
    const shareBtn = button("Share with the group", "small ghost");
    const groupBtn = button("Group answers", "small ghost");
    const shareMsg = el("span", "sharemsg");
    tools.append(guideBtn, shareBtn, groupBtn, shareMsg);
    card.append(tools);

    const guide = el("div", "guide"); guide.hidden = !st.shown || locked;
    const gtotal = el("span", "gtotal");
    const upTotal = () => { const c = prog(ex.id).open[k] || {}; gtotal.textContent = (c.ticks || []).reduce((s, i) => s + (pt.guide[i]?.pts || 0), 0) + " / " + pt.points; };
    const fill = () => {
      guide.textContent = "";
      const gh = el("div", "ghead"); gh.append(el("p", "kicker", "Marking guide · tick what you covered"), gtotal); guide.append(gh);
      const ticks = new Set((prog(ex.id).open[k] || {}).ticks || []);
      pt.guide.forEach((g, gi) => {
        const lab = el("label", "gi"); const c = el("input"); c.type = "checkbox"; c.checked = ticks.has(gi);
        c.addEventListener("change", () => {
          const pp = prog(ex.id); const s = pp.open[k] || {}; const tk = new Set(s.ticks || []);
          c.checked ? tk.add(gi) : tk.delete(gi); pp.open[k] = { ...s, ticks: [...tk], marked: true }; saveProg(ex.id, pp); upTotal(); paintMap();
        });
        lab.append(c, el("span", "gp", g.pts + (g.pts === 1 ? " pt" : " pts")), el("span", null, g.text)); guide.append(lab);
      });
      const s = sourcesLine(pt.sources); if (s) guide.append(s);
      upTotal();
    };
    if (!guide.hidden) fill();
    guideBtn.addEventListener("click", () => {
      const pp = prog(ex.id); const s = pp.open[k] || {}; const open = guide.hidden;
      pp.open[k] = { ...s, marked: open ? true : s.marked, shown: open }; saveProg(ex.id, pp);
      guide.hidden = !open; guideBtn.lastChild.textContent = open ? "Hide marking guide" : "Show marking guide";
      if (open) fill();
      paintMap();
    });
    card.append(guide);

    const group = el("div", "group"); group.hidden = true;
    const joinBox = el("div", "joinbox"); joinBox.hidden = true;
    card.append(group, joinBox);
    const mine = () => (P.answers.get(ex.id) || []).find((a) => a.qkey === qkey && S.me && a.page === S.me.id);
    const others = () => (P.answers.get(ex.id) || []).filter((a) => a.qkey === qkey);
    function shareState() {
      const m = mine(), cnt = others().length;
      groupBtn.lastChild.textContent = "Group answers" + (cnt ? " · " + cnt : "");
      groupBtn.disabled = !cnt;
      if (m) {
        shareBtn.lastChild.textContent = m.body === ta.value ? "Shared · stop sharing" : "Update my shared answer";
        shareMsg.textContent = m.body === ta.value ? "The group sees this answer as " + S.me.name + "." : "You changed it since you shared.";
      } else { shareBtn.lastChild.textContent = "Share with the group"; shareMsg.textContent = ""; }
      shareBtn.disabled = !m && !ta.value.trim();
      if (!group.hidden) fillGroup();
    }
    function fillGroup() {
      group.textContent = "";
      const list = others();
      if (!list.length) { group.append(el("p", "small", "Nobody has shared an answer to this part yet.")); return; }
      list.forEach((a) => {
        const it = el("div", "ga"); const h = el("div", "gah");
        h.append(el("span", "avatar", (a.name || "?").trim().slice(0, 1).toUpperCase()), el("b", null, a.name + (S.me && a.page === S.me.id ? " (you)" : "")), el("span", "small", ago(a.updated)));
        it.append(h, el("div", "gab", a.body)); group.append(it);
      });
    }
    groupBtn.addEventListener("click", () => { group.hidden = !group.hidden; if (!group.hidden) fillGroup(); });
    shareBtn.addEventListener("click", async () => {
      if (!S.me) {
        joinBox.hidden = false; joinBox.textContent = "";
        const j = joinForm({ lead: "Shared answers carry your name. Open your page once with your name and a PIN (the same as in Notes); this device remembers you.", button: "Continue", cancel: () => { joinBox.hidden = true; }, done: () => { joinBox.hidden = true; shareBtn.click(); } });
        joinBox.append(j.form); j.focus(); return;
      }
      const m = mine(), stop = m && m.body === ta.value;
      shareBtn.disabled = true; shareMsg.textContent = stop ? "Removing…" : "Sharing…";
      try {
        const r = await rpc("share_answer", { g: S.g, p_token: S.me.token, p_qkey: qkey, p_body: stop ? "" : ta.value });
        if (r.error === "signed_out") { await signOut(); shareMsg.textContent = "You were signed out on this device. Press Share again."; shareBtn.disabled = false; return; }
        if (r.error) { shareMsg.textContent = r.error === "too_long" ? "Too long to share (20,000 characters max)." : "Couldn't share. Try again."; shareBtn.disabled = false; return; }
        await loadAnswers(ex.id, true);
      } catch (e) { shareMsg.textContent = "No connection. Your answer is still here; try again."; shareBtn.disabled = false; }
    });
    card._refresh = shareState;
    shareState();

    const foot = el("div", "qfoot");
    const prev = button("Previous part", "ghost small", n > 1 ? () => go("practise/" + ex.id + "/b/" + (n - 1)) : null, "back"); prev.disabled = n <= 1;
    const next = n < total ? button("Next part", "primary small", () => go("practise/" + ex.id + "/b/" + (n + 1)), "next", true) : button("See my score", "primary small", () => go("practise/" + ex.id + "/score"), "next", true);
    foot.append(prev, el("span", "hint", locked ? "Exam mode: the marking guides open when you finish Section B." : "Write first, then open the guide."), next);
    card.append(foot);
    keyTarget = null;
    return card;
  }

  function autoGrow(ta) { ta.style.height = "auto"; ta.style.height = Math.max(170, ta.scrollHeight + 4) + "px"; }

  async function loadAnswers(examId, force) {
    const at = P.answersAt.get(examId) || 0;
    if (!force && Date.now() - at < 20000) { refreshParts(); return; }
    P.answersAt.set(examId, Date.now());
    try { const r = await rpc("list_answers", { g: S.g, p_exam: examId }); if (Array.isArray(r)) P.answers.set(examId, r); } catch (e) { /* offline */ }
    refreshParts();
  }
  function refreshParts() { document.querySelectorAll("#practise .pcard").forEach((b) => b._refresh && b._refresh()); }

  /* ---------- score ---------- */
  function ring(value, label, sub) {
    const w = el("div", "ring");
    const s = document.createElementNS(NS, "svg"); s.setAttribute("viewBox", "0 0 120 120");
    const mk = (stroke, dash) => { const c = document.createElementNS(NS, "circle"); c.setAttribute("cx", "60"); c.setAttribute("cy", "60"); c.setAttribute("r", "52"); c.setAttribute("fill", "none"); c.setAttribute("stroke", stroke); c.setAttribute("stroke-width", "11"); c.setAttribute("stroke-linecap", "round"); if (dash != null) c.setAttribute("stroke-dasharray", dash + " 400"); return c; };
    s.append(mk("var(--panel-3)"));
    if (value > 0) s.append(mk("var(--x, var(--accent))", (2 * Math.PI * 52 * Math.min(100, value) / 100).toFixed(1)));
    const l = el("div", "lbl"); const inner = el("div"); inner.append(el("b", null, label), el("small", null, sub)); l.append(inner);
    w.append(s, l); return w;
  }
  function meter(label, val, max, sub, color) {
    const d = el("div", "spart"); const r = el("div", "row"); r.append(el("span", null, label), el("b", null, val + " / " + max));
    const b = el("div", "bar"); const f = el("i"); f.style.width = pct(val, max) + "%"; if (color) f.style.background = color; b.append(f);
    d.append(r, b); if (sub) d.append(el("span", "small", sub)); return d;
  }

  function renderScore(main, ex) {
    const p = prog(ex.id), s = score(ex, p);
    const got = s.a + s.b, max = s.aDone * 4 + s.bDone, perc = pct(got, max);
    const hero = panel("scorehero");
    hero.append(ring(perc, max ? perc + "%" : "–", max ? "on " + max + " of 100 points marked" : "nothing marked yet"));
    const sp = el("div", "sparts");
    const [bl, bc] = band(perc);
    const head = el("div", "row"); head.style.display = "flex"; head.style.gap = "10px"; head.style.alignItems = "center"; head.style.flexWrap = "wrap";
    head.append(el("b", null, "So far: " + got + " points"), el("span", "band " + bc, max ? bl : "Start a section"));
    sp.append(head);
    sp.append(meter("Section A · multiple choice", s.a, 48, s.aDone + " of 12 checked"));
    sp.append(meter("Section B · open questions (self-marked)", s.b, s.bDone || 52, s.partsDone + " of " + s.parts + " parts marked"));
    if (max === 100) sp.append(el("p", "small", "Complete: " + got + " of 100 · " + bl + ". His scale: 55 pass, 70 good, 85 excellent."));
    hero.append(sp);
    main.append(hero);

    const shown = ex.mcq.filter((q) => p.finishedA || p.checked[q.id]);
    if (shown.length) {
      const bc2 = panel("byclass");
      bc2.append(h2("Multiple choice by class", "where you lose points"));
      const per = {};
      shown.forEach((q) => q.classes.forEach((c) => { per[c] = per[c] || { r: 0, t: 0 }; per[c].t++; if (p.mcq[q.id] === q.answer) per[c].r++; }));
      Object.keys(per).sort((a, b) => a - b).forEach((c) => {
        const row = el("div", "bc"); const lab = el("span"); lab.append(chip(c), document.createTextNode(" " + CLASS_NAMES[c]));
        const b = el("div", "bar"); const f = el("i"); f.style.width = pct(per[c].r, per[c].t) + "%"; f.style.background = "var(--c" + c + ")"; b.append(f);
        row.append(lab, b, el("span", "mono", per[c].r + "/" + per[c].t)); bc2.append(row);
      });
      main.append(bc2);
    }

    const missed = ex.mcq.map((q, i) => ({ q, i })).filter(({ q }) => (p.finishedA || p.checked[q.id]) && p.mcq[q.id] !== q.answer);
    if (missed.length) {
      const rv = el("section", "sect"); rv.append(h2("Revisit", missed.length + (missed.length === 1 ? " question" : " questions")));
      const list = panel("revisit");
      missed.forEach(({ q, i }) => {
        const b = el("button", "rv"); b.type = "button";
        const t = el("span", "t", q.concept || q.stem.slice(0, 90)); t.append(el("small", null, sourceLabels(q.sources).join(" · ")));
        b.append(el("span", "qd no", String(i + 1)), t, icon("next"));
        b.addEventListener("click", () => go("practise/" + ex.id + "/a/" + (i + 1)));
        list.append(b);
      });
      rv.append(list); main.append(rv);
    }
    const foot = panel("secfoot");
    foot.append(el("span", "small", "Want a clean run? Your answers for this exam are only on this device."));
    foot.append(resetButton("Start this exam again", () => resetExam(ex)));
    main.append(foot);
  }

  /* ---------- slides and book: "Class 7 slides · slide 43" or "Gillingham p. 212" opens right here ---------- */
  // The class decks and the book are encrypted with the group code like the questions (built by
  // notes-exchange/build-slides.mjs) and rendered with pdf.js, so they work the same on phones.
  // "Slide" = page of the PDF; book references use the printed page (manifest.book.offset = front matter).
  const PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/";
  const SL = { manifest: null, docs: new Map(), lib: null, open: null };
  async function slideManifest() {
    try { const r = await fetch("slides/manifest.json", { cache: "no-cache" }); SL.manifest = r.ok ? await r.json() : null; }
    catch (e) { SL.manifest = null; }
  }
  const docInfo = (key) => key === "book" ? SL.manifest?.book : SL.manifest?.classes?.[key.slice(1)];
  function deck(key) {
    if (SL.docs.has(key)) return SL.docs.get(key);
    const pr = (async () => {
      if (!SL.lib) { SL.lib = await import(PDFJS + "pdf.min.mjs"); SL.lib.GlobalWorkerOptions.workerSrc = PDFJS + "pdf.worker.min.mjs"; }
      const r = await fetch("slides/" + key + ".bin?v=" + docInfo(key).v);
      if (!r.ok) throw new Error("fetch " + r.status);
      const buf = new Uint8Array(await r.arrayBuffer());
      const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(S.g), "PBKDF2", false, ["deriveKey"]);
      const k = await crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt: buf.slice(0, 16), iterations: SL.manifest.iter },
        base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
      const pdf = await crypto.subtle.decrypt({ name: "AES-GCM", iv: buf.slice(16, 28) }, k, buf.slice(28));
      return SL.lib.getDocument({ data: new Uint8Array(pdf) }).promise;
    })();
    SL.docs.set(key, pr);
    pr.catch(() => SL.docs.delete(key));
    return pr;
  }
  function openDoc(key, n) {
    closeSlides();
    const book = key === "book", c = book ? 0 : +key.slice(1), off = book ? SL.manifest.book.offset || 0 : 0;
    const what = book ? "the book" : "the class " + c + " slides";
    const st = { c, n, doc: null, task: null, seq: 0 };
    const back = el("div", "slideview-back"); back.addEventListener("click", closeSlides);
    const sh = el("div", "slideview"); sh.setAttribute("role", "dialog"); sh.setAttribute("aria-modal", "true"); sh.setAttribute("aria-label", book ? "Gillingham, Tech-Enabled Hospitality" : "Class " + c + " slides");
    const head = el("div", "sh-head");
    const title = el("div", "sh-title");
    if (book) title.append(el("b", null, "Gillingham"), el("span", "small", "Tech-Enabled Hospitality"));
    else title.append(chip(c), el("b", null, "Class " + c + " slides"));
    const count = el("span", "sh-count");
    const x = button("", "ghost small", closeSlides, "x"); x.setAttribute("aria-label", "Close");
    head.append(title, count, x);
    const body = el("div", "sh-body"), canvas = el("canvas"), msg = el("p", "loading", "Opening " + what + "…");
    body.append(msg);
    const prev = button("Previous", "ghost small", () => show(st.n - 1), "back");
    const next = button("Next", "ghost small", () => show(st.n + 1), "next", true);
    const foot = el("div", "sh-foot"); foot.append(prev, el("span", "hint", book ? "Page numbers as printed in the book" : "Slide = page of the PDF"), next);
    sh.append(head, body, foot);
    document.body.append(back, sh); document.body.classList.add("slideview-open");
    SL.open = { st, show: (k) => show(k), nodes: [back, sh] };
    x.focus();
    async function show(k) {
      if (!st.doc) return;
      const my = ++st.seq;
      st.n = Math.max(1, Math.min(st.doc.numPages, k));
      count.textContent = book ? (st.n > off ? "p. " + (st.n - off) : "front matter") + " · " + st.n + "/" + st.doc.numPages : "slide " + st.n + " of " + st.doc.numPages;
      prev.disabled = st.n <= 1; next.disabled = st.n >= st.doc.numPages;
      const page = await st.doc.getPage(st.n);
      if (my !== st.seq) return;
      if (st.task) { st.task.cancel(); st.task = null; }
      const v1 = page.getViewport({ scale: 1 }), cs = getComputedStyle(body);
      const w = body.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const h = window.matchMedia("(max-width: 760px)").matches ? Infinity : body.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      const scale = Math.min(w / v1.width, h / v1.height), dpr = window.devicePixelRatio || 1;
      const vp = page.getViewport({ scale: scale * dpr });
      canvas.width = Math.floor(vp.width); canvas.height = Math.floor(vp.height);
      canvas.style.width = Math.floor(vp.width / dpr) + "px"; canvas.style.height = Math.floor(vp.height / dpr) + "px";
      st.task = page.render({ canvasContext: canvas.getContext("2d"), viewport: vp });
      try { await st.task.promise; } catch (e) { /* replaced by a newer page */ }
    }
    deck(key).then((doc) => { if (SL.open?.st !== st) return; st.doc = doc; msg.remove(); body.append(canvas); show(n); })
      .catch(() => { msg.textContent = "Couldn't open " + what + ". Check your connection and try again."; });
  }
  /* The Slides tab: every deck and the book, with the slides the practice questions cite most. */
  function citations() {
    const by = {}, book = new Map();
    const add = (srcs) => new Set(srcs || []).forEach((s) => {
      let m;
      if ((m = s.match(/^C(\d) S(\d+)/))) { const c = +m[1]; (by[c] = by[c] || new Map()).set(+m[2], (by[c].get(+m[2]) || 0) + 1); }
      else if ((m = s.match(/^pp?\. (\d+)/))) book.set(+m[1], (book.get(+m[1]) || 0) + 1);
    });
    exams().forEach((ex) => { ex.mcq.forEach((q) => add(q.sources)); partsOf(ex).forEach(({ pt }) => add(pt.sources)); });
    (P.content.drill || []).forEach((q) => add(q.sources));
    return { by, book };
  }
  function renderLibrary(box) {
    const head = el("div", "hero-text");
    head.append(el("p", "kicker", "Course material · the files you'll have in the exam"), el("h1", null, "Slides & book"),
      el("p", "lede", "Every class deck and Gillingham's book, opened right here. Under each deck: the slides the practice questions cite most."));
    box.append(head);
    if (!SL.manifest) { box.append(el("p", "loading", "The slides can't be loaded right now. Check your connection and reload.")); return; }
    const { by, book } = citations();
    const grid = el("div", "libgrid");
    for (let c = 1; c <= 9; c++) {
      if (!SL.manifest.classes?.[c]) continue;
      const card = panel("libcard"); card.style.setProperty("--cc", "var(--c" + c + ")");
      const top = el("div", "lc-top"), t = el("div", "lc-t");
      t.append(el("b", null, CLASS_NAMES[c]), el("span", "small", "Class " + c + " slides"));
      top.append(el("span", "n", String(c)), t); card.append(top);
      const cited = [...(by[c] || new Map())].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
      if (cited.length) {
        const k = el("div", "lc-key"), row = el("div", "lc-slides");
        cited.slice(0, 6).sort((a, b) => a[0] - b[0]).forEach(([n, k2]) => {
          const b = el("button", "src link", "slide " + n); b.type = "button"; b.append(el("small", null, "×" + k2));
          b.title = k2 + (k2 === 1 ? " question cites" : " questions cite") + " this slide";
          b.addEventListener("click", () => openDoc("c" + c, n)); row.append(b);
        });
        k.append(el("span", "kicker", "Most cited in the questions"), row); card.append(k);
      }
      const total = cited.reduce((sum, x) => sum + x[1], 0);
      const foot = el("div", "lc-foot");
      foot.append(el("span", "small", total ? plural(total, "reference") : "No references yet"), button("Open slides", "small", () => openDoc("c" + c, 1), "book"));
      card.append(foot); grid.append(card);
    }
    box.append(grid);
    if (SL.manifest.book) {
      const off = SL.manifest.book.offset || 0, total = [...book.values()].reduce((sum, x) => sum + x, 0);
      const bk = panel("libbook"), top = el("div", "lc-top"), t = el("div", "lc-t");
      t.append(el("b", null, "Gillingham, Tech-Enabled Hospitality (2025)"), el("span", "small", "The course book · " + plural(total, "reference") + " in the questions"));
      top.append(t, button("Open the book", "small", () => openDoc("book", 1 + off), "book")); bk.append(top);
      const ch = el("div", "lb-ch");
      BOOK_CH.forEach(([p, name], i) => {
        const end = (BOOK_CH[i + 1] ? BOOK_CH[i + 1][0] : 271) - 1;
        const n = [...book].filter(([pg]) => pg >= p && pg <= end).reduce((sum, x) => sum + x[1], 0);
        const b = el("button", "lb-row"); b.type = "button";
        b.append(el("span", "lb-n", String(i + 1)), el("span", null, name[0].toUpperCase() + name.slice(1)), el("span", "lb-p", "p. " + p), el("span", "lb-c", n ? "×" + n : ""));
        if (n) b.title = n + (n === 1 ? " reference" : " references") + " in the questions";
        b.addEventListener("click", () => openDoc("book", p + off)); ch.append(b);
      });
      bk.append(el("span", "kicker", "Chapters"), ch); box.append(bk);
    }
  }
  function closeSlides() {
    if (!SL.open) return;
    SL.open.nodes.forEach((x) => x.remove()); SL.open = null; document.body.classList.remove("slideview-open");
  }

  /* ---------- drill ---------- */
  const DRILL_SIZES = [5, 10, 20];   // plus "All"; stored as drill:size, 0 = all
  function drillSettings() {
    const size = store.get("drill:size");
    return { classes: store.get("drill:classes") || [], size: size === undefined || size === null ? 10 : size, mode: store.get("drill:mode") || "mix" };
  }
  function drillPool(s, stats) {
    return (P.content.drill || []).filter((q) => (!s.classes.length || q.classes.some((c) => s.classes.includes(c)))
      && (s.mode === "new" ? !stats[q.id] : s.mode === "missed" ? !!stats[q.id] && !stats[q.id].right : true));
  }
  // A round from the saved settings (new questions first, then missed, then ones you got right), or
  // exactly the questions given (one from Topics, or the ones missed in the last round).
  function startDrill(items, from) {
    if (!items) {
      const s = drillSettings(), stats = store.get("drill:stats") || {};
      const pool = drillPool(s, stats);
      items = pool.map((q) => ({ q, r: Math.random() + (stats[q.id]?.right ? 1 : 0) + (stats[q.id]?.seen ? .5 : 0) }))
        .sort((a, b) => a.r - b.r).slice(0, s.size || pool.length).map((x) => x.q);
    }
    if (!items.length) return;
    P.drill = { items, i: 0, picks: {}, checked: {}, from: from || "practise" };
    go("drill");
  }

  function renderDrill(box) {
    const d = P.drill;
    if (!d || !d.items.length) { go("practise"); return; }
    const head = el("div", "xhead");
    const cr = el("nav", "crumbs"); const a = el("a"); a.href = d.from === "topics" ? "#/topics" : "#/practise"; a.append(icon("back"), document.createTextNode(d.from === "topics" ? "Topics" : "All exams")); cr.append(a);
    head.append(cr);
    const tt = el("div", "xtitle"); const lft = el("div", "lft");
    lft.append(el("span", "tag", "Quick drill"), el("h1", null, d.i < d.items.length ? (d.items.length === 1 ? "One question" : "Question " + (d.i + 1) + " of " + d.items.length) : "How you did"));
    tt.append(lft); head.append(tt);
    const bar = el("div", "bar"); const f = el("i"); f.style.width = pct(Math.min(d.i, d.items.length), d.items.length) + "%"; bar.append(f);
    head.append(bar);
    box.append(head);
    const main = el("div", "xmain"); main.style.maxWidth = "860px";
    if (d.i >= d.items.length) {
      const right = d.items.filter((q) => d.picks[q.id] === q.answer).length;
      const hero = panel("scorehero");
      hero.append(ring(pct(right, d.items.length), right + "/" + d.items.length, "right"));
      const sp = el("div", "sparts");
      const missed = d.items.filter((q) => d.picks[q.id] !== q.answer);
      sp.append(el("b", null, !missed.length ? "All right. Try another round, or a full exam." : "Open the ones you missed to reread why, then retry them."));
      const btns = el("div", "btns");
      if (missed.length) btns.append(button(missed.length === 1 ? "Retry the one you missed" : "Retry the " + missed.length + " you missed", "primary", () => startDrill([...missed].sort(() => Math.random() - .5), d.from), "reset"));
      if (d.from === "topics") btns.append(button("Back to Topics", missed.length ? "ghost" : "primary", () => go("topics")));
      else btns.append(button("New round", missed.length ? "ghost" : "primary", () => startDrill(), "play"), button("Back to exams", "ghost", () => go("practise")));
      sp.append(btns); hero.append(sp); main.append(hero);
      if (missed.length) {
        const list = panel("revisit");
        missed.forEach((q) => {
          const row = el("button", "rv"); row.type = "button";
          const t = el("span", "t", q.concept || q.stem.slice(0, 90)); t.append(el("small", null, sourceLabels(q.sources).join(" · ")));
          row.append(chips(q.classes), t, icon("next"));
          row.addEventListener("click", () => { d.i = d.items.indexOf(q); d.review = true; render(); window.scrollTo({ top: 0 }); });
          list.append(row);
        });
        const sec = el("section", "sect"); sec.append(h2("Missed", "open one to see the answer and where to look it up"), list); main.append(sec);
      }
      box.append(main); return;
    }
    const q = d.items[d.i];
    main.append(questionCard({
      q, num: d.items.length === 1 ? "Drill question" : "Question " + (d.i + 1) + " of " + d.items.length, points: "", name: "drill-" + q.id, picked: d.picks[q.id], shown: !!d.checked[q.id],
      onPick: (L) => { d.picks[q.id] = L; render(); },
      onCheck: () => {
        d.checked[q.id] = true;
        const stats = store.get("drill:stats") || {};
        stats[q.id] = { seen: (stats[q.id]?.seen || 0) + 1, right: d.picks[q.id] === q.answer ? 1 : 0 };
        store.set("drill:stats", stats); render();
      },
      prev: d.i > 0 ? () => { d.i--; render(); window.scrollTo({ top: 0 }); } : null,
      next: d.checked[q.id] ? () => { d.i = d.review ? d.items.length : d.i + 1; d.review = false; render(); window.scrollTo({ top: 0 }); } : null,
      nextLabel: d.review ? "Back to results" : d.i + 1 < d.items.length ? "Next" : "See how you did",
    }));
    box.append(main);
  }

  /* ---------- topics: every concept, searchable ---------- */
  function classesFromSources(list) { const s = new Set(); (list || []).forEach((x) => { const m = String(x).match(/^C(\d)/); if (m) s.add(+m[1]); }); return [...s]; }
  function buildIndex() {
    if (P.idx) return P.idx;
    const idx = [];
    exams().forEach((ex) => {
      ex.mcq.forEach((q, i) => idx.push({ kind: "mcq", ex, n: i + 1, where: (ex.kind === "demo" ? "Trial" : ex.title.replace("Mock exam ", "Mock ")) + " · Q" + q.id, classes: q.classes, concept: q.concept, stem: q.stem, sources: q.sources, text: [q.stem, q.concept, q.why, ...q.options].join(" ") }));
      partsOf(ex).forEach(({ o, pt, k }, i) => {
        const cl = classesFromSources(pt.sources);
        idx.push({ kind: "open", ex, n: i + 1, where: (ex.kind === "demo" ? "Trial" : ex.title.replace("Mock exam ", "Mock ")) + " · " + k, classes: cl.length ? cl : ex.focus, concept: o.title, stem: pt.prompt, sources: pt.sources, text: [o.title, pt.prompt, ...pt.guide.map((g) => g.text)].join(" ") });
      });
    });
    (P.content.drill || []).forEach((q) => idx.push({ kind: "drill", q, where: "Drill", classes: q.classes, concept: q.concept, stem: q.stem, sources: q.sources, text: [q.stem, q.concept, q.why, ...q.options].join(" ") }));
    P.idx = idx; return idx;
  }
  function openItem(it) {
    if (it.kind === "mcq") go("practise/" + it.ex.id + "/a/" + it.n);
    else if (it.kind === "open") go("practise/" + it.ex.id + "/b/" + it.n);
    else startDrill([it.q], "topics");
  }
  function qrow(it, terms) {
    const b = el("button", "qr"); b.type = "button";
    const w = el("span", "where", it.where); if (it.ex) w.style.setProperty("--x", xColor(it.ex));
    const s = el("span", "s");
    if (terms && terms.length) { const cn = el("span", "cn"); highlight(cn, it.concept || "", terms); s.append(cn); highlight(s, snippet(it, terms), terms, true); }
    else s.textContent = it.stem;
    b.append(w, s, icon("next"));
    b.addEventListener("click", () => openItem(it));
    return b;
  }
  function snippet(it, terms) {
    const t = it.text, lo = t.toLowerCase(); let at = -1;
    for (const x of terms) { const i = lo.indexOf(x); if (i >= 0 && (at < 0 || i < at)) at = i; }
    if (at < 0 || at < 120) return it.stem;
    return "…" + t.slice(Math.max(0, at - 60), at + 160) + "…";
  }
  function highlight(node, text, terms, append) {
    const re = new RegExp("(" + terms.map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")", "ig");
    text.split(re).forEach((part, i) => node.append(i % 2 ? el("mark", null, part) : document.createTextNode(part)));
    return node;
  }

  function renderTopics(box) {
    const idx = buildIndex();
    const head = el("div", "hero-text");
    head.append(el("p", "kicker", "Topics · every framework, case and concept"), el("h1", null, "Find a topic"),
      el("p", "lede", "Search across all questions, explanations and marking guides, or browse the concepts class by class. Open any question straight from here."));
    box.append(head);
    const sb = el("div", "searchbox"); sb.append(icon("search"));
    const input = el("input"); input.type = "search"; input.placeholder = "Search: network effects, GDPR, Marriott, value–irritation…"; input.value = P.tq; input.setAttribute("aria-label", "Search topics");
    sb.append(input); box.append(sb);
    const area = el("div"); box.append(area);
    const draw = () => {
      area.textContent = "";
      const terms = P.tq.toLowerCase().split(/\s+/).filter((x) => x.length > 1);
      if (terms.length) {
        const hits = idx.filter((it) => { const t = it.text.toLowerCase(); return terms.every((x) => t.includes(x)); });
        const sec = el("section", "sect"); sec.append(h2(hits.length + (hits.length === 1 ? " match" : " matches"), "for “" + P.tq.trim() + "”"));
        const list = panel("results");
        if (!hits.length) list.append(el("p", "empty", "Nothing found. Try a shorter word, a company name or a class topic."));
        hits.slice(0, 80).forEach((it) => list.append(qrow(it, terms)));
        sec.append(list); area.append(sec); return;
      }
      const lay = el("div", "tlayout");
      const side = panel("tclasses");
      const allBtn = el("button", "tcl"); allBtn.type = "button"; allBtn.append(el("span", "n", "∗"), el("span", null, "All classes"), el("span", "c", String(idx.filter((it) => it.kind !== "open").length)));
      allBtn.style.setProperty("--cc", "var(--accent)"); allBtn.setAttribute("aria-current", String(!P.tclass));
      allBtn.addEventListener("click", () => { P.tclass = 0; draw(); });
      side.append(allBtn);
      for (let c = 1; c <= 9; c++) {
        const b = el("button", "tcl"); b.type = "button"; b.style.setProperty("--cc", "var(--c" + c + ")");
        b.append(el("span", "n", String(c)), el("span", null, CLASS_NAMES[c]), el("span", "c", String(idx.filter((it) => it.kind !== "open" && it.classes.includes(c)).length)));
        b.setAttribute("aria-current", String(P.tclass === c));
        b.addEventListener("click", () => { P.tclass = c; draw(); window.scrollTo({ top: 0 }); });
        side.append(b);
      }
      const right = el("div");
      (P.tclass ? [P.tclass] : [1, 2, 3, 4, 5, 6, 7, 8, 9]).forEach((c) => {
        const items = idx.filter((it) => it.classes.includes(c) && it.kind !== "open");
        const by = new Map();
        items.forEach((it) => { const k = it.concept || "Other"; if (!by.has(k)) by.set(k, []); by.get(k).push(it); });
        const sec = el("section", "tsect"); sec.style.setProperty("--cc", "var(--c" + c + ")");
        const th = el("div", "th"); th.append(el("span", "n", String(c)), el("h3", null, CLASS_NAMES[c]), el("span", "c", by.size + " concepts · " + items.length + " questions"));
        sec.append(th);
        const cs = el("div", "concepts");
        [...by.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0])).forEach(([name, list]) => {
          const d = el("details", "cpt"); const sm = el("summary"); sm.append(el("b", null, name), el("span", "c", list.length + (list.length === 1 ? " question" : " questions")));
          d.append(sm);
          const srcs = [...new Set(list.flatMap((it) => it.sources || []))].slice(0, 8);
          d.addEventListener("toggle", () => {
            if (!d.open || d.dataset.filled) return; d.dataset.filled = "1";
            const s = sourcesLine(srcs); if (s) d.append(s);
            const rows = el("div", "qrows"); list.forEach((it) => rows.append(qrow(it))); d.append(rows);
          });
          cs.append(d);
        });
        sec.append(cs); right.append(sec);
      });
      lay.append(side, right); area.append(lay);
    };
    let tmr = null;
    input.addEventListener("input", () => { clearTimeout(tmr); tmr = setTimeout(() => { P.tq = input.value; draw(); }, 120); });
    draw();
  }

  /* ---------- render ---------- */
  async function render() {
    const box = root();
    if (!P.content) {
      box.textContent = ""; box.append(el("p", "loading", "Opening the practice questions…"));
      try { await loadContent(); }
      catch (e) {
        box.textContent = "";
        const g = el("div", "gate");
        g.append(el("b", null, P.failed === "key" ? "These questions don't open with this link" : "Can't load the practice questions"),
          el("p", null, P.failed === "key" ? "Ask Antonis for the current invitation link." : "Check your internet connection and reload the page."));
        box.append(g); return;
      }
    }
    keyTarget = null;
    box.textContent = ""; box.style.removeProperty("--x");
    if (P.view.name === "topics") renderTopics(box);
    else if (P.view.name === "slides") renderLibrary(box);
    else if (P.view.name === "exam") renderExam(box);
    else if (P.view.name === "drill") renderDrill(box);
    else renderHome(box);
  }

  function onKey(e) {
    if (SL.open) {
      if (e.key === "Escape") closeSlides();
      else if (e.key === "ArrowRight") SL.open.show(SL.open.st.n + 1);
      else if (e.key === "ArrowLeft") SL.open.show(SL.open.st.n - 1);
      else return;
      e.preventDefault(); return;
    }
    if (!keyTarget || S.tab !== "practise" || P.drawer) { if (e.key === "Escape") closeDrawer(); return; }
    const t = e.target, tag = t && t.tagName;
    if (tag === "TEXTAREA" || (tag === "INPUT" && t.type !== "radio") || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === "Enter" && (tag === "BUTTON" || tag === "A" || tag === "SUMMARY")) return;
    const k = e.key.toLowerCase();
    const L = "abcde".includes(k) && k.length === 1 ? k.toUpperCase() : "12345".includes(k) && k.length === 1 ? LETTERS[+k - 1] : null;
    if (L) { e.preventDefault(); keyTarget.pick(L); }
    else if (e.key === "Enter") { e.preventDefault(); keyTarget.enter(); }
    else if (e.key === "ArrowRight" && keyTarget.next) { e.preventDefault(); keyTarget.next(); }
    else if (e.key === "ArrowLeft" && keyTarget.prev) { e.preventDefault(); keyTarget.prev(); }
  }

  return {
    init() {
      paintTheme(); tickClock(); setInterval(tickClock, 30000);
      $("#theme").addEventListener("click", () => {
        const next = isDark() ? "light" : "dark";
        document.documentElement.dataset.theme = next; store.set("theme", next); paintTheme();
      });
      window.addEventListener("hashchange", route);
      document.addEventListener("keydown", onKey);
      let rs = null, wasWide = window.matchMedia("(min-width: 1180px)").matches;
      window.addEventListener("resize", () => {
        clearTimeout(rs); rs = setTimeout(() => {
          if (SL.open) SL.open.show(SL.open.st.n);
          const wide = window.matchMedia("(min-width: 1180px)").matches;
          if (wide !== wasWide && P.view.name === "exam" && S.tab === "practise" && document.activeElement?.tagName !== "TEXTAREA") { closeDrawer(); render(); }
          wasWide = wide;
        }, 200);
      });
      document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && P.view.name === "exam" && P.view.sec === "b" && S.tab === "practise") loadAnswers(P.view.id); });
    },
    route,
    signedIn() { if (P.view.name === "exam") { P.answersAt.delete(P.view.id); loadAnswers(P.view.id, true); } },
  };
})();

window.Practise = Practise;   // a top-level const is not a window property; notes.js looks for it there
start();
