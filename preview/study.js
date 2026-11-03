/* Study: learn every course of the Master, class by class. The Study home (the front desk) opens on
   today's session, with the crab, then the courses: the current block's first, earlier blocks folded.
   A course opens as a hotel (path.js): a floor per class, a room per topic, each a short lesson played
   full screen by lesson.js, which also plays the daily session. Each class also has its notes pages
   ("Class notes" on its floor), below. A class opens with its story, then one topic at a time: the idea in plain
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
   Your case notebook (#/study/ldd/case) keeps the topics you've applied to a hotel of your choice.
   Search (#/study/search) and More (#/more: LDD's exam room, your settings, how it works) are tabs.
   Addresses: #/study (the courses), #/study/today, #/study/ldd (the hotel), #/study/ldd/f/6 (a floor),
   #/study/ldd/l/c6-l2 (a lesson), #/study/ldd/l/mixups, …/l/refresh, …/l/mistakes, #/study/ldd/c6, #/study/ldd/c6/t/3,
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
    if (!T.catLoading) T.catLoading = K().openBox("packs/catalog.enc").then((c) => {
      T.blocks = c.blocks || [];
      // weeks with no class in any course pause the run of study weeks
      Today.setTerm(c.courses.flatMap((x) => [...classesOf(x).map((k) => k.date), ...(x.events || []).map((e) => e.date)]));
      return (T.cat = c.courses);
    }).catch((e) => { T.catLoading = null; throw e; });
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
    s.append(h, VText.el("p", null, text));   // key terms, lists and figures drawn
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
    // where it stands for you: a topic's room and its light, a framework's light
    if ((e.kind === "topic" || e.kind === "framework") && e.course) {
      const st = Mem.get(e.course, e.id), r0 = st ? Mem.recall(e.course, e.id) : null, rm = e.kind === "topic" && e.pk ? Path.roomOf(e.pk, e.id) : null;
      const lv = !st ? "dark" : r0 < Today.FADING ? "dim" : "lit";
      const tag = el("span", "st-light " + lv);
      tag.append(el("i"), document.createTextNode((rm ? "Room " + rm.no + " · " : "") + (lv === "lit" ? "you know it" : lv === "dim" ? "dimming" : "not yet")));
      s.append(tag);
    }
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
    Lesson.stop();
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
    if (seg[0] === "search") return renderSearch(w);
    if (seg[0] === "plaques") {
      const ready = T.cat.filter((c) => c.status === "ready");
      const packs = await Promise.all(ready.map((c) => pack(c.id).catch(() => null)));
      if (location.hash !== at) return;
      return Awards.render(w, ready.map((c, i) => ({ id: c.id, pk: packs[i] })));
    }
    if (!course) return renderPicker(w);
    if (course.status !== "ready") return renderComing(w, course);
    const rest = seg.slice(1), m = /^c(\d+)$/.exec(rest[0] || "");
    const ctx = { course: course.id, pk: T.data, meta: course };
    if (rest[0] === "cards" && T.data.frameworks.length) renderCards(w);
    else if (rest[0] === "l" && rest[1]) Path.play(w, ctx, rest[1]);
    else if (rest[0] === "f" && rest[1] != null) Path.renderFloor(w, ctx, rest[1]);
    else if (rest[0] === "case") renderCase(w);
    else if (rest[0] === "pass" && rest[1]) Path.playPass(w, ctx, rest.slice(1));
    else if (rest[0] === "inbox" && Inbox.has(T.data)) Inbox.render(w, ctx);
    else if (rest[0] === "index") renderIndex(w);
    else if (m && T.data.classes[m[1]]) { store.set("study:last", [course.id, ...rest].join("/")); renderClass(w, +m[1], rest.slice(1)); }
    else {
      const just = T.justDone; T.justDone = null;
      Path.render(w, { ...ctx, justDone: just });
    }
  }

  /* ---------- the timetable: before and after class ----------
     A course's classes with their dates: from its schedule in the course list (MyTimetable), and the
     classes already built into its pack. The evening before (or the day of) a class, Today offers a
     warm-up; for the week after it, its new things come first; on your first visit from day 3, and again
     from day 7, a few of them come back (marked back1:<n>, back2:<n> on the path once done, so a later
     visit still gets them). A class still to come is a floor under construction. */
  const unitName = (x) => x?.course?.unit || x?.unit || "Class";   // a pack, or a course in the list
  const dnum = (iso) => Math.round(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 864e5);
  const tnum = () => dnum(Mem.today());
  const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const shortDate = (iso) => new Date(iso + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  function classesOf(c) {
    const by = new Map();
    (c?.classes || []).forEach((k) => by.set(+k.n, { n: +k.n, date: k.date || null, name: k.name, built: true }));
    (c?.schedule || []).forEach((x) => { const o = by.get(+x.n) || { n: +x.n, built: false }; by.set(+x.n, { ...o, date: x.date, time: x.time, also: x.also, label: x.name || null }); });
    return [...by.values()].sort((a, b) => a.n - b.n);
  }
  // "Monday's class", "yesterday's class", "today's class"; older: "the 9 Nov class"
  function classDay(iso) {
    const d = tnum() - dnum(iso);
    if (d === 0) return "today's class"; if (d === 1) return "yesterday's class";
    if (d > 1 && d < 7) return WEEKDAY[new Date(iso + "T12:00:00").getDay()] + "'s class";
    return "the " + new Date(iso + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" }) + " class";
  }
  // classes later today or tomorrow, in every course with a timetable
  function upcoming() {
    const t0 = tnum(), hm = new Date().toTimeString().slice(0, 5), out = [];
    (T.cat || []).forEach((c) => classesOf(c).forEach((k) => {
      if (!k.date) return;
      const d = dnum(k.date) - t0;
      if ((d === 0 && (!k.time || k.time > hm)) || d === 1) out.push({ c, k, when: d ? "tomorrow" : "today" });
    }));
    return out.sort((a, b) => (a.k.date + (a.k.time || "")).localeCompare(b.k.date + (b.k.time || "")));
  }
  // a warm-up for class n: the class before it, if the course has it
  const warmable = (c, n) => c.status === "ready" && (c.classes || []).some((k) => +k.n < n);
  function planOpts(list) {
    const t0 = tnum(), recent = new Map(), returns = [], label = {};
    list.forEach(({ id }) => {
      const c = T.cat.find((x) => x.id === id);
      classesOf(c).forEach((k) => {
        if (!k.built || !k.date) return;
        const d = t0 - dnum(k.date);
        if (d >= 0 && d <= 7) { if (!recent.has(id)) recent.set(id, new Set()); recent.get(id).add(k.n); label[id + ":" + k.n] = "from " + classDay(k.date); }
        // the returns wait for your next visit: the first from day 3 (until three weeks on), the second from
        // day 7 and at least three days after the first (until four weeks on)
        const b1 = Mem.flagAt(id, "back1:" + k.n), b2 = Mem.flagged(id, "back2:" + k.n), label2 = "back from " + classDay(k.date);
        if (!b1 && d >= 3 && d <= 21) returns.push({ course: id, n: k.n, round: 1, label: label2 });
        else if (b1 && !b2 && d >= 7 && d <= 28 && t0 - dnum(Mem.today(new Date(b1 * 1000))) >= 3) returns.push({ course: id, n: k.n, round: 2, label: label2 });
      });
    });
    const ready = new Map();
    list.forEach(({ id }) => { const r = readyOf(id); if (r) ready.set(id, { at: r.at, label: "for " + shortDate(r.date) }); });
    return { recent, returns, label, ready, welcome: Today.run(Mem.days(), Mem.today()).welcome };
  }
  /* ---------- ready by a date ----------
     An exam or a presentation: pick it (from the course's timetable, or any date), and in its last six weeks
     your sessions bring back a few things a visit that would have faded by then (today.js). No countdown:
     dates only. Kept per course on this device (study:ready:<course>). */
  function readyOf(c) {
    const d = store.get("study:ready:" + c);
    if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d) || d < Mem.today()) return null;
    const [y, m, dd] = d.split("-").map(Number);
    return { date: d, at: Math.floor(new Date(y, m - 1, dd, 23, 59).getTime() / 1000) };
  }
  function readyBox(c, meta, pk) {
    const box = el("section", "panel rb"), r = readyOf(c), today = Mem.today();
    const evs = (meta?.events || []).filter((e) => e.date && e.date >= today);
    const set = (d) => { store.set("study:ready:" + c, d); T.readyEdit = null; K().render(); };
    if (r && T.readyEdit !== c) {
      const ev = evs.find((e) => e.date === r.date), days = (r.at - Date.now() / 1000) / 86400;
      const t = el("p", "rb-h"); t.append(K().icon("star"), el("b", null, "Ready by " + shortDate(r.date)), document.createTextNode(ev ? " · " + ev.name : ""));
      box.append(t);
      if (pk) {
        const rooms = pk.items.filter((it) => it.kind === "topic"), learnt = rooms.filter((it) => Mem.get(c, it.id)).length;
        const onTrack = rooms.filter((it) => Mem.get(c, it.id) && Mem.recall(c, it.id, r.at) >= Today.FADING).length;
        box.append(el("p", "small", learnt + " of " + rooms.length + " rooms learnt" + (days <= 21 && onTrack ? " · " + onTrack + " will still be lit that day" : "") + ". "
          + (days <= 42 ? "Your sessions now bring back, a few at a time, what would fade by then." : "From six weeks before, your sessions spread the reviews so it's all lit by then.")));
      } else box.append(el("p", "small", "Once its classes are in, your sessions spread the reviews so it's all lit by then."));
      const b = el("div", "btns"); b.append(K().textBtn("Change the date", () => { T.readyEdit = c; K().render(); }), K().textBtn("No date", () => set(null)));
      box.append(b);
      return box;
    }
    box.append(el("p", "rb-h", "Ready by a date?"), el("p", "small", "An exam or a presentation: pick it, and in the last six weeks your sessions spread the reviews so the whole hotel is lit by then. No countdown."));
    const b = el("div", "btns rb-pick");
    evs.forEach((e) => b.append(K().button(e.name + " · " + shortDate(e.date), "small", () => set(e.date), "star")));
    const inp = el("input"); inp.type = "date"; inp.min = today; inp.setAttribute("aria-label", "Another date");
    const go = K().button("Set", "small ghost", () => { if (inp.value && inp.value >= today) set(inp.value); });
    const lab = el("label", "rb-date"); lab.append(el("span", "small", evs.length ? "Or another date" : "A date"), inp);
    b.append(lab, go);
    if (r) b.append(K().textBtn("Keep " + shortDate(r.date), () => { T.readyEdit = null; K().render(); }));
    box.append(b);
    return box;
  }
  // the class returns a finished session brought back: done, so they don't come again
  function markReturns(steps) {
    const done = new Set();
    steps.forEach((st) => { if (st.why === "after" && st.round) done.add(st.course + "|back" + st.round + ":" + st.n); });
    done.forEach((x) => { const [c, k] = x.split("|"); Mem.flag(c, k); });
  }
  // the course's timetable, as a short list (folded away on a course page)
  function timetable(c, pk) {
    const ks = classesOf(c).filter((k) => k.date);
    if (!ks.length) return null;
    const t0 = tnum(), next = ks.find((k) => dnum(k.date) >= t0), U = unitName(pk || c);
    const d = el("details", "tt"), sm = el("summary");
    sm.append(el("span", "kicker", "Timetable"), el("span", "small", next ? "Next: " + U.toLowerCase() + " " + next.n + ", " + shortDate(next.date) + (next.time ? ", " + next.time : "") : "All classes held"));
    d.append(sm);
    const ol = el("ol", "tt-list");
    ks.forEach((k) => {
      const li = el("li", dnum(k.date) < t0 ? "past" : k === next ? "next" : "");
      li.append(el("b", null, U + " " + k.n + (k.label ? " · " + k.label : "")), el("span", null, shortDate(k.date) + (k.time ? ", " + k.time : "") + (k.also ? " and " + shortDate(k.also) : "")));
      li.append(el("small", null, k.built ? "floor open" : dnum(k.date) < t0 ? "floor coming soon" : "floor opens after the class"));
      ol.append(li);
    });
    (c.events || []).forEach((e) => { const li = el("li", "ev"); li.append(el("b", null, e.name), el("span", null, shortDate(e.date) + (e.time ? ", " + e.time : ""))); ol.append(li); });
    d.append(ol);
    if (c.scheduleFrom) d.append(el("p", "small", "From " + c.scheduleFrom + ". Timetables change: check MyTimetable before a class."));
    return d;
  }

  /* ---------- the front desk: Study's home ----------
     Today first, with the crab. Then the courses of the block you're in, the ones that run across
     blocks, and earlier blocks folded away (open when the current block has nothing ready yet). The
     current block is the latest one in the course list. Search has its own tab. */
  // the block you're in (by its start date) and the crab's shell for it: Block A a beach hut, B a
  // boutique hotel, C and after a grand hotel
  const SHELLS = ["hut", "boutique", "grand"];
  function blockNow() {
    const list = (T.blocks || []).filter((b) => b.start).sort((a, b) => a.start.localeCompare(b.start)), d = Mem.today();
    let i = -1; list.forEach((b, k) => { if (b.start <= d) i = k; });
    return i < 0 ? null : { ...list[i], i, shell: SHELLS[Math.min(i, 2)], prev: list[i - 1] || null };
  }
  const shellNow = () => blockNow()?.shell || "boutique";
  const crabOpt = (o = {}) => ({ shell: shellNow(), lights: Crab.seasonAt() === "lights", ...o });
  const dayOf = (iso) => new Date(iso + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  function blocksOf() {
    const all = [...new Set(T.cat.map((c) => c.block))], single = all.filter((b) => /^[A-Z]$/.test(b)).sort();
    const now = single[single.length - 1] || null;
    return { now, across: all.filter((b) => !/^[A-Z]$/.test(b)), past: single.filter((b) => b !== now).reverse() };
  }
  function renderPicker(w) {
    w.append(el("h1", "sr", "Study"));
    const page = el("div", "st-page fd");
    movingDay(page);
    todayCard(page);
    const { now, across, past } = blocksOf(), tiles = [];
    const grid = (list) => { const g = el("div", "fd-grid"); list.forEach((c) => { const t = courseTile(c); tiles.push([c, t]); g.append(t); }); return g; };
    const nowReady = now && T.cat.some((c) => c.block === now && c.status === "ready");
    const nowStart = (T.blocks || []).find((b) => b.id === now)?.start;
    if (now) { const s = el("section", "fd-sec"); s.append(el("h2", "fd-h", "Block " + now + (nowStart && nowStart > Mem.today() ? " · starts " + dayOf(nowStart) : " · now")), grid(T.cat.filter((c) => c.block === now))); page.append(s); }
    across.forEach((b) => { const s = el("section", "fd-sec"); s.append(el("h2", "fd-h", "Across blocks " + b), grid(T.cat.filter((c) => c.block === b))); page.append(s); });
    past.forEach((b, i) => {
      const list = T.cat.filter((c) => c.block === b), d = el("details", "fd-past"), sm = el("summary");
      const k = (T.blocks || []).findIndex((x) => x.id === b), hut = el("span", "fd-hut");
      // the crab's old shell, asleep, once the block is really over (by date)
      if (k >= 0 && (blockNow()?.i ?? -1) > k) { hut.innerHTML = Crab.svg("rest", { shell: SHELLS[Math.min(k, 2)] }); hut.title = "The crab's old shell"; }
      sm.append(hut, el("span", "fd-h", "Block " + b + " · done"), el("small", null, list.map((c) => c.code || c.name).join(", ")));
      d.append(sm, grid(list));
      if (!nowReady && i === 0) d.open = true;
      page.append(d);
    });
    const about = el("p", "small fd-about"); const al = el("a", null, "How Check-in works"); al.href = "#/more"; about.append(al);
    page.append(about);
    syncLine(page);
    w.append(page);
    // the tiles show rooms lit once their courses are open (the Today card opens them anyway)
    const ready = T.cat.filter((c) => c.status === "ready");
    Promise.all(ready.map((c) => pack(c.id))).then(() => tiles.forEach(([c, t]) => { if (t.isConnected && c.status === "ready") t.replaceWith(courseTile(c)); })).catch(() => {});
  }
  // moving day: the first weeks of a new block, a card until you've seen it
  function movingDay(page) {
    const b = blockNow();
    if (!b || b.i < 1 || store.get("study:moved") === b.id) return;
    if ((new Date(Mem.today()) - new Date(b.start)) / 864e5 > 21) return;
    const box = el("section", "panel fd-move"), scene = el("div", "fd-scene"), t = el("div", "fd-movet");
    const from = el("span", "fd-from"), arrow = el("span", "fd-arrow"), to = el("span", "fd-to");
    from.innerHTML = Crab.svg("idle", { shell: SHELLS[Math.min(b.i - 1, 2)] }).replace("<svg ", '<svg opacity=".45" ');
    arrow.append(K().icon("arrow"));
    to.innerHTML = Crab.svg("done", crabOpt({ label: "The crab in its new hotel" }));
    scene.append(from, arrow, to);
    const NAME = { hut: "beach hut", boutique: "boutique hotel", grand: "grand hotel" };
    const these = T.cat.filter((c) => c.block === b.id).map((c) => [c.code, c.name].filter(Boolean).join(" · "));
    t.append(el("p", "kicker", "Block " + b.id + " · " + dayOf(b.start)), el("h2", null, "Moving day!"),
      el("p", null, "Block " + b.id + " has started, and the crab has moved out of its " + NAME[SHELLS[Math.min(b.i - 1, 2)]] + " into a " + NAME[b.shell] + "." + (these.length ? " On the front desk now: " + these.join(", ") + "." : "")));
    const go = K().button("Settle in", "primary small", () => { store.set("study:moved", b.id); box.remove(); });
    t.append(go);
    box.append(scene, t);
    page.append(box);
  }
  function courseTile(c) {
    const ready = c.status === "ready", pk = ready ? T.packs.get(c.id) : null;
    const planned = !ready && (c.schedule || []).length;
    const a = el(ready || planned ? "a" : "div", "fd-tile" + (ready ? "" : " coming"));
    if (ready || planned) a.href = "#/study/" + c.id;
    const mh = el("span", "fd-mini"), t = el("span", "fd-t"), name = el("span", "fd-name");
    if (c.code) name.append(el("span", "chip", c.code));
    name.append(el("b", null, c.name));
    let line;
    if (pk) {
      const r = Path.lit(c.id, pk), sm = Mem.summary(c.id), nk = Path.claimKeys(c.id, pk).length;
      line = (r.lit || sm.seen ? Path.litLine(r) : plural(r.rooms, "room") + " on " + plural(pk.nums.length, "floor") + " · not started") + (nk ? " · " + nk + (nk === 1 ? " key" : " keys") : "");
      mh.innerHTML = Crab.mini(pk.nums.length, r.rooms ? r.lit / r.rooms : 0);
    } else if (ready) {
      const sm = Mem.summary(c.id);
      line = sm.seen ? sm.known + " of " + c.items + " known" : c.classes.length + " " + unitsOf(c.unit || "Class") + " · not started";
      mh.innerHTML = Crab.mini(c.classes.length, c.items ? sm.known / c.items : 0);
    } else if (planned) {
      const first = classesOf(c).find((k) => k.date && dnum(k.date) >= tnum()) || classesOf(c)[0];
      line = c.schedule.length + " " + unitsOf(c.unit || "Class") + " · " + (dnum(first.date) >= tnum() ? "first on " + shortDate(first.date) + (first.time ? ", " + first.time : "") : "the first floor opens soon");
      mh.innerHTML = Crab.mini(c.schedule.length, 0, true);
    } else { line = c.note || "Coming"; mh.innerHTML = Crab.mini(0, 0, true); }
    t.append(name, el("small", "fd-line", line));
    a.append(mh, t);
    if (ready || planned) a.append(K().icon("next")); if (!ready) a.append(el("span", "fd-soon", "Coming"));
    return a;
  }

  /* ---------- search: its own tab ---------- */
  function renderSearch(w) {
    const head = el("section", "st-head");
    head.append(el("p", "kicker", "Search"), el("h1", null, "Find anything"));
    w.append(head);
    const page = el("div", "st-page");
    const input = findBox(w, T.cat.filter((c) => c.status === "ready").map((c) => c.id), page);
    if (!T.find.q) setTimeout(() => input.focus({ preventScroll: true }), 60);
  }

  /* ---------- More: a course's extras, your settings, about ---------- */
  function more(box) {
    box.textContent = "";
    const w = el("div", "study more"); box.append(w);
    const head = el("section", "st-head");
    head.append(el("p", "kicker", "More"), el("h1", null, "Check-in"));
    w.append(head);
    const sec = (title, kick) => { const s = el("section", "panel mo-sec"); if (kick) s.append(el("p", "kicker", kick)); s.append(el("h2", null, title)); w.append(s); return s; };
    const you = sec("Your study");
    const toggle = (label, key, on) => {
      const lab = el("label", "mo-tog"), cb = el("input"); cb.type = "checkbox"; cb.checked = on();
      cb.addEventListener("change", () => store.set(key.k, key.flip ? !cb.checked : cb.checked));
      lab.append(cb, el("span", null, label)); you.append(lab);
    };
    toggle("Show my run of study days", { k: "study:run:off", flip: true }, () => !runOff());
    toggle("Ask me to apply each new topic to my hotel, at the end of its lesson", { k: "study:apply:off", flip: true }, () => !store.get("study:apply:off"));
    toggle("Messages from the GM of my hotel, now and then", { k: "study:gm:off", flip: true }, () => !store.get("study:gm:off"));
    toggle("Sound in lessons", { k: "study:sound" }, () => !!store.get("study:sound"));
    if (window.SpeechRecognition || window.webkitSpeechRecognition) toggle("A microphone button to say it out loud (your browser's speech service turns it into text)", { k: "study:mic:off", flip: true }, () => !store.get("study:mic:off"));
    // on your phone: on the home screen, and offline once opened
    const ph = sec("On your phone");
    const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (standalone) ph.append(el("p", "small", "Check-in is on your home screen. Once opened, it works without a connection too: your courses and progress are kept on this device, and they sync when you're back online."));
    else if (window.installPrompt) {
      ph.append(el("p", "small", "Put Check-in on your home screen: it opens like an app, and works without a connection once opened."));
      const bb = el("div", "btns"); bb.append(K().button("Add to my home screen", "small", async () => { const e = window.installPrompt; window.installPrompt = null; e.prompt(); await e.userChoice.catch(() => {}); K().render(); }, "plus")); ph.append(bb);
    } else if (ios) {
      ph.append(el("p", "small", "In Safari, tap Share, then “Add to Home Screen”. It opens like an app and works without a connection once opened."),
        el("p", "small", "The home-screen app keeps its own storage: the first time, paste the invitation link (copy it from your messages), and open your page on the Notes tab there so your progress follows you."));
    } else ph.append(el("p", "small", "On a phone, open this page in Chrome (Android) or Safari (iPhone) and add it to your home screen: it opens like an app and works without a connection once opened."));
    const pl = sec("Your plaques");
    pl.append(el("p", "small", "What you've done, never how fast: plaques for your rooms, keys, letters to the GM and coming back after a break, and up to five stars per hotel. Private, and never taken away."));
    const plb = el("div", "btns"); plb.append(link("The lobby wall", "#/study/plaques", "small", "trophy")); pl.append(plb);
    const ab = sec("How Check-in works"); ab.id = "about";
    [
      ["Each course is a hotel.", "A floor per class, a room per topic, built from the lecturers' material, what was said in class and research we checked ourselves. A room's window lights up once you know it and dims as it starts to fade. Remember it for three weeks or more and its key is yours, for good."],
      ["A few minutes, whenever you come.", "Today's session mixes what is fading with something new, in 5, 10 or 15 minutes, however long you've been away: it never grows into a backlog. Back after a few days, it starts with what you knew best. Your run counts weeks with a study day in them, so a week off is a rest, and holidays don't count against it."],
      ["Around your classes.", "The evening before a class, a 3-minute warm-up on the one before. In the week after, its new rooms come first, and a few of them come back on your next visits."],
      ["Apply it like a consultant.", "After a topic you can apply it to a hotel of your choice; now and then that hotel's GM writes with a problem your rooms can help with. Your answers collect in a case notebook per course, and applying an idea counts as remembering it."],
      ["Mix-ups and mistakes.", "When you confuse two ideas twice, they become a mix-up: a quick round to tell them apart, until you've done it on three different days. What you last got wrong waits in Your mistakes, a few at a time."],
      ["Nobody is ranked.", "Nothing here is marked by AI: you mark your own written answers. The crab carries a hotel for a shell and moves into a bigger one each block."],
    ].forEach(([b2, t]) => { const p = el("p"); p.append(el("b", null, b2 + " "), document.createTextNode(t)); ab.append(p); });
    syncLine(ab);
    const ex = sec("Digital Developments: the exam room", "Block A · earlier");
    ex.append(el("p", "small", "The lecturer's trial exam, three mock exams and the drill; every concept from the questions; the class decks and the book."));
    const b = el("div", "btns");
    b.append(link("Practice exams", "#/practise", "small ghost", "doc"), link("Topics", "#/topics", "small ghost", "search"), link("Slides and book", "#/slides", "small ghost", "book"));
    ex.append(b);
  }

  /* ---------- your case notebook ----------
     The ideas of a course applied to one hotel: what you wrote and the points you ticked. Only you see
     it (Mem keeps it with your progress). Copy it all as text for slides or a report. */
  function applyBox(course, pk, t) {
    const box = el("div", "ap-box"), q = el("h2", "ls-q ap-q"), list = el("ul", "ap-points"), on = [];
    const entry = Mem.caseGet(course, t.id) || {}, ticks = new Set(entry.ticks || []);
    let hotel = Path.hotelOf(course);
    const hl = el("label", "ap-hotel"), hin = el("input");
    hin.type = "text"; hin.maxLength = 80; hin.value = hotel; hin.autocomplete = "off";
    hin.placeholder = "Your workplace, the case company, a hotel you know";
    hl.append(el("span", "kicker", "Your hotel"), hin);
    hin.addEventListener("input", () => { hotel = hin.value.trim(); Mem.caseSet(course, "_hotel", { text: hotel }); paint(); });
    const ta = el("textarea", "ls-write ap-ta"); ta.rows = 4; ta.maxLength = Mem.CASE_MAX; ta.value = entry.text || "";
    ta.placeholder = "A few lines: where it shows up, who owns it, what you'd change."; ta.setAttribute("aria-label", "How it shows up at your hotel");
    let tm = null;
    const save = () => { clearTimeout(tm); if (!ta.value.trim() && !Mem.caseGet(course, t.id)?.text) return; Mem.caseSet(course, t.id, { text: ta.value, ticks: [...ticks] }); };
    ta.addEventListener("input", () => { on.forEach((f) => f()); clearTimeout(tm); tm = setTimeout(save, 400); });
    ta.addEventListener("blur", save);
    function paint() {
      const a = Path.applyOf(pk, t, hotel);
      q.textContent = a.q; list.textContent = "";
      a.points.forEach((p, k) => {
        const lab = el("label"), cb = el("input"); cb.type = "checkbox"; cb.checked = ticks.has(k);
        cb.addEventListener("change", () => { if (cb.checked) ticks.add(k); else ticks.delete(k); save(); });
        lab.append(cb, el("span", null, p));
        const li = el("li"); li.append(lab); list.append(li);
      });
    }
    paint();
    box.append(hl, q, ta, el("p", "kicker ap-did", "Did your answer…"), list, el("p", "small", "Only you see it. It goes in your case notebook for this course."));
    return { el: box, save, text: () => ta.value.trim(), focus: hotel ? ta : hin, onInput: (f) => on.push(f) };
  }
  function renderCase(w) {
    const pk = T.data, c = T.course, crs = pk.course;
    const head = el("section", "st-head");
    head.append(crumbs(base(), (crs.code || crs.name) + " hotel"), el("p", "kicker", "Case notebook · " + (crs.code || crs.name)), el("h1", null, "Your case notebook"),
      el("p", "line", "Ideas from this course, applied to one hotel. Only you see it. Copy it into slides or a report when you need it."));
    w.append(head);
    const page = el("div", "st-page cn");
    // the hotel
    const hl = el("label", "panel cn-hotel"), hin = el("input");
    hin.type = "text"; hin.maxLength = 80; hin.value = Path.hotelOf(c); hin.autocomplete = "off";
    hin.placeholder = "Your workplace, the case company, a hotel you know";
    hl.append(el("span", "kicker", "Your hotel"), hin);
    hin.addEventListener("input", () => Mem.caseSet(c, "_hotel", { text: hin.value.trim() }));
    page.append(hl);
    const topics = pk.items.filter((it) => it.kind === "topic"), byId = Object.fromEntries(topics.map((it) => [it.id, it]));
    const done = Mem.caseAll(c).filter((e) => byId[e.id]);
    const tools = el("div", "btns cn-tools");
    if (done.length || Inbox.sent(c, pk).length) {
      const copy = K().button("Copy it all as text", "small", async () => {
        const text = asText(c, pk, done, byId);
        try { await navigator.clipboard.writeText(text); copy.lastChild.textContent = "Copied"; }
        catch (e) { const ta = el("textarea", "cn-copy"); ta.value = text; ta.readOnly = true; copy.after(ta); ta.select(); copy.lastChild.textContent = "Select and copy below"; }
        setTimeout(() => { if (copy.isConnected) copy.lastChild.textContent = "Copy it all as text"; }, 2500);
      }, "doc");
      tools.append(copy);
    }
    page.append(tools);
    // what you've applied, class by class
    const U = unit(pk);
    pk.nums.forEach((n) => {
      const mine = done.filter((e) => byId[e.id].class === n);
      if (!mine.length) return;
      const s = el("section", "cn-sec");
      s.style.setProperty("--cc", color(n, pk));
      s.append(el("h2", "cn-h", "Floor " + n + " · " + pk.classes[n].name));
      mine.forEach((e) => s.append(caseEntry(c, pk, byId[e.id], e)));
      page.append(s);
    });
    // your replies to the GM
    const sent = Inbox.sent(c, pk);
    if (sent.length) {
      const s = el("section", "cn-sec");
      s.append(el("h2", "cn-h", "Replies to the GM"));
      sent.forEach(({ m, r }) => {
        const a = el("article", "panel cn-entry");
        a.append(el("h3", null, m.title), el("p", "cn-text", r.text), el("p", "small", (r.ticks || []).length + " of " + m.points.length + " key points covered"));
        const b = el("div", "btns"); b.append(link("Open in the inbox", "#/study/" + c + "/inbox", "small ghost", "mail")); a.append(b);
        s.append(a);
      });
      page.append(s);
    }
    // what you've learnt and could apply
    const open = topics.filter((it) => Mem.get(c, it.id) && Path.applicable(it) && !done.some((e) => e.id === it.id));
    if (open.length) {
      const s = el("section", "cn-sec");
      s.append(el("h2", "cn-h", done.length ? "Learnt, not applied yet" : "Topics you've learnt"));
      const ul = el("div", "cn-open");
      // a few suggestions first (the most recent classes, the rooms you know best), the rest folded away
      const known = (it) => Mem.recall(c, it.id) ?? 0;
      const pick = [...open].sort((a, b) => b.class - a.class || known(b) - known(a)).slice(0, 3);
      const rest = open.filter((it) => !pick.includes(it));
      if (rest.length > 2) s.firstChild.textContent = done.length ? "Something to apply next" : "Try one of these";
      (rest.length > 2 ? pick : open).forEach((it) => {
        const row = el("div", "cn-row"), t2 = el("span", null, it.title);
        const go = K().button("Apply it", "small ghost", () => { const ed = applyBox(c, pk, it), box = el("div", "panel cn-entry"); box.append(el("h3", null, it.title), ed.el); row.replaceWith(box); ed.focus.focus(); }, "pen");
        const chip = el("span", "chip", unitShort(pk) + it.class); chip.style.setProperty("--cc", color(it.class, pk));
        row.append(chip, t2, go); ul.append(row);
      });
      s.append(ul);
      if (rest.length > 2) {
        const more = K().button("Show all " + open.length + " you've learnt", "small ghost", () => {
          rest.forEach((it) => {
            const row = el("div", "cn-row"), t2 = el("span", null, it.title);
            const go = K().button("Apply it", "small ghost", () => { const ed = applyBox(c, pk, it), box = el("div", "panel cn-entry"); box.append(el("h3", null, it.title), ed.el); row.replaceWith(box); ed.focus.focus(); }, "pen");
            const chip = el("span", "chip", unitShort(pk) + it.class); chip.style.setProperty("--cc", color(it.class, pk));
            row.append(chip, t2, go); ul.append(row);
          });
          more.remove();
        }, "plus");
        s.append(more);
      }
      page.append(s);
    }
    if (!done.length && !open.length && !sent.length) page.append(el("p", "panel cn-empty", "Learn a topic first. At the end of each new topic's lesson you can apply it to your hotel, and it lands here."));
    w.append(page);
    syncLine(w);
  }
  /* ---------- your index: where everything is ----------
     Every topic and framework of a course, class by class, with where to look it up (the slide, the
     page) and your own note: for an open-book exam or a report. "Only what I've learnt" narrows it;
     it prints cleanly (or saves as a PDF from the print dialog). */
  function renderIndex(w) {
    const pk = T.data, c = T.course, crs = pk.course, mine = !!store.get("study:index:mine"), links = slides();
    const head = el("section", "st-head ix-head");
    head.append(crumbs(base(), (crs.code || crs.name) + " hotel"), el("p", "kicker", "Your index · " + (crs.code || crs.name)), el("h1", null, "Where everything is"),
      el("p", "line", "Every topic and framework of the course, " + unit(pk).toLowerCase() + " by " + unit(pk).toLowerCase() + ", with where to look it up and your own notes. Handy for an open-book question or a report."));
    const tools = el("div", "btns ix-tools");
    const tg = el("label", "mo-tog ix-mine"), cb = el("input"); cb.type = "checkbox"; cb.checked = mine; cb.id = "ix-mine";
    cb.addEventListener("change", () => { store.set("study:index:mine", cb.checked); K().render(); });
    tg.append(cb, el("span", null, "Only what I've learnt"));
    tools.append(tg, K().button("Print or save as PDF", "small ghost", () => window.print(), "doc"));
    head.append(tools);
    // jump to a class: the index is long on a phone
    const jump = el("nav", "ix-jump"); jump.setAttribute("aria-label", "Jump to a " + unit(pk).toLowerCase());
    pk.nums.forEach((n) => { const b = el("button", "chip", unitShort(pk) + n); b.type = "button"; b.style.setProperty("--cc", color(n, pk)); b.addEventListener("click", () => document.getElementById("ix-c" + n)?.scrollIntoView({ behavior: "smooth", block: "start" })); jump.append(b); });
    head.append(jump);
    w.append(head);
    const page = el("div", "st-page ix");
    let shown = 0;
    const known = (id) => !!Mem.get(c, id);
    const row = (it, kind) => {
      const r = el("div", "ix-row" + (known(it.id) ? " known" : "")), t = el("div", "ix-t");
      t.append(el("span", "ix-kind", kind), el("b", null, it.title));
      if (kind === "Framework" && it.gist) t.append(el("p", "ix-gist", it.gist));
      r.append(t);
      const refs = K().sourcesLine(it.x?.refs || it.refs || (it.ref ? [it.ref] : []), links); if (refs) r.append(refs);
      const note = Mem.note(c, it.id).trim(); if (note) r.append(el("p", "ix-note", note));
      shown++;
      return r;
    };
    pk.nums.forEach((n) => {
      const cl = pk.classes[n];
      const topics = pk.items.filter((it) => it.kind === "topic" && String(it.class) === String(n) && (!mine || known(it.id)));
      const fws = pk.items.filter((it) => it.kind === "framework" && String(it.class) === String(n) && (!mine || known(it.id)));
      if (!topics.length && !fws.length) return;
      const s = el("section", "ix-sec"); s.style.setProperty("--cc", color(n, pk)); s.id = "ix-c" + n;
      s.append(el("h2", "ix-h", unit(pk) + " " + n + " · " + cl.name));
      topics.forEach((it) => s.append(row(it, "Topic")));
      fws.forEach((it) => s.append(row(it, "Framework")));
      page.append(s);
    });
    // frameworks of the whole course, in no single class
    const general = pk.items.filter((it) => it.kind === "framework" && !pk.classes[it.class] && (!mine || known(it.id)));
    if (general.length) {
      const s = el("section", "ix-sec"); s.id = "ix-all";
      s.append(el("h2", "ix-h", "The whole course"));
      general.forEach((it) => s.append(row(it, "Framework")));
      page.append(s);
    }
    if (!shown) page.append(el("p", "panel cn-empty", mine ? "Nothing learnt in this course yet. Untick “Only what I've learnt” to see the whole course." : "This course has no topics yet."));
    w.append(page);
  }
  function caseEntry(c, pk, it, e) {
    const a = el("article", "panel cn-entry"), n = Path.applyOf(pk, it, Path.hotelOf(c)).points.length;
    a.append(el("h3", null, it.title), el("p", "cn-text", e.text), el("p", "small", e.ticks.length + " of " + n + " points ticked"));
    const b = el("div", "btns");
    b.append(K().button("Edit", "small ghost", () => { const ed = applyBox(c, pk, it); a.textContent = ""; a.append(el("h3", null, it.title), ed.el); ed.focus.focus(); }, "pen"));
    a.append(b);
    return a;
  }
  function asText(c, pk, done, byId) {
    const crs = pk.course, hotel = Path.hotelOf(c), out = ["Case notebook · " + (crs.code ? crs.code + " " : "") + crs.name + (hotel ? " · " + hotel : ""), ""];
    pk.nums.forEach((n) => {
      const mine = done.filter((e) => byId[e.id].class === n);
      if (!mine.length) return;
      out.push(unit(pk) + " " + n + " · " + pk.classes[n].name);
      mine.forEach((e) => out.push("• " + byId[e.id].title, ...e.text.trim().split("\n").map((l) => "  " + l), ""));
    });
    const sent = Inbox.sent(c, pk);
    if (sent.length) {
      out.push("Replies to the GM");
      sent.forEach(({ m, r }) => out.push("• " + m.title, ...r.text.trim().split("\n").map((l) => "  " + l), ""));
    }
    return out.join("\n").trim() + "\n";
  }

  function renderComing(w, c) {
    const head = el("div", "st-head");
    head.append(crumbs("#/study", "All courses"), el("p", "kicker", [c.code, c.lecturer].filter(Boolean).join(" · ") || "Block " + c.block), el("h1", null, c.full || c.name),
      el("p", "line", c.note || "This course is coming."));
    w.append(head);
    const ks = classesOf(c).filter((k) => k.date);
    if (ks.length) {
      const page = el("div", "ho-page"), left = el("div", "ho-left"), bld = el("div", "ho-bld"), side = el("div", "ho-side");
      bld.innerHTML = Crab.hotel({ code: c.code || "", sky: Crab.skyAt(), lights: Crab.seasonAt() === "lights",
        label: (c.code || c.name) + " as a hotel under construction: " + ks.length + " floors, one per class, opening after each class.",
        floors: ks.map((k) => ({ n: k.n, planned: true, date: shortDate(k.date).toUpperCase() })) });
      left.append(bld, el("p", "small ho-tap", "Under construction: each floor opens a day or so after its class."));
      if ((c.events || []).length) side.append(readyBox(c.id, c, null));
      const tt = timetable(c); if (tt) { tt.open = true; side.append(tt); }
      page.append(left, side); w.append(page);
    }
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
  // Your daily mix, the block you're in first. Until you pick: the ready courses of the block you're in (and
  // those across blocks) with the ones you've started, so a new block's courses join on their own and an
  // earlier block's only if you'd begun them; before anything of this block is ready, the ones you've started,
  // or every ready course. Once you pick (study:mix, on this device), your pick, plus a course of this block
  // that became ready after you picked (study:mix:known: the ready courses when you picked).
  const inBlock = (c) => { const b = blockNow(); return !/^[A-Z]$/.test(c.block || "") || (!!b && c.block === b.id); };
  function mix() {
    const ready = T.cat.filter((c) => c.status === "ready"), chosen = store.get("study:mix");
    const first = (l) => [...l.filter(inBlock), ...l.filter((c) => !inBlock(c))];
    if (Array.isArray(chosen)) {
      const known = Array.isArray(store.get("study:mix:known")) ? store.get("study:mix:known") : chosen;
      const picked = ready.filter((c) => chosen.includes(c.id) || (inBlock(c) && !known.includes(c.id)));
      if (picked.length) return first(picked);
    }
    const started = ready.filter((c) => Mem.summary(c.id).seen), now = ready.filter(inBlock);
    if (now.length) return first(ready.filter((c) => inBlock(c) || started.includes(c)));
    return started.length ? started : ready;
  }
  // which ready courses today's session draws from; at least one stays in. Folded to one line until you change it.
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
        store.set("study:mix", ready.filter((x) => next.has(x.id)).map((x) => x.id));
        store.set("study:mix:known", ready.map((x) => x.id)); onChange();
      });
      g.append(b);
    });
    return g;
  }
  async function mixPacks() {
    const list = mix(), packs = await Promise.all(list.map((c) => pack(c.id)));
    return list.map((c, i) => ({ id: c.id, meta: c, pack: packs[i] }));
  }

  function todayCard(w) {
    const box = el("section", "panel td-card");
    box.append(el("p", "loading", "Getting today ready…"));
    w.append(box);
    const load = () => mixPacks().then((list) => { if (box.isConnected) fillToday(box, list, load); }).catch(() => box.remove());
    load();
  }
  // today's mix-up, if there is one you haven't already told apart today
  function mixFor(list) {
    for (const { id, pack: pk } of list) {
      const m = Path.mixList(id, pk).find((x) => !x.today);
      if (m && Path.mixSteps(id, pk, m)) return { course: id, pk, m };
    }
    return null;
  }
  function fillToday(box, list, load) {
    box.textContent = "";
    const run = Today.run(Mem.days(), Mem.today()), mx = mixFor(list);
    const p = (T.plan = Today.plan(list, mx ? mins() - 1 : mins(), undefined, planOpts(list)));
    const any = p.steps.length || mx, soon = upcoming(), warm = soon.find((x) => warmable(x.c, x.k.n));
    // the crab: its flag shows your run once today counts, it naps after a rest day, otherwise it waits
    // (back after days away it waves you in, whatever the run says)
    const state = run.welcome && (p.steps.length || mx) ? "right" : run.today && !runOff() ? "run" : run.keep && !runOff() && !run.thisWeek ? "rest" : "idle";
    const welcome = run.welcome && any;
    const say = soon.length && !run.today && warm ? (soon[0].when === "today" ? "Class later today. " : "Class tomorrow. ") + "A 3-minute warm-up?"
      : welcome ? (p.due ? "Welcome back! We'll start with what you knew best." : "Welcome back! Nothing has faded, so on with something new.")
      : soon.length && !run.today ? (soon[0].when === "today" ? "Class later today. " : "Class tomorrow. ") + "The new floor opens after it."
      : !any ? "All caught up. Nothing is fading, and you've seen everything so far."
      : run.today ? "That's today counted. Anything more is a bonus."
      : state === "rest" ? "Last week was a rest. Your run is still on."
      : p.due ? mins() + " minutes today. What's fading comes first."
      : mins() + " minutes today, with something new.";
    const top = el("div", "td-top"), greet = el("div", "td-greet"), crab = el("div", "td-crab");
    crab.innerHTML = Crab.svg(state, crabOpt({ count: run.count }));
    // it waves when you arrive (once a visit), and again when you tap it
    const wave = () => { crab.classList.remove("wave"); void crab.offsetWidth; crab.classList.add("wave"); };
    if (!T.waved && state !== "rest") { T.waved = true; setTimeout(wave, 350); }
    crab.addEventListener("click", wave); crab.title = "Hello!";
    greet.append(crab, el("p", "td-say", say));
    top.append(el("p", "kicker", "Today · " + new Date().toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })));
    const body = el("div", "td-body");
    if (soon.length) {
      const cl = el("div", "td-class");
      soon.forEach(({ c, k, when }) => {
        const row = el("div", "td-classrow"), t = el("div", "td-ct");
        t.append(el("b", null, (when === "today" ? "Today" : "Tomorrow") + (k.time ? ", " + k.time : "") + " · " + (c.code || c.name) + " " + unitName(c).toLowerCase() + " " + k.n + (k.label ? " (" + k.label.toLowerCase() + ")" : "")),
          el("span", "small", warmable(c, k.n) ? "Warm up with the class before it." : k.n === classesOf(c)[0]?.n ? "The first class: its floor opens after it." : "Its floor opens after the class."));
        row.append(el("i", null, "◷"), t);
        if (warmable(c, k.n)) row.append(link("Warm up · 3 min", "#/study/" + c.id + "/l/warmup-" + k.n, "small", "play"));
        cl.append(row);
      });
      body.append(cl);
    }
    if (any) {
      if (welcome && p.due) body.append(el("p", "small td-back", "Some of it faded while you were away. That's normal: one session at a time brings it back, and there's no backlog to clear."));
      const ul = el("ul", "td-list"), li = (ic, cls, b, rest) => { const x = el("li"); x.append(el("i", cls, ic), el("b", null, b), el("span", null, rest)); ul.append(x); };
      const many = list.length > 1;
      const after = p.steps.filter((s2) => s2.why === "after"), fading = p.due - after.length - p.steps.filter((s2) => s2.why === "ready").length;
      if (after.length) li("↺", "acc", after.length + " back", String(after[0].whyText || "").replace(/^back /, ""));
      const ready = p.steps.filter((s2) => s2.why === "ready");
      if (ready.length) li("★", "gold", ready.length + " to keep lit", String(ready[0].whyText || ""));
      if (fading > 0) {
        const by = [...new Set(p.steps.filter((s2) => s2.why === "fading").map((s2) => s2.pack.course.code || s2.pack.course.name))];
        li("◐", "gold", fading + (welcome ? " to bring back" : " to refresh"), [many ? by.join(", ") : "", welcome ? "what you knew best first" : many ? "" : "fading"].filter(Boolean).join(" · "));
      }
      if (p.fresh) {
        const x = p.steps.find((s2) => s2.why === "new") || p.next, c = x && x.pack.classes[x.it.class];
        li("+", "acc", p.fresh + " new", x ? [many ? x.pack.course.code : "", c ? unit(x.pack) + " " + x.it.class : "", x.whyText || ""].filter(Boolean).join(" · ") : "");
      }
      if (mx) { const nm = (id) => Path.short(mx.pk.items.find((it) => it.id === id).title); li("⇄", "coral", "1 mix-up", nm(mx.m.a) + " ↔ " + nm(mx.m.b)); }
      body.append(ul);
      const b = el("div", "btns");
      b.append(K().button((run.today ? "Another " : "Start · ") + mins() + " min", "primary td-start", () => K().go("study/today"), "play"));
      body.append(b);
    }
    // a message from the GM, if one is waiting in a course of your mix (one at most; "Not today" hides it till tomorrow)
    const gm = store.get("study:gm:later") === Mem.today() ? null : list.map(({ id, pack: pk }) => ({ id, pk, m: Inbox.deliver(id, pk) })).find((x) => x.m);
    if (gm) {
      const row = el("div", "td-gm"), t = el("div", "td-ct"), ic = el("i"); ic.append(K().icon("mail"));
      t.append(el("b", null, "A message from the GM" + (list.length > 1 ? " · " + (gm.pk.course.code || gm.pk.course.name) : "")), el("span", "small", "“" + gm.m.title + "”"));
      const go = el("div", "td-gmgo");
      go.append(link("Read it · 5 min", "#/study/" + gm.id + "/l/gm-" + gm.m.id, "small", "arrow", true), K().textBtn("Not today", () => { store.set("study:gm:later", Mem.today()); fillToday(box, list, load); }));
      row.append(ic, t, go);
      body.append(row);
    }
    if (!T.mixOpen) {
      const ready = T.cat.filter((c) => c.status === "ready"), mine = mix();
      const p = el("p", "td-mix td-mixline");
      p.append(document.createTextNode(mins() + " min a day" + (ready.length > 1 ? " · from " + mine.map((c) => c.code || c.name).join(", ") : "") + " · "), K().textBtn("change", () => { T.mixOpen = true; fillToday(box, list, load); }));
      body.append(p);
    } else {
      const set = el("div", "td-set");
      set.append(sizes(() => fillToday(box, list, load)));
      const mr = mixRow(load); if (mr) set.append(mr);
      set.append(K().textBtn("Done", () => { T.mixOpen = false; fillToday(box, list, load); }));
      body.append(set);
    }
    box.append(top, greet, body);
    const wk = weekNote(list); if (wk) box.append(wk);
    Awards.check(list.map(({ id, pack: pk }) => ({ id, pk })));
    const nu = Awards.unseen();
    if (nu.length) {
      const a = el("a", "td-plaque"); a.href = "#/study/plaques";
      a.append(K().icon("trophy"), el("span", null, (nu.length === 1 ? "A new plaque: " + Awards.name(nu[0]) : nu.length + " new plaques") + " · see the lobby wall"));
      box.append(a);
    }
    if (!runOff()) box.append(runRow(run));
    else { const p = el("p", "small td-hidden"); p.append(document.createTextNode("Your run of study days is hidden. "), K().textBtn("Show it", () => { store.set("study:run:off", false); K().render(); })); box.append(p); }
  }
  // the week that was, on your first visits of a new week: only what went well, and only if something did
  function weekNote(list) {
    const lw = Today.lastWeek(Mem.days(), Mem.today());
    if (!lw.cards || store.get("study:week:seen") === lw.week + 1) return null;
    const parts = [];
    if (lw.studyDays) parts.push(plural(lw.studyDays, "study day"));
    parts.push(plural(lw.cards, "card"));
    let keys = 0, letters = 0;
    T.cat.filter((c) => c.status === "ready").forEach((c) => {
      keys += Mem.flagsBetween(c.id, "key:", lw.from, lw.to).length;
      letters += Mem.flagsBetween(c.id, "gmdone:", lw.from, lw.to).filter((k) => Mem.caseGet(c.id, "gm:" + k.slice(7))?.sent).length;
    });
    if (keys) parts.push(plural(keys, "new key"));
    if (letters) parts.push(plural(letters, "letter to the GM", "letters to the GM"));
    const box = el("div", "td-weeknote"), t = el("p");
    t.append(el("b", null, "Last week at the hotel: "), document.createTextNode(parts.join(" · ") + "."));
    const x = el("button", "td-wkx"); x.type = "button"; x.setAttribute("aria-label", "Close"); x.append(K().icon("x"));
    x.addEventListener("click", () => { store.set("study:week:seen", lw.week + 1); box.remove(); });
    box.append(K().icon("star"), t, x);
    return box;
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
  // this week's days and the run; gentle: the run counts weeks, and one week off is a rest
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
    head.append(el("b", null, run.count ? run.count + "-week run" : "No run yet"));
    if (run.total) head.append(el("span", null, " · " + plural(run.total, "study day")));
    const left = Today.DAY_MIN - run.cardsToday;
    const say = run.today ? (run.daysThisWeek > 1 ? "Today counts too. Every day past the first is a bonus." : "Today counts, and so does this week.")
      : run.cardsToday ? plural(left, "more card") + " and today is a study day."
      : run.thisWeek ? "This week already counts. Today is a bonus."
      : run.keep ? "Last week was a rest. One study day this week keeps your run."
      : run.count ? "One study day any time this week keeps your run going."
      : "One study day a week makes a run: " + Today.DAY_MIN + " cards make a day.";
    const note = el("p", "small", say);
    note.title = "A day counts once you've done " + Today.DAY_MIN + " cards (anywhere in Study, on any device), and a week counts with one study day. One week off is a rest and keeps the run; two in a row start a new one. Weeks without classes don't count against it.";
    t.append(head, note);
    r.append(wk, t, K().textBtn("Hide", () => { store.set("study:run:off", true); K().render(); }));
    return r;
  }

  // The daily session, in the lesson player: what is fading, then new things from your path.
  function renderToday(w, list) {
    const mx = mixFor(list), p = Today.plan(list, mx ? mins() - 1 : mins(), undefined, planOpts(list)), welcome = Today.run(Mem.days(), Mem.today()).welcome;
    if (!p.steps.length && !mx) {
      const d = el("div", "panel st-done");
      d.append(el("p", "kicker", "Today"), el("h2", null, "All caught up"), el("p", "small", "Nothing is fading, and you've seen everything in your courses so far."));
      const b = el("div", "btns"); b.append(link("Back to Study", "#/study", "primary", "back")); d.append(b);
      w.append(d); return;
    }
    const runBefore = Today.run(Mem.days(), Mem.today()), before = runBefore.today, many = list.length > 1;
    // a new topic is taught in small steps, as in its room; a fading one comes back from one of three sides
    const steps = p.steps.flatMap((st) => {
      const tag = (x, why) => ({ ...x, why, whyText: why ? st.whyText : null, r: st.r, showCourse: many });
      if (st.it.kind === "topic" && st.kind === "learn") return Path.teachSteps(st.course, st.pack, st.it).map((x, i) => tag(x, i ? null : st.why));
      if (st.it.kind === "topic" && st.kind === "say" && (st.why === "fading" || st.why === "after" || st.why === "ready")) return [tag(Path.topicCheck(st.course, st.pack, st.it), st.why)];
      return [{
        type: st.kind, course: st.course, pk: st.pack, it: st.it, items: [{ course: st.course, id: st.it.id }],
        why: st.why, whyText: st.whyText, r: st.r, pick: st.pick, where: st.where, showCourse: many,
        retryable: st.kind === "mcq" || st.kind === "learn" ? false : undefined,
      }];
    });
    // one "find it fast": where would you look up a topic you've learnt that isn't in today's cards
    // (so nothing on screen gives its class away)
    if (steps.length >= 4) for (const { id, pack: pk } of list) {
      const inSession = new Set(p.steps.map((st) => st.it.id));
      const known = pk.items.filter((it) => it.kind === "topic" && Mem.get(id, it.id) && !inSession.has(it.id));
      const wh = known.length >= 2 && Path.whereFrom(id, pk, known);
      if (wh) { steps.splice(Math.max(1, steps.length - 1), 0, { ...wh, showCourse: many, why: null }); break; }
    }
    const mixSteps = mx ? Path.mixSteps(mx.course, mx.pk, mx.m).map((x) => ({ ...x, showCourse: many })) : [];
    if (mixSteps.length) steps.splice(Math.min(2, steps.length), 0, ...mixSteps);
    Lesson.play(w, {
      color: "var(--accent)", steps, title: welcome ? "Welcome back, and done!" : "Today's session done!",
      end(box, res) {
        markReturns(p.steps);
        if ((runBefore.away ?? 0) >= 14) Awards.mark("welcome-back");
        const run = Today.run(Mem.days(), Mem.today()), justCounted = run.today && !before;
        if (mx) Path.settledLines(box, mx.pk, Path.settle(res.log, [mx.m]));
        if (justCounted && !runOff()) box.querySelector("h2").textContent = runBefore.thisWeek ? "Done, and today counts!" : "Done, and this week counts!";
        if (!runOff()) box.append(runRow(run, justCounted));
        // where each course in the mix stands, and what comes back tomorrow
        const where = el("div", "td-courses");
        list.forEach(({ id, meta }) => {
          const sm = Mem.summary(id), row = el("div", "td-course");
          row.append(el("b", null, meta.code || meta.name), meter("Known", sm.known, meta.items), el("span", "small", !sm.fading ? "nothing fading" : sm.fading > 9 ? "10+ fading, no rush" : sm.fading + " fading"));
          where.append(row);
        });
        const tm = Today.tomorrow(list);
        where.append(el("p", "small", !tm ? "Nothing will be fading by tomorrow." : tm <= 10 ? "About " + plural(tm, "card") + " will be fading by tomorrow evening: that's your next session, whenever it is." : "Your next session, whenever it is, takes the most useful few of what's fading: there's nothing to catch up on."));
        box.append(where);
        // something deeper: an open question from a class you just worked on
        const deep = deeper(res.log);
        if (deep) {
          const q = el("div", "td-deep"), tmp = el("div"); tmp.innerHTML = deep.q.ask;   // from our notes
          q.append(el("p", "kicker", "Something deeper, when you have ten minutes"), el("p", "td-q", tmp.textContent.trim()));
          const qb = el("div", "btns"); qb.append(link("Answer it", "#/study/" + deep.course + "/l/c" + deep.n + "-explain", "small", "arrow", true)); q.append(qb);
          box.append(q);
        }
        const more = K().button(mins() + " more minutes", "small", () => { Lesson.stop(); K().render(); }, "play");
        const mb = el("div", "btns"); mb.append(more); box.append(mb);
      },
      done() { location.replace("#/study"); },
      exit() { location.replace("#/study"); },
    });
  }

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
  // an open question from the last class you worked on in the session, that you haven't answered lately
  function deeper(log) {
    const seen = [];
    log.forEach((l) => { const it = l.ex.it, n = it?.class, k = l.ex.course + ":" + n; if (n && l.ex.pk?.classes[n] && !seen.some((x) => x.k === k)) seen.push({ k, course: l.ex.course, pk: l.ex.pk, n }); });
    for (const x of seen.reverse()) {
      const q = x.pk.items.find((it) => it.kind === "prompt" && it.class === x.n && (!Mem.get(x.course, it.id) || Mem.recall(x.course, it.id) < Today.FADING));
      if (q) return { course: x.course, n: x.n, q };
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
    if (S.tab !== "study" || !T.cat || Lesson.active() || /\/(cards|today)$/.test(location.hash)) return;
    const a = document.activeElement;
    if (a && (a.tagName === "TEXTAREA" || a.tagName === "INPUT")) return;
    K().render();
  });

  return {
    render, more,
    justDone(id) { T.justDone = id; },
    _pack: (id) => T.packs.get(id),   // for testing from the console: a course already opened
    kit: { readyBox, rich, sec, link, meter, crumbs, unit, unitShort, color, chipOf, whereLine, notesDoc, noteBox, noteShow, findBox, syncLine, runRow, applyBox, timetable, classesOf, shortDate, dnum, tnum },
  };
})();

window.Study = Study;
