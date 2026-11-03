/* Path: a course as a hotel of short lessons, class by class. Each class is a floor (a unit) with its
   rooms: the class's story (with two questions in it), a lesson per topic (with the frameworks it
   explains and the questions that test it), the class's other frameworks, its open questions, and a
   review of the whole class. A room's window lights up once you know it and dims as it fades; the
   next one is marked, and any can be opened early. A topic is taught in small steps: a few sentences
   at a time, with gaps to fill a step later; a hotel scene to recognise it in; the usual mix-up; and
   optionally applying it to your hotel (the case notebook). "Your mistakes" replays what you last got
   wrong, "Refresh" what is fading, and the mix-ups the pairs of ideas you keep confusing.
   What's done is read from Mem (every answer, anywhere in Study, counts), plus two marks Mem keeps
   for the path (a story read, a review done). Lesson.play plays the lessons. */

const Path = (() => {
  const K = () => Practise.kit, SK = () => Study.kit;
  const { shuffle, words, norm } = Lesson;
  const nameOf = (t) => Today.nameOf(t);
  const short = (t) => String(t).split(/:\s|\s[–—]\s/)[0];
  const chunk = (a, n) => { const out = []; for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n)); return out; };

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
      // a room's light is its topic; a set of frameworks fades as a whole
      if (nd.kind === "lesson") { const r = Mem.recall(course, nd.parts[0].t.id); fading = r != null && r < Today.FADING; }
      else { const r = nd.items.map((id) => Mem.recall(course, id)).filter((x) => x != null); fading = r.length && r.reduce((a, b) => a + b, 0) / r.length < Today.FADING; }
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

  // a key term followed by its own abbreviation ("**customer service** (CS)") would give its gap away
  function givesAway(s, term) {
    const m = new RegExp("\\*\\*" + term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\*\\*\\s*\\(([A-Za-z&]{2,6})\\)").exec(s);
    return !!m && (m[1].match(/[A-Z]/g) || []).length >= 2;
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
      const ks = [...s.matchAll(/\*\*(.+?)\*\*/g)].map((m) => m[1]).filter((x) => words(x).length <= 5 && !givesAway(s, x));
      const n = words(s.replace(/\*\*/g, "")).length;
      if (!ks.length || n < 7 || n > 50) return;
      const score = ks.slice(0, 3).reduce((a, x) => a + worth(x, s), 0) * 10 - Math.abs(n - 26) / 4;
      if (!best || score > best.score) best = { s, score };
    });
    if (!best) return null;
    const answers = [], parts = [];
    best.s.split(/(\*\*.+?\*\*)/).forEach((seg) => {
      const m = /^\*\*(.+)\*\*$/.exec(seg);
      if (m && words(m[1]).length <= 5 && answers.length < 3 && !givesAway(best.s, m[1]) && !answers.some((a) => norm(a) === norm(m[1]))) { parts.push({ k: answers.length }); answers.push(m[1]); }
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
    return { type: "scene", ...base(c, pk, t), hotel, cue, more: open.length < ss.length, options: options.map((x) => x.title), ids: options.map((x) => x.id), answer: options.indexOf(t) };
  }
  // a new topic in small steps: its plain words a part at a time, and a hotel scene to recognise it in.
  // Each part's gaps come one step later (after the next part, the last one after the scene), so the
  // words are recalled rather than copied from the screen. Then the usual mix-up. Reading counts as
  // one card for your run, not one per part.
  function teachSteps(c, pk, t) {
    const x = t.x;
    if (!x?.plain) return [{ ...learnEx(c, pk, t), tick: true }];   // a topic with only our notes: one card, as before
    const ps = parts(x.plain), steps = [];
    const gaps = ps.map((text) => clozeEx(c, pk, t, text) || clozeEx(c, pk, t, boldKnown(pk, text)));
    ps.forEach((text, k) => {
      steps.push({ type: "read", ...base(c, pk, t), items: [], part: "plain", text, k, n: ps.length, retryable: false });
      if (k > 0 && gaps[k - 1]) steps.push(gaps[k - 1]);
    });
    const sc = sceneEx(c, pk, t);
    if (sc) steps.push(sc);
    else if (x.hotel) steps.push({ type: "read", ...base(c, pk, t), items: [], part: "hotel", text: x.hotel, retryable: false });
    if (gaps[ps.length - 1]) steps.push(gaps[ps.length - 1]);
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

  // guess first (no score): one of the topic's own questions before it is taught, or its hotel scene.
  // Guessing before you learn helps you remember, even when the guess is wrong; the question comes back
  // later in the lesson, for real.
  function guessEx(c, pk, t, q) {
    if (q) return { type: "mcq", ...base(c, pk, q), items: [], guess: true, retryable: false };
    const sc = sceneEx(c, pk, t);
    return sc ? { ...sc, items: [], guess: true, retryable: false } : null;
  }
  // find it fast: where would you look this topic up? Only in a mix of classes (in a class's own lesson
  // the answer is the floor you're on). Not counted as remembering the topic itself.
  function whereEx(c, pk, t) { const w = Today.whereOf(pk, t); return w ? { type: "where", ...base(c, pk, t), items: [], where: w, retryable: false } : null; }
  function whereFrom(c, pk, topics) {
    if (new Set(topics.map((t) => String(t.class))).size < 2) return null;
    for (const t of shuffle(topics)) { const e = whereEx(c, pk, t); if (e) return e; }
    return null;
  }
  function lessonSteps(c, pk, nd) {
    const steps = [], later = [];
    nd.parts.forEach(({ t, f, q }) => {
      const g = guessEx(c, pk, t, q[0]); if (g) steps.push(g);
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
    // then, optionally, apply it to your hotel (your case notebook), unless you've done so already
    const t0 = nd.parts[0]?.t;
    if (t0 && !store.get("study:apply:off") && !Mem.caseGet(c, t0.id)?.text?.trim()) steps.push({ type: "apply", ...base(c, pk, t0), items: [], retryable: false });
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
    // and one "find it fast", when what you practise spans classes
    const topics = items.filter((it) => it.kind === "topic");
    if (topics.length >= 3) out.push(whereFrom(c, pk, topics));
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

  /* ---------- the course as a hotel ----------
     A class is a floor (the first at street level), a topic a room with a window: lit once you know it,
     dimming as it fades, the next one marked. The crab carries the building. Each floor opens as a
     corridor: the story in the lift lobby, a room per topic, the library for frameworks, the rooftop
     for explaining and the review. Any door opens; the order is a suggestion. */
  const ROOMNAME = { story: "Lift lobby", frameworks: "Library", explain: "Rooftop", review: "Rooftop" };
  const roomNo = (u, nd) => (nd.kind === "lesson" ? String(u.n * 100 + nd.num) : "");
  const whereIn = (u, nd) => (nd.kind === "lesson" ? "Room " + roomNo(u, nd) : ROOMNAME[nd.kind]);
  const nodeTitle = (pk, nd) => (nd.kind === "lesson" ? nd.title : nd.kind === "story" ? "The story" : nd.kind === "explain" ? "Explain it" : nd.kind === "review" ? SK().unit(pk) + " review" : nd.title);
  const lessonsOf = (u) => { const ls = u.nodes.filter((nd) => nd.kind === "lesson"); return ls.length ? ls : u.nodes; };
  function windowsOf(course, u, cur) {
    return lessonsOf(u).map((nd) => { const st = status(course, nd); return st.done ? (st.fading ? "D" : "L") : cur && nd.id === cur.id ? "C" : st.part > 0 ? "P" : "-"; }).join("");
  }
  function roomsLit(course, list) {
    let rooms = 0, lit = 0, dim = 0;
    list.forEach((u) => lessonsOf(u).forEach((nd) => { rooms++; const st = status(course, nd); if (st.done) { lit++; if (st.fading) dim++; } }));
    return { rooms, lit, dim };
  }
  const litLine = (c) => c.lit + " of " + c.rooms + (c.rooms === 1 ? " room" : " rooms") + " lit" + (c.dim ? " · " + c.dim + " dimming" : "");
  // what is fading in a course, for a refresh
  const KINDS = new Set(["topic", "framework", "mcq"]);
  const fadingIds = (c, pk) => pk.items.filter((it) => KINDS.has(it.kind) && Mem.get(c, it.id) && Mem.recall(c, it.id) < Today.FADING).map((it) => it.id);
  const inClass = (it, n) => String(it.class) === String(n) || (it.classes || []).map(String).includes(String(n));

  /* ---------- room keys ----------
     "Lit" means you've learnt a room; its key means you own it: you'll remember its topic for three
     weeks or more (memory stability of 21 days or more, last answer good). It takes a few good answers
     spread over a couple of weeks, or remembering it after a long gap. Keys stay earned: forgetting later
     dims the window, it doesn't take the key back. Kept as marks on the path (key:<topic id>), so they sync. */
  const KEY_DAYS = 21;
  const holds = (c, id) => { const st = Mem.get(c, id); return !!st && st.s >= KEY_DAYS && st.g >= 3; };
  function claimKeys(c, pk) {
    const out = [];
    units(pk).forEach((u) => u.nodes.forEach((nd) => {
      if (nd.kind !== "lesson") return;
      const id = nd.parts[0].t.id, k = "key:" + id;
      if (Mem.flagged(c, k)) out.push(id);
      else if (holds(c, id)) { Mem.flag(c, k); out.push(id); }
    }));
    return out;
  }
  function roomOf(pk, id) {
    for (const u of units(pk)) for (const nd of u.nodes) if (nd.kind === "lesson" && nd.parts[0].t.id === id) return { no: roomNo(u, nd), n: u.n, title: nd.title };
    return null;
  }

  /* ---------- renovation ----------
     A floor with two or more dimming rooms gets scaffolding, and a renovation: a few minutes on what is
     fading in that class. When it's done the scaffolding comes down. Only one floor at a time (the one
     with most rooms dimming), so a hotel you come back to after a while has one job, not a list. */
  const RENO_AT = 2;
  const dimOn = (c, u) => lessonsOf(u).filter((nd) => { const st = status(c, nd); return st.done && st.fading; }).length;
  function renoFloor(c, pk) {
    let best = null, most = RENO_AT - 1;
    units(pk).forEach((u) => { if (!u.n) return; const d = dimOn(c, u); if (d > most) { best = u; most = d; } });
    return best;
  }
  const needsReno = (c, u, pk) => !!u.n && renoFloor(c, pk)?.n === u.n;
  const floorFading = (c, pk, n) => fadingIds(c, pk).filter((id) => inClass(itemOf(pk, id), n));
  function renoPlan(c, pk, u) {
    const topics = lessonsOf(u).filter((nd) => { const st = status(c, nd); return st.done && st.fading; }).map((nd) => nd.parts[0].t.id);
    const rest = floorFading(c, pk, u.n).filter((id) => !topics.includes(id));
    const more = Math.min(rest.length, Math.max(3, 10 - topics.length));
    return { topics, rest, more, mins: Math.max(2, Math.round((topics.length + more) * 0.5)) };
  }

  // a class held this past week (its floor is new), and the classes still to come (floors under construction)
  function freshClass(pk, meta, n) {
    const d = pk.classes[n]?.date || (meta?.schedule || []).find((x) => +x.n === +n)?.date;
    if (!d) return false;
    const ago = SK().tnum() - SK().dnum(d);
    return ago >= 0 && ago <= 7;
  }
  const plannedOf = (pk, meta) => SK().classesOf(meta).filter((k) => k.date && !pk.nums.includes(k.n));
  function render(w, { course, pk, meta, justDone }) {
    const crs = pk.course, us = units(pk), floors = us.filter((u) => u.n), cur = current(course, pk), U = SK().unit(pk);
    const planned = plannedOf(pk, meta);
    const run = Today.run(Mem.days(), Mem.today()), c = roomsLit(course, floors), keys = new Set(claimKeys(course, pk));
    const reno = /^renovate-(\d+)$/.exec(justDone || "")?.[1];
    const head = el("section", "ho-head");
    head.append(SK().crumbs("#/study", "All courses"), el("p", "kicker", [crs.code, crs.lecturer].filter(Boolean).join(" · ")), el("h1", null, crs.full || crs.name), el("p", "ho-sum", litLine(c)));
    if (crs.note) head.append(el("p", "small st-note", crs.note));
    if (run.welcome && c.dim) head.append(el("p", "ho-back", "Welcome back. Some lights dimmed while you were away: that's how memory works, and what you bring back after a gap stays longer."));
    w.append(head);
    const page = el("div", "ho-page");
    // the building
    const left = el("div", "ho-left"), bld = el("div", "ho-bld");
    bld.innerHTML = Crab.hotel({
      code: crs.code || "", mood: run.today ? "happy" : "idle", sky: Crab.skyAt(), lights: Crab.seasonAt() === "lights",
      label: (crs.code || crs.name) + " as a hotel: a floor per " + U.toLowerCase() + ", a window per topic. " + litLine(c) + (keys.size ? ", " + keys.size + (keys.size === 1 ? " key" : " keys") : "") + ".",
      floors: [...floors.map((u) => {
        const fc = roomsLit(course, [u]), ls = lessonsOf(u), j = justDone ? ls.findIndex((nd) => nd.id === justDone) : -1, rn = needsReno(course, u, pk);
        const ks = ls.map((nd, i) => (nd.kind === "lesson" && keys.has(nd.parts[0].t.id) ? i : -1)).filter((i) => i >= 0);
        return { n: u.n, windows: windowsOf(course, u, cur), href: "#/study/" + course + "/f/" + u.n, just: j, keys: ks, fresh: freshClass(pk, meta, u.n),
          scaffold: rn, unscaffold: !rn && reno === String(u.n), done: u.nodes.every((nd) => status(course, nd).done),
          aria: "Floor " + u.n + ", " + U + " " + u.n + ": " + u.name + ". " + litLine(fc) + (rn ? ". Scaffolding up: it needs a renovation" : "") };
      }), ...planned.map((k) => ({ n: k.n, planned: true, date: SK().shortDate(k.date).toUpperCase() }))].sort((a, b) => a.n - b.n),
    });
    const key = el("div", "ho-key");
    [["lit", "you know it"], ["dim", "dimming"], ["dark", "not yet"], ...(keys.size ? [["gold", "your key"]] : [])].forEach(([k, t]) => { const s = el("span", k); s.append(el("i"), document.createTextNode(t)); key.append(s); });
    left.append(bld, key, el("p", "small ho-tap", "Tap a floor to walk in."));
    page.append(left);
    // what to do next, and the floors
    const side = el("div", "ho-side");
    side.append(nextCard(course, pk, cur, planned));
    const acts = el("div", "ho-acts"), fade = fadingIds(course, pk).length, mixes = mixList(course, pk).length, miss = mistakes(course, pk).length;
    const rf = renoFloor(course, pk);
    if (rf) acts.append(act("Renovate floor " + rf.n, "#/study/" + course + "/l/renovate-" + rf.n, "gold", "wrench", dimOn(course, rf) + " rooms dimming on floor " + rf.n + ": a few minutes brings them back"));
    else if (fade) acts.append(act("Refresh · " + refreshMins(fade) + " min", "#/study/" + course + "/l/refresh", "gold", "sun", "Some of what you learnt is fading: a few minutes brings it back"));
    const letter = Inbox.deliver(course, pk);
    if (letter) acts.append(act("A message from the GM", "#/study/" + course + "/inbox", "acc", "mail", "“" + letter.title + "”: your rooms can help"));
    if (mixes) acts.append(act(mixes === 1 ? "1 mix-up" : mixes + " mix-ups", "#/study/" + course + "/l/mixups", "coral", "swap", "Ideas you keep confusing: tell them apart"));
    if (miss) acts.append(act("Your mistakes " + miss, "#/study/" + course + "/l/mistakes", "plain", "reset", "What you last got wrong: one more go"));
    if (acts.children.length) side.append(acts);
    side.append(keyRing(keys, c.rooms));
    const list = el("section", "ho-floors");
    list.append(el("h2", "ho-h", "Floors"));
    floors.forEach((u) => list.append(floorRow(course, pk, u, keys, freshClass(pk, meta, u.n))));
    planned.forEach((k) => {
      const r = el("div", "ho-floor planned"), n = el("span", "ho-fn", String(k.n)), t = el("span", "ho-ft");
      t.append(el("b", null, U + " " + k.n + (k.label ? " · " + k.label : "")), el("small", null, SK().shortDate(k.date) + (k.time ? ", " + k.time : "") + " · opens after the class"));
      r.append(n, t); list.append(r);
    });
    const gen = us.find((u) => !u.n);
    if (gen) { const a = el("a", "ho-floor lib"); a.href = "#/study/" + course + "/f/0"; const m = el("span", "ho-fn"); m.append(K().icon("layers")); const t = el("span", "ho-ft"); t.append(el("b", null, "The library"), el("small", null, gen.name)); a.append(m, t, K().icon("next")); list.append(a); }
    side.append(list);
    // the rest: your notebook, flashcards, and a course's own extras (LDD's exam room)
    const more = el("div", "ho-more");
    const nb = Mem.caseAll(course).length;
    more.append(SK().link("Case notebook" + (nb ? " · " + nb : ""), "#/study/" + course + "/case", "small", "pen"), SK().link("Your index", "#/study/" + course + "/index", "small", "search"));
    if (Inbox.has(pk)) more.append(SK().link("The GM's inbox", "#/study/" + course + "/inbox", "small", "mail"));
    if (pk.frameworks.length) more.append(SK().link("Framework flashcards", "#/study/" + course + "/cards", "small", "layers"));
    side.append(more);
    const tt = SK().timetable(meta, pk); if (tt) side.append(tt);
    if (crs.exam?.practise || crs.slides) {
      const ex = el("div", "ho-extra");
      ex.append(el("p", "kicker", (crs.code || "This course") + "'s exam room"));
      const b = el("div", "btns");
      if (crs.exam?.practise) b.append(SK().link("Practice exams", "#/practise", "small ghost", "doc"));
      b.append(SK().link("Topics", "#/topics", "small ghost", "search"));
      if (crs.slides) b.append(SK().link("Slides and book", "#/slides", "small ghost", "book"));
      ex.append(b); side.append(ex);
    }
    page.append(side);
    w.append(page);
    SK().syncLine(w);
  }
  function act(text, href, cls, ic, title) { const a = SK().link(text, href, "ho-act " + cls, ic); a.title = title; return a; }
  function nextCard(course, pk, cur, planned = []) {
    const box = el("div", "panel ho-next");
    if (!cur && planned.length) {
      const k = planned[0];
      box.append(el("p", "kicker", "Every open room lit"), el("p", "ho-nt", "The next floor opens after " + SK().unit(pk).toLowerCase() + " " + k.n + ", " + SK().shortDate(k.date) + "."),
        el("p", "small", "Until then, what starts to fade comes back in your daily session."));
      return box;
    }
    if (!cur) {
      box.append(el("p", "kicker", "Every room lit"), el("p", "ho-nt", "You've been through the whole course."),
        el("p", "small", "What starts to fade comes back in your daily session, and you can refresh it here any time."));
      return box;
    }
    const u = units(pk).find((x) => x.nodes.includes(cur)), st = status(course, cur);
    box.style.setProperty("--cc", u.n ? SK().color(u.n, pk) : "var(--c9)");
    box.append(el("p", "kicker ho-k", (u.n ? "Floor " + u.n + " · " : "") + u.name),
      el("p", "ho-nt", "Next: " + (cur.kind === "lesson" ? "room " + roomNo(u, cur) + ", " + cur.title : nodeTitle(pk, cur) + (cur.kind === "story" ? ", in the lift lobby" : cur.kind === "frameworks" ? ", in the library" : ", on the rooftop"))));
    box.append(SK().link((st.seen ? "Carry on" : "Start") + " · " + minutes(cur) + " min", "#/study/" + course + "/l/" + cur.id, "primary ho-go", "play"));
    return box;
  }
  function floorRow(course, pk, u, keys, fresh) {
    const a = el("a", "ho-floor"), fc = roomsLit(course, [u]), done = u.nodes.every((nd) => status(course, nd).done), started = u.nodes.some((nd) => status(course, nd).seen);
    a.href = "#/study/" + course + "/f/" + u.n;
    a.style.setProperty("--cc", SK().color(u.n, pk));
    const n = el("span", "ho-fn", String(u.n)), t = el("span", "ho-ft");
    const nk = lessonsOf(u).filter((nd) => nd.kind === "lesson" && keys.has(nd.parts[0].t.id)).length;
    const line = needsReno(course, u, pk) ? "Scaffolding up · " + fc.dim + " rooms dimming"
      : (done ? (fc.dim ? "Complete · " + fc.dim + " dimming" : "Complete") : started ? litLine(fc) : fc.rooms + (fc.rooms === 1 ? " room" : " rooms") + " · not started") + (nk ? " · " + nk + (nk === 1 ? " key" : " keys") : "");
    t.append(el("b", null, u.name), el("small", needsReno(course, u, pk) ? "reno" : null, line));
    if (fresh) a.classList.add("fresh");
    if (fresh) n.after(el("span", "ho-new", "New"));
    a.append(n, t);
    if (done) { const b = el("span", "ho-done"); b.append(K().icon("check")); a.append(b); }
    a.append(K().icon("next"));
    return a;
  }

  // your keys: the rooms you own
  function keyRing(keys, rooms) {
    const box = el("div", "ho-ring"), row = el("div", "ho-ringk"), t = el("div", "ho-ringt");
    if (keys.size) {
      for (let i = 0; i < Math.min(keys.size, 12); i++) { const k = el("span"); k.innerHTML = Crab.key(); row.append(k); }
      if (keys.size > 12) row.append(el("b", null, "+" + (keys.size - 12)));
      t.append(el("p", "kicker", "Your keys · " + keys.size + " of " + rooms), el("p", "small", "Rooms you'll remember for three weeks or more. They're yours."));
    } else {
      const k = el("span"); k.innerHTML = Crab.key(true); row.append(k);
      t.append(el("p", "kicker", "Your keys"), el("p", "small", "Get a room to stick for three weeks and its key is yours: a few good answers, spread over time."));
    }
    box.append(row, t);
    return box;
  }

  // one floor: its rooms in order, as doors
  function renderFloor(w, { course, pk }, n) {
    const u = units(pk).find((x) => String(x.n) === String(n));
    if (!u) { location.replace("#/study/" + course); return; }
    const crs = pk.course, cur = current(course, pk), U = SK().unit(pk), fc = roomsLit(course, [u]);
    w.style.setProperty("--cc", u.n ? SK().color(u.n, pk) : "var(--c9)");
    const head = el("section", "ho-head ho-fhead");
    head.append(SK().crumbs("#/study/" + course, (crs.code || crs.name) + " hotel"),
      el("p", "kicker ho-k", u.n ? "Floor " + u.n + " · " + U + " " + u.n : "The library"), el("h1", null, u.name));
    if (u.line) head.append(el("p", "ho-line", u.line));
    const row = el("div", "ho-frow");
    row.append(el("p", "ho-sum", u.n ? litLine(fc) : u.nodes.length + " sets of frameworks"));
    if (u.n) row.append(SK().link("Class notes", "#/study/" + course + "/c" + u.n, "small ghost", "book"));
    head.append(row);
    w.append(head);
    if (needsReno(course, u, pk)) {
      const bn = el("div", "panel ho-reno"), ic = el("span", "ho-renoic"), t = el("div", "ho-renot");
      ic.innerHTML = '<svg viewBox="0 0 40 30" aria-hidden="true"><path d="M5 2 V28 M20 2 V28 M35 2 V28" stroke="#2B1B17" stroke-width="3.6" stroke-linecap="round"/><path d="M5 2 V28 M20 2 V28 M35 2 V28" stroke="#B5813A" stroke-width="2" stroke-linecap="round"/><path d="M5 24 L20 6 M20 24 L35 6" stroke="#B5813A" stroke-width="1.4"/><rect x="1" y="5" width="38" height="3.6" rx="1" fill="#E3B062" stroke="#2B1B17" stroke-width=".9"/><rect x="1" y="21" width="38" height="3.6" rx="1" fill="#E3B062" stroke="#2B1B17" stroke-width=".9"/></svg>';
      t.append(el("b", null, "Scaffolding's up: " + dimOn(course, u) + " rooms here are dimming"), el("span", "small", "A short renovation brings them back. The scaffolding comes down when you're done."));
      bn.append(ic, t, SK().link("Renovate · " + renoPlan(course, pk, u).mins + " min", "#/study/" + course + "/l/renovate-" + u.n, "primary ho-go", "wrench"));
      w.append(bn);
    }
    const keys = new Set(claimKeys(course, pk));
    const ol = el("ol", "ho-doors");
    u.nodes.forEach((nd) => {
      const st = status(course, nd), isCur = cur && cur.id === nd.id;
      const li = el("li"), a = el("a", "ho-door" + (isCur ? " cur" : "") + (st.done ? " done" : ""));
      a.href = "#/study/" + course + "/l/" + nd.id;
      const ds = isCur ? "cur" : st.done ? (st.fading ? "dim" : "lit") : st.part > 0 ? "part" : "dark";
      const ic = el("span", "ho-dr"); ic.innerHTML = Crab.door(ds, roomNo(u, nd));
      const t = el("span", "ho-dt");
      t.append(el("small", null, whereIn(u, nd)), el("b", null, nodeTitle(pk, nd)));
      a.append(ic, t);
      const applied = nd.kind === "lesson" && Mem.caseGet(course, nd.parts[0].t.id)?.text?.trim();
      if (applied) { const p = el("span", "ho-pen"); p.title = "In your case notebook"; p.append(K().icon("pen")); a.append(p); }
      const owned = nd.kind === "lesson" && keys.has(nd.parts[0].t.id);
      if (owned) { const k = el("span", "ho-keyic"); k.title = "Your key: you'll remember it for three weeks or more"; k.innerHTML = Crab.key(); a.append(k); }
      if (isCur) a.append(el("span", "ho-pill", st.seen ? "Carry on" : "Start"));
      else a.append(el("span", "ho-st " + (owned && !st.fading ? "key" : ds), st.done ? (st.fading ? "refresh" : owned ? "yours" : nd.flag ? "done" : "lit") : st.part > 0 && !nd.flag ? st.seen + " of " + st.total : minutes(nd) + " min"));
      a.setAttribute("aria-label", whereIn(u, nd) + ": " + nodeTitle(pk, nd) + (isCur ? ", up next" : st.done ? (st.fading ? ", fading" : ", done") : ""));
      li.append(a); ol.append(li);
    });
    w.append(ol, el("p", "small ho-note", "Any door opens: the order is a suggestion."));
  }

  /* ---------- mix-ups: two ideas you keep confusing ----------
     From your own answers (Mem.slip): a round shows the two side by side, then asks you to sort four
     cards (hotel scenes, lines from the topic, summaries, each with both names blanked) into one or the
     other. A round without a miss counts as a day you told them apart; three such days settle it. */
  const itemOf = (pk, id) => pk.items.find((it) => it.id === id);
  const mixList = (c, pk) => Mem.mixups(c).filter((m) => itemOf(pk, m.a) && itemOf(pk, m.b));
  const unbold = (t) => String(t || "").replace(/\*\*/g, "");
  function gistOf(it) {
    if (it.kind !== "topic") return it.gist || "";
    const ss = sentences(unbold(it.x?.plain));
    let out = ss[0] || "";
    if (words(out).length < 14 && ss[1]) out += " " + ss[1];
    return out;
  }
  function mixSteps(c, pk, m) {
    const a = itemOf(pk, m.a), b = itemOf(pk, m.b);
    if (!a || !b) return null;
    const both = nameOf(a.title) + " " + nameOf(b.title);
    const blank = (text) => (text ? Today.cue({ title: both, gist: text }) : null);
    const cuesOf = (it) => {
      const out = [];
      if (it.kind === "topic") {
        const x = it.x || {};
        if (x.hotel) { const ss = sentences(x.hotel), open = []; for (const s of ss) { if (open.length >= 1 && words(open.join(" ")).length + words(s).length > 45) break; open.push(s); } out.push(blank(open.join(" "))); }
        sentences(unbold(x.plain)).filter((s) => words(s).length >= 8 && words(s).length <= 40).slice(0, 4).forEach((s) => out.push(blank(s)));
        if (x.ask?.a) out.push(blank(sentences(unbold(x.ask.a))[0]));
      } else out.push(blank(it.gist));
      return shuffle(out.filter(Boolean));
    };
    const ca = cuesOf(a), cb = cuesOf(b);
    if (!ca.length || !cb.length) return null;
    const raw = [[a, ca[0], 0], [b, cb[0], 1], [a, ca[1], 0], [b, cb[1], 1]].filter((x) => x[1]);
    // the order: never the same answer three times running
    const order = shuffle(raw); for (let i = 2; i < order.length; i++) if (order[i][2] === order[i - 1][2] && order[i][2] === order[i - 2][2]) { const j = order.findIndex((x, k) => k > i && x[2] !== order[i][2]); if (j > 0) [order[i], order[j]] = [order[j], order[i]]; }
    return [
      { type: "contrast", course: c, pk, a, b, ga: gistOf(a), gb: gistOf(b), pair: m.id, items: [], retryable: false },
      ...order.map(([it, cue, side], i) => ({ type: "sort", ...base(c, pk, it), a, b, cue, answer: side, pair: m.id, k: i + 1, of: order.length })),
    ];
  }
  // after a round: the pairs you told apart without a miss (first answers only) get a good day
  function settle(log, pairs) {
    return pairs.map((m) => {
      const firsts = log.filter((l) => l.ex.type === "sort" && l.ex.pair === m.id && !l.ex.retry);
      const ok = firsts.length > 0 && firsts.every((l) => l.g >= 3);
      const days = ok ? Mem.apart(m.id) : (Mem.mixOf(m.id)?.ok || []).length;
      return { m, ok, days };
    });
  }
  function settledLines(box, pk, res) {
    res.forEach(({ m, ok, days }) => {
      const a = itemOf(pk, m.a), b = itemOf(pk, m.b), names = short(a.title) + " and " + short(b.title);
      box.append(el("p", "ls-runnote", ok ? (days >= Mem.APART ? "Apart for good: " + names + " have left your list." : "Told apart today: " + names + " (" + days + " of " + Mem.APART + " days).")
        : "Not quite yet: " + names + " come back another day."));
    });
  }
  function playMixups(w, course, pk, home) {
    const list = mixList(course, pk).slice(0, 3), steps = list.flatMap((m) => mixSteps(course, pk, m) || []);
    if (!steps.length) { location.replace(home); return; }
    Lesson.play(w, {
      color: "var(--coral)", steps, crab: "done", title: list.length === 1 ? "Mix-up practised!" : "Mix-ups practised!",
      end(box, res) { settledLines(box, pk, settle(res.log, list)); },
      done() { location.replace(home); }, exit() { location.replace(home); },
    });
  }
  // a floor's renovation: what is fading in that class, brought back; then the scaffolding comes down
  function playRenovate(w, course, pk, home, n) {
    const u = units(pk).find((x) => x.n === n), plan = u && renoPlan(course, pk, u);
    if (!plan || !(plan.topics.length + plan.rest.length)) { location.replace(u ? home + "/f/" + n : home); return; }
    const steps = spread([...plan.topics.map((id) => topicCheck(course, pk, itemOf(pk, id))), ...(plan.more ? practiceSteps(course, pk, plan.rest, plan.more) : [])].filter(Boolean));
    Lesson.play(w, {
      color: "var(--gold)", steps, title: "Floor " + n + " renovated!",
      end(box) {
        const left = dimOn(course, u);
        box.append(el("p", "ls-runnote", left >= RENO_AT ? left + " rooms still dimming: they come back in your daily session, no rush." : "The scaffolding comes down: “" + u.name + "” is lit again."));
      },
      done() { Study.justDone("renovate-" + n); location.replace(home); }, exit() { location.replace(home); },
    });
  }
  // a warm-up before class n: the class before it. What you know of it, briefly; if you haven't
  // studied it yet, its story (a recap with two questions), or else its first lesson.
  function playWarmup(w, course, pk, home, n) {
    const prev = Math.max(...pk.nums.filter((x) => x < n));
    const u = units(pk).find((x) => x.n === prev);
    if (!u) { location.replace(home); return; }
    const known = pk.items.filter((it) => KINDS.has(it.kind) && inClass(it, prev) && Mem.get(course, it.id)).map((it) => it.id);
    const story = u.nodes.find((nd) => nd.kind === "story"), first = u.nodes.find((nd) => nd.kind === "lesson");
    const useStory = known.length < 3 && !!story;
    const steps = known.length >= 3 ? practiceSteps(course, pk, known, 6) : useStory ? stepsFor(course, pk, story) : first ? stepsFor(course, pk, first) : [];
    if (!steps.length) { location.replace(home); return; }
    Lesson.play(w, {
      color: u.n ? SK().color(u.n, pk) : "var(--accent)", steps, title: "Warmed up!",
      end(box) {
        if (useStory) Mem.flag(course, story.id);
        box.append(el("p", "ls-runnote", SK().unit(pk) + " " + prev + " is fresh again. Enjoy " + SK().unit(pk).toLowerCase() + " " + n + "."));
      },
      done() { location.replace(home); }, exit() { location.replace(home); },
    });
  }
  // what is fading in the course, brought back (ten at most at a time: about five minutes)
  const REFRESH_MAX = 10;
  const refreshMins = (n) => Math.max(2, Math.round(Math.min(n, REFRESH_MAX) * 0.5));
  function playRefresh(w, course, pk, home) {
    const ids = fadingIds(course, pk);
    if (!ids.length) { location.replace(home); return; }
    Lesson.play(w, {
      color: "var(--gold)", steps: practiceSteps(course, pk, ids, REFRESH_MAX), title: "Refreshed!",
      end(box) { const left = fadingIds(course, pk).length; box.append(el("p", "ls-runnote", left ? "The rest comes back a few at a time in your daily session: nothing to catch up on." : "Nothing fading in this course now.")); },
      done() { location.replace(home); }, exit() { location.replace(home); },
    });
  }

  /* ---------- apply it: your case notebook ----------
     After a topic, optionally: how does it show up at your hotel? You write a few lines and tick what
     your answer did (self-marked). A pack can give a topic its own prompt (x.apply, with {hotel}) and
     points (x.applyPoints); otherwise a general one. */
  const hotelOf = (c) => Mem.caseGet(c, "_hotel")?.text?.trim() || "";
  function applyOf(pk, t, hotel) {
    const h = hotel || "your hotel", x = t.x || {};
    const keys = [...new Set([...String(x.plain || "").matchAll(/\*\*(.+?)\*\*/g)].map((m) => m[1]).filter((k) => words(k).length <= 4))].slice(0, 3);
    const q = x.apply ? String(x.apply).replace(/\{hotel\}/g, h) : "Where does “" + short(t.title) + "” show up at " + h + "? Give one real moment, place or process, and say who would own it.";
    const points = Array.isArray(x.applyPoints) && x.applyPoints.length ? x.applyPoints : [
      "Names a real moment, place or process at the hotel",
      keys.length ? "Uses the idea's own words correctly (" + keys.join(", ") + ")" : "Uses the idea's own words correctly",
      "Says who owns it, or who would act",
      "Says what you would change or measure",
    ];
    return { q, points };
  }

  /* ---------- playing a node ---------- */
  function play(w, { course, pk }, id) {
    const home = "#/study/" + course;
    if (id === "mistakes") return playMistakes(w, course, pk, home);
    if (id === "mixups") return playMixups(w, course, pk, home);
    if (id === "refresh") return playRefresh(w, course, pk, home);
    const rn = /^renovate-(\d+)$/.exec(id);
    if (rn) return playRenovate(w, course, pk, home, +rn[1]);
    const wu = /^warmup-(\d+)$/.exec(id);
    if (wu) return playWarmup(w, course, pk, home, +wu[1]);
    const gm = /^gm-(.+)$/.exec(id);
    if (gm) return Inbox.play(w, course, pk, home, gm[1]);
    const nd = allNodes(pk).find((x) => x.id === id);
    if (!nd) { location.replace(home); return; }
    const st = status(course, nd), again = st.done && !nd.flag;
    const steps = stepsFor(course, pk, nd, again);
    if (!steps.length) { location.replace(nd.n ? home + "/c" + nd.n : home); return; }
    const runBefore = Today.run(Mem.days(), Mem.today());
    const color = nd.n ? SK().color(nd.n, pk) : "var(--c9)";
    const unit = units(pk).find((u) => u.nodes.includes(nd)), unitDone = () => unit.nodes.every((x) => status(course, x).done), wasDone = unitDone();
    Lesson.play(w, {
      color, steps,
      title: nd.kind === "story" ? "Story done!" : nd.kind === "review" ? SK().unit(pk) + " " + nd.n + " reviewed!" : again ? "Practice done!" : "Lesson complete!",
      end(box) {
        const rn = Today.endNote(runBefore);
        if (rn) box.append(el("p", "ls-runnote", rn));
        if (nd.flag) Mem.flag(course, nd.id);
        // the last lesson of a class: a moment for the whole class
        if (!wasDone && unitDone()) {
          box.querySelector("h2").textContent = (unit.n ? "Floor " + unit.n : "The library") + " complete!";
          const u = el("div", "ls-unitdone");
          u.append(K().icon("trophy"), el("p", null, "Every room of “" + unit.name + "” is lit. From here it comes back in your daily session as it starts to fade."));
          box.querySelector(".ls-stats")?.after(u);
        }
        const nx = current(course, pk);
        if (nx && nx.id !== nd.id) { const nu = units(pk).find((x) => x.nodes.includes(nx)); box.append(el("p", "ls-next", "Up next: " + (nu.n ? "floor " + nu.n + ", " : "") + whereIn(nu, nx).toLowerCase() + " · " + nodeTitle(pk, nx))); }
      },
      done() { Study.justDone(nd.id); location.replace(home); },
      exit() { location.replace(home); },
    });
  }

  // what you last got wrong, once more; what you get right drops off the list
  function playMistakes(w, course, pk, home) {
    const ids = mistakes(course, pk);
    if (!ids.length) { location.replace(home); return; }
    const before = ids.length, runBefore = Today.run(Mem.days(), Mem.today());
    Lesson.play(w, {
      color: "var(--gold)", steps: practiceSteps(course, pk, ids, 12), title: "Mistakes practised!",
      end(box) {
        const left = mistakes(course, pk).length, fixed = Math.max(0, before - left);
        box.append(el("p", "ls-runnote", fixed ? fixed + (fixed === 1 ? " mistake" : " mistakes") + " put right." + (left ? " " + left + " still on the list." : " The list is empty.") : left + " still on the list: they come back here and in your daily session."));
        const rn = Today.endNote(runBefore);
        if (rn) box.append(el("p", "ls-runnote", rn));
      },
      done() { location.replace(home); },
      exit() { location.replace(home); },
    });
  }

  return { render, renderFloor, play, units, status, current, stepsFor, practiceSteps, teachSteps, topicCheck, sceneEx, clozeEx, matchEx, typeEx, parts, sentences, mistakes,
           mixList, mixSteps, settle, settledLines, applyOf, hotelOf, short, litLine, claimKeys, roomOf, KEY_DAYS, whereFrom,
           lit: (c, pk) => roomsLit(c, units(pk).filter((u) => u.n)) };
})();

window.Path = Path;
