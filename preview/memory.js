/* Memory: what you know and what is fading, item by item. Every answer, flashcard or "I can explain
   this" is a review with a grade (1 again, 2 hard, 3 good, 4 easy). The schedule is FSRS-4.5 with its
   default parameters, the open scheduler Anki uses: each item has a stability s (days until your chance
   of recalling it falls to 90%) and a difficulty d (1–10), and recall fades as (1 + 19/81 · days/s)^-0.5.
   Progress lives on this device and, once you have opened your page on the Notes tab, in your page's
   private progress, so phone and laptop share it. Keys: mem:<course> (items), mem:days (cards done per day),
   mem:notes-<course> (your own notes), mem:path-<course> (marks on the path). */

const Mem = (() => {
  const W = [0.4872, 1.4003, 3.7145, 13.8206, 5.1618, 1.2298, 0.8975, 0.031, 1.6474, 0.1367, 1.0461, 2.1072, 0.0793, 0.3246, 1.587, 0.2272, 2.8755];
  const DAY = 86400;
  const now = () => Math.floor(Date.now() / 1000);
  const clampD = (d) => Math.min(10, Math.max(1, d));
  const fade = (s, days) => Math.pow(1 + (19 / 81) * days / s, -0.5);
  const d0 = (g) => clampD(W[4] - (g - 3) * W[5]);
  const r3 = (x) => Math.round(x * 1000) / 1000;

  // the next state of an item after a review with grade g (1–4) at time t (seconds)
  function next(st, g, t) {
    if (!st) return { s: W[g - 1], d: r3(d0(g)), t, n: 1, l: g === 1 ? 1 : 0, g };
    const r = fade(st.s, Math.max(0, t - st.t) / DAY);
    const d = clampD(W[7] * d0(3) + (1 - W[7]) * (st.d - W[6] * (g - 3)));
    const s = g === 1
      ? Math.min(st.s, W[11] * Math.pow(d, -W[12]) * (Math.pow(st.s + 1, W[13]) - 1) * Math.exp(W[14] * (1 - r)))
      : st.s * (1 + Math.exp(W[8]) * (11 - d) * Math.pow(st.s, -W[9]) * (Math.exp(W[10] * (1 - r)) - 1) * (g === 2 ? W[15] : 1) * (g === 4 ? W[16] : 1));
    return { s: r3(Math.min(365, Math.max(0.01, s))), d: r3(d), t, n: st.n + 1, l: st.l + (g === 1 ? 1 : 0), g };
  }

  /* ---------- on this device ---------- */
  const blank = () => ({ v: 1, owner: null, items: {}, days: {}, at: 0 });
  const load = (key) => Object.assign(blank(), store.get(key) || {});
  const save = (key, b) => store.set(key, b);
  const pad = (x) => String(x).padStart(2, "0");
  const today = (d = new Date()) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());

  function grade(course, id, g, t = now()) {
    const k = "mem:" + course, b = load(k);
    b.items[id] = next(b.items[id], g, t); b.at = t; save(k, b);
    tick(t);
    return b.items[id];
  }
  // a card done today (every review, and reading something new in the daily session): the run counts these
  function tick(t = now()) {
    const dk = load("mem:days"); dk.days[today()] = (dk.days[today()] || 0) + 1; dk.at = t; save("mem:days", dk);
    later();
  }
  const get = (course, id) => load("mem:" + course).items[id] || null;
  const last = (course, id) => get(course, id)?.g || null;
  function recall(course, id, t = now()) { const st = get(course, id); return st ? fade(st.s, Math.max(0, t - st.t) / DAY) : null; }
  // How a course is going: items reviewed, known (last answer good or easy), fading (recall now under 90%).
  function summary(course, t = now()) {
    let seen = 0, known = 0, fading = 0;
    for (const st of Object.values(load("mem:" + course).items)) {
      seen++; if (st.g >= 3) known++;
      if (fade(st.s, Math.max(0, t - st.t) / DAY) < 0.9) fading++;
    }
    return { seen, known, fading };
  }
  // Start items from older progress (before this model): as if reviewed now with that grade. Never overwrites.
  function seed(course, list) {
    const k = "mem:" + course, b = load(k), t = now(); let added = 0;
    list.forEach(([id, g]) => { if (id && g && !b.items[id]) { b.items[id] = next(null, g, t); added++; } });
    if (added) { b.at = Math.max(b.at, t); save(k, b); later(); setTimeout(() => window.dispatchEvent(new Event("mem-changed")), 0); }
    return added;
  }

  /* ---------- your own notes ----------
     A note on a topic or a framework, in your own words. Only you see it. It is kept like progress
     (mem:notes-<course>, one entry per item: text, last edit t, edit count n), so it syncs and merges the
     same way: the later edit wins. An emptied note stays as "" so the deletion syncs too. */
  const NOTE_MAX = 3000;
  const noteKey = (course) => "mem:notes-" + course;
  const note = (course, id) => load(noteKey(course)).items[id]?.text || "";
  function setNote(course, id, text, t = now()) {
    const k = noteKey(course), b = load(k), old = b.items[id];
    text = String(text || "").slice(0, NOTE_MAX);
    if ((old?.text || "") === text) return;
    b.items[id] = { text, t: Math.max(t, (old?.t || 0) + 1e-3), n: (old?.n || 0) + 1 };   // later than the last edit, always
    b.at = t; save(k, b); later();
  }
  const notes = (course) => Object.entries(load(noteKey(course)).items)
    .filter(([, v]) => typeof v?.text === "string" && v.text.trim()).map(([id, v]) => ({ id, text: v.text, t: v.t }));

  /* ---------- marks on the path ----------
     What the path can't read from your answers: a class's story read, its review done. Kept like notes
     (mem:path-<course>: per mark v, t, n), so they sync and merge the same way. */
  const pathKey = (course) => "mem:path-" + course;
  const flagged = (course, key) => !!load(pathKey(course)).items[key]?.v;
  function flag(course, key, t = now()) {
    const k = pathKey(course), b = load(k), old = b.items[key];
    b.items[key] = { v: 1, t: Math.max(t, (old?.t || 0) + 1e-3), n: (old?.n || 0) + 1 };
    b.at = t; save(k, b); later();
  }

  /* ---------- across devices (your page's private progress) ---------- */
  const sy = { state: "local", at: 0, timer: null, busy: null, again: false };
  const keys = () => {
    const ks = new Set(["mem:days"]);
    try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith(LS + "mem:")) ks.add(k.slice(LS.length)); } } catch (e) {}
    return ks;
  };
  // Join two copies: per item the later review wins, per day the higher count.
  function merge(a, b) {
    const out = blank(); let fromA = false, fromB = false;
    for (const id of new Set([...Object.keys(a.items), ...Object.keys(b.items)])) {
      const x = a.items[id], y = b.items[id];
      const pick = !y || (x && (x.t > y.t || (x.t === y.t && x.n >= y.n))) ? x : y;
      out.items[id] = pick;
      if (pick !== y && JSON.stringify(pick) !== JSON.stringify(y)) fromA = true;
      if (pick !== x && JSON.stringify(pick) !== JSON.stringify(x)) fromB = true;
    }
    for (const day of new Set([...Object.keys(a.days), ...Object.keys(b.days)])) {
      const x = a.days[day] || 0, y = b.days[day] || 0;
      out.days[day] = Math.max(x, y);
      if (x > y) fromA = true; if (y > x) fromB = true;
    }
    out.at = Math.max(a.at || 0, b.at || 0);
    return { out, aChanged: fromB, bChanged: fromA };   // aChanged: a must take something from b
  }
  function later(ms = 4000) { clearTimeout(sy.timer); sy.timer = S.me?.token ? setTimeout(sync, ms) : null; }
  async function sync() {
    clearTimeout(sy.timer); sy.timer = null;
    if (!S.g || !S.me?.token || sy.state === "setup") return;
    if (sy.busy) { sy.again = true; return sy.busy; }
    sy.busy = (async () => {
      let changed = false;
      try {
        const r = await rpc("get_progress", { g: S.g, p_token: S.me.token });
        if (r.error) { sy.state = r.error === "signed_out" ? "local" : "error"; return; }
        const rows = r.rows || {};
        for (const k of new Set([...keys(), ...Object.keys(rows)])) {
          if (!/^mem:[a-z0-9-]{1,30}$/.test(k)) continue;
          const mine = load(k), theirs = Object.assign(blank(), rows[k]?.body || {});
          // progress made here by someone else who was signed in on this device stays theirs
          const local = mine.owner && mine.owner !== S.me.id ? blank() : mine;
          const m = merge(local, theirs);
          m.out.owner = S.me.id;
          if (m.aChanged || local !== mine || mine.owner !== S.me.id) { save(k, m.out); if (m.aChanged || local !== mine) changed = true; }
          const any = Object.keys(m.out.items).length || Object.keys(m.out.days).length;
          if (any && (m.bChanged || !rows[k])) {
            const w = await rpc("save_progress", { g: S.g, p_token: S.me.token, p_key: k, p_body: { ...m.out, owner: undefined } });
            if (w.error) { sy.state = "error"; return; }
          }
        }
        sy.state = "synced"; sy.at = Date.now();
      } catch (e) {
        // the progress functions aren't in the database yet (404), or no connection: stay on this device
        sy.state = /\b404\b/.test(e.message) ? "setup" : "offline";
      } finally {
        sy.busy = null;
        if (changed) window.dispatchEvent(new Event("mem-changed"));
        if (sy.again) { sy.again = false; later(500); }
      }
    })();
    return sy.busy;
  }
  function status() {
    const who = S.me?.name;
    if (!who) return { state: "local", text: "Saved on this device. Open your page on the Notes tab to keep your progress on all your devices." };
    if (sy.state === "synced") return { state: "synced", text: "Saved to your page, " + who + ", so it follows you to every device." };
    if (sy.state === "offline") return { state: "offline", text: "Saved on this device; it goes to your page, " + who + ", when you're back online." };
    return { state: sy.state, text: "Saved on this device." };
  }
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") sync(); else if (sy.timer) sync(); });

  return { grade, tick, get, last, recall, seed, summary, sync, status, today, days: () => load("mem:days").days,
           note, setNote, notes, NOTE_MAX, flag, flagged, _next: next, _merge: merge };
})();

window.Mem = Mem;
