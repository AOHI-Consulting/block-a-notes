/* Path: a course as a path of short lessons, class by class (each class a unit), to follow step by step.
   A unit: the class's story (with two questions in it), a lesson per topic (with the frameworks it
   explains and the questions that test it), the class's other frameworks, its open questions, and a
   review of the whole class. The next lesson is marked; later ones can be done earlier ("jump ahead");
   a finished lesson whose items are fading asks to be refreshed. A topic is taught in small steps:
   a few sentences at a time, each followed by a gap to fill; then a hotel scene to recognise it in,
   then the usual mix-up. "Your mistakes" replays what you last got wrong.
   What's done is read from Mem (every answer, anywhere in Study, counts), plus two marks Mem keeps
   for the path (a story read, a review done). Lesson.play plays the lessons. */

const Path = (() => {
  const K = () => Practise.kit, SK = () => Study.kit;
  const { shuffle, words, norm } = Lesson;
  const nameOf = (t) => Today.nameOf(t);
  const short = (t) => String(t).split(/:\s|\s[–—]\s/)[0];
  const chunk = (a, n) => { const out = []; for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n)); return out; };
  const OFFSET = [0, 1, 2, 1, 0, -1, -2, -1];   // the path winds left and right
  const LABEL = { story: "Story", lesson: "Lesson", frameworks: "Frameworks", explain: "Explain it", review: "Review" };
  const ICON = { story: "book", lesson: "star", frameworks: "layers", explain: "pen", review: "trophy" };

  /* ---------- a course as units of lessons ---------- */
  function units(pk) {
    if (pk._units) return pk._units;
    const out = [];
    pk.nums.forEach((n) => {
      const c = pk.classes[n], of = (k) => pk.items.filter((it) => it.kind === k && it.class === n);
      const topics = of("topic"), fws = of("framework"), qs = of("mcq"), prompts = of("prompt");
      const usedF = new Set(), usedQ = new Set(), nodes = [];
      // each framework goes with the first topic that explains it, each question with the topic it tests
      const per = topics.map((t) => {
        const f = fws.filter((x) => !usedF.has(x.id) && (x.links || []).includes(t.id)).slice(0, 2);
        const q = qs.filter((x) => !usedQ.has(x.id) && (x.links || []).includes(t.id)).slice(0, 2);
        f.forEach((x) => usedF.add(x.id)); q.forEach((x) => usedQ.add(x.id));
        return { t, f, q };
      });
      if (c.story?.length) {
        const free = qs.filter((x) => !usedQ.has(x.id));
        nodes.push({ id: "c" + n + "-story", kind: "story", n, title: "The story", flag: true, items: [], qs: (free.length >= 2 ? free : qs).slice(0, 2) });
      }
      per.forEach((x, k) => nodes.push({
        id: "c" + n + "-l" + (k + 1), kind: "lesson", n, num: k + 1, title: short(x.t.title), parts: [x],
        items: [x.t.id, ...x.f.map((f) => f.id), ...x.q.map((q) => q.id)],
      }));
      const rest = fws.filter((x) => !usedF.has(x.id)), fc = chunk(rest, 5);
      fc.forEach((g, k) => nodes.push({ id: "c" + n + "-f" + (k + 1), kind: "frameworks", n, title: "Frameworks" + (fc.length > 1 ? " " + (k + 1) : ""), fws: g, items: g.map((f) => f.id) }));
      if (prompts.length) nodes.push({ id: "c" + n + "-explain", kind: "explain", n, title: "Explain it", prompts, items: prompts.map((p) => p.id) });
      if (topics.length + fws.length + qs.length >= 4) nodes.push({ id: "c" + n + "-review", kind: "review", n, title: SK().unit(pk) + " review", flag: true, items: [...topics, ...fws, ...qs].map((x) => x.id) });
      if (nodes.length) out.push({ n, name: c.name, line: c.line, nodes });
    });
    // frameworks of no class (some of LDD's): a last unit of their own
    const general = pk.items.filter((it) => it.kind === "framework" && !pk.classes[it.class]);
    if (general.length) {
      const gc = chunk(general, 5);
      out.push({ n: 0, name: "Frameworks of the whole course", line: "The ones no single class owns.",
        nodes: gc.map((g, k) => ({ id: "g-f" + (k + 1), kind: "frameworks", n: 0, title: "Frameworks" + (gc.length > 1 ? " " + (k + 1) : ""), fws: g, items: g.map((f) => f.id) })) });
    }
    pk._units = out;
    return out;
  }
  const allNodes = (pk) => units(pk).flatMap((u) => u.nodes);

  // done, how far, fading; the current node is the first one not done
  function status(course, nd) {
    const total = nd.items.length, seen = nd.items.filter((id) => Mem.get(course, id)).length;
    const done = nd.flag ? Mem.flagged(course, nd.id) : total > 0 && seen === total;
    let fading = false;
    if (done && !nd.flag && total) {
      const r = nd.items.map((id) => Mem.recall(course, id)).filter((x) => x != null);
      fading = r.length && r.reduce((a, b) => a + b, 0) / r.length < Today.FADING;
    }
    return { done, seen, total, part: nd.flag ? (done ? 1 : 0) : total ? seen / total : 0, fading };
  }
  function current(course, pk) { return allNodes(pk).find((nd) => !status(course, nd).done) || null; }

  /* ---------- exercises from the course's own material ---------- */
  const base = (c, pk, it) => ({ course: c, pk, it, items: [{ course: c, id: it.id }] });
  const learnEx = (c, pk, it) => ({ type: "learn", ...base(c, pk, it), retryable: false });
  const sayEx = (c, pk, t) => ({ type: "say", ...base(c, pk, t), retryable: false });
  const mcqEx = (c, pk, q) => ({ type: "mcq", ...base(c, pk, q) });
  function pickEx(c, pk, f) { const p = Today.pickOf(pk, f); return p ? { type: "pick", ...base(c, pk, f), pick: p } : null; }
  function typeEx(c, pk, f) {
    const name = nameOf(f.title), cue = Today.cue(f);
    if (!cue || words(name).length > 4 || name.length > 36) return null;
    const alt = (String(f.title).match(/\(([^)]+)\)\s*$/) || [])[1];
    return { type: "type", ...base(c, pk, f), cue, answer: name, alt: alt ? [alt] : [] };
  }
  // the summary with its own name's words as "…", shortened to a line
  function cueText(f) {
    const cue = Today.cue(f); if (!cue) return null;
    let t = cue.map((p) => (p === null ? "…" : p)).join("").replace(/(…\s*)+/g, "… ").replace(/\s+/g, " ").trim();
    const w = words(t);
    if (w.length > 16) t = w.slice(0, 15).join(" ").replace(/[,;:]$/, "") + "…";
    return t;
  }
  function matchEx(c, pk, fws) {
    const seen = new Set(), pairs = [];
    fws.forEach((f) => {
      const name = nameOf(f.title), text = cueText(f);
      if (!text || seen.has(norm(name))) return;
      seen.add(norm(name)); pairs.push({ id: f.id, name, text });
    });
    if (pairs.length < 3) return null;
    const p = pairs.slice(0, 5);
    return { type: "match", course: c, pk, pairs: p, items: p.map((x) => ({ course: c, id: x.id })), retryable: false, n: fws[0].class };
  }
  // sentences: a full stop (or ? or !) then a space and a capital; "e.g. " and decimals don't end one
  function sentences(text) {
    const out = [];
    String(text || "").split(/(?<=[.!?]["”’)*]*)\s+(?=(?:\*\*)?["“‘(]?[A-Z0-9])/).forEach((s) => {
      if (out.length && /\b(?:e\.g|i\.e|vs|etc|cf|approx|pp?|no)\.$/i.test(out[out.length - 1])) out[out.length - 1] += " " + s;
      else out.push(s);
    });
    return out.map((s) => s.trim()).filter(Boolean);
  }
  // a topic's plain words in parts of about 70 words (whole sentences), so each fits a phone screen
  function parts(text) {
    const ss = sentences(text), total = words(text).length, n = Math.max(1, Math.ceil(total / 70)), target = total / n;
    const out = []; let cur = [], len = 0;
    ss.forEach((s) => {
      const w = words(s).length;
      if (cur.length && out.length < n - 1 && Math.abs(len + w - target) > Math.abs(len - target)) { out.push(cur.join(" ")); cur = []; len = 0; }
      cur.push(s); len += w;
    });
    if (cur.length) out.push(cur.join(" "));
    return out;
  }
  // the key terms of the course (the bold ones in the topics), for the gaps' other tiles
  function terms(pk) {
    if (pk._terms) return pk._terms;
    const out = [];
    pk.items.forEach((it) => { if (it.kind === "topic" && it.x?.plain) for (const m of it.x.plain.matchAll(/\*\*(.+?)\*\*/g)) if (words(m[1]).length <= 5) out.push({ term: m[1], class: it.class }); });
    return (pk._terms = out);
  }
  // a part with no bold of its own: the course's key terms that it uses, marked as if they were
  function boldKnown(pk, text) {
    // multi-word terms and coined ones (GenAI, B2B): a single plain word ("meaning") makes a poor gap
    const known = [...new Set(terms(pk).map((x) => x.term).filter((x) => x.length >= 5 && (words(x).length >= 2 || /[A-Z\d]/.test(x.slice(1)))))].sort((a, b) => b.length - a.length);
    let segs = text.split(/(\*\*.+?\*\*)/).filter(Boolean);
    for (const k of known) {
      const re = new RegExp("(^|[^\\p{L}])(" + k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")(?![\\p{L}])", "iu");
      // only outside what is already marked
      const i = segs.findIndex((x) => !/^\*\*/.test(x) && re.test(x));
      if (i < 0) continue;
      const m = re.exec(segs[i]), at = m.index + m[1].length;
      segs.splice(i, 1, segs[i].slice(0, at), "**" + m[2] + "**", segs[i].slice(at + m[2].length));
    }
    return segs.join("");
  }

  // a sentence from the topic with up to three of its bold key terms as gaps, and tiles to fill them
  function clozeEx(c, pk, t, text) {
    const plain = text || t.x?.plain; if (!plain) return null;
    const sents = sentences(plain);
    // one sentence, or two that follow each other when the first is short: as many key terms as fit
    const spans = sents.flatMap((s, i) => (i + 1 < sents.length && words(s).length < 22 ? [s, s + " " + sents[i + 1]] : [s]));
    // the topic's own concepts make the best gaps; a name in the middle of a sentence (a person, a
    // company) makes a weak one
    const title = norm(t.title).split(" ").filter((w) => w.length > 3);
    const worth = (x, s) => {
      let v = 1;
      if (/^[A-Z][\w'’-]+$/.test(x) && s.indexOf("**" + x) > 0) v = 0.4;
      if (title.some((w) => norm(x).includes(w))) v += 0.8;
      return v;
    };
    let best = null;
    spans.forEach((s) => {
      const ks = [...s.matchAll(/\*\*(.+?)\*\*/g)].map((m) => m[1]).filter((x) => words(x).length <= 5);
      const n = words(s.replace(/\*\*/g, "")).length;
      if (!ks.length || n < 7 || n > 50) return;
      const score = ks.slice(0, 3).reduce((a, x) => a + worth(x, s), 0) * 10 - Math.abs(n - 26) / 4;
      if (!best || score > best.score) best = { s, score };
    });
    if (!best) return null;
    const answers = [], parts = [];
    best.s.split(/(\*\*.+?\*\*)/).forEach((seg) => {
      const m = /^\*\*(.+)\*\*$/.exec(seg);
      if (m && words(m[1]).length <= 5 && answers.length < 3 && !answers.some((a) => norm(a) === norm(m[1]))) { parts.push({ k: answers.length }); answers.push(m[1]); }
      else if (seg) parts.push(seg);
    });
    const avg = answers.reduce((s, a) => s + words(a).length, 0) / answers.length;
    const clash = (x) => answers.some((a) => { const p = norm(a), q = norm(x); return p === q || p.includes(q) || q.includes(p); });
    const pool = terms(pk).filter((x) => !clash(x.term) && Math.abs(words(x.term).length - avg) <= 1.5);
    const picks = [];
    for (const x of [...shuffle(pool.filter((y) => y.class === t.class)), ...shuffle(pool.filter((y) => y.class !== t.class))]) {
      if (picks.length >= Math.max(2, 5 - answers.length)) break;
      if (!picks.some((p) => norm(p) === norm(x.term))) picks.push(x.term);
    }
    if (picks.length < 2) return null;
    return { type: "cloze", ...base(c, pk, t), parts, answers, tiles: shuffle([...answers, ...picks]), full: best.s };
  }
  // a hotel scene from the topic: which idea is at work? The other options are topics you've had
  // (then others from the same class, then the rest of the course)
  function sceneEx(c, pk, t) {
    const hotel = t.x?.hotel; if (!hotel) return null;
    const others = pk.items.filter((x) => x.kind === "topic" && x.id !== t.id && norm(x.title) !== norm(t.title));
    const seen = shuffle(others.filter((x) => Mem.get(c, x.id))), near = shuffle(others.filter((x) => !Mem.get(c, x.id) && x.class === t.class));
    const rest = shuffle(others.filter((x) => !Mem.get(c, x.id) && x.class !== t.class));
    const pick = [...seen.filter((x) => x.class === t.class), ...seen.filter((x) => x.class !== t.class), ...near, ...rest].slice(0, 3);
    if (pick.length < 2) return null;
    const options = shuffle([t, ...pick]);
    // the opening of the scene (whole sentences, about 60 words: room for the options on a phone), with
    // the topic's own words blanked so it doesn't name itself; the whole scene shows once you've answered
    const ss = sentences(hotel), open = [];
    for (const x of ss) { if (open.length >= 2 && words(open.join(" ")).length + words(x).length > 62) break; open.push(x); }
    const cue = Today.cue({ title: t.title, gist: open.join(" ") });
    if (!cue) return null;
    return { type: "scene", ...base(c, pk, t), hotel, cue, more: open.length < ss.length, options: options.map((x) => x.title), answer: options.indexOf(t) };
  }
  // a new topic in small steps: its plain words a part at a time, each with a gap or two to fill
  // straight after; then a hotel scene to recognise it in; then the usual mix-up. Reading counts as
  // one card for your run, not one per part.
  function teachSteps(c, pk, t) {
    const x = t.x;
    if (!x?.plain) return [{ ...learnEx(c, pk, t), tick: true }];   // a topic with only our notes: one card, as before
    const ps = parts(x.plain), steps = [];
    ps.forEach((text, k) => {
      steps.push({ type: "read", ...base(c, pk, t), items: [], part: "plain", text, k, n: ps.length, retryable: false });
      const cz = clozeEx(c, pk, t, text) || clozeEx(c, pk, t, boldKnown(pk, text)); if (cz) steps.push(cz);
    });
    const sc = sceneEx(c, pk, t);
    if (sc) steps.push(sc);
    else if (x.hotel) steps.push({ type: "read", ...base(c, pk, t), items: [], part: "hotel", text: x.hotel, retryable: false });
    steps.push({ type: "read", ...base(c, pk, t), items: [], part: x.mixup ? "mixup" : "end", text: x.mixup || "", last: true, tick: true, retryable: false });
    return steps;
  }
  // a topic you've had, from one of three sides: fill the gaps, recognise its hotel scene, explain it
  function topicCheck(c, pk, t) {
    const r = Math.random();
    if (r < 0.4) return clozeEx(c, pk, t) || sayEx(c, pk, t);
    if (r < 0.7) return sceneEx(c, pk, t) || sayEx(c, pk, t);
    return sayEx(c, pk, t);
  }
  // what you last got wrong, in this course
  const mistakes = (c, pk) => pk.items.filter((it) => (it.kind === "topic" || it.kind === "framework" || it.kind === "mcq") && Mem.last(c, it.id) === 1).map((it) => it.id);

  // a framework the topic just taught (its name is the topic's title) needs no card of its own
  const taught = (f, t) => norm(nameOf(f.title)) === norm(t.title) || norm(t.title).startsWith(norm(nameOf(f.title)) + " ");

  function lessonSteps(c, pk, nd) {
    const steps = [], later = [];
    nd.parts.forEach(({ t, f, q }) => {
      steps.push(...teachSteps(c, pk, t));
      f.forEach((x) => { if (!taught(x, t)) steps.push(learnEx(c, pk, x)); });
      f.forEach((x) => { const e = pickEx(c, pk, x) || typeEx(c, pk, x); if (e) later.push(e); });
      q.forEach((x) => later.push(mcqEx(c, pk, x)));
    });
    // the checks come after the topic is taught: a little distance helps them stick
    const fwAll = nd.parts.flatMap((p) => p.f), m = fwAll.length >= 3 ? matchEx(c, pk, fwAll) : null;
    const rest = m ? later.filter((e) => e.type !== "pick" && e.type !== "type") : later;
    steps.push(...shuffle(rest));
    if (m) steps.push(m);
    if (nd.parts.length) steps.push(sayEx(c, pk, nd.parts[0].t));
    return steps.filter(Boolean);
  }
  function frameworkSteps(c, pk, fws) {
    const steps = fws.map((f) => learnEx(c, pk, f));
    const m = matchEx(c, pk, fws);
    if (m) steps.push(m);
    const quiz = shuffle(fws).map((f, i) => (i % 2 ? typeEx(c, pk, f) || pickEx(c, pk, f) : pickEx(c, pk, f) || typeEx(c, pk, f))).filter(Boolean);
    steps.push(...quiz.slice(0, m ? 3 : 5));
    return steps;
  }
  // practise what you've had: a mix that asks for each item from a side you can answer without reading first
  function practiceSteps(c, pk, ids, size = 10) {
    const items = ids.map((id) => pk.items.find((it) => it.id === id)).filter(Boolean);
    // weakest first, some randomness
    const weak = items.map((it) => [Mem.recall(c, it.id) ?? 0, Math.random() * 0.15, it]).sort((a, b) => a[0] + a[1] - (b[0] + b[1])).map((x) => x[2]);
    const out = [], fwSeen = [];
    for (const it of weak) {
      if (out.length >= size) break;
      if (it.kind === "topic") out.push(topicCheck(c, pk, it));
      else if (it.kind === "mcq") out.push(mcqEx(c, pk, it));
      else if (it.kind === "framework") { fwSeen.push(it); if (fwSeen.length <= 2) out.push(Math.random() < 0.5 ? typeEx(c, pk, it) || pickEx(c, pk, it) : pickEx(c, pk, it) || typeEx(c, pk, it)); }
    }
    const more = fwSeen.slice(2);
    if (more.length >= 3) out.push(matchEx(c, pk, more));
    return spread(out.filter(Boolean));
  }
  // no two of a kind in a row, where it can be helped
  function spread(list) {
    const out = [], pool = shuffle(list);
    while (pool.length) {
      const k = pool.findIndex((e) => e.type !== out[out.length - 1]?.type);
      out.push(pool.splice(k < 0 ? 0 : k, 1)[0]);
    }
    return out;
  }
  function stepsFor(c, pk, nd, again) {
    if (nd.kind === "story") return [{ type: "story", course: c, pk, n: nd.n, paras: pk.classes[nd.n].story, qs: nd.qs, items: [], retryable: false }];
    if (nd.kind === "explain") return nd.prompts.map((q) => ({ type: "explain", ...base(c, pk, q), n: nd.n, i: pk.classes[nd.n].likely.findIndex((x) => x.id === q.id), retryable: false }));
    if (nd.kind === "review") return practiceSteps(c, pk, nd.items, 12);
    if (again) return practiceSteps(c, pk, nd.items, 8);
    return nd.kind === "lesson" ? lessonSteps(c, pk, nd) : frameworkSteps(c, pk, nd.fws);
  }
  const minutes = (nd) => Math.max(2, Math.round(({ story: 3, explain: 6 * (nd.prompts?.length || 1), review: 5, lesson: 2.5 + (nd.items.length - 1) * 0.4 }[nd.kind]) || nd.items.length * 0.5 + 1));

  /* ---------- the path on screen ---------- */
  function render(w, { course, pk, meta, justDone }) {
    const crs = pk.course, us = units(pk), cur = current(course, pk);
    const hero = el("section", "pa-hero");
    hero.append(SK().crumbs("#/study", "All courses"), el("p", "kicker", [crs.code, crs.lecturer].filter(Boolean).join(" · ")), el("h1", null, crs.full || crs.name));
    if (crs.note) hero.append(el("p", "small st-note", crs.note));
    // where you stand: known, fading, your run
    const sm = Mem.summary(course), run = Today.run(Mem.days(), Mem.today()), all = allNodes(pk), done = all.filter((nd) => status(course, nd).done).length;
    const strip = el("div", "pa-strip");
    const stat = (ic, v, l, cls) => { const s = el("div", "pa-stat " + (cls || "")); s.append(K().icon(ic), el("b", null, v), el("span", null, l)); strip.append(s); };
    stat("star", done + "/" + all.length, "lessons", "done");
    stat("check", sm.known + "/" + meta.items, "known", "known");
    if (sm.fading) stat("reset", String(sm.fading), "fading", "fading");
    stat("bolt", String(run.count), run.count === 1 ? "day run" : "day run", run.today ? "run on" : "run");
    const tools = el("div", "pa-tools");
    tools.append(SK().link("Today's session", "#/study/today", "small", "play"));
    const miss = mistakes(course, pk).length;
    if (miss) { const m = SK().link("Your mistakes", "#/study/" + course + "/l/mistakes", "small pa-miss", "reset"); m.append(el("b", null, String(miss))); m.title = miss + (miss === 1 ? " thing" : " things") + " you last got wrong: one more go"; tools.append(m); }
    if (pk.frameworks.length) tools.append(SK().link("Framework flashcards", "#/study/" + course + "/cards", "small", "layers"));
    hero.append(strip, tools);
    w.append(hero);
    const page = el("div", "st-page");
    SK().findBox(w, [course], page);
    const path = el("div", "pa");
    let curEl = null, justEl = null;
    us.forEach((u) => {
      const sec = el("section", "pa-unit");
      sec.style.setProperty("--cc", u.n ? SK().color(u.n, pk) : "var(--c9)");
      const ban = el("header", "pa-banner"), bt = el("div", "pa-bt");
      const doneN = u.nodes.filter((nd) => status(course, nd).done).length;
      bt.append(el("p", "pa-k", (u.n ? SK().unit(pk) + " " + u.n : "The whole course") + " · " + doneN + "/" + u.nodes.length), el("h2", null, u.name));
      if (u.line) { const ln = el("p", "pa-line", u.line); ln.addEventListener("click", () => ln.classList.toggle("open")); bt.append(ln); }   // shortened on a phone: tap for all of it
      ban.append(bt);
      if (u.n) ban.append(SK().link("Class notes", "#/study/" + course + "/c" + u.n, "small pa-notes", "book"));
      const unitDone = doneN === u.nodes.length;
      if (unitDone) { sec.classList.add("complete"); const b = el("span", "pa-badge"); b.append(K().icon("check"), document.createTextNode("Complete")); bt.prepend(b); }
      sec.append(ban);
      const ol = el("ol", "pa-nodes");
      u.nodes.forEach((nd, k) => {
        const st = status(course, nd), isCur = cur && nd.id === cur.id;
        const after = !st.done && !isCur && cur && all.indexOf(nd) > all.indexOf(cur);
        const li = el("li", "pa-node " + (st.done ? (st.fading ? "done fading" : "done") : isCur ? "current" : after ? "ahead" : "open") + " k-" + nd.kind);
        li.style.setProperty("--dx", OFFSET[k % OFFSET.length]);
        const spot = el("div", "pa-spot"), b = el("button", "pa-btn"); b.type = "button";
        b.setAttribute("aria-label", LABEL[nd.kind] + ": " + nd.title + (st.done ? ", done" : isCur ? ", up next" : ""));
        if (st.part > 0 && st.part < 1) {   // a ring shows how far you got
          const NS = "http://www.w3.org/2000/svg", svg = document.createElementNS(NS, "svg"), ci = document.createElementNS(NS, "circle");
          svg.setAttribute("viewBox", "0 0 100 100"); svg.setAttribute("class", "pa-ring"); svg.setAttribute("aria-hidden", "true");
          ci.setAttribute("cx", "50"); ci.setAttribute("cy", "50"); ci.setAttribute("r", "46"); ci.setAttribute("pathLength", "100");
          ci.setAttribute("stroke-dasharray", Math.round(st.part * 100) + " 100");
          svg.append(ci); spot.append(svg);
        }
        b.append(K().icon(st.done && !st.fading ? "check" : st.fading ? "reset" : ICON[nd.kind]));
        spot.append(b);
        if (isCur) { spot.append(el("span", "pa-tip", st.seen ? "Carry on" : "Start")); curEl = li; }
        spot.append(el("span", "pa-lab", nd.title));   // a lesson: its topic, shortened
        li.append(spot);
        if (justDone === nd.id) { li.classList.add("just"); justEl = li; }
        b.addEventListener("click", (e) => { e.stopPropagation(); popover(li, course, pk, u, nd, st, isCur, after); });
        ol.append(li);
      });
      sec.append(ol);
      path.append(sec);
    });
    if (!us.length) path.append(el("p", "small", "Nothing on this course's path yet."));
    page.append(path);
    SK().syncLine(page);
    // open on where you are: the lesson you just finished, or the next one
    const to = justEl || curEl;
    if (to) requestAnimationFrame(() => {
      const r = to.getBoundingClientRect();
      if (justEl || r.top > innerHeight * 0.8 || r.bottom < 0) to.scrollIntoView({ block: "center", behavior: justEl ? "smooth" : "auto" });
    });
  }

  let openPop = null;
  function closePop() { openPop?.remove(); openPop = null; }
  document.addEventListener("click", (e) => { if (openPop && !openPop.contains(e.target)) closePop(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && openPop) closePop(); });
  function popover(li, course, pk, u, nd, st, isCur, ahead) {
    const was = openPop?.parentElement === li;
    closePop();
    if (was) return;
    const p = el("div", "pa-pop");
    p.append(el("p", "pa-k", LABEL[nd.kind] + (u.n ? " · " + SK().unit(pk) + " " + u.n : "")), el("h3", null, nd.kind === "lesson" ? "Lesson " + nd.num : nd.title));
    const ul = el("ul", "pa-what");
    const add = (t) => ul.append(el("li", null, t));
    if (nd.kind === "lesson") nd.parts.forEach((x) => add(x.t.title));
    else if (nd.kind === "frameworks") nd.fws.forEach((f) => add(nameOf(f.title)));
    else if (nd.kind === "story") add(pk.classes[nd.n].line || "The class, start to finish, with two questions on the way.");
    else if (nd.kind === "explain") nd.prompts.forEach((q) => { const d = el("div"); d.innerHTML = q.ask; add(d.textContent.trim().replace(/^[“"]|[”"]$/g, "")); });   // from our notes
    else add("A mix from the whole " + SK().unit(pk).toLowerCase() + ": what you know least comes first.");
    p.append(ul);
    p.append(el("p", "pa-meta", "About " + minutes(nd) + " min" + (st.done ? st.fading ? " · fading: worth a refresh" : " · done" : st.seen ? " · " + st.seen + " of " + st.total + " seen" : "")));
    const label = st.done ? (st.fading ? "Refresh it" : nd.flag ? "Do it again" : "Practise it") : isCur ? (st.seen ? "Carry on" : "Start") : ahead ? "Jump ahead" : "Start";
    const go = SK().link(label, "#/study/" + course + "/l/" + nd.id, "primary", ahead ? "next" : "play");
    p.append(go);
    if (ahead) p.append(el("p", "small", "The path is a suggested order, not a rule."));
    li.append(p); openPop = p;
    // keep it on screen
    requestAnimationFrame(() => { const r = p.getBoundingClientRect(); if (r.bottom > innerHeight - 10) p.scrollIntoView({ block: "nearest", behavior: "smooth" }); });
    go.focus({ preventScroll: true });
  }

  /* ---------- playing a node ---------- */
  function play(w, { course, pk }, id) {
    const home = "#/study/" + course;
    if (id === "mistakes") return playMistakes(w, course, pk, home);
    const nd = allNodes(pk).find((x) => x.id === id);
    if (!nd) { location.replace(home); return; }
    const st = status(course, nd), again = st.done && !nd.flag;
    const steps = stepsFor(course, pk, nd, again);
    if (!steps.length) { location.replace(nd.n ? home + "/c" + nd.n : home); return; }
    const runBefore = Today.run(Mem.days(), Mem.today()).today;
    const color = nd.n ? SK().color(nd.n, pk) : "var(--c9)";
    const unit = units(pk).find((u) => u.nodes.includes(nd)), unitDone = () => unit.nodes.every((x) => status(course, x).done), wasDone = unitDone();
    Lesson.play(w, {
      color, steps,
      icon: ICON[nd.kind] === "star" ? "trophy" : ICON[nd.kind],
      title: nd.kind === "story" ? "Story done!" : nd.kind === "review" ? SK().unit(pk) + " " + nd.n + " reviewed!" : again ? "Practice done!" : "Lesson complete!",
      end(box) {
        const run = Today.run(Mem.days(), Mem.today());
        if (run.today && !runBefore) box.append(el("p", "ls-runnote", "That's today's study day: your run is now " + run.count + (run.count === 1 ? " day." : " days.")));
        else if (!run.today) box.append(el("p", "ls-runnote", (Today.DAY_MIN - run.cardsToday) + " more cards and today counts for your run."));
        if (nd.flag) Mem.flag(course, nd.id);
        // the last lesson of a class: a moment for the whole class
        if (!wasDone && unitDone()) {
          box.querySelector("h2").textContent = (unit.n ? SK().unit(pk) + " " + unit.n : "The course's frameworks") + " complete!";
          const u = el("div", "ls-unitdone");
          u.append(K().icon("trophy"), el("p", null, "Every lesson of “" + unit.name + "” done. From here it comes back in your daily session as it starts to fade."));
          box.querySelector(".ls-stats")?.after(u);
        }
        const nx = current(course, pk);
        if (nx && nx.id !== nd.id) box.append(el("p", "ls-next", "Up next: " + (nx.n ? SK().unit(pk) + " " + nx.n + " · " : "") + (nx.kind === "lesson" ? "Lesson " + nx.num + ": " + nx.title : nx.title)));
      },
      done() { Study.justDone(nd.id); location.replace(home); },
      exit() { location.replace(home); },
    });
  }

  // what you last got wrong, once more; what you get right drops off the list
  function playMistakes(w, course, pk, home) {
    const ids = mistakes(course, pk);
    if (!ids.length) { location.replace(home); return; }
    const before = ids.length, runBefore = Today.run(Mem.days(), Mem.today()).today;
    Lesson.play(w, {
      color: "var(--gold)", steps: practiceSteps(course, pk, ids, 12), icon: "reset", title: "Mistakes practised!",
      end(box) {
        const left = mistakes(course, pk).length, fixed = Math.max(0, before - left);
        box.append(el("p", "ls-runnote", fixed ? fixed + (fixed === 1 ? " mistake" : " mistakes") + " put right." + (left ? " " + left + " still on the list." : " The list is empty.") : left + " still on the list: they come back here and in your daily session."));
        const run = Today.run(Mem.days(), Mem.today());
        if (run.today && !runBefore) box.append(el("p", "ls-runnote", "That's today's study day: your run is now " + run.count + (run.count === 1 ? " day." : " days.")));
      },
      done() { location.replace(home); },
      exit() { location.replace(home); },
    });
  }

  return { render, play, units, status, current, stepsFor, practiceSteps, teachSteps, topicCheck, sceneEx, clozeEx, matchEx, typeEx, parts, sentences, mistakes };
})();

window.Path = Path;
