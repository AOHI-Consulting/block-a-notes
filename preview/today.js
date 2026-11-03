/* Today: the daily session and the run, as plain logic (study.js draws them).
   A session is a few minutes of cards from the courses you follow: first what is fading (recall under
   90%, from Mem), then new things from your path through each course, class by class. A new topic is
   read first and explained a few cards later; a new framework is read, then recognised. Cards for what
   is fading change format (flashcard, "which framework is this?", "where would you look it up?") so you
   recall it from a different side each time.
   The run counts the days you study (5 cards or more, on any device). Missing one day is a rest and
   keeps the run; two days in a row start a new one. */

const Today = (() => {
  const DAY_MIN = 5;                    // cards that make a study day
  const FADING = 0.9;                   // recall under this is due again
  // rough seconds per card, to fill the minutes you chose
  const COST = { learn: 110, say: 35, learnFw: 20, flash: 15, pick: 20, where: 15, mcq: 45 };   // learn: a topic's parts, gaps, scene and mix-up
  const STOP = new Set(["and", "the", "for", "with", "from", "into", "about", "your", "what", "vs"]);
  const now = () => Math.floor(Date.now() / 1000);
  const shuffle = (a) => a.map((x) => [Math.random(), x]).sort((p, q) => p[0] - q[0]).map((p) => p[1]);
  const KINDS = new Set(["topic", "framework", "mcq"]);

  /* ---------- the path: what is new, in order ---------- */
  // Class by class. Within a class its topics and frameworks are spread evenly, a topic first (it
  // explains the rest), so a class doesn't end with a long run of one kind. A drill question comes a
  // card after the topic it tests, or at the end of its class. Frameworks of no class come last.
  function path(pack) {
    const by = {}, general = [];
    pack.items.forEach((it) => {
      if (!KINDS.has(it.kind)) return;
      if (!it.class || !pack.classes[it.class]) { if (it.kind === "framework") general.push(it); return; }
      (by[it.class] = by[it.class] || { topic: [], framework: [], mcq: [] })[it.kind].push(it);
    });
    const out = [];
    pack.nums.forEach((n) => {
      const b = by[n]; if (!b) return;
      // a framework never comes before the topic that explains it
      const at = {}; b.topic.forEach((it, i) => (at[it.id] = i / b.topic.length));
      const after = (it, p) => { const t = (it.links || []).filter((id) => id in at).map((id) => at[id]); return t.length ? Math.max(p, Math.min(...t) + 1e-6) : p; };
      const block = [...b.topic.map((it, i) => [i / b.topic.length, 0, it]), ...b.framework.map((it, i) => [after(it, (i + 0.5) / b.framework.length), 1, it])]
        .sort((p, q) => p[0] - q[0] || p[1] - q[1]).map((p) => p[2]);
      const late = [];
      b.mcq.forEach((q) => {
        const k = Math.max(-1, ...(q.links || []).map((id) => block.findIndex((it) => it.id === id && it.kind === "topic")));
        if (k < 0) late.push(q); else block.splice(Math.min(k + 2, block.length), 0, q);
      });
      out.push(...block, ...late);
    });
    return out.concat(general);
  }

  /* ---------- formats ---------- */
  const nameOf = (title) => String(title).replace(/\s*\([^)]*\)\s*$/, "");
  // The summary of a framework with the words of its own name blanked out, so it can be recognised
  // without giving itself away. Null when too much of it would be blank.
  function cue(it) {
    const stems = (nameOf(it.title).match(/[A-Za-z][A-Za-z'’]{3,}/g) || [])
      .map((w) => w.toLowerCase().replace(/['’]s$/, "")).filter((w) => !STOP.has(w)).map((w) => w.slice(0, Math.max(4, Math.min(w.length - 1, 6))));
    let blanks = 0;
    const parts = String(it.gist || "").split(/(\b[A-Za-z][\w'’-]*)/);
    const out = parts.map((p) => {
      const low = p.toLowerCase();
      if (/^[A-Za-z]/.test(p) && stems.some((s) => low.startsWith(s))) { blanks++; return null; }
      return p;
    });
    const words = parts.filter((p) => /^[A-Za-z]/.test(p)).length;
    if (!words || blanks / words > 0.4 || words - blanks < 3) return null;
    return out;   // strings, and null where a blank goes
  }
  function pickOf(pack, it) {
    const c = cue(it);
    const others = pack.items.filter((f) => f.kind === "framework" && f.id !== it.id && nameOf(f.title) !== nameOf(it.title));
    if (!c || others.length < 3) return null;
    const near = shuffle(others.filter((f) => f.class === it.class)), far = shuffle(others.filter((f) => f.class !== it.class));
    const names = [...new Set(near.concat(far).map((f) => nameOf(f.title)))];   // no two options alike
    if (names.length < 3) return null;
    const options = shuffle([nameOf(it.title), ...names.slice(0, 3)]);
    // which framework each option is, so a wrong pick can count as a mix-up between the two
    const ids = options.map((o) => (o === nameOf(it.title) ? it.id : others.find((f) => nameOf(f.title) === o)?.id || null));
    return { cue: c, options, ids, answer: options.indexOf(nameOf(it.title)) };
  }
  function whereOf(pack, it) {
    if (!it.class || !pack.classes[it.class]) return null;
    // its own class, and a class that has a framework of the same name, aren't wrong answers
    // (classes are numbers in the course, sometimes text on an item: compare them as numbers)
    const own = +it.class;
    const also = new Set(pack.items.filter((f) => f.kind === "framework" && nameOf(f.title) === nameOf(it.title)).map((f) => +f.class));
    const wrong = pack.nums.filter((n) => +n !== own && !also.has(+n));
    if (wrong.length < 2) return null;
    const options = [own, ...shuffle(wrong).slice(0, 3)].sort((a, b) => a - b);
    return { options, answer: options.indexOf(own) };
  }
  // a framework you've seen before, from a side you haven't just used
  function fwStep(base, pack, it, avoid) {
    const pick = pickOf(pack, it), where = whereOf(pack, it);
    const ways = [["flash", 4], ["pick", pick ? 5 : 0], ["where", where ? 2 : 0]].filter(([k, w]) => w && k !== avoid);
    let r = Math.random() * ways.reduce((s, [, w]) => s + w, 0), kind = "flash";
    for (const [k, w] of ways) { if ((r -= w) < 0) { kind = k; break; } }
    return { ...base, kind, pick: kind === "pick" ? pick : null, where: kind === "where" ? where : null };
  }

  /* ---------- a session ---------- */
  // list: [{ id, meta, pack }] for the courses in your mix; mins: 5, 10 or 15.
  // opts (before and after class, from the timetable): recent: Map(course → Set of classes held this past
  // week), whose new things come first; returns: [{ course, n, label }] for day 3 and day 7 after a class,
  // when a few things from it come back even before they fade; label: { "course:n": "from Monday's class" }.
  function plan(list, mins, t = now(), opts = {}) {
    const budget = mins * 60, due = [], lanes = [];
    list.forEach(({ id, pack }) => {
      pack.items.forEach((it) => {
        if (!KINDS.has(it.kind)) return;
        const st = Mem.get(id, it.id);
        if (!st) return;
        const r = Mem.recall(id, it.id, t);
        if (r < FADING) due.push({ course: id, pack, it, why: "fading", r, seen: st.t });
      });
      // a framework named like a topic was taught by that topic: it skips its own "new" card
      const topics = new Set(pack.items.filter((it) => it.kind === "topic").map((it) => it.title.toLowerCase()));
      let lane = path(pack).filter((it) => !Mem.get(id, it.id))
        .map((it) => ({ course: id, pack, it, why: "new", taught: it.kind === "framework" && topics.has(nameOf(it.title).toLowerCase()) }));
      // a class from this past week comes first, while it's fresh
      const rec = opts.recent?.get(id);
      if (rec?.size) lane = [...lane.filter((x) => rec.has(+x.it.class)).map((x) => ({ ...x, whyText: opts.label?.[id + ":" + (+x.it.class)] })), ...lane.filter((x) => !rec.has(+x.it.class))];
      lanes.push(lane);
    });
    due.sort((a, b) => a.r - b.r);
    // day 3 and day 7 after a class: a few things from it, the weakest first, even before they fade
    const back = [], have = new Set(due.map((x) => x.course + ":" + x.it.id));
    (opts.returns || []).forEach(({ course, n, label }) => {
      const pk = list.find((x) => x.id === course)?.pack; if (!pk) return;
      pk.items.filter((it) => KINDS.has(it.kind) && +it.class === +n && !have.has(course + ":" + it.id))
        .map((it) => ({ it, st: Mem.get(course, it.id) })).filter(({ st }) => st && t - st.t > 2 * 86400)
        .map(({ it }) => ({ course, pack: pk, it, why: "after", whyText: label, r: Mem.recall(course, it.id, t) }))
        .sort((a, b) => a.r - b.r).slice(0, 3).forEach((x) => back.push(x));
    });
    due.unshift(...back);
    // new things from each course in turn
    const fresh = [];
    for (let k = 0; lanes.some((l) => k < l.length); k++) lanes.forEach((l) => { if (k < l.length) fresh.push(l[k]); });
    const costOf = (x) => x.why === "new"
      ? { topic: COST.learn + COST.say, framework: COST.learnFw + COST.pick, mcq: COST.mcq }[x.it.kind]
      : { topic: COST.say, framework: COST.pick, mcq: COST.mcq }[x.it.kind];
    let spent = 0;
    const takeDue = [], takeNew = [], rest = [];
    const cap = fresh.length ? budget * 0.6 : budget;   // leave room for something new
    due.forEach((x) => { const c = costOf(x); if (!takeDue.length || spent + c <= cap) { takeDue.push(x); spent += c; } else rest.push(x); });
    for (const x of fresh) { const c = costOf(x); if (takeDue.length + takeNew.length && spent + c > budget) break; takeNew.push(x); spent += c; }
    rest.forEach((x) => { const c = costOf(x); if (spent + c <= budget) { takeDue.push(x); spent += c; } });

    // the order: something you know to start, then a new thing every third card; a new thing's
    // check comes two cards after you read it
    const D = takeDue.map((x) => x), N = takeNew.map((x) => x), steps = [], pending = [];
    let last = null;
    const add = (s) => { steps.push(s); last = s.kind; };
    const review = (x) => x.it.kind === "topic" ? { ...x, kind: "say" } : x.it.kind === "mcq" ? { ...x, kind: "mcq" } : fwStep(x, x.pack, x.it, last);
    while (D.length || N.length || pending.length) {
      if (pending.length && pending[0].at <= steps.length) { add(pending.shift().step); continue; }
      if (N.length && (!D.length || steps.length % 3 === 1)) {
        const x = N.shift();
        if (x.it.kind === "mcq") { add({ ...x, kind: "mcq" }); continue; }
        if (!x.taught) add({ ...x, kind: "learn" });
        const check = x.it.kind === "topic" ? { ...x, kind: "say" } : (() => { const p = pickOf(x.pack, x.it); return p ? { ...x, kind: "pick", pick: p } : { ...x, kind: "flash" }; })();
        pending.push({ at: steps.length + 2, step: check });
      } else if (D.length) add(review(D.shift()));
      else add(pending.shift().step);
    }
    return { steps, mins, due: takeDue.length, fresh: takeNew.length, dueAll: due.length, next: fresh[0] || null };
  }
  // the card to show again later in the session after a miss (once per item)
  function retry(step) {
    if (step.kind === "mcq") return null;
    return { ...step, kind: step.it.kind === "topic" ? "say" : "flash", why: "retry", pick: null, where: null };
  }
  // what will be fading by the end of tomorrow, in the courses of your mix
  function tomorrow(list, t = now()) {
    const d = new Date(); d.setHours(24 * 2, 0, 0, 0);
    const end = Math.floor(d.getTime() / 1000);
    let n = 0;
    list.forEach(({ id, pack }) => pack.items.forEach((it) => { if (KINDS.has(it.kind) && Mem.get(id, it.id) && Mem.recall(id, it.id, end) < FADING) n++; }));
    return n;
  }

  /* ---------- the run ---------- */
  const num = (s) => { const [y, m, d] = s.split("-").map(Number); return Math.round(Date.UTC(y, m - 1, d) / 864e5); };
  const LABELS = ["M", "T", "W", "T", "F", "S", "S"], NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  function run(days, today) {
    const studied = new Set(Object.entries(days || {}).filter(([, c]) => c >= DAY_MIN).map(([d]) => num(d)));
    const t0 = num(today), has = (n) => studied.has(n);
    let count = 0;
    const start = has(t0) ? t0 : has(t0 - 1) ? t0 - 1 : has(t0 - 2) ? t0 - 2 : null;
    if (start !== null) for (let d = start; ;) { if (has(d)) { count++; d--; } else if (has(d - 1)) d--; else break; }
    let best = 0, len = 0, prev = null;
    [...studied].sort((a, b) => a - b).forEach((d) => { len = prev !== null && d - prev <= 2 ? len + 1 : 1; best = Math.max(best, len); prev = d; });
    const dow = (t0 + 3) % 7;   // day 0 (1 Jan 1970) was a Thursday; Monday is 0 here
    const byNum = {};
    Object.entries(days || {}).forEach(([d, c]) => (byNum[num(d)] = c));
    const week = LABELS.map((label, i) => {
      const n = t0 - dow + i, c = byNum[n] || 0;
      const state = n > t0 ? "future" : has(n) ? "done" : c ? "some" : n === t0 ? "today" : "off";
      return { label, name: NAMES[i], state, cards: c, isToday: n === t0 };
    });
    return {
      count, best: Math.max(best, count), today: has(t0), cardsToday: byNum[t0] || 0,
      keep: !has(t0) && !has(t0 - 1) && has(t0 - 2),   // today keeps the run going
      week,
    };
  }

  return { plan, retry, tomorrow, run, path, cue, nameOf, pickOf, whereOf, DAY_MIN, FADING };
})();

window.Today = Today;
