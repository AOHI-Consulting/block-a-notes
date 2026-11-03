/* Plaques and hotel stars: a quiet record of what you've done, never of how fast. They're private, nobody is
   ranked, and once earned they stay (forgetting later doesn't take one back). Most are read from what Check-in
   already keeps (rooms, keys, your run, the notebook, letters to the GM); a few are marked when they happen
   (a welcome back, a warm-up, a renovation, saying it out loud, passing a card on). Kept as marks
   (mem:path-awards: award:<id>, and stars:<course>:<n>), so they sync like the rest of your progress.

   A course's hotel earns up to five stars: its first floor complete, half its rooms lit, every room lit,
   ten keys, half its rooms with keys. */

const Awards = (() => {
  const K = () => Practise.kit, SK = () => Study.kit;
  const BOX = "awards";
  // until 4 Nov 2026 they were kept as mem:path-_awards, a name the sync turns away (no underscores), so they
  // stayed on one device: move them over once, the later mark winning where both have one
  try {
    const OLD = LS + "mem:path-_awards", NEW = LS + "mem:path-awards", o = JSON.parse(localStorage.getItem(OLD) || "null");
    if (o) {
      const n = JSON.parse(localStorage.getItem(NEW) || "null") || { v: 1, owner: null, items: {}, days: {}, at: 0 };
      for (const [k, x] of Object.entries(o.items || {})) if (!n.items[k] || (x?.t || 0) > (n.items[k].t || 0)) n.items[k] = x;
      n.at = Math.max(n.at || 0, o.at || 0);
      localStorage.setItem(NEW, JSON.stringify(n)); localStorage.removeItem(OLD);
    }
  } catch (e) {}
  const has = (id) => Mem.flagged(BOX, "award:" + id);
  const when = (id) => Mem.flagAt(BOX, "award:" + id);
  const topicsOf = (pk) => pk.items.filter((it) => it.kind === "topic");
  const keysOf = (c) => Mem.flagsBetween(c, "key:", 0, Infinity).length;
  const lessons = (pk) => Path.units(pk).filter((u) => u.n).map((u) => u.nodes.filter((nd) => nd.kind === "lesson"));
  const sentReplies = (c, pk) => Inbox.sent(c, pk).length;
  const settled = () => Object.values(JSON.parse(localStorage.getItem("block-a-notes:mem:mix") || "{}").items || {}).filter((v) => (v.ok || []).length >= 3).length;

  // [id, name, how you earn it, icon, test(courses) or null when it's marked as it happens]
  const LIST = [
    ["first-room", "Opening night", "Light your first room.", "key", (cs) => cs.some(({ id, pk }) => topicsOf(pk).some((t) => Mem.get(id, t.id)))],
    ["floor", "Floor complete", "Finish every room on a floor.", "check", (cs) => cs.some(({ id, pk }) => lessons(pk).some((ls) => ls.length && ls.every((nd) => Path.status(id, nd).done)))],
    ["first-key", "Your first key", "Remember a room for three weeks or more.", "key", (cs) => cs.some(({ id }) => keysOf(id) > 0)],
    ["key-ring", "A key ring", "Hold ten keys.", "key", (cs) => cs.reduce((s, { id }) => s + keysOf(id), 0) >= 10],
    ["grand-opening", "Grand opening", "Light every room of a course.", "star", (cs) => cs.some(({ id, pk }) => { const t = topicsOf(pk); return t.length && t.every((x) => Mem.get(id, x.id)); })],
    ["rooftop", "On the rooftop", "Explain an open question in your own words.", "pen", (cs) => cs.some(({ id, pk }) => pk.items.some((it) => it.kind === "prompt" && Mem.get(id, it.id)))],
    ["told-apart", "Told apart", "Settle a mix-up: tell the two apart on three days.", "swap", () => settled() > 0],
    ["notebook", "Case builder", "Apply five ideas to your hotel in the case notebook.", "pen", (cs) => cs.reduce((s, { id }) => s + Mem.caseAll(id).filter((e) => !e.id.startsWith("gm:")).length, 0) >= 5],
    ["consultant", "Consultant", "Reply to the GM.", "mail", (cs) => cs.some(({ id, pk }) => sentReplies(id, pk) > 0)],
    ["adviser", "Trusted adviser", "Reply to the GM five times.", "mail", (cs) => cs.reduce((s, { id, pk }) => s + sentReplies(id, pk), 0) >= 5],
    ["regular", "Regular guest", "A run of four weeks with a study day in each.", "bolt", () => Today.run(Mem.days(), Mem.today()).best >= 4],
    ["season", "Season ticket", "A run of twelve weeks.", "bolt", () => Today.run(Mem.days(), Mem.today()).best >= 12],
    ["days-25", "Twenty-five study days", "Study on twenty-five days, whenever suits you.", "clock", () => Today.run(Mem.days(), Mem.today()).total >= 25],
    ["welcome-back", "Welcome back", "Come back after two weeks or more away, and do a session.", "reset", null],
    ["warm-up", "Warmed up", "Do a warm-up before a class.", "play", null],
    ["fresh", "Fresh from class", "Study a class within two days of it.", "plus", null],
    ["renovator", "Renovator", "Renovate a floor until the scaffolding comes down.", "wrench", null],
    ["spoke", "Out loud", "Explain something out loud with the microphone.", "mic", null],
    ["passed", "Pass it on", "Pass a card to a classmate.", "arrow", null],
  ];
  const byId = Object.fromEntries(LIST.map((a) => [a[0], a]));

  // marked as it happens; returns true when it's new
  function mark(id) {
    if (!byId[id] || has(id)) return false;
    Mem.flag(BOX, "award:" + id);
    return true;
  }
  // everything you've newly earned, given the courses at hand ([{ id, pk }]); marks them
  function check(courses = []) {
    const fresh = [];
    LIST.forEach(([id, , , , test]) => {
      if (!test || has(id)) return;
      let ok = false; try { ok = test(courses); } catch (e) {}
      if (ok) { Mem.flag(BOX, "award:" + id); fresh.push(id); }
    });
    courses.forEach(({ id, pk }) => stars(id, pk));
    return fresh;
  }
  // a course's stars: the most ever reached (kept as a mark, so they're never lost)
  function stars(c, pk) { return starInfo(c, pk).n; }
  // n: stars held; next: the first of the five not met yet
  function starInfo(c, pk) {
    const t = topicsOf(pk), lit = t.filter((x) => Mem.get(c, x.id)).length, keys = keysOf(c);
    const met = [
      lessons(pk).some((ls) => ls.length && ls.every((nd) => Path.status(c, nd).done)),
      t.length > 0 && lit * 2 >= t.length,
      t.length > 0 && lit === t.length,
      t.length > 0 && keys >= Math.min(10, t.length),
      t.length > 0 && keys * 2 >= t.length,
    ], now = met.filter(Boolean).length;
    let best = 0;
    for (let n = 5; n > 0; n--) if (Mem.flagged(BOX, "stars:" + c + ":" + n)) { best = n; break; }
    for (let n = best + 1; n <= now; n++) Mem.flag(BOX, "stars:" + c + ":" + n);
    const k = met.indexOf(false);
    return { n: Math.max(best, now), next: k >= 0 ? STARS[k] : null };
  }
  const STARS = ["Its first floor complete", "Half its rooms lit", "Every room lit", "Ten keys", "Half its rooms with keys"];
  // earned since you last looked at your plaques
  function unseen() {
    const seen = store.get("study:awards:seen") || 0;
    return LIST.filter(([id]) => has(id) && when(id) > seen).map(([id]) => id);
  }
  const seenNow = () => store.set("study:awards:seen", Math.floor(Date.now() / 1000) + 1);

  // a plaque, as a small brass sign (or its outline, still to come)
  function plaque(id, small) {
    const [, name, how, icon] = byId[id], got = has(id);
    const p = el("div", "aw-plaque" + (got ? " got" : "") + (small ? " small" : ""));
    const ic = el("span", "aw-ic"); ic.append(K().icon(icon));
    const t = el("div");
    t.append(el("b", null, name), el("span", null, how));
    if (got && !small) t.append(el("small", null, new Date(when(id) * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })));
    p.append(ic, t);
    return p;
  }
  function starRow(n) {
    const s = el("span", "aw-stars"); s.setAttribute("aria-label", n + " of 5 stars");
    for (let i = 1; i <= 5; i++) s.append(el("i", i <= n ? "on" : null, "★"));
    return s;
  }

  /* ---------- the page: #/study/plaques ---------- */
  async function render(w, ready) {
    const head = el("section", "st-head");
    head.append(SK().crumbs("#/study", "Study"), el("p", "kicker", "Your plaques"), el("h1", null, "The lobby wall"),
      el("p", "line", "What you've done, never how fast. Only you see it, and nothing here is ever taken away."));
    w.append(head);
    const page = el("div", "st-page aw-page");
    const courses = ready.filter((x) => x.pk);
    check(courses);
    const got = LIST.filter(([id]) => has(id)), left = LIST.filter(([id]) => !has(id));
    const wall = el("section", "aw-wall");
    wall.append(el("h2", "cn-h", got.length ? got.length + " of " + LIST.length + " on the wall" : "Nothing on the wall yet: your first plaque comes with your first room"));
    const grid = el("div", "aw-grid"); got.sort((a, b) => when(b[0]) - when(a[0])).forEach(([id]) => grid.append(plaque(id))); wall.append(grid);
    page.append(wall);
    if (courses.length) {
      const st = el("section", "aw-hotels");
      st.append(el("h2", "cn-h", "Your hotels"));
      courses.forEach(({ id, pk }) => {
        const r = el("a", "panel aw-hotel"); r.href = "#/study/" + id;
        const { n, next } = starInfo(id, pk), t = el("div");
        t.append(el("b", null, pk.course.code ? pk.course.code + " · " + pk.course.name : pk.course.name), starRow(n));
        if (next && n < 5) t.append(el("small", null, "Next star: " + next.toLowerCase()));
        r.append(t); st.append(r);
      });
      const how = el("p", "small", "Stars for a hotel: " + STARS.map((s, i) => (i + 1) + ". " + s.toLowerCase()).join(" · ") + ".");
      st.append(how); page.append(st);
    }
    if (left.length) {
      const s = el("section", "aw-left");
      s.append(el("h2", "cn-h", "Still to come"));
      const g = el("div", "aw-grid"); left.forEach(([id]) => g.append(plaque(id))); s.append(g);
      page.append(s);
    }
    w.append(page);
    seenNow();
  }

  const earnedSince = (t) => LIST.filter(([id]) => has(id) && when(id) >= t).map(([id]) => id);
  return { LIST, mark, check, stars, starRow, unseen, seenNow, earnedSince, plaque, render, name: (id) => byId[id]?.[1] };
})();

window.Awards = Awards;
