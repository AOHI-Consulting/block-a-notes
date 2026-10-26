/* Practice for the LDD exam: the lecturer's demo exam, mock exams in the same format, and a
   quick multiple-choice drill. The questions arrive encrypted (content.enc) and open with the
   group code from the invitation link, so the public repository holds nothing readable.
   Progress stays on this device; an open answer reaches the group only when you share it. */

const Practise = (() => {
  const EXAM_AT = new Date("2026-10-30T11:00:00+01:00");
  const LETTERS = ["A", "B", "C", "D", "E"];
  const BANDS = [[85, "Excellent"], [70, "Good"], [55, "Sufficient (pass)"], [0, "Insufficient"]];
  const CLASS_NAMES = {
    1: "Customer experience", 2: "Mobility & supply chain", 3: "Future of work", 4: "Payments",
    5: "Platforms & ecosystems", 6: "Smart buildings", 7: "Data & AI", 8: "Resilience", 9: "Transformation & tech stack",
  };
  const P = {
    content: null, loading: null, failed: "",
    view: { name: "home" },          // home | exam | drill
    answers: new Map(),              // examId -> [{qkey, page, name, body, updated}]
    answersAt: new Map(),
    drill: null,
    timerTick: null,
  };
  const root = () => $("#practise");

  /* ---------- local progress ---------- */
  const key = (id) => "px:" + id;
  function prog(id) {
    const p = store.get(key(id)) || {};
    p.mode = p.mode === "exam" ? "exam" : "practise";
    p.mcq = p.mcq || {}; p.checked = p.checked || {}; p.open = p.open || {};
    return p;
  }
  const saveProg = (id, p) => store.set(key(id), p);

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
      return P.content;
    })();
    try { return await P.loading; }
    catch (e) { P.loading = null; P.failed = String(e && e.name === "OperationError" ? "key" : "net"); throw e; }
  }
  const exams = () => (P.content?.exams || []);
  const examById = (id) => exams().find((x) => x.id === id);

  /* ---------- scoring ---------- */
  function score(ex, p) {
    let a = 0, aDone = 0;
    const revealAll = !!p.finishedA;
    ex.mcq.forEach((q) => {
      const shown = revealAll || p.checked[q.id];
      if (shown && p.mcq[q.id]) { aDone++; if (p.mcq[q.id] === q.answer) a += 4; }
      else if (shown) aDone++;
    });
    let b = 0, bDone = 0, bMax = 0;
    ex.open.forEach((o) => o.parts.forEach((pt) => {
      bMax += pt.points;
      const st = p.open[o.id + pt.id];
      if (st && st.marked) { bDone += pt.points; b += (st.ticks || []).reduce((s, i) => s + (pt.guide[i]?.pts || 0), 0); }
    }));
    return { a, aDone, aMax: ex.mcq.length * 4, b, bDone, bMax };
  }
  const band = (pct) => BANDS.find(([min]) => pct >= min)[1];

  /* ---------- small builders ---------- */
  function chips(classes) {
    const w = el("span", "chips");
    (classes || []).forEach((c) => { const s = el("span", "chip", "C" + c); s.title = "Class " + c + ": " + (CLASS_NAMES[c] || ""); w.append(s); });
    return w;
  }
  function sourcesLine(list) {
    if (!list || !list.length) return null;
    const p = el("p", "srcs");
    p.append(el("span", "srclab", "Look it up"));
    list.forEach((s) => p.append(el("span", "src", s)));
    return p;
  }
  function button(text, cls, fn) { const b = el("button", "btn " + (cls || "ghost"), text); b.type = "button"; if (fn) b.addEventListener("click", fn); return b; }
  function textBtn(text, fn, cls) { const b = el("button", "tbtn" + (cls ? " " + cls : ""), text); b.type = "button"; b.addEventListener("click", fn); return b; }
  function go(view) {
    P.view = view;
    clearInterval(P.timerTick);
    document.body.classList.toggle("in-exam", view.name !== "home");
    render();
    window.scrollTo({ top: 0 });
  }

  /* ---------- home ---------- */
  function daysLeft() {
    const ms = EXAM_AT - Date.now();
    if (ms <= 0) return "Exam day";
    const d = Math.floor(ms / 86400000), h = Math.floor((ms % 86400000) / 3600000);
    return d > 0 ? d + (d === 1 ? " day " : " days ") + h + " h to go" : h + " h to go";
  }

  function renderHome(box) {
    const top = el("section", "pintro");
    const facts = el("div", "facts");
    const f1 = el("div", "fact"); f1.append(el("span", "fk", "The exam"), el("b", null, "Fri 30 Oct, 11:00–14:00"), el("span", "fs", daysLeft() + " · room opens 10:30"));
    const f2 = el("div", "fact"); f2.append(el("span", "fk", "Format"), el("b", null, "One case · 12 MC + 2 open"), el("span", "fs", "48 + 52 points · 3 hours · open book"));
    const f3 = el("div", "fact"); f3.append(el("span", "fk", "Pass"), el("b", null, "55 of 100"), el("span", "fs", "70 good · 85 excellent (his trial-exam scale)"));
    facts.append(f1, f2, f3);
    top.append(facts);

    const how = el("details", "how");
    how.append(el("summary", null, "How he marks the open questions"));
    const ol = el("ol");
    ["Use a concept from the lectures or the Gillingham book, and use it accurately.",
      "Apply it explicitly to evidence from the case: the numbers, the people, the exhibits.",
      "Show judgement: make a choice and justify it."].forEach((t) => ol.append(el("li", null, t)));
    how.append(ol,
      el("p", null, "A purely descriptive answer, or one that only restates the case, earns at most half the points. Other relevant frameworks get credit if you apply them correctly."),
      el("p", null, "Timing he suggests: about 30 minutes for the 12 multiple-choice questions, about 75 minutes per open question, and time to read the case and check."),
      el("p", null, "A pattern in his trial exam: in all 12 multiple-choice questions the right answer was also the most complete option, the one that joins technology with the business model, data, people or governance. Don't count on it; read every option."),
      el("p", "small", "From his answer key for the trial exam and the individual-exam rubric on slide 63 of the class 8 deck."));
    top.append(how);
    box.append(top);

    box.append(el("h2", "sect", "Full exams"));
    const grid = el("div", "cards");
    exams().forEach((ex) => {
      const p = prog(ex.id), s = score(ex, p);
      const c = el("button", "card"); c.type = "button";
      c.addEventListener("click", () => go({ name: "exam", id: ex.id, tab: "case" }));
      const tag = el("span", "ctag" + (ex.kind === "demo" ? " his" : ""), ex.kind === "demo" ? "His trial exam" : ex.title);
      c.append(tag, el("b", "cname", ex.company), el("span", "cline", ex.tagline));
      const meta = el("span", "cmeta");
      meta.append(chips(ex.focus));
      const done = s.aDone + (s.bDone ? 1 : 0);
      meta.append(el("span", "cprog", done ? "A " + s.a + "/" + s.aMax + (s.bDone ? " · B " + s.b + "/" + s.bDone : "") : "Not started"));
      c.append(meta);
      grid.append(c);
    });
    box.append(grid);

    box.append(el("h2", "sect", "Quick drill"));
    const d = el("div", "drillcard");
    const pool = P.content.drill || [];
    d.append(el("p", null, "Ten multiple-choice questions at a time, without a case, on the frameworks from each class. You see the answer and where to look it up after each one."));
    const pick = el("div", "picker");
    const chosen = new Set(store.get("drill:classes") || []);
    for (let c = 1; c <= 9; c++) {
      const n = pool.filter((q) => q.classes.includes(c)).length;
      const b = el("button", "pick", c + " · " + CLASS_NAMES[c]); b.type = "button";
      b.setAttribute("aria-pressed", String(chosen.has(c)));
      b.title = n + " questions";
      b.disabled = !n;
      b.addEventListener("click", () => {
        chosen.has(c) ? chosen.delete(c) : chosen.add(c);
        b.setAttribute("aria-pressed", String(chosen.has(c)));
        store.set("drill:classes", [...chosen]);
        count.textContent = countText();
      });
      pick.append(b);
    }
    const countText = () => {
      const n = pool.filter((q) => !chosen.size || q.classes.some((c) => chosen.has(c))).length;
      return (chosen.size ? "Classes picked: " + n : "All classes: " + n) + " questions in the pool";
    };
    const count = el("p", "small", countText());
    d.append(pick, count, button("Start 10 questions", "primary", () => startDrill([...chosen])));
    box.append(d);

    box.append(el("p", "foot", "Your answers and scores stay on this device. An open answer reaches the group only if you press Share. Built " + (P.content.built ? new Date(P.content.built).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "") + " from the class decks, our recordings and Gillingham."));
  }

  /* ---------- exam ---------- */
  function renderExam(box) {
    const ex = examById(P.view.id);
    if (!ex) { go({ name: "home" }); return; }
    const p = prog(ex.id);

    const head = el("div", "xhead");
    head.append(textBtn("← All exams", () => go({ name: "home" }), "back"));
    const t = el("div", "xtitle");
    t.append(el("span", "ctag" + (ex.kind === "demo" ? " his" : ""), ex.kind === "demo" ? "His trial exam" : ex.title), el("h2", null, ex.company));
    head.append(t);

    const bar = el("div", "xbar");
    const tabs = el("div", "xtabs"); tabs.setAttribute("role", "tablist");
    [["case", "Case"], ["a", "Section A"], ["b", "Section B"], ["score", "Score"]].forEach(([k, label]) => {
      const b = el("button", "xtab", label); b.type = "button"; b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", String(P.view.tab === k));
      b.addEventListener("click", () => { P.view.tab = k; render(); window.scrollTo({ top: 0 }); });
      tabs.append(b);
    });
    bar.append(tabs);
    const mode = el("div", "mode");
    const mp = el("button", "seg", "Practise"); mp.type = "button"; mp.setAttribute("aria-pressed", String(p.mode === "practise"));
    const me = el("button", "seg", "Exam"); me.type = "button"; me.setAttribute("aria-pressed", String(p.mode === "exam"));
    mp.title = "Check each answer as you go"; me.title = "Answers and marking guides stay hidden until you finish; 3-hour timer";
    mp.addEventListener("click", () => { const q = prog(ex.id); q.mode = "practise"; saveProg(ex.id, q); render(); });
    me.addEventListener("click", () => { const q = prog(ex.id); q.mode = "exam"; if (!q.timerStart) q.timerStart = Date.now(); saveProg(ex.id, q); render(); });
    mode.append(mp, me);
    bar.append(mode);
    const timer = el("span", "timer"); timer.id = "xtimer";
    bar.append(timer);
    head.append(bar);
    box.append(head);
    tickTimer(ex.id);

    const wide = window.matchMedia("(min-width: 1180px)").matches;
    const body = el("div", "xbody" + (wide && (P.view.tab === "a" || P.view.tab === "b") ? " split" : ""));
    if (body.classList.contains("split")) {
      const side = el("aside", "caseside"); side.setAttribute("aria-label", "The case");
      side.append(caseView(ex, true));
      body.append(side);
    }
    const main = el("div", "xmain");
    if (P.view.tab === "case") main.append(caseView(ex, false));
    else if (P.view.tab === "a") renderSectionA(main, ex);
    else if (P.view.tab === "b") renderSectionB(main, ex);
    else renderScore(main, ex);
    body.append(main);
    box.append(body);
  }

  function tickTimer(id) {
    const t = $("#xtimer"); if (!t) return;
    const upd = () => {
      const p = prog(id);
      if (p.mode !== "exam" || !p.timerStart || p.finishedB) { t.textContent = ""; t.hidden = true; return; }
      t.hidden = false;
      const left = p.timerStart + 3 * 3600000 - Date.now();
      const s = Math.max(0, Math.floor(left / 1000));
      t.textContent = (left <= 0 ? "Time is up · " : "") + Math.floor(s / 3600) + ":" + String(Math.floor(s % 3600 / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
      t.classList.toggle("late", left < 15 * 60000);
    };
    upd();
    P.timerTick = setInterval(upd, 1000);
  }

  function caseView(ex, compact) {
    const art = el("article", "case" + (compact ? " compact" : ""));
    art.append(el("h3", "casetitle", ex.case.title));
    if (ex.case.note) art.append(el("p", "casenote", ex.case.note));
    if (!compact && ex.instructions) {
      const ins = el("div", "instr");
      ins.append(el("p", "fk", "Instructions"));
      const ul = el("ul"); ex.instructions.forEach((x) => ul.append(el("li", null, x)));
      ins.append(ul);
      art.append(ins);
    }
    ex.case.blocks.forEach((b) => {
      if (b.h) art.append(el("h4", null, b.h));
      else if (b.p) art.append(el("p", null, b.p));
      else if (b.table) {
        if (b.table.caption) art.append(el("p", "tcap", b.table.caption));
        const wrap = el("div", "twrap");
        const tb = el("table");
        const thead = el("thead"); const tr = el("tr");
        b.table.head.forEach((h) => tr.append(el("th", null, h)));
        thead.append(tr); tb.append(thead);
        const tbody = el("tbody");
        b.table.rows.forEach((r) => { const rr = el("tr"); r.forEach((c, i) => rr.append(el(i === 0 ? "th" : "td", null, c))); tbody.append(rr); });
        tb.append(tbody); wrap.append(tb); art.append(wrap);
      }
    });
    if (!compact) {
      const nx = el("div", "next");
      nx.append(button("Start Section A →", "primary", () => { P.view.tab = "a"; render(); window.scrollTo({ top: 0 }); }));
      art.append(nx);
    }
    if (ex.origin && !compact) art.append(el("p", "small origin", ex.origin));
    return art;
  }

  function renderSectionA(main, ex) {
    const p = prog(ex.id);
    const examMode = p.mode === "exam";
    const reveal = !!p.finishedA;
    main.append(el("h3", "secthead", "Section A · multiple choice"), el("p", "small", "12 questions × 4 points. One best answer each." + (examMode ? (reveal ? " Finished: answers are shown." : " Exam mode: the answers appear when you finish the section.") : " Practise mode: check each answer as you go.")));
    const list = el("ol", "mcqs");
    ex.mcq.forEach((q) => {
      const li = el("li", "mcq"); li.id = "q" + q.id;
      const shown = reveal || (!examMode && p.checked[q.id]);
      const head = el("div", "qhead"); head.append(el("span", "qn", "Question " + q.id), el("span", "qp", "4 points"));
      li.append(head, el("p", "stem", q.stem));
      const opts = el("div", "opts"); opts.setAttribute("role", "radiogroup");
      q.options.forEach((o, i) => {
        const L = LETTERS[i];
        const lab = el("label", "opt");
        const r = el("input"); r.type = "radio"; r.name = ex.id + "-" + q.id; r.value = L; r.checked = p.mcq[q.id] === L; r.disabled = !!shown;
        r.addEventListener("change", () => { const pp = prog(ex.id); pp.mcq[q.id] = L; saveProg(ex.id, pp); });
        lab.append(r, el("span", "ol", L), el("span", "ot", o));
        if (shown) {
          if (L === q.answer) lab.classList.add("right");
          else if (p.mcq[q.id] === L) lab.classList.add("wrong");
        }
        opts.append(lab);
      });
      li.append(opts);
      if (shown) li.append(feedback(q, p.mcq[q.id]));
      else if (!examMode) {
        const act = el("div", "qact");
        act.append(button("Check", "ghost small", () => {
          const pp = prog(ex.id);
          if (!pp.mcq[q.id]) { hint.textContent = "Pick an answer first."; return; }
          pp.checked[q.id] = true; saveProg(ex.id, pp); render(); document.getElementById("q" + q.id)?.scrollIntoView({ block: "center" });
        }));
        const hint = el("span", "small"); act.append(hint);
        li.append(act);
      }
      list.append(li);
    });
    main.append(list);

    const foot = el("div", "secfoot");
    if (examMode && !reveal) {
      const n = Object.keys(p.mcq).length;
      foot.append(el("p", "small", n + " of 12 answered."), button("Finish Section A and see the answers", "primary", () => {
        const pp = prog(ex.id); pp.finishedA = true; saveProg(ex.id, pp); render(); window.scrollTo({ top: 0 });
      }));
    } else {
      const s = score(ex, p);
      foot.append(el("p", "tally", "Section A: " + s.a + " of " + s.aMax + " points" + (s.aDone < 12 ? " so far (" + s.aDone + " of 12 checked)" : "")));
    }
    foot.append(button("Go to Section B →", "primary", () => { P.view.tab = "b"; render(); window.scrollTo({ top: 0 }); }));
    foot.append(textBtn("Clear my answers for Section A", () => {
      const pp = prog(ex.id); pp.mcq = {}; pp.checked = {}; pp.finishedA = false; saveProg(ex.id, pp); render();
    }));
    main.append(foot);
  }

  function feedback(q, picked) {
    const f = el("div", "fb " + (picked === q.answer ? "ok" : "no"));
    f.append(el("p", "fbhead", picked === q.answer ? "Right: " + q.answer : (picked ? "Not quite. You picked " + picked + "; the answer is " + q.answer : "Not answered. The answer is " + q.answer)));
    if (q.concept) f.append(el("p", "concept", q.concept));
    f.append(el("p", null, q.why));
    const s = sourcesLine(q.sources); if (s) f.append(s);
    return f;
  }

  function renderSectionB(main, ex) {
    const p = prog(ex.id);
    const examMode = p.mode === "exam";
    const locked = examMode && !p.finishedB;
    main.append(el("h3", "secthead", "Section B · open questions"),
      el("p", "small", "Write your answer, then open the marking guide and tick what you covered: that's your score. " + (locked ? "Exam mode: the guides open when you finish the section." : "Share an answer to compare it with the group's.")));
    ex.open.forEach((o) => {
      const sec = el("section", "openq");
      const hd = el("div", "qhead"); hd.append(el("span", "qn", "Question " + o.id + " · " + o.title), el("span", "qp", o.points + " points"));
      sec.append(hd);
      if (o.intro) sec.append(el("p", "stem", o.intro));
      o.parts.forEach((pt) => sec.append(partView(ex, o, pt, locked)));
      main.append(sec);
    });
    const foot = el("div", "secfoot");
    if (locked) foot.append(button("Finish Section B and open the marking guides", "primary", () => {
      const pp = prog(ex.id); pp.finishedB = true; saveProg(ex.id, pp); render(); window.scrollTo({ top: 0 });
    }));
    foot.append(button("See my score →", "primary", () => { P.view.tab = "score"; render(); window.scrollTo({ top: 0 }); }));
    main.append(foot);
    loadAnswers(ex.id);
  }

  function partView(ex, o, pt, locked) {
    const k = o.id + pt.id, qkey = ex.id + ":" + k;
    const box = el("div", "part"); box.dataset.qkey = qkey;
    box.append(el("p", "prompt", pt.id + ") " + pt.prompt));
    const p = prog(ex.id); const st = p.open[k] || {};
    const ta = el("textarea", "ans"); ta.rows = 6; ta.value = st.text || "";
    ta.placeholder = "Your answer. Name the framework, apply it to the case's facts, then make a choice.";
    ta.setAttribute("aria-label", "Your answer to " + o.id + pt.id);
    const meta = el("div", "ameta");
    const wc = el("span", "small", plural(words(ta.value), "word"));
    let t = null;
    ta.addEventListener("input", () => {
      wc.textContent = plural(words(ta.value), "word");
      clearTimeout(t); t = setTimeout(() => { const pp = prog(ex.id); pp.open[k] = { ...(pp.open[k] || {}), text: ta.value }; saveProg(ex.id, pp); shareState(); }, 400);
      autoGrow(ta);
    });
    requestAnimationFrame(() => autoGrow(ta));
    meta.append(wc);
    box.append(ta, meta);

    const tools = el("div", "ptools");
    const guideBtn = button(st.shown && !locked ? "Hide marking guide" : "Show marking guide", "ghost small");
    guideBtn.disabled = locked;
    if (locked) guideBtn.title = "Opens when you finish Section B (exam mode)";
    const shareBtn = button("Share with the group", "ghost small");
    const groupBtn = button("Group answers", "ghost small");
    tools.append(guideBtn, shareBtn, groupBtn);
    const shareMsg = el("span", "small sharemsg");
    tools.append(shareMsg);
    box.append(tools);

    const guide = el("div", "guide"); guide.hidden = !st.shown || locked;
    const total = el("p", "gtotal");
    const fill = () => {
      guide.textContent = "";
      guide.append(el("p", "fk", "Marking guide · tick what your answer covered"));
      const cur = prog(ex.id).open[k] || {};
      const ticks = new Set(cur.ticks || []);
      pt.guide.forEach((g, i) => {
        const lab = el("label", "gi");
        const c = el("input"); c.type = "checkbox"; c.checked = ticks.has(i);
        c.addEventListener("change", () => {
          const pp = prog(ex.id); const s = pp.open[k] || {}; const tk = new Set(s.ticks || []);
          c.checked ? tk.add(i) : tk.delete(i);
          pp.open[k] = { ...s, ticks: [...tk], marked: true }; saveProg(ex.id, pp); upTotal();
        });
        lab.append(c, el("span", "gp", g.pts + (g.pts === 1 ? " pt" : " pts")), el("span", "gt", g.text));
        guide.append(lab);
      });
      guide.append(total);
      const s = sourcesLine(pt.sources); if (s) guide.append(s);
      upTotal();
    };
    const upTotal = () => {
      const cur = prog(ex.id).open[k] || {};
      const got = (cur.ticks || []).reduce((s, i) => s + (pt.guide[i]?.pts || 0), 0);
      total.textContent = "You: " + got + " of " + pt.points + " points";
    };
    if (!guide.hidden) fill();
    guideBtn.addEventListener("click", () => {
      const pp = prog(ex.id); const s = pp.open[k] || {};
      const open = guide.hidden;
      pp.open[k] = { ...s, marked: open ? true : s.marked, shown: open }; saveProg(ex.id, pp);
      guide.hidden = !open; guideBtn.textContent = open ? "Hide marking guide" : "Show marking guide";
      if (open) fill();
    });
    box.append(guide);

    const group = el("div", "group"); group.hidden = true;
    box.append(group);
    const joinBox = el("div", "joinbox"); joinBox.hidden = true;
    box.append(joinBox);

    function mine() { return (P.answers.get(ex.id) || []).find((a) => a.qkey === qkey && S.me && a.page === S.me.id); }
    function others() { return (P.answers.get(ex.id) || []).filter((a) => a.qkey === qkey); }
    function shareState() {
      const m = mine(), n = others().length;
      groupBtn.textContent = "Group answers" + (n ? " · " + n : "");
      groupBtn.disabled = !n;
      const text = ta.value.trim();
      if (m) {
        shareBtn.textContent = m.body === ta.value ? "Shared ✓ · stop sharing" : "Update my shared answer";
        shareMsg.textContent = m.body === ta.value ? "The group sees this answer as " + S.me.name + "." : "You changed it since you shared.";
      } else {
        shareBtn.textContent = "Share with the group";
        shareMsg.textContent = "";
      }
      shareBtn.disabled = !m && !text;
      if (!group.hidden) fillGroup();
    }
    function fillGroup() {
      group.textContent = "";
      const list = others();
      if (!list.length) { group.append(el("p", "small", "Nobody has shared an answer to this part yet.")); return; }
      list.forEach((a) => {
        const it = el("div", "ga");
        const h = el("p", "gah"); h.append(el("b", null, a.name + (S.me && a.page === S.me.id ? " (you)" : "")), el("span", "small", ago(a.updated)));
        it.append(h, el("div", "gab", a.body));
        group.append(it);
      });
    }
    groupBtn.addEventListener("click", () => { group.hidden = !group.hidden; if (!group.hidden) fillGroup(); });
    shareBtn.addEventListener("click", async () => {
      if (!S.me) {
        joinBox.hidden = false; joinBox.textContent = "";
        const j = joinForm({
          lead: "Shared answers carry your name. Open your page once with your name and a PIN (the same as in the Notes tab); this device remembers you.",
          button: "Continue",
          cancel: () => { joinBox.hidden = true; },
          done: () => { joinBox.hidden = true; shareBtn.click(); },
        });
        joinBox.append(j.form); j.focus();
        return;
      }
      const m = mine();
      const stop = m && m.body === ta.value;
      shareBtn.disabled = true; shareMsg.textContent = stop ? "Removing…" : "Sharing…";
      try {
        const r = await rpc("share_answer", { g: S.g, p_token: S.me.token, p_qkey: qkey, p_body: stop ? "" : ta.value });
        if (r.error === "signed_out") { await signOut(); shareMsg.textContent = "You were signed out on this device. Press Share again."; shareBtn.disabled = false; return; }
        if (r.error) { shareMsg.textContent = r.error === "too_long" ? "Too long to share (20,000 characters max)." : "Couldn't share. Try again."; shareBtn.disabled = false; return; }
        await loadAnswers(ex.id, true);
      } catch (e) { shareMsg.textContent = "No connection. Your answer is still here; try again."; shareBtn.disabled = false; }
    });
    box._refresh = shareState;
    shareState();
    return box;
  }

  function autoGrow(ta) { ta.style.height = "auto"; ta.style.height = Math.max(150, ta.scrollHeight + 4) + "px"; }

  async function loadAnswers(examId, force) {
    const at = P.answersAt.get(examId) || 0;
    if (!force && Date.now() - at < 20000) { refreshParts(); return; }
    P.answersAt.set(examId, Date.now());
    try {
      const r = await rpc("list_answers", { g: S.g, p_exam: examId });
      if (Array.isArray(r)) P.answers.set(examId, r);
    } catch (e) { /* offline: keep what we have */ }
    refreshParts();
  }
  function refreshParts() { document.querySelectorAll("#practise .part").forEach((b) => b._refresh && b._refresh()); }

  function renderScore(main, ex) {
    const p = prog(ex.id), s = score(ex, p);
    main.append(el("h3", "secthead", "Your score"));
    const grid = el("div", "scores");
    const total = s.a + s.b, counted = (s.aDone * 4) + s.bDone;
    const cell = (k, v, sub) => { const c = el("div", "sc"); c.append(el("span", "fk", k), el("b", null, v), el("span", "small", sub)); return c; };
    grid.append(cell("Section A", s.a + " / 48", s.aDone + " of 12 questions checked"));
    grid.append(cell("Section B (self-marked)", s.b + " / " + (s.bDone || 52), s.bDone ? "on " + s.bDone + " of 52 points marked" : "open a marking guide to score"));
    const pct = counted ? Math.round(100 * total / counted) : 0;
    grid.append(cell("So far", counted ? pct + "%" : "–", counted ? band(pct) + " on what you've marked" : "nothing marked yet"));
    main.append(grid);
    if (counted === 100) main.append(el("p", "tally", "Total: " + total + " of 100 · " + band(total)));

    const missed = ex.mcq.filter((q) => (p.finishedA || p.checked[q.id]) && p.mcq[q.id] !== q.answer);
    if (missed.length) {
      main.append(el("h4", "sub", "Revisit"));
      const ul = el("ul", "revisit");
      missed.forEach((q) => {
        const li = el("li");
        li.append(el("b", null, "Q" + q.id + " · " + (q.concept || "")), chips(q.classes));
        const s2 = sourcesLine(q.sources); if (s2) li.append(s2);
        ul.append(li);
      });
      main.append(ul);
    }
    const foot = el("div", "secfoot");
    foot.append(textBtn("Start this exam again (clears your answers on this device)", () => {
      store.del(key(ex.id)); render();
    }, "danger"));
    main.append(foot);
  }

  /* ---------- drill ---------- */
  function startDrill(classes) {
    const pool = (P.content.drill || []).filter((q) => !classes.length || q.classes.some((c) => classes.includes(c)));
    const stats = store.get("drill:stats") || {};
    const shuffled = pool.map((q) => ({ q, r: Math.random() + (stats[q.id]?.right ? 1 : 0) + (stats[q.id]?.seen ? 0.5 : 0) }))
      .sort((a, b) => a.r - b.r).slice(0, 10).map((x) => x.q);
    P.drill = { items: shuffled, i: 0, picks: {}, checked: {} };
    go({ name: "drill" });
  }

  function renderDrill(box) {
    const d = P.drill;
    if (!d || !d.items.length) { go({ name: "home" }); return; }
    const head = el("div", "xhead");
    head.append(textBtn("← All exams", () => go({ name: "home" }), "back"));
    const t = el("div", "xtitle"); t.append(el("span", "ctag", "Quick drill"), el("h2", null, d.i < d.items.length ? "Question " + (d.i + 1) + " of " + d.items.length : "Done"));
    head.append(t); box.append(head);
    const main = el("div", "xmain drill");
    if (d.i >= d.items.length) {
      const right = d.items.filter((q) => d.picks[q.id] === q.answer).length;
      main.append(el("p", "tally", right + " of " + d.items.length + " right"));
      const ul = el("ul", "revisit");
      d.items.filter((q) => d.picks[q.id] !== q.answer).forEach((q) => {
        const li = el("li"); li.append(el("b", null, q.concept || q.stem.slice(0, 80)), chips(q.classes));
        const s = sourcesLine(q.sources); if (s) li.append(s); ul.append(li);
      });
      if (ul.children.length) main.append(el("h4", "sub", "Revisit"), ul);
      main.append(button("Another 10", "primary", () => startDrill(store.get("drill:classes") || [])));
      box.append(main); return;
    }
    const q = d.items[d.i];
    const li = el("div", "mcq");
    const hd = el("div", "qhead"); hd.append(chips(q.classes)); li.append(hd);
    li.append(el("p", "stem", q.stem));
    const shown = !!d.checked[q.id];
    const opts = el("div", "opts");
    q.options.forEach((o, i) => {
      const L = LETTERS[i];
      const lab = el("label", "opt");
      const r = el("input"); r.type = "radio"; r.name = "drill"; r.value = L; r.checked = d.picks[q.id] === L; r.disabled = shown;
      r.addEventListener("change", () => { d.picks[q.id] = L; });
      lab.append(r, el("span", "ol", L), el("span", "ot", o));
      if (shown) { if (L === q.answer) lab.classList.add("right"); else if (d.picks[q.id] === L) lab.classList.add("wrong"); }
      opts.append(lab);
    });
    li.append(opts);
    const act = el("div", "qact");
    if (!shown) {
      const hint = el("span", "small");
      act.append(button("Check", "primary", () => {
        if (!d.picks[q.id]) { hint.textContent = "Pick an answer first."; return; }
        d.checked[q.id] = true;
        const stats = store.get("drill:stats") || {};
        stats[q.id] = { seen: (stats[q.id]?.seen || 0) + 1, right: d.picks[q.id] === q.answer ? 1 : 0 };
        store.set("drill:stats", stats);
        render();
      }), hint);
    } else {
      li.append(feedback(q, d.picks[q.id]));
      act.append(button(d.i + 1 < d.items.length ? "Next question →" : "See how you did", "primary", () => { d.i++; render(); window.scrollTo({ top: 0 }); }));
    }
    li.append(act);
    main.append(li);
    box.append(main);
  }

  /* ---------- render ---------- */
  async function render() {
    const box = root();
    clearInterval(P.timerTick);
    if (!P.content) {
      box.textContent = "";
      box.append(el("p", "loading", "Opening the practice questions…"));
      try { await loadContent(); }
      catch (e) {
        box.textContent = "";
        const g = el("div", "gate");
        g.append(el("b", null, P.failed === "key" ? "These questions don't open with this link" : "Can't load the practice questions"),
          el("p", null, P.failed === "key" ? "Ask Antonis for the current invitation link." : "Check your internet connection and reload the page."));
        box.append(g);
        return;
      }
    }
    box.textContent = "";
    if (P.view.name === "exam") renderExam(box);
    else if (P.view.name === "drill") renderDrill(box);
    else renderHome(box);
  }

  return {
    init() {
      window.addEventListener("resize", () => { if (P.view.name === "exam" && S.tab === "practise") { clearTimeout(P.rs); P.rs = setTimeout(() => { if (!document.activeElement || document.activeElement.tagName !== "TEXTAREA") render(); }, 250); } });
      document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && P.view.name === "exam" && P.view.tab === "b" && S.tab === "practise") loadAnswers(P.view.id); });
    },
    show() { render(); },
    signedIn() { if (P.view.name === "exam") { const id = P.view.id; P.answersAt.delete(id); loadAnswers(id, true); } },
  };
})();

window.Practise = Practise;   // a top-level const is not a window property; notes.js looks for it there
start();
