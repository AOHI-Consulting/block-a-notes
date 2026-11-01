/* Study: learn every course of the Master, class by class. The Study home lists the courses (the
   catalog); you pick one. A class opens with its story, then one topic at a time: the idea in plain
   words, a hotel scene, the usual mix-up and where to look it up, next to our notes for that topic.
   Then you explain the class's open questions in your own words (ticking the key points you covered)
   and check yourself with quick questions. No exam format is assumed; a course can add exam practice.
   Each course is a pack (packs/<course>.enc, see FORMAT.md in the build folder), encrypted with the
   group code like the practice questions. What you know is kept by Mem (memory.js), per course, on
   this device and, once you've opened your page, on all your devices.
   The daily session (#/study/today) mixes what is fading with new things from your path through each
   course you follow; today.js plans it and keeps the run.
   You can write a note of your own on any topic or framework (only you see it), and search every course
   and your notes from the Study home, or one course from its home.
   Addresses: #/study (the courses), #/study/today, #/study/ldd, #/study/ldd/c6, #/study/ldd/c6/t/3,
   #/study/ldd/c6/explain(/2), #/study/ldd/c6/check, #/study/ldd/cards. The older #/study/c6… are LDD's. */

const Study = (() => {
  const K = () => Practise.kit;
  const T = {
    cat: null, catLoading: null,          // the courses
    plan: null, sess: null,               // today's session: the one offered, the one under way
    packs: new Map(), loading: new Map(), // course id -> its pack, read as classes (view)
    course: null, meta: null, data: null, // the course on screen: id, catalog entry, pack
    filter: "all", keys: null,
    idx: new Map(),                       // course id -> what the search can find in it
    find: { key: "", q: "", notes: false },   // the search box: where it is, what's typed, your notes listed
  };
  const C = () => T.course;
  const base = () => "#/study/" + T.course;
  const cls = (n) => base() + "/c" + n;

  /* ---------- loading ---------- */
  const failed = (e) => (e && e.name === "OperationError" ? "key" : "net");
  function catalog() {
    if (T.cat) return Promise.resolve(T.cat);
    if (!T.catLoading) T.catLoading = K().openBox("packs/catalog.enc").then((c) => (T.cat = c.courses)).catch((e) => { T.catLoading = null; throw e; });
    return T.catLoading;
  }
  function pack(id) {
    if (T.packs.has(id)) return Promise.resolve(T.packs.get(id));
    if (!T.loading.has(id)) T.loading.set(id, K().openBox("packs/" + id + ".enc").then((p) => {
      const v = view(p); T.packs.set(id, v); if (id === "ldd") seedOld(v); return v;
    }).catch((e) => { T.loading.delete(id); throw e; }));
    return T.loading.get(id);
  }
  // A pack is a flat list of checked items; Study reads it as classes with topics, questions and a drill.
  function view(pack) {
    const classes = {}, frameworks = [], names = {};
    Object.entries(pack.classes).forEach(([n, c]) => { classes[n] = { ...c, cards: [], likely: [], drill: [] }; names[n] = c.name; });
    const links = !!pack.course.slides, nums = Object.keys(classes).map(Number).sort((a, b) => a - b);
    const u = pack.course.unit && { name: pack.course.unit, short: pack.course.unitShort || pack.course.unit[0],
      colors: Object.fromEntries(nums.map((n) => [n, color(n, { nums })])) };
    pack.items.forEach((it) => {
      if (it.kind === "topic") classes[it.class].cards.push({ id: it.id, title: it.title, html: it.notes, x: it.x && { ...it.x, refs: it.refs } });
      else if (it.kind === "prompt") classes[it.class].likely.push({ id: it.id, ask: it.ask, html: it.notes, answer: it.answer });
      else if (it.kind === "framework") frameworks.push({ id: it.id, name: it.title, gist: it.gist, ref: it.ref, c: it.class || 0 });
      else if (it.kind === "mcq") {
        // in the shape the Practise drill expects
        const q = { id: it.id, classes: it.classes, stem: it.stem, options: it.options, answer: it.answer, why: it.why,
                    concept: it.concept, sources: it.refs, names, noLinks: !links, unit: u };
        it.classes.forEach((n) => classes[n]?.drill.push(q));
      }
    });
    return { course: pack.course, classes, nums, frameworks, items: pack.items };
  }

  /* ---------- progress ---------- */
  const get = (k) => store.get("study:" + k) || {};
  function update(k, fn) { const v = get(k); fn(v); store.set("study:" + k, v); }
  const exKey = () => (T.course === "ldd" ? "explain" : "explain:" + T.course);   // your typed answers, on this device
  // what you marked: 1 = can explain / knew it / got it (grade 3+), 0 = not yet (grade 1–2)
  function readOf(n) {
    const r = {};
    T.data.classes[n].cards.forEach((k, i) => { const g = Mem.last(C(), k.id); if (g) r[i] = g >= 3 ? 1 : 0; });
    return r;
  }
  const MARK = { 1: "miss", 2: "part", 3: "got", 4: "got" }, GRADE = { got: 3, part: 2, miss: 1 };
  const markOf = (q) => MARK[Mem.last(C(), q.id)] || null;
  const knows = (id) => Mem.last(C(), id) >= 3;
  // LDD progress from before the memory model (marks kept per device) starts it off, once per device.
  function seedOld(d) {
    if (store.get("study:seeded:ldd")) return;
    const list = [];
    Object.entries(get("read")).forEach(([n, r]) => Object.entries(r || {}).forEach(([i, v]) => list.push([d.classes[n]?.cards[i]?.id, v === 1 ? 3 : 1])));
    Object.entries(get("explain")).forEach(([n, r]) => Object.entries(r || {}).forEach(([i, v]) => list.push([d.classes[n]?.likely[i]?.id, GRADE[v?.mark]])));
    const fl = get("flash");
    d.frameworks.forEach((f) => { const v = fl[f.name]; if (v) list.push([f.id, v.k > 0 && v.k >= v.a ? 3 : 1]); });
    Object.entries(store.get("drill:stats") || {}).forEach(([id, v]) => list.push([id, v.right ? 3 : 1]));
    Mem.seed("ldd", list);
    store.set("study:seeded:ldd", true);
  }
  function prog(n) {
    const c = T.data.classes[n], r = readOf(n), st = store.get("drill:stats") || {}, qs = c.drill;
    return {
      known: c.cards.filter((_, i) => r[i] === 1).length, cards: c.cards.length,
      done: c.likely.filter((q) => markOf(q)).length, likely: c.likely.length,
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
  function crumbs(href, text) {
    const cr = el("nav", "crumbs"), back = el("a"); back.href = href; back.append(K().icon("back"), document.createTextNode(text)); cr.append(back);
    return cr;
  }
  // How a course calls its sessions: classes (LDD), workshops (LRD, numbered 1, 4, 10). Colours go by
  // position in the course, so LDD's class n keeps colour n.
  const unit = (pk = T.data) => pk?.course?.unit || "Class";
  const unitShort = (pk = T.data) => pk?.course?.unitShort || "C";
  const unitsOf = (u) => u.toLowerCase() + (/(s|sh|ch|x)$/i.test(u) ? "es" : "s");
  function color(n, pk = T.data) { const i = pk?.nums ? pk.nums.indexOf(+n) + 1 : +n; return i >= 1 && i <= 9 ? "var(--c" + i + ")" : "var(--accent)"; }
  function classChip(n) {
    const s = el("span", "chip", unitShort() + n); s.style.setProperty("--cc", color(n));
    s.title = unit() + " " + n + ": " + (T.data?.classes[n]?.name || ""); return s;
  }
  const slides = () => !!T.data?.course.slides;   // only LDD's decks and book are in the viewer
  const sources = (refs) => K().sourcesLine(refs, slides());
  const notesPages = (c, one) => (c.notesPages ? "exam notes " + (one ? "p. " + c.notesPages[one === "first" ? 0 : 1] : "pp. " + c.notesPages[0] + "–" + c.notesPages[1]) : "");
  // Our notes as they are in the PDF; their slide and page chips open the slide or the book page.
  function notesDoc(html, n, links = slides()) {
    const d = el("div", "sdoc"); d.innerHTML = html;   // our own notes, built from the parts
    d.querySelectorAll("table").forEach((t) => { const w = el("div", "tw"); t.replaceWith(w); w.append(t); });
    if (!links || !K().slideReady()) return d;
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
  function syncLine(w) {
    const sy = Mem.status();
    w.append(el("p", "small st-sync" + (sy.state === "synced" ? " on" : ""), sy.text));
  }

  /* ---------- your own notes ---------- */
  // A note in your own words on a topic or a framework. Only you see it: Mem keeps it with your progress,
  // so it follows you to your other devices once you've opened your page.
  let pendingNote = null;   // a note still being typed: saved before the view changes
  const flushNote = () => { const f = pendingNote; pendingNote = null; if (f) f(); };
  function noteBox(course, id) {
    const box = el("div", "st-mynote"), body = el("div", "st-mynote-b"), head = el("div", "st-mynote-h");
    const state = el("span", "small", "Only you see it");
    const ta = el("textarea"); ta.maxLength = Mem.NOTE_MAX; ta.rows = 3; ta.value = Mem.note(course, id);
    ta.placeholder = "In your own words: an example from a hotel you know, a link to another course, a question to ask in class.";
    ta.setAttribute("aria-label", "Your note");
    head.append(el("p", "kicker", "Your note"), state); body.append(head, ta);
    const grow = () => { ta.style.height = "auto"; ta.style.height = Math.max(76, ta.scrollHeight + 2) + "px"; };
    let tm = null;
    const save = () => { clearTimeout(tm); pendingNote = null; Mem.setNote(course, id, ta.value); state.textContent = "Saved · only you see it"; };
    ta.addEventListener("input", () => { grow(); state.textContent = "Saving…"; pendingNote = save; clearTimeout(tm); tm = setTimeout(save, 400); });
    ta.addEventListener("blur", () => { if (pendingNote === save) save(); });
    const add = K().button("Add your own note", "small ghost", () => { add.hidden = true; body.hidden = false; grow(); ta.focus(); }, "pen");
    const has = !!ta.value.trim();
    body.hidden = !has; add.hidden = has;
    box.append(add, body);
    if (has) requestAnimationFrame(grow);
    return box;
  }
  // the note, to read, on the answer side of a card in the daily session
  function noteShow(course, id) {
    const t = Mem.note(course, id).trim();
    if (!t) return null;
    const d = el("div", "st-mynote-b ro"); d.append(el("p", "kicker", "Your note"), el("p", "st-mynote-t", t));
    return d;
  }

  /* ---------- search: every course, and your notes ---------- */
  // British and American spellings fold together, and words match by their stem ("network effects"
  // finds "network effect"): the same rules as the slide search on the Slides tab.
  const fold = (t) => String(t || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/is(e|ed|es|ing|ation|ations)\b/g, "iz$1");
  const stem = (w) => {
    if (w.length < 5) return w;
    let t = w.replace(/(ations?|ating|ated|ates|ingly|ings?|ions?|ants?|ences?|ances?|ments?|ers?|ed|ies|es|s)$/, "");
    if (t.length < 4) t = w.replace(/s$/, "");
    return t.length > 4 ? t.replace(/e$/, "") : t;
  };
  const termsOf = (q) => [...new Set(fold(q).split(/\s+/).map((t) => t.replace(/^[^\p{L}\p{N}€$£]+|[^\p{L}\p{N}%]+$/gu, "")).filter((t) => t.length > 1).map(stem))];
  const KINDS = { note: "Your note", topic: "Topic", framework: "Framework", prompt: "Open question", story: "Story", mcq: "Question" };
  const WEIGHT = { note: 5, topic: 4, framework: 3.5, prompt: 2.5, story: 2, mcq: 1 };
  const plainOf = (h) => (h ? new DOMParser().parseFromString(String(h), "text/html").body.textContent.replace(/\s+/g, " ").trim() : "");
  const unbold = (t) => String(t || "").replace(/\*\*/g, "");
  // everything in a course you can find, each with its address (built once per course)
  function searchIndex(id) {
    if (T.idx.has(id)) return T.idx.get(id);
    const pk = T.packs.get(id), out = [], at = {}, home = "#/study/" + id;
    const add = (e) => {
      e.course = id; e.pk = pk;
      e.body = e.parts.filter(Boolean).map(unbold).join(" · ");
      e.ft = fold(e.title); e.fb = fold(e.body);
      out.push(e);
    };
    pk.nums.forEach((n) => {
      const c = pk.classes[n], here = home + "/c" + n;
      add({ kind: "story", n, title: c.name, href: here, parts: [c.line, ...(c.story || [])] });
      c.cards.forEach((k, i) => {
        at[k.id] = here + "/t/" + (i + 1);
        const x = k.x || {};
        add({ kind: "topic", id: k.id, n, title: k.title, href: at[k.id], parts: [x.plain, x.hotel, x.mixup, x.ask?.q, x.ask?.a, plainOf(k.html)] });
      });
      c.likely.forEach((q, i) => add({ kind: "prompt", id: q.id, n, title: plainOf(q.ask).replace(/^[“"]+|[”"]+$/g, ""), href: here + "/explain/" + (i + 1),
        parts: [q.answer?.case, ...(q.answer?.points || []), q.answer?.conclusion, plainOf(q.html)] }));
      c.drill.forEach((q) => { if (q.classes[0] === n) add({ kind: "mcq", id: q.id, n, title: q.concept || q.stem, q, parts: [q.stem, ...q.options, q.why] }); });
    });
    const links = Object.fromEntries(pk.items.filter((it) => it.kind === "framework").map((it) => [it.id, it.links || []]));
    pk.frameworks.forEach((f) => {
      // a framework has no page of its own: it opens the topic that explains it, or its class
      const href = at[links[f.id]?.[0]] || (f.c && pk.classes[f.c] ? home + "/c" + f.c : home + "/cards");
      add({ kind: "framework", id: f.id, n: pk.classes[f.c] ? f.c : 0, title: f.name, href, parts: [f.gist, refOf(f, pk).text || f.ref] });
    });
    const v = { list: out, byId: Object.fromEntries(out.filter((e) => e.id).map((e) => [e.id, e])) };
    T.idx.set(id, v);
    return v;
  }
  // your notes in a course, as search entries (they change as you write, so never cached)
  function noteEntries(id) {
    const ix = searchIndex(id);
    return Mem.notes(id).map((nt) => {
      const on = ix.byId[nt.id];
      const e = { kind: "note", id: nt.id, n: on?.n || 0, course: id, pk: T.packs.get(id), t: nt.t,
        title: on ? on.title : "A note on something no longer in the course", href: on?.href || null, body: nt.text };
      e.ft = fold(e.title); e.fb = fold(e.body);
      return e;
    });
  }
  function search(q, ids) {
    const terms = termsOf(q), hits = [];
    if (!terms.length) return { terms, hits };
    ids.forEach((id) => [...noteEntries(id), ...searchIndex(id).list].forEach((e) => {
      if (!terms.every((t) => e.ft.includes(t) || e.fb.includes(t))) return;
      const inTitle = terms.filter((t) => e.ft.includes(t)).length;
      hits.push({ e, score: WEIGHT[e.kind] + 3 * inTitle + (inTitle === terms.length ? 2 : 0) });
    }));
    hits.sort((a, b) => b.score - a.score);
    return { terms, hits: hits.map((h) => h.e) };
  }
  function marked(node, text, terms) {
    const pat = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/iz/g, "i[sz]"));
    String(text).split(new RegExp("(" + pat.map((x) => x + "\\p{L}*").join("|") + ")", "igu")).forEach((part, i) => node.append(i % 2 ? el("mark", null, part) : document.createTextNode(part)));
    return node;
  }
  function snippetOf(e, terms) {
    let i = -1;
    for (const t of terms) { const k = e.fb.indexOf(t); if (k >= 0 && (i < 0 || k < i)) i = k; }
    if (i < 0) return e.body.length > 170 ? e.body.slice(0, 170).trim() + "…" : e.body;
    const a = Math.max(0, i - 60), b = Math.min(e.body.length, i + 150);
    return (a > 0 ? "…" : "") + e.body.slice(a, b).trim() + (b < e.body.length ? "…" : "");
  }
  function hitRow(e, terms) {
    const r = el(e.href || e.q ? "a" : "div", "qr st-hit");
    if (e.href) r.href = e.href;
    else if (e.q) { r.href = "#"; r.addEventListener("click", (ev) => { ev.preventDefault(); flushNote(); K().startDrill([e.q], "study/" + e.course + "/c" + e.n + "/check"); }); }
    const w = el("span", "where", KINDS[e.kind]);
    w.style.setProperty("--x", e.kind === "note" ? "var(--gold)" : e.n ? color(e.n, e.pk) : "var(--accent)");
    const s = el("span", "s"), sn = el("span", "sn");
    if (e.n && e.pk?.classes[e.n]) sn.append(el("b", null, unitShort(e.pk) + e.n + " · "));
    s.append(marked(el("span", "cn"), e.title, terms), marked(sn, snippetOf(e, terms), terms));
    r.append(w, s);
    if (e.href || e.q) r.append(K().icon("next"));
    return r;
  }
  // The search box, on the Study home (every course) and on a course's home (that course). Typing
  // shows the matches in place of the page below it; with nothing typed you can list your notes.
  function findBox(w, ids, page) {
    if (T.find.key !== ids.join()) T.find = { key: ids.join(), q: "", notes: false };
    const F = T.find, many = ids.length > 1;
    const sb = el("div", "searchbox st-search"), input = el("input");
    input.type = "search"; input.value = F.q; input.autocomplete = "off";
    input.placeholder = many ? "Search every course: a framework, a hotel, an idea…" : "Search " + (T.meta?.code || "this course") + ": a framework, a hotel, an idea…";
    input.setAttribute("aria-label", many ? "Search every course and your notes" : "Search this course and your notes");
    sb.append(K().icon("search"), input);
    const line = el("p", "small st-findline"), area = el("div", "st-found");
    w.append(sb, line, area, page);
    const counts = () => ids.map((id) => [id, Mem.notes(id).length]).filter((x) => x[1]);
    let seq = 0;
    const draw = async () => {
      const q = F.q.trim(), mine = counts(), total = mine.reduce((a, x) => a + x[1], 0), my = ++seq;
      line.textContent = "";
      if (!q && total) line.append(document.createTextNode(plural(total, "note") + " of your own" + (many && mine.length > 1 ? ", in " + mine.length + " courses" : "") + ". "),
        K().textBtn(F.notes ? "Hide them" : "Show them", () => { F.notes = !F.notes; draw(); }));
      else if (!q) line.append(document.createTextNode("Finds topics, frameworks, questions and stories in " + (many ? "every course" : "this course") + ". Write a note of your own on any topic, and it finds that too."));
      page.hidden = !!q || (F.notes && !!total);
      area.textContent = "";
      if (!q && !(F.notes && total)) return;
      const need = q ? ids : mine.map((x) => x[0]);
      if (need.some((id) => !T.packs.has(id))) {
        area.append(el("p", "loading", "Searching…"));
        try { await Promise.all(need.map(pack)); } catch (e) { area.textContent = ""; area.append(el("p", "small", "The search can't open the courses right now. Check your connection.")); return; }
        if (my !== seq) return;
        area.textContent = "";
      }
      const { terms, hits } = q ? search(q, ids) : { terms: [], hits: need.flatMap(noteEntries).sort((a, b) => b.t - a.t) };
      if (q) area.append(el("p", "small st-found-n", hits.length ? plural(hits.length, "match", "matches") + " for “" + q + "”"
        : "Nothing found for “" + q + "”. Try fewer or shorter words, or another spelling."));
      // the course with the best match first
      (q ? [...new Set(hits.map((e) => e.course))] : need).forEach((id) => {
        const mine2 = hits.filter((e) => e.course === id);
        if (!mine2.length) return;
        const sec = el("section", "sect"), meta = T.cat.find((c) => c.id === id);
        if (need.length > 1 || !q) sec.append(K().h2(q ? [meta?.code, meta?.name].filter(Boolean).join(" · ") : "Your notes" + (many ? " · " + (meta?.code || meta?.name) : ""), plural(mine2.length, q ? "match" : "note", q ? "matches" : "notes")));
        const list = el("div", "panel results st-results");
        mine2.slice(0, 40).forEach((e) => list.append(hitRow(e, terms)));
        if (mine2.length > 40) list.append(el("p", "small st-more", (mine2.length - 40) + " more: add a word to narrow it down."));
        sec.append(list); area.append(sec);
      });
    };
    let tm = null;
    input.addEventListener("input", () => { clearTimeout(tm); tm = setTimeout(() => { F.q = input.value; draw(); }, 120); });
    input.addEventListener("keydown", (e) => { if (e.key === "Escape" && input.value) { e.preventDefault(); input.value = F.q = ""; draw(); } });
    T.keys = (e) => { if (e.key === "/") input.focus(); else return false; };
    draw();
    return input;
  }

  /* ---------- render ---------- */
  async function render(box, seg) {
    flushNote();
    T.keys = null;
    // addresses from before there were several courses (#/study/c4/…, #/study/cards) are LDD's
    if (/^(c\d+|cards)$/.test(seg[0] || "")) { seg = ["ldd", ...seg]; history.replaceState(null, "", "#/study/" + seg.join("/")); }
    const at = location.hash, today = seg[0] === "today";
    let course = null, list = null;
    try {
      if (!T.cat) { box.append(el("p", "loading", "Opening your courses…")); await catalog(); }
      if (today) { box.textContent = ""; box.append(el("p", "loading", "Getting today ready…")); list = await mixPacks(); }
      course = (!today && seg[0] && T.cat.find((c) => c.id === seg[0])) || null;
      if (course?.status === "ready" && !T.packs.has(course.id)) {
        box.textContent = ""; box.append(el("p", "loading", "Opening " + course.name + "…"));
        await pack(course.id);
      }
    } catch (e) {
      box.textContent = "";
      const g = el("div", "gate"), key = failed(e) === "key";
      g.append(el("b", null, key ? "The study notes don't open with this link" : "Can't load the study notes"),
        el("p", null, key ? "Ask Antonis for the current invitation link." : "Check your internet connection and reload the page."));
      box.append(g); return;
    }
    if (location.hash !== at) return;   // you moved on while it opened
    box.textContent = "";
    const w = el("div", "study"); box.append(w);
    if (T.course !== course?.id) T.filter = "all";
    T.course = course?.id || null; T.meta = course; T.data = course ? T.packs.get(course.id) || null : null;
    if (today) return renderToday(w, list);
    if (!course) return renderPicker(w);
    if (course.status !== "ready") return renderComing(w, course);
    const rest = seg.slice(1), m = /^c(\d+)$/.exec(rest[0] || "");
    if (rest[0] === "cards" && T.data.frameworks.length) renderCards(w);
    else if (m && T.data.classes[m[1]]) { store.set("study:last", [course.id, ...rest].join("/")); renderClass(w, +m[1], rest.slice(1)); }
    else renderHome(w);
  }

  // Where you were: "ldd/c4/t/2" (older ones, without the course, are LDD's).
  function whereLabel(path) {
    let p = String(path || "");
    if (/^c\d/.test(p)) p = "ldd/" + p;
    const m = /^([a-z0-9-]+)\/c(\d+)(?:\/(t|explain|check)(?:\/(\d+|done))?)?$/.exec(p);
    const course = m && T.cat?.find((c) => c.id === m[1] && c.status === "ready");
    const k = course?.classes.find((x) => x.n === +m[2]);
    if (!k) return null;
    const card = m[3] === "t" && m[4] && m[4] !== "done" ? T.packs.get(course.id)?.classes[m[2]]?.cards[+m[4] - 1] : null;
    const step = !m[3] ? "The story" : m[3] === "explain" ? "Explain" : m[3] === "check" ? "Check"
      : m[4] && m[4] !== "done" ? "Topic " + m[4] + (card ? ": " + card.title : "") : "Topics";
    return { href: "#/study/" + p, course, text: (course.code ? course.code + " · " : "") + (course.unit || "Class") + " " + m[2] + " · " + k.name, step };
  }
  function continueBox(w, only) {
    const last = whereLabel(store.get("study:last"));
    if (!last || (only && last.course.id !== only)) return null;
    const box = el("div", "panel st-continue"), t = el("div", "t");
    t.append(el("span", "kicker", "Carry on where you were"), el("b", null, last.text), el("span", "small", last.step));
    box.append(t, link("Continue", last.href, "primary", "arrow", true));
    w.append(box);
    return last;
  }

  /* ---------- the courses ---------- */
  function renderPicker(w) {
    const hero = el("section", "st-hero");
    hero.append(el("p", "kicker", "Study"), el("h1", null, "What do you want to learn?"),
      el("p", "lede", "Every course of the Master, built from the lecturers' material, what was said in class and research we checked ourselves. Pick a course and take it class by class. What you know is remembered per course, and the app shows you what's starting to fade."));
    w.append(hero);
    const page = el("div", "st-page");
    findBox(w, T.cat.filter((c) => c.status === "ready").map((c) => c.id), page);
    todayCard(page);
    const last = continueBox(page);
    if (last) pack(last.course.id).catch(() => {});   // likely your next click: open it in the background
    [...new Set(T.cat.map((c) => c.block))].forEach((b) => {
      const s = el("section", "sect");
      s.append(K().h2((b.includes("–") ? "Blocks " : "Block ") + b));
      const grid = el("div", "st-grid st-courses");
      T.cat.filter((c) => c.block === b).forEach((c) => grid.append(courseTile(c)));
      s.append(grid); page.append(s);
    });
    syncLine(page);
    if (runOff()) { const p = el("p", "small"); p.append(document.createTextNode("Your run is hidden. "), K().textBtn("Show it again", () => { store.set("study:run:off", false); K().render(); })); page.append(p); }
  }
  function courseTile(c) {
    const ready = c.status === "ready";
    const a = el(ready ? "a" : "div", "panel st-tile st-course" + (ready ? "" : " coming"));
    if (ready) a.href = "#/study/" + c.id;
    const th = el("div", "th");
    if (c.code) th.append(el("span", "chip", c.code));
    th.append(el("b", null, c.name));
    a.append(th);
    const meta = [c.lecturer, ready ? c.classes.length + " " + unitsOf(c.unit || "Class") : null].filter(Boolean).join(" · ");
    if (meta) a.append(el("p", "ln", meta));
    if (ready) {
      const sm = Mem.summary(c.id), ms = el("div", "st-meters");
      ms.append(meter("Known", sm.known, c.items));
      a.append(ms, el("p", "small", !sm.seen ? "Not started yet" : sm.fading ? sm.fading + " fading: worth a look today" : "Nothing fading right now"));
    } else a.append(el("span", "st-state", "Coming"), el("p", "small", c.note || ""));
    return a;
  }
  function renderComing(w, c) {
    const head = el("div", "st-head");
    head.append(crumbs("#/study", "All courses"), el("p", "kicker", (c.code ? c.code + " · " : "") + "Block " + c.block), el("h1", null, c.name),
      el("p", "line", c.note || "This course is coming."));
    w.append(head);
  }

  /* ---------- one course ---------- */
  function renderHome(w) {
    const crs = T.data.course;
    const hero = el("section", "st-hero");
    hero.append(crumbs("#/study", "All courses"), el("p", "kicker", [crs.code, crs.full || crs.name, crs.lecturer].filter(Boolean).join(" · ")),
      el("h1", null, "Understand each " + unit().toLowerCase()),
      el("p", "lede", "Start a " + unit().toLowerCase() + " with its story. Then take its topics one at a time: the idea in plain words, a hotel example, the usual mix-up, and where to look it up" + (slides() ? " in the slides and the book" : "") + ". Then answer its open questions in your own words, and check yourself with a few quick questions."));
    if (crs.note) hero.append(el("p", "small st-note", crs.note));   // e.g. which workshops are in so far
    w.append(hero);
    const page = el("div", "st-page");
    findBox(w, [T.course], page);
    w = page;
    continueBox(w, T.course);
    const s1 = el("section", "sect");
    s1.append(K().h2(unitsOf(unit()).replace(/^./, (x) => x.toUpperCase()), "story → topics → explain → check"));
    const grid = el("div", "st-grid");
    T.data.nums.forEach((n) => {
      const c = T.data.classes[n], p = prog(n), a = el("a", "panel st-tile");
      a.href = cls(n); a.style.setProperty("--cc", color(n));
      const th = el("div", "th"); th.append(classChip(n), el("b", null, c.name));
      const ms = el("div", "st-meters");
      ms.append(meter("Topics", p.known, p.cards));
      if (p.likely) ms.append(meter("Explain", p.done, p.likely));
      if (p.drill) ms.append(meter("Check", p.right, p.drill));
      a.append(th, el("p", "ln", c.line), ms);
      if (!c.story.length) a.append(el("span", "st-state", "Notes only, explanations coming"));
      grid.append(a);
    });
    s1.append(grid); w.append(s1);
    if (T.data.frameworks.length) {
      const s2 = el("section", "sect"), fws = T.data.frameworks;
      s2.append(K().h2("Frameworks A–Z", "every framework in the course, as flashcards"));
      const a = el("a", "panel st-tile st-wide"); a.href = base() + "/cards";
      const th = el("div", "th"); th.append(el("b", null, "Framework flashcards"));
      const ms = el("div", "st-meters"); ms.append(meter("Known", fws.filter((f) => knows(f.id)).length, fws.length));
      a.append(th, el("p", "ln", "Read the name, say what it means and when you'd use it for a hotel, then turn the card." + (crs.notes?.frameworks ? " Exam notes " + crs.notes.frameworks + "." : "")), ms);
      s2.append(a); w.append(s2);
    }
    syncLine(w);
  }

  /* ---------- one class ---------- */
  let refreshSteps = () => {};
  function renderClass(w, n, rest) {
    const c = T.data.classes[n], crs = T.data.course;
    w.style.setProperty("--cc", color(n));
    const step = ["t", "explain", "check"].includes(rest[0]) ? rest[0] : "";
    const head = el("div", "st-head");
    const h1 = el("h1"); h1.append(document.createTextNode(c.name));
    const kick = el("div", "st-kick"); kick.append(classChip(n), el("span", "kicker", [c.kicker, notesPages(c)].filter(Boolean).join(" · ")));
    head.append(crumbs(base(), crs.code || crs.name), kick, h1, el("p", "line", c.line));
    const nav = el("nav", "st-steps"); nav.setAttribute("aria-label", "Steps");
    const counts = () => { const p = prog(n); return ["read first", p.known + "/" + p.cards + " known", p.done + "/" + p.likely + " done", p.right + "/" + p.drill + " right"]; };
    const smalls = [];
    [["", "Story"], ["t", "Topics"], ["explain", "Explain"], ["check", "Check"]].forEach(([k, l], j) => {
      const a = el("a", "st-step"); a.href = cls(n) + (k ? "/" + k : "");
      if (k === step) a.setAttribute("aria-current", "step");
      const sm = el("small", null, counts()[j]); smalls.push(sm);
      a.append(el("b", null, (j + 1) + " · " + l), sm); nav.append(a);
    });
    refreshSteps = () => { const cs = counts(); smalls.forEach((sm, j) => (sm.textContent = cs[j])); };
    head.append(nav); w.append(head);
    if (step === "t") renderTopic(w, n, rest[1]);
    else if (step === "explain") renderExplain(w, n, rest[1]);
    else if (step === "check") renderCheck(w, n);
    else renderStory(w, n);
  }

  function renderStory(w, n) {
    const c = T.data.classes[n], r = readOf(n);
    if (c.story.length) {
      const s = el("article", "panel st-story");
      s.append(el("p", "kicker", "The story of this " + unit().toLowerCase()));
      c.story.forEach((t) => s.append(rich("p", null, t)));
      w.append(s);
    } else {
      const s = el("div", "panel st-box"); s.append(el("p", "small", "The plain-words explanations for this " + unit().toLowerCase() + " aren't in yet. Its notes are all here: start with the topics."));
      w.append(s);
    }
    if (c.intro) {
      const ex = el("details", "st-notes"); ex.open = !c.story.length;
      const sum = el("summary"); sum.append(document.createTextNode("In one line, and what was stressed"), el("small", null, notesPages(c, "first")));
      ex.append(sum, notesDoc(c.intro, n)); w.append(ex);
    }
    const s2 = el("section", "sect");
    s2.append(K().h2("Topics", "one at a time; mark the ones you can explain"));
    const list = el("div", "panel st-trows");
    c.cards.forEach((k, i) => {
      const a = el("a", "st-trow"); a.href = cls(n) + "/t/" + (i + 1);
      const t = el("span", "t", k.title);
      if (Mem.note(C(), k.id).trim()) { const ic = K().icon("pen"); ic.classList.add("st-noted"); ic.setAttribute("aria-label", "You have a note here"); ic.removeAttribute("aria-hidden"); t.append(ic); }
      a.append(el("span", "n", String(i + 1)), t,
        r[i] === 1 ? el("span", "st-state ok", "Can explain") : r[i] === 0 ? el("span", "st-state no", "Not yet") : el("span"));
      list.append(a);
    });
    s2.append(list);
    const next = c.cards.findIndex((_, i) => r[i] !== 1);
    const btns = el("div", "btns");
    if (next < 0) btns.append(link("Go to Explain", cls(n) + "/explain", "primary", "arrow", true));
    else btns.append(link(next === 0 && r[0] == null ? "Start with topic 1" : "Continue with topic " + (next + 1), cls(n) + "/t/" + (next + 1), "primary", "arrow", true));
    s2.append(btns); w.append(s2);
  }

  function renderTopic(w, n, which) {
    const c = T.data.classes[n], r = readOf(n);
    if (which === "done") return topicsDone(w, n);
    let i = parseInt(which, 10) - 1;
    if (!(i >= 0 && i < c.cards.length)) {
      i = Math.max(0, c.cards.findIndex((_, k) => r[k] !== 1));
      history.replaceState(null, "", cls(n) + "/t/" + (i + 1)); store.set("study:last", T.course + "/c" + n + "/t/" + (i + 1));
    }
    const card = c.cards[i], x = card.x, to = (k) => cls(n) + "/t/" + (k + 1);
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
      art.append(sec("plain", "In plain words", "", x.plain), sec("hotel", "Picture it in a hotel", "", x.hotel), sec("mix", "Easy to mix up", "", x.mixup));
      if (x.exam) art.append(sec("exam", "How it comes up in the exam", "", x.exam));
      const say = el("div", "st-say");
      const a = rich("p", "a", x.ask.a); a.hidden = true;
      const show = K().button("Show the answer", "small", () => { a.hidden = !a.hidden; show.lastChild.textContent = a.hidden ? "Show the answer" : "Hide the answer"; }, "eye");
      say.append(el("p", "kicker", "Say it out loud, then check"), rich("p", "q", x.ask.q), show, a);
      art.append(say);
      const refs = sources(x.refs);
      if (refs) art.append(refs);
    }
    art.append(noteBox(C(), card.id));
    if (card.html) {
      const nd = el("details", "st-notes"); nd.open = !x || !!store.get("study:notesOpen");
      const sum = el("summary"); sum.append(document.createTextNode("Our notes for this topic"), el("small", null, notesPages(c)));
      nd.append(sum, notesDoc(card.html, n));
      if (x) nd.addEventListener("toggle", () => store.set("study:notesOpen", nd.open));
      art.append(nd);
    }
    const rate = el("div", "st-rate");
    rate.append(el("p", null, "Could you explain this to a classmate, with a hotel example?"));
    const mark = (v) => {
      Mem.grade(C(), card.id, v ? 3 : 1);
      const rr = readOf(n), after = c.cards.findIndex((_, k) => k > i && rr[k] !== 1), any = c.cards.findIndex((_, k) => rr[k] !== 1);
      location.hash = after >= 0 ? to(after) : any >= 0 && any !== i ? to(any) : cls(n) + "/t/done";
    };
    const no = K().button("Not yet", "", () => mark(0)), yes = K().button("I can explain this", "primary", () => mark(1), "check");
    if (r[i] === 0) no.classList.add("on"); if (r[i] === 1) yes.classList.add("on");
    rate.append(no, yes);
    art.append(rate);
    w.append(art);
    const nav = el("div", "st-nav");
    const prev = i > 0 ? link("Previous", to(i - 1), "ghost small", "back") : el("span");
    const next = i < c.cards.length - 1 ? link("Next topic", to(i + 1), "ghost small", "next", true) : link("Done with the topics", cls(n) + "/t/done", "ghost small", "next", true);
    nav.append(prev, el("span", "hint", "← → to move between topics"), next);
    w.append(nav);
    T.keys = (e) => {
      if (e.key === "ArrowRight") location.hash = i < c.cards.length - 1 ? to(i + 1) : cls(n) + "/t/done";
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
      c.cards.forEach((k, j) => { if (r[j] !== 1) { const li = el("li"), a = el("a", null, k.title); a.href = cls(n) + "/t/" + (j + 1); li.append(a); ul.append(li); } });
      d.append(ul);
    }
    const btns = el("div", "btns");
    if (left) btns.append(link("Go through them again", cls(n) + "/t/" + (c.cards.findIndex((_, k) => r[k] !== 1) + 1), "", "reset"));
    btns.append(link("Go to Explain", cls(n) + "/explain", "primary", "arrow", true));
    d.append(btns); w.append(d);
  }

  function renderExplain(w, n, which) {
    const c = T.data.classes[n], how3 = T.data.course.notes?.howTo;
    w.append(el("p", "small st-intro", "Answer each question in your own words first, before you look: a few bullets and an example. Then open the key points, tick the ones your answer covered, and mark yourself honestly."
      + (how3 && c.notesPages ? " In an exam this is your route: the question type on p. " + how3 + ", the class's likely questions on p. " + c.notesPages[1] + ", evidence from the case, then the p. " + how3 + " recipe." : "")));
    if (!c.likely.length) w.append(el("p", "small", "No open questions for this " + unit().toLowerCase() + " yet."));
    c.likely.forEach((q, i) => {
      const st = (get(exKey())[n] || {})[i] || {}, mk = markOf(q);   // your answer stays on this device
      const save = (fn) => update(exKey(), (s) => { s[n] = s[n] || {}; s[n][i] = s[n][i] || {}; fn(s[n][i]); });
      const card = el("article", "panel st-q");
      const ask = el("p", "ask"); ask.innerHTML = q.ask;   // from our notes
      const ta = el("textarea"); ta.placeholder = "Your answer, before you look"; ta.value = st.text || "";
      ta.setAttribute("aria-label", "Your answer");
      let tm = null;
      ta.addEventListener("input", () => { clearTimeout(tm); tm = setTimeout(() => save((s) => (s.text = ta.value)), 300); });
      const how = el("div", "st-how"); how.hidden = !st.shown;
      how.append(el("p", "kicker", ["How our notes answer it", notesPages(c, "last")].filter(Boolean).join(" · ")), notesDoc(q.html, n));
      // the key points of one good answer (on an example, when the question has one); you tick the
      // ones your answer covered and the app suggests a mark from them. No exam format assumed.
      const x = q.answer, ans = el("div", "st-ans"), ticks = new Set(st.ticks || []); ans.hidden = !(x && st.answer);
      const marks = el("div", "st-marks"), hint = el("p", "small st-hint");
      const LABEL = { got: "Got it", part: "Partly", miss: "Missed it" };
      const suggest = () => {
        if (!x) return;
        const n1 = ticks.size, all = x.points.length, k = n1 === all ? "got" : n1 * 2 >= all ? "part" : "miss";
        hint.textContent = n1 ? "You covered " + n1 + " of " + all + " key points: that's " + LABEL[k].toLowerCase() + "." : "Tick the key points your answer covered.";
        marks.querySelectorAll(".st-mark").forEach((m) => m.classList.toggle("suggest", !!n1 && m.dataset.k === k));
      };
      if (x) {
        ans.append(el("p", "kicker", "Key points of a good answer"));
        if (x.case) ans.append(rich("p", "st-case", x.case));
        const ol = el("ol", "st-points");
        x.points.forEach((p, k) => {
          const lab = el("label"), cb = el("input"); cb.type = "checkbox"; cb.checked = ticks.has(k);
          cb.addEventListener("change", () => { if (cb.checked) ticks.add(k); else ticks.delete(k); save((s) => (s.ticks = [...ticks])); suggest(); });
          lab.append(cb, rich("span", null, p));
          const li = el("li"); li.append(lab); ol.append(li);
        });
        ans.append(ol, rich("p", "st-concl", x.conclusion));
        const refs = sources(x.refs);
        if (refs) ans.append(refs);
        ans.append(el("p", "small", "One good answer, not the only one. Another route that is well argued counts too."));
      }
      marks.hidden = how.hidden && ans.hidden;
      marks.append(el("span", "small", "How did you do?"));
      [["got", "Got it", "m-got"], ["part", "Partly", "m-part"], ["miss", "Missed it", "m-miss"]].forEach(([k, l, cl]) => {
        const b = el("button", "st-mark " + cl, l); b.type = "button"; b.dataset.k = k; b.setAttribute("aria-pressed", String(mk === k));
        b.addEventListener("click", () => {
          Mem.grade(C(), q.id, GRADE[k]); refreshSteps();
          marks.querySelectorAll(".st-mark").forEach((m) => m.setAttribute("aria-pressed", String(m === b)));
        });
        marks.append(b);
      });
      if (x) { marks.append(hint); suggest(); }
      const show = K().button(st.shown ? "Hide how to answer" : "Show how to answer", "small", () => {
        const on = how.hidden; save((s) => (s.shown = on)); how.hidden = !on; marks.hidden = how.hidden && ans.hidden;
        show.lastChild.textContent = on ? "Hide how to answer" : "Show how to answer";
      }, "eye");
      const btns = el("div", "btns"); btns.append(show);
      if (x) {
        const see = K().button(ans.hidden ? "Show the key points" : "Hide the key points", "small", () => {
          const on = ans.hidden; save((s) => (s.answer = on)); ans.hidden = !on; marks.hidden = how.hidden && ans.hidden;
          see.lastChild.textContent = on ? "Hide the key points" : "Show the key points";
        }, "check");
        btns.append(see);
      }
      card.append(el("p", "kicker", "Question " + (i + 1) + " of " + c.likely.length), ask, ta, btns, how, ans, marks);
      w.append(card);
      if (+which === i + 1) { card.classList.add("st-here"); requestAnimationFrame(() => card.scrollIntoView({ block: "start" })); }
    });
    const nav = el("div", "st-nav");
    nav.append(link("Topics", cls(n) + "/t", "ghost small", "back"), link("Go to Check", cls(n) + "/check", "primary", "arrow", true));
    w.append(nav);
  }

  // Check runs the Practise drill on this class's questions, so the scores are the same everywhere.
  function renderCheck(w, n) {
    const c = T.data.classes[n], qs = c.drill, p = prog(n), st = store.get("drill:stats") || {};
    const from = "study/" + T.course + "/c" + n + "/check";
    const box = el("div", "panel st-check");
    box.append(el("p", "kicker", "Check yourself"), el("h2", null, qs.length ? qs.length + " questions on this " + unit().toLowerCase() : "No drill questions on this " + unit().toLowerCase() + " yet"));
    if (qs.length) {
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
      box.append(btns, el("p", "small", "New questions come first, then the ones you missed. Each answer says why, with the source to look it up." + (T.course === "ldd" ? " The scores are shared with the drill on Practise." : "")));
    }
    w.append(box);
    const more = el("div", "panel st-box"), mb = el("div", "btns");
    more.append(el("p", "kicker", "Then"));
    if (T.data.course.exam?.practise) {
      // the practice exams with questions on this class, read from the exams themselves
      const exams = (K().content()?.exams || []).filter((ex) => (ex.mcq || []).some((q) => (q.classes || []).includes(n)));
      more.append(el("p", null, exams.length
        ? "Try this class on a case. " + (exams.length === 1 ? "This exam has" : "These exams have") + " questions on it:"
        : "None of the practice exams has questions on this class yet."));
      exams.forEach((ex) => mb.append(link(ex.kind === "demo" ? "His trial exam" : ex.title, "#/practise/" + ex.id + "/case", "small", "arrow", true)));
    }
    const nx = T.data.nums[T.data.nums.indexOf(n) + 1];
    if (nx) mb.append(link("Next " + unit().toLowerCase() + ": " + T.data.classes[nx].name, cls(nx), "ghost small", "next", true));
    else mb.append(link("Back to " + (T.data.course.code || "the course"), base(), "ghost small", "back"));
    more.append(mb); w.append(more);
  }

  /* ---------- flashcards ---------- */
  function refOf(f, pk = T.data) {
    let m;
    f = { c: f.c, ref: String(f.ref || "") };
    if (f.c >= 1 && (m = f.ref.match(/^slides? (\d+)(?:[–-](\d+))?/))) return { src: "C" + f.c + " S" + m[1] + (m[2] ? "-" + m[2] : "") };
    if ((m = f.ref.match(/^(?:Gillingham )?(pp?\. \d+(?:[–-]\d+)?)/))) return { src: m[1].replace("–", "-"), cls: f.c };
    return { text: f.c === 0 ? "General · " + (f.ref || "the course") : unit(pk) + " " + f.c + (f.ref ? " · " + f.ref : "") };
  }
  function renderCards(w) {
    const FW = T.data.frameworks, crs = T.data.course;
    const head = el("div", "st-head");
    head.append(crumbs(base(), crs.code || crs.name), el("p", "kicker", "Frameworks A–Z" + (crs.notes?.frameworks ? " · exam notes " + crs.notes.frameworks : "")), el("h1", null, "Framework flashcards"),
      el("p", "line", "Read the name. Say what it means and when you'd use it for a hotel. Then turn the card. Cards you don't know come back a few cards later. You don't have to memorise them: recognise them and know where to look."));
    w.append(head);
    const filters = el("div", "st-filters");
    const groups = [...new Set(FW.map((f) => f.c))].sort((a, b) => a - b);
    [["all", "All"], ["new", "Not known yet"], ...groups.map((n) => ["c" + n, n === 0 ? "General" : unit() + " " + n])].forEach(([k, l]) => {
      const b = el("button", "st-fchip", l); b.type = "button"; b.setAttribute("aria-pressed", String(T.filter === k));
      b.addEventListener("click", () => { T.filter = k; K().render(); });
      filters.append(b);
    });
    w.append(filters);
    // "Not known yet": cards whose last answer wasn't "Knew it"
    const pool = FW.filter((f) => T.filter === "all" ? true : T.filter === "new" ? !knows(f.id) : f.c === +T.filter.slice(1));
    const deck = pool.map((f) => [Math.random(), f]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
    const stage = el("div", "st-stage"); w.append(stage);
    const tried = new Set();
    let firstGo = 0, turned = false, turn = null;
    function show() {
      stage.textContent = ""; turned = false;
      if (!deck.length) {
        const d = el("div", "panel st-done");
        d.append(el("p", "kicker", "Deck done"), el("h2", null, pool.length ? "You went through all " + pool.length + " cards" : "No cards here"), el("p", "small", firstGo + " known on the first go this round."));
        const b = el("div", "btns"); b.append(K().button("Shuffle again", "primary", () => K().render(), "reset"), K().button("Only the ones not known yet", "", () => { T.filter = "new"; K().render(); }));
        d.append(b); stage.append(d); return;
      }
      const f = deck[0], card = el("article", "panel st-flash"); card.style.setProperty("--cc", f.c ? color(f.c) : "var(--accent)");
      const top = el("div", "st-ftop"); top.append(f.c ? classChip(f.c) : el("span", "chip", "General"), el("span", "kicker", deck.length + " left"));
      const backSide = el("div", "st-back"); backSide.hidden = true;
      const r = refOf(f);
      backSide.append(el("p", "gist", f.gist));
      if (r.src) {
        const line = sources([r.src]);
        if (line) backSide.append(line);
        if (f.c) backSide.append(el("p", "small", unit() + " " + f.c + ": " + T.data.classes[f.c].name));
      } else backSide.append(el("p", "small", r.text));
      backSide.append(noteBox(C(), f.id));
      const row = el("div", "btns");
      const tb = K().button("Turn the card", "primary", () => turn()), again = K().button("Again", "", () => answer(false)), knew = K().button("Knew it", "primary", () => answer(true), "check");
      again.hidden = knew.hidden = true;
      row.append(tb, again, knew);
      // focus goes to the card, not to "Knew it", so a second Space can't answer for you
      card.tabIndex = -1;
      turn = () => { turned = true; backSide.hidden = false; tb.hidden = true; again.hidden = knew.hidden = false; card.focus({ preventScroll: true }); };
      card.append(top, el("p", "name", f.name), backSide, row);
      const hint = el("p", "hint"); hint.append(el("kbd", null, "Space"), document.createTextNode(" turn · "), el("kbd", null, "1"), document.createTextNode(" again · "), el("kbd", null, "2"), document.createTextNode(" knew it"));
      stage.append(card, hint);
    }
    function answer(ok) {
      const f = deck.shift();
      Mem.grade(C(), f.id, ok ? 3 : 1);
      if (!tried.has(f.id)) { tried.add(f.id); if (ok) firstGo++; }
      if (!ok) deck.splice(Math.min(3, deck.length), 0, f);
      show();
    }
    T.keys = (e) => {
      if (e.key === " " && deck.length) { if (!turned) turn(); }   // Space only turns the card
      else if (turned && e.key === "1") answer(false);
      else if (turned && e.key === "2") answer(true);
      else return false;
    };
    show();
  }

  /* ---------- today: the daily session ---------- */
  const MINS = [5, 10, 15];
  const mins = () => (MINS.includes(store.get("study:mins")) ? store.get("study:mins") : 5);
  const runOff = () => !!store.get("study:run:off");
  const plural = (n, one, many) => n + " " + (n === 1 ? one : many || one + "s");
  // Your daily mix: the courses you picked for it (study:mix, on this device); until you pick, the ready
  // courses you've started, or every ready course before you start one.
  function mix() {
    const ready = T.cat.filter((c) => c.status === "ready"), chosen = store.get("study:mix");
    const picked = Array.isArray(chosen) ? ready.filter((c) => chosen.includes(c.id)) : [];
    if (picked.length) return picked;
    const started = ready.filter((c) => Mem.summary(c.id).seen);
    return started.length ? started : ready;
  }
  // which ready courses today's session draws from; at least one stays in
  function mixRow(onChange) {
    const ready = T.cat.filter((c) => c.status === "ready");
    if (ready.length < 2) return null;
    const on = new Set(mix().map((c) => c.id));
    const g = el("div", "td-mix"); g.setAttribute("role", "group"); g.setAttribute("aria-label", "Courses in your session");
    g.append(el("span", null, "From"));
    ready.forEach((c) => {
      const b = el("button"), has = on.has(c.id); b.type = "button";
      b.setAttribute("aria-pressed", String(has)); b.title = (has ? "In your session: " : "Add to your session: ") + c.name;
      if (has) b.append(K().icon("check"));
      b.append(document.createTextNode(c.code || c.name));
      b.addEventListener("click", () => {
        const next = new Set(on); if (has) next.delete(c.id); else next.add(c.id);
        if (!next.size) return;
        store.set("study:mix", ready.filter((x) => next.has(x.id)).map((x) => x.id)); onChange();
      });
      g.append(b);
    });
    return g;
  }
  async function mixPacks() {
    const list = mix(), packs = await Promise.all(list.map((c) => pack(c.id)));
    return list.map((c, i) => ({ id: c.id, meta: c, pack: packs[i] }));
  }
  const begin = (p, list) => ({ steps: p.steps.slice(), i: 0, log: [], list, retried: new Set(), counted: Today.run(Mem.days(), Mem.today()).today });

  function todayCard(w) {
    const box = el("section", "panel td-card");
    box.append(el("p", "loading", "Getting today ready…"));
    w.append(box);
    const load = () => mixPacks().then((list) => { if (box.isConnected) fillToday(box, list, load); }).catch(() => box.remove());
    load();
  }
  function fillToday(box, list, load) {
    box.textContent = "";
    const s = T.sess, run = Today.run(Mem.days(), Mem.today());
    const top = el("div", "td-top"), body = el("div", "td-body");
    top.append(el("p", "kicker", "Today"));
    if (s && s.i < s.steps.length) {
      body.append(el("h2", null, "Carry on with today's session"), el("p", "td-what", s.i + " of " + s.steps.length + " cards done."));
      const b = el("div", "btns"); b.append(link("Continue", "#/study/today", "primary", "arrow", true)); body.append(b);
    } else {
      top.append(sizes(() => fillToday(box, list, load)));
      const p = (T.plan = Today.plan(list, mins()));
      if (!p.steps.length) body.append(el("h2", null, "All caught up"), el("p", "td-what", "Nothing is fading, and you've seen everything in your courses so far."));
      else {
        body.append(el("h2", null, run.today ? "Another " + mins() + " minutes?" : "Your " + mins() + " minutes for today"));
        const bits = [p.due && p.due + " fading", p.fresh && p.fresh + " new"].filter(Boolean);
        body.append(el("p", "td-what", plural(p.steps.length, "card") + ": " + bits.join(", ") + "."));
        if (p.next) {
          const x = p.next, c = x.pack.classes[x.it.class];
          body.append(el("p", "small", "New from " + [list.length > 1 ? x.pack.course.code : "", c ? unit(x.pack) + " " + x.it.class + ", " + c.name : x.pack.course.name].filter(Boolean).join(" · ") + "."));
        }
        const b = el("div", "btns");
        b.append(K().button("Start", "primary", () => { T.sess = begin(T.plan, list); K().go("study/today"); }, "play"));
        body.append(b);
      }
      const mr = mixRow(load); if (mr) body.append(mr);
    }
    box.append(top, body);
    if (!runOff()) box.append(runRow(run));
  }
  function sizes(onChange) {
    const g = el("div", "td-sizes"); g.setAttribute("role", "group"); g.setAttribute("aria-label", "Minutes a day");
    MINS.forEach((m) => {
      const b = el("button", null, m + " min"); b.type = "button"; b.setAttribute("aria-pressed", String(m === mins()));
      b.addEventListener("click", () => { store.set("study:mins", m); onChange(); });
      g.append(b);
    });
    return g;
  }
  // this week's days and the run; gentle: one missed day is a rest
  function runRow(run, justCounted) {
    const r = el("div", "td-run");
    const wk = el("ol", "td-week"); wk.setAttribute("aria-label", "This week");
    run.week.forEach((d) => {
      const li = el("li", "td-day " + d.state + (d.isToday ? " now" : "") + (justCounted && d.isToday ? " pop" : "")), dot = el("i");
      if (d.state === "done") dot.append(K().icon("check"));
      li.title = d.name + ": " + (d.state === "future" ? "still to come" : d.state === "done" ? plural(d.cards, "card") : d.cards ? d.cards + " of " + Today.DAY_MIN + " cards" : d.isToday ? "nothing yet" : "a rest");
      li.append(dot, el("span", null, d.label));
      wk.append(li);
    });
    const t = el("div", "td-runtext"), head = el("p");
    head.append(el("b", null, run.count ? run.count + "-day run" : "No run yet"));
    if (run.best > run.count) head.append(el("span", null, " · best " + run.best));
    const left = Today.DAY_MIN - run.cardsToday;
    const say = run.today ? (justCounted ? "Today counts." : "Today counts. Anything more is a bonus.")
      : run.cardsToday ? plural(left, "more card") + " and today counts."
      : run.keep ? "A few minutes today keep your run going."
      : run.count ? "Today can be a rest day: one missed day doesn't break your run."
      : Today.DAY_MIN + " cards make a day.";
    const note = el("p", "small", say);
    note.title = "A day counts once you've done " + Today.DAY_MIN + " cards (anywhere in Study, on any device). Missing one day is a rest and keeps the run; two days in a row start a new one.";
    t.append(head, note);
    r.append(wk, t, K().textBtn("Hide", () => { store.set("study:run:off", true); K().render(); }));
    return r;
  }

  function renderToday(w, list) {
    w.classList.add("td");
    if (!T.sess || (T.sess.i >= T.sess.steps.length && !T.sess.log.length)) {
      const p = Today.plan(list, mins());
      if (!p.steps.length) {
        const d = el("div", "panel st-done");
        d.append(el("p", "kicker", "Today"), el("h2", null, "All caught up"), el("p", "small", "Nothing is fading, and you've seen everything in your courses so far."));
        const b = el("div", "btns"); b.append(link("Back to Study", "#/study", "primary", "back")); d.append(b);
        w.append(d); return;
      }
      T.sess = begin(p, list);
    }
    const s = T.sess;
    const head = el("div", "td-head"), bar = el("div", "td-prog"), track = el("div", "st-track"), fill = el("i"), count = el("span");
    track.append(fill); bar.append(track, count);
    head.append(crumbs("#/study", "Study"), bar);
    const stage = el("div", "td-stage");
    w.append(head, stage);
    const show = () => {
      flushNote(); T.keys = null; stage.textContent = "";
      const n = s.steps.length;
      fill.style.width = pct(Math.min(s.i, n), n) + "%";
      count.textContent = s.i < n ? s.i + 1 + " / " + n : n + " / " + n;
      if (s.i >= n) return endOfSession(stage, s);
      const card = stepCard(s.steps[s.i], s, () => { s.i++; show(); window.scrollTo({ top: 0 }); });
      stage.append(card);
      card.focus({ preventScroll: true });
    };
    show();
  }

  const KIND = { say: "Explain it", flash: "Flashcard", pick: "Which framework?", where: "Where would you look?", mcq: "Question" };
  function ago(t) { const d = Math.floor((Date.now() / 1000 - t) / 86400); return d <= 0 ? "today" : d === 1 ? "yesterday" : d + " days ago"; }
  function chipOf(pk, n) { const c = el("span", "chip", unitShort(pk) + n); c.style.setProperty("--cc", color(n, pk)); c.title = unit(pk) + " " + n + ": " + (pk.classes[n]?.name || ""); return c; }
  function whereLine(pk, it) {
    const r = refOf({ c: it.class || 0, ref: it.ref }, pk), w = el("div", "td-loc");
    if (r.src) {
      const l = K().sourcesLine([r.src], !!pk.course.slides);
      if (l) w.append(l);
      if (it.class && pk.classes[it.class]) w.append(el("p", "small", unit(pk) + " " + it.class + ": " + pk.classes[it.class].name));
    } else w.append(el("p", "small", r.text));
    return w;
  }
  function gradeRow(onGrade) {
    const g = el("div", "td-grade");
    [[1, "Missed it"], [2, "Partly"], [3, "Got it"]].forEach(([v, l]) => {
      const b = el("button", "btn g" + v); b.type = "button";
      b.append(el("kbd", null, String(v)), document.createTextNode(l));
      b.addEventListener("click", () => onGrade(v));
      g.append(b);
    });
    return g;
  }
  function choices(labels, letters, onPick) {
    const box = el("div", "td-opts");
    const btns = labels.map((t, i) => {
      const b = el("button", "opt td-opt"); b.type = "button";
      b.append(el("span", "ol", letters ? "ABCDE"[i] : String(i + 1)), el("span", "ot", t));
      b.addEventListener("click", () => onPick(i));
      box.append(b); return b;
    });
    const lock = (right, picked) => btns.forEach((b, i) => { b.classList.add("locked"); b.setAttribute("aria-disabled", "true"); if (i === right) b.classList.add("right"); else if (i === picked) b.classList.add("wrong"); });
    return { box, lock };
  }

  // One card of the session. next() moves on; grades go to Mem as you answer.
  function stepCard(st, s, next) {
    const it = st.it, pk = st.pack, n = it.class, x = it.x, links = !!pk.course.slides;
    const a = el("article", "panel td-step td-" + st.kind); a.tabIndex = -1;
    const hide = st.kind === "where";   // the class is the answer: no chip or class colour
    a.style.setProperty("--cc", n && pk.classes[n] && !hide ? color(n, pk) : "var(--accent)");
    const top = el("div", "td-ctop"), tags = el("div", "td-tags");
    if (s.list.length > 1) tags.append(el("span", "chip", pk.course.code || pk.course.name));
    if (n && pk.classes[n] && !hide) tags.append(chipOf(pk, n));
    tags.append(el("span", "kicker", st.kind === "learn" ? (it.kind === "topic" ? "New topic" : "New framework") : KIND[st.kind]));
    const why = st.why === "new" ? el("span", "td-why new", "New to you")
      : st.why === "retry" ? el("span", "td-why", "Once more")
      : el("span", "td-why fading", "Last seen " + ago(st.seen) + " · memory " + Math.round(st.r * 100) + "%");
    top.append(tags, why);
    a.append(top);
    const foot = el("div", "td-foot");
    const grade = (g) => {
      if (g == null) { Mem.tick(); s.log.push({ step: st, g: null }); return; }
      Mem.grade(st.course, it.id, g);
      s.log.push({ step: st, g });
      if (g === 1 && st.why !== "retry" && !s.retried.has(it.id)) {
        const again = Today.retry(st);
        if (again) { s.retried.add(it.id); s.steps.splice(Math.min(s.i + 4, s.steps.length), 0, again); }
      }
    };
    const cont = (label = "Continue") => K().button(label, "primary", next, "arrow", true);

    if (st.kind === "learn") {
      a.append(el("h2", "td-title", it.title));
      if (it.kind === "topic") {
        if (x) a.append(sec("plain", "In plain words", "", x.plain), sec("hotel", "Picture it in a hotel", "", x.hotel), sec("mix", "Easy to mix up", "", x.mixup));
        else if (it.notes) a.append(notesDoc(it.notes, n, links));
        const refs = K().sourcesLine(x?.refs || it.refs, links); if (refs) a.append(refs);
        if (x && it.notes) {
          const nd = el("details", "st-notes"), sum = el("summary");
          sum.append(document.createTextNode("Our notes for this topic"));
          nd.append(sum, notesDoc(it.notes, n, links)); a.append(nd);
        }
      } else a.append(el("p", "td-gist", it.gist), whereLine(pk, it));
      a.append(noteBox(st.course, it.id));
      const go = K().button("Continue", "primary", () => { grade(null); next(); }, "arrow", true);
      foot.append(el("p", "hint", it.kind === "topic" ? "You'll explain it in a moment." : "You'll meet it again in a moment."), go);
      a.append(foot);
      T.keys = (e) => { if (e.key === "Enter" || e.key === "ArrowRight" || e.key === " ") go.click(); else return false; };
      return a;
    }

    if (st.kind === "say" || st.kind === "flash") {
      const flash = st.kind === "flash";
      if (flash) a.append(el("h2", "td-title", it.title), el("p", "td-ask", "What is it, and when would you use it for a hotel?"));
      else a.append(el("p", "td-topic", it.title), rich("p", "td-q", x ? x.ask.q : "Explain it in your own words, with a hotel example."), el("p", "small", "Say it out loud or in your head, then check."));
      const back = el("div", "td-ans"); back.hidden = true;
      if (flash) back.append(el("p", "td-gist", it.gist), whereLine(pk, it));
      else {
        if (x) back.append(rich("p", null, x.ask.a)); else if (it.notes) back.append(notesDoc(it.notes, n, links));
        const refs = K().sourcesLine(x?.refs || it.refs, links); if (refs) back.append(refs);
      }
      const mine = noteShow(st.course, it.id); if (mine) back.append(mine);
      const rate = gradeRow((g) => { grade(g); next(); }); rate.hidden = true;
      const ask = el("p", "td-rate", "How did you do?"); ask.hidden = true;
      let open = false;
      const turn = () => { open = true; back.hidden = rate.hidden = ask.hidden = false; foot.hidden = true; a.focus({ preventScroll: true }); };
      const reveal = K().button(flash ? "Turn the card" : "Show the answer", "primary", turn, flash ? "reset" : "eye");
      const hint = el("p", "hint td-keys");
      hint.append(el("kbd", null, "Space"), document.createTextNode(flash ? " to turn it" : " to show it"));
      foot.append(hint, reveal);
      a.append(back, ask, rate, foot);
      T.keys = (e) => {
        if (!open && (e.key === " " || e.key === "Enter")) turn();
        else if (open && ["1", "2", "3"].includes(e.key)) { grade(+e.key); next(); }
        else return false;
      };
      return a;
    }

    // the cards you answer by picking: a framework from its summary, where to look, a drill question
    let opts, right, labels, letters = false, feedback;
    if (st.kind === "pick") {
      a.append(el("p", "td-q", "Which framework is this?"));
      const cue = el("p", "td-cue");
      st.pick.cue.forEach((p) => cue.append(p === null ? el("span", "td-blank") : document.createTextNode(p)));
      a.append(cue);
      labels = st.pick.options; right = st.pick.answer;
      feedback = (ok) => { const f = el("div", "td-ans"); f.append(el("p", "td-verdict " + (ok ? "ok" : "no"), ok ? "Right." : "It's " + Today.nameOf(it.title) + "."));
        if (st.pick.cue.includes(null)) f.append(el("p", "td-gist", it.gist));   // the summary without blanks
        f.append(whereLine(pk, it)); return f; };
    } else if (st.kind === "where") {
      a.append(el("p", "td-q", "Where would you look it up?"), el("h2", "td-title", it.title), el("p", "td-gist", it.gist));
      labels = st.where.options.map((c) => unit(pk) + " " + c + " · " + pk.classes[c].name); right = st.where.answer;
      feedback = (ok) => { const f = el("div", "td-ans"); f.append(el("p", "td-verdict " + (ok ? "ok" : "no"), ok ? "Right." : "It's in " + unit(pk).toLowerCase() + " " + n + "."), whereLine(pk, it)); return f; };
    } else {
      a.append(el("p", "td-stem", it.stem));
      labels = it.options; right = "ABCDE".indexOf(it.answer); letters = true;
      feedback = (ok) => {
        const f = el("div", "fb " + (ok ? "ok" : "no")), h = el("div", "fbhead");
        h.append(K().icon(ok ? "check" : "x"), document.createTextNode(ok ? "Right" : "Not this one: the answer is " + it.answer));
        f.append(h, rich("p", null, it.why));
        if (it.concept) f.append(el("p", "concept", it.concept));
        const refs = K().sourcesLine(it.refs, links); if (refs) f.append(refs);
        return f;
      };
    }
    let picked = null, go = null;
    const pickIt = (i) => {
      if (picked !== null || i < 0 || i >= labels.length) return;
      picked = i;
      const ok = i === right;
      opts.lock(right, i);
      if (st.kind === "mcq") {   // the same scores as the drill on Practise and Check
        const stats = store.get("drill:stats") || {};
        stats[it.id] = { seen: (stats[it.id]?.seen || 0) + 1, right: ok ? 1 : 0 };
        store.set("drill:stats", stats);
      }
      grade(ok ? 3 : 1);
      a.insertBefore(feedback(ok), foot);
      go = cont(); foot.textContent = ""; foot.append(go);
      go.focus({ preventScroll: true });
    };
    opts = choices(labels, letters, pickIt);
    a.append(opts.box, foot);
    const hint = el("p", "hint td-keys");
    hint.append(el("kbd", null, letters ? "A–E" : "1–" + labels.length), document.createTextNode(" to answer"));
    foot.append(hint);
    T.keys = (e) => {
      if (picked === null) {
        const k = e.key.toLowerCase(), i = /^[1-5]$/.test(k) ? +k - 1 : letters && /^[a-e]$/.test(k) ? k.charCodeAt(0) - 97 : -1;
        if (i < 0) return false;
        pickIt(i);
      } else if (e.key === "Enter" || e.key === "ArrowRight" || e.key === " ") go.click();
      else return false;
    };
    return a;
  }

  function endOfSession(stage, s) {
    stage.previousElementSibling?.querySelector(".td-prog")?.setAttribute("hidden", "");
    const run = Today.run(Mem.days(), Mem.today()), justCounted = run.today && !s.counted;
    const graded = s.log.filter((l) => l.g), ids = (why) => new Set(s.log.filter((l) => l.step.why === why).map((l) => l.step.it.id)).size;
    const d = el("section", "panel td-end");
    d.append(el("p", "kicker", "Today's session"), el("h2", null, justCounted ? "Done, and today counts" : "Done"));
    const stats = el("div", "td-stats");
    [[s.log.length, "cards"], [ids("new"), "new to you"], [ids("fading"), "brought back"], [graded.filter((l) => l.g >= 3).length + "/" + graded.length, "right"]]
      .forEach(([v, l]) => { const b = el("div"); b.append(el("b", null, String(v)), el("span", null, l)); stats.append(b); });
    d.append(stats);
    if (!runOff()) d.append(runRow(run, justCounted));
    // where each course in the mix stands, and what comes back tomorrow
    const where = el("div", "td-courses");
    s.list.forEach(({ id, meta }) => {
      const sm = Mem.summary(id), row = el("div", "td-course");
      row.append(el("b", null, meta.code || meta.name), meter("Known", sm.known, meta.items), el("span", "small", sm.fading ? sm.fading + " fading" : "nothing fading"));
      where.append(row);
    });
    const tm = Today.tomorrow(s.list);
    where.append(el("p", "small", tm ? "About " + plural(tm, "card") + " will be fading by tomorrow evening: that's tomorrow's session." : "Nothing will be fading by tomorrow."));
    d.append(where);
    const b = el("div", "btns");
    b.append(link("Back to Study", "#/study", "primary", "back"),
      K().button(mins() + " more minutes", "", () => { T.sess = begin(Today.plan(s.list, mins()), s.list); K().render(); window.scrollTo({ top: 0 }); }, "play"));
    d.append(b);
    stage.append(d);
    // something deeper: an open question from a class you just worked on
    const deep = deeper(s);
    if (deep) {
      const q = el("section", "panel td-deep"), tmp = el("div"); tmp.innerHTML = deep.q.ask;   // from our notes
      q.append(el("p", "kicker", "Something deeper, when you have ten minutes"), el("p", "td-q", tmp.textContent.trim()),
        el("p", "small", "Answer it in your own words, then compare with how our notes answer it."));
      const qb = el("div", "btns"); qb.append(link("Answer it", "#/study/" + deep.course + "/c" + deep.n + "/explain", "small", "arrow", true));
      q.append(qb); stage.append(q);
    }
    T.keys = null;
  }
  function deeper(s) {
    const seen = [];
    s.log.forEach((l) => { const k = l.step.course + ":" + l.step.it.class; if (l.step.it.class && !seen.some((x) => x.k === k)) seen.push({ k, st: l.step }); });
    for (const { st } of seen.reverse()) {
      const q = st.pack.items.find((it) => it.kind === "prompt" && it.class === st.it.class && (!Mem.get(st.course, it.id) || Mem.recall(st.course, it.id) < Today.FADING));
      if (q) return { course: st.course, n: st.it.class, q };
    }
    return null;
  }

  document.addEventListener("keydown", (e) => {
    if (!T.keys || S.tab !== "study" || document.body.classList.contains("slideview-open")) return;
    const t = e.target, tag = t && t.tagName;
    if (tag === "TEXTAREA" || tag === "INPUT" || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === " " && (tag === "BUTTON" || tag === "A" || tag === "SUMMARY")) return;
    if (T.keys(e) !== false) e.preventDefault();
  });
  // a note half typed is saved when you leave the page or switch apps
  window.addEventListener("pagehide", flushNote);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flushNote(); });
  // progress arrived from another device: show it, unless you're typing or halfway through a deck
  window.addEventListener("mem-changed", () => {
    if (S.tab !== "study" || !T.cat || /\/(cards|today)$/.test(location.hash)) return;
    const a = document.activeElement;
    if (a && (a.tagName === "TEXTAREA" || a.tagName === "INPUT")) return;
    K().render();
  });

  return { render };
})();

window.Study = Study;
