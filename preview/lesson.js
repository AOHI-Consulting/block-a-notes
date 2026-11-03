/* Lesson: the player for a lesson (a room of a course's hotel) and for the daily session. One exercise at a time,
   full screen: you answer, press Check (or Enter), and a bar slides up saying whether you were right,
   with why and where to look. What you missed comes back once at the end. No hearts and no timer: a
   wrong answer costs nothing but a second look.
   Exercises: learn (a new framework, or a topic all at once), read (a topic a part at a time: its plain
   words, then its mix-up), cloze (tap the key terms into the gaps of a sentence), scene (which idea is
   at work in this hotel?), mcq, pick (which framework is this?), where (which class?), type (name the
   framework), match (pairs),
   say (explain it, then mark yourself), flash, story (a class's story with questions in it), explain
   (an open question: write, tick the key points you covered, mark yourself), contrast and sort (a
   mix-up: two ideas side by side, then cards to sort into one or the other), apply (your case
   notebook: how does it show up at your hotel?) and note (a message).
   The crab reacts to each answer: claws up when you're right, a head tilt when you're not. A wrong
   answer that names another idea is noted as a slip between the two (Mem.slip): that's how mix-ups
   are found.
   Every answer is a review for Mem, so the path, the daily session and the class pages share one memory.
   path.js and study.js build the exercises; this file only plays them. */

const Lesson = (() => {
  const K = () => Practise.kit, SK = () => Study.kit;
  let R = null;   // the lesson under way
  const PRAISE = ["Nice!", "Correct!", "Well done!", "Exactly!", "Spot on!", "That's it!", "Good one!"];
  const shuffle = (a) => a.map((x) => [Math.random(), x]).sort((p, q) => p[0] - q[0]).map((p) => p[1]);
  const words = (t) => String(t || "").trim().split(/\s+/).filter(Boolean);
  const norm = (t) => String(t || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const LETTERS = "ABCDE";

  /* ---------- sound (off until you turn it on) and a short buzz on a miss ---------- */
  const soundOn = () => !!store.get("study:sound");
  let ac = null;
  function tone(kind) {
    if (!soundOn()) return;
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      const t = ac.currentTime;
      if (kind === "ok") { bell(t); return; }
      const notes = kind === "done" ? [[523.3, 0], [659.3, 0.1], [784, 0.2], [1046.5, 0.3]] : kind === "tap" ? [[1200, 0]] : [[196, 0], [174.6, 0.1]];
      notes.forEach(([f, at]) => {
        const o = ac.createOscillator(), g = ac.createGain();
        o.type = kind === "no" ? "triangle" : "sine"; o.frequency.value = f;
        const v = kind === "tap" ? 0.04 : 0.14, len = kind === "tap" ? 0.05 : 0.22;
        g.gain.setValueAtTime(0.0001, t + at); g.gain.exponentialRampToValueAtTime(v, t + at + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + at + len);
        o.connect(g).connect(ac.destination); o.start(t + at); o.stop(t + at + len + 0.02);
      });
      if (kind === "no") navigator.vibrate?.(35);
    } catch (e) {}
  }

  /* ---------- say it out loud ----------
     The browser's own dictation (Apple's or Google's speech service turns the audio into text; Check-in
     keeps only the text, on this device). Asked once (study:mic:ok); can be switched off in More
     (study:mic:off). mic(host, onText): a button that listens and hands over the text as it comes;
     null where the browser can't. */
  const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
  let listening = null;
  function mic(host, onText, label = "Say it out loud") {
    if (!Speech || store.get("study:mic:off")) return null;
    const b = btn(label, "ghost ls-mic", () => (listening?.b === b ? listening.rec.stop() : ask()), "mic");
    const note = el("div", "ls-micnote"); note.hidden = true;
    function ask() {
      if (store.get("study:mic:ok")) return start();
      note.textContent = ""; note.hidden = false;
      note.append(el("p", null, "Your phone's speech service (Apple's or Google's) turns what you say into text. Check-in keeps only the text, on this device."));
      const r = el("div", "ls-micbtns");
      r.append(btn("Use the microphone", "primary small", () => { store.set("study:mic:ok", true); note.hidden = true; start(); }), btn("Not now", "ghost small", () => { note.hidden = true; }));
      note.append(r);
    }
    function start() {
      if (listening) listening.rec.stop();
      let rec;
      try { rec = new Speech(); } catch (e) { return; }
      rec.lang = "en-GB"; rec.interimResults = true; rec.continuous = true;
      let done = "";
      rec.onresult = (e) => {
        let interim = "";
        for (let i = e.resultIndex; i < e.results.length; i++) { const t = e.results[i][0].transcript; if (e.results[i].isFinal) done += (done ? " " : "") + t.trim(); else interim += t; }
        onText(done, interim.trim());
      };
      const stop = () => { if (listening?.rec === rec) listening = null; b.classList.remove("on"); b.lastChild.textContent = label; onText(done, "", true); };
      rec.onend = stop; rec.onerror = (e) => { stop(); if (e.error === "not-allowed") { note.hidden = false; note.textContent = "The microphone isn't allowed for this page: check your browser's settings."; } };
      try { rec.start(); } catch (e) { return; }
      listening = { rec, b }; b.classList.add("on"); b.lastChild.textContent = "Listening… tap to stop";
    }
    host.append(b, note);
    return b;
  }
  // dictation into a writing box: what you say is added after what's there
  function dictateInto(host, ta) {
    const row = el("div", "ls-microw"); let base = null;
    if (!mic(row, (text, interim, end) => {
      if (base === null) base = ta.value.trim();
      ta.value = [base, (text + " " + interim).trim()].filter(Boolean).join(base ? " " : "");
      ta.dispatchEvent(new Event("input"));
      if (end) { base = null; if (text) window.Awards?.mark?.("spoke"); }
    }, "Dictate")) return;
    ta.after(row);
  }
  // which of a topic's key terms (its **bold** words) a text uses: [{ term, used }]
  function termsUsed(it, text) {
    const terms = [...new Set([...String(it.x?.plain || "").matchAll(/\*\*(.+?)\*\*/g)].map((m) => m[1].trim()).filter((t) => words(t).length <= 4))].slice(0, 6);
    const said = norm(text).split(/\s+/);
    const has = (w) => { const k = w.slice(0, Math.max(4, w.length - 2)); return said.some((s) => s.startsWith(k)); };
    return terms.map((term) => ({ term, used: norm(term).split(/\s+/).filter((w) => w.length >= 3).every(has) }));
  }

  // a soft reception-bell ding: a bright partial over a warm one, ringing out
  function bell(t) {
    [[1568, 0.11, 1.1], [3136, 0.04, 0.5], [4704, 0.018, 0.3], [784, 0.035, 0.6]].forEach(([f, v, len]) => {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = "sine"; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      o.connect(g).connect(ac.destination); o.start(t); o.stop(t + len + 0.05);
    });
  }

  /* ---------- small builders ---------- */
  function btn(text, cls, fn, ic) {
    const b = el("button", "ls-btn " + (cls || "")); b.type = "button";
    if (ic) b.append(K().icon(ic));
    b.append(document.createTextNode(text));
    if (fn) b.addEventListener("click", fn);
    return b;
  }
  const rich = (tag, cls, text) => SK().rich(tag, cls, text);
  // the line over an exercise: what kind it is, from which class, and why it's here (daily session)
  function kick(ex, label) {
    const k = el("div", "ls-kick"), pk = ex.pk, n = ex.it?.class ?? ex.n;
    if (ex.showCourse && pk) k.append(el("span", "chip", pk.course.code || pk.course.name));
    if (n && pk?.classes[n] && !ex.hideClass) k.append(SK().chipOf(pk, n));
    k.append(el("span", "kicker", label));
    if (ex.retry) k.append(el("span", "ls-why", "Once more"));
    else if (ex.why === "new") k.append(el("span", "ls-why new", ex.whyText ? "New · " + ex.whyText : "New to you"));
    else if (ex.why === "after") k.append(el("span", "ls-why new", ex.whyText ? ex.whyText[0].toUpperCase() + ex.whyText.slice(1) : "From class"));
    else if (ex.why === "ready") k.append(el("span", "ls-why new", ex.whyText ? ex.whyText[0].toUpperCase() + ex.whyText.slice(1) : "Getting ready"));
    else if (ex.why === "fading") k.append(el("span", "ls-why fading", ex.r < 0.6 ? "It's been a while" : "Memory " + Math.round(ex.r * 100) + "%"));   // a low score after a break reads like a mark
    return k;
  }
  const card = (cls) => { const a = el("article", "ls-card " + (cls || "")); a.tabIndex = -1; return a; };
  function grade(ex, g) {
    (ex.items || []).forEach((x) => Mem.grade(x.course, x.id, g));
    R.log.push({ ex, g });
    if (g === 1 && !ex.retry && ex.retryable !== false) R.missed.push(ex);
  }
  function drillStat(id, ok) {   // the same scores as the drill on Practise and the class Check
    const stats = store.get("drill:stats") || {};
    stats[id] = { seen: (stats[id]?.seen || 0) + 1, right: ok ? 1 : 0 };
    store.set("drill:stats", stats);
  }
  // a word flies from where you tapped it to where it goes
  function fly(from, to) {
    if (reduced() || !from.isConnected || !to.isConnected) return;
    const a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
    const g = from.cloneNode(true); g.className = "ls-tile ls-ghost";
    Object.assign(g.style, { left: a.left + "px", top: a.top + "px", width: a.width + "px", height: a.height + "px" });
    document.body.append(g);
    to.classList.add("landing");
    const end = () => { g.remove(); to.classList.remove("landing"); };
    requestAnimationFrame(() => requestAnimationFrame(() => {
      g.style.transform = "translate(" + (b.left - a.left) + "px," + (b.top - a.top) + "px)";
      g.style.width = b.width + "px"; g.style.height = b.height + "px";
    }));
    g.addEventListener("transitionend", end, { once: true });
    setTimeout(end, 420);
  }
  function confetti(host) {
    if (reduced()) return;
    const box = el("div", "ls-confetti"), colors = ["var(--cc)", "var(--gold)", "var(--good)", "var(--accent)", "var(--c5)", "var(--c3)"];
    for (let i = 0; i < 70; i++) {
      const p = el("i");
      p.style.left = Math.random() * 100 + "%";
      p.style.background = colors[i % colors.length];
      p.style.setProperty("--dx", (Math.random() * 2 - 1) * 120 + "px");
      p.style.setProperty("--r", (Math.random() * 720 - 360) + "deg");
      p.style.animationDelay = Math.random() * 0.35 + "s";
      p.style.animationDuration = 1.6 + Math.random() * 1.2 + "s";
      if (i % 3 === 0) p.style.borderRadius = "50%";
      box.append(p);
    }
    host.append(box);
    setTimeout(() => box.remove(), 3500);
  }

  /* ---------- the player ---------- */
  // spec: { color, steps: [exercise], title?, end(box, result)?, done(result), exit() }
  function play(box, spec) {
    stop();
    R = { spec, steps: spec.steps.slice(), i: 0, log: [], missed: [], retrying: false, combo: 0, best: 0, t0: Date.now(), primary: null, modal: null, keys: new Map() };
    // the room keys you held before, per course in the lesson: a key earned on the way gets its moment at the end
    spec.steps.forEach((ex) => { if (ex.course && ex.pk && !R.keys.has(ex.course)) R.keys.set(ex.course, { pk: ex.pk, before: new Set(Path.claimKeys(ex.course, ex.pk)) }); });
    document.body.classList.add("ls-open");
    const shell = el("div", "ls"); shell.style.setProperty("--cc", spec.color || "var(--accent)");
    const top = el("div", "ls-top"), x = el("button", "ls-x");
    x.type = "button"; x.setAttribute("aria-label", "Leave the lesson"); x.title = "Leave (Esc)"; x.append(K().icon("x")); x.addEventListener("click", leave);
    const bar = el("div", "ls-bar"), fill = el("i"); bar.setAttribute("role", "progressbar"); bar.setAttribute("aria-label", "Progress"); bar.append(fill);
    const comboEl = el("span", "ls-combo"), snd = el("button", "ls-snd");
    snd.type = "button";
    const paintSnd = () => { snd.textContent = ""; snd.append(K().icon(soundOn() ? "speaker" : "mute")); snd.title = soundOn() ? "Sound on" : "Sound off"; snd.setAttribute("aria-pressed", String(soundOn())); };
    snd.addEventListener("click", () => { store.set("study:sound", !soundOn()); paintSnd(); if (soundOn()) tone("ok"); });
    paintSnd();
    top.append(x, bar, comboEl, snd);
    const stage = el("div", "ls-stage"), foot = el("div", "ls-foot");
    shell.append(top, stage, foot);
    box.textContent = ""; box.append(shell);
    Object.assign(R, { shell, fill, bar, comboEl, stage, foot });
    show();
  }
  function stop() {
    R = null;
    document.body.classList.remove("ls-open");
    document.querySelectorAll(".ls-ghost").forEach((g) => g.remove());
  }
  function progress(done) {
    if (!R) return;
    const ex = R.steps[R.i], sub = ex?.sub ? ex.sub.i / ex.sub.n : 0;
    const v = done ? 1 : Math.min(1, (R.i + sub) / Math.max(1, R.steps.length));
    R.fill.style.width = v * 100 + "%";
    R.bar.setAttribute("aria-valuenow", String(Math.round(v * 100)));
  }
  function next() {
    if (!R) return;
    R.i++;
    show();
  }
  function show() {
    const r = R; if (!r) return;
    if (r.i >= r.steps.length && r.missed.length && !r.retrying) {
      r.retrying = true;
      r.steps.push({ type: "note", title: "Now the ones you missed", text: "One more go at each. Getting them right a second time is what makes them stick.", retryable: false },
        ...r.missed.map((m) => ({ ...m, retry: true, sub: null })));
      r.missed = [];
    }
    progress();
    if (r.i >= r.steps.length) return finish();
    const ex = r.steps[r.i];
    r.stage.textContent = ""; r.foot.textContent = ""; r.foot.className = "ls-foot"; r.primary = null; r.grader = null; r.storyKey = null;
    let view;
    try { view = (KIND[ex.type] || KIND.note)(ex); }
    catch (e) { console.error(e); return next(); }   // one broken exercise shouldn't stop the lesson
    r.cur = { ex, view };
    view.el.classList.add("ls-in");
    r.stage.append(view.el);
    window.scrollTo({ top: 0 });
    (view.focus || view.el).focus?.({ preventScroll: true });
  }
  // the bar at the bottom: Check (once you've answered), or Continue, or how you did
  function footCheck(onCheck, onSkip, label = "Check") {
    const f = R.foot, inner = el("div", "ls-foot-in");
    f.textContent = ""; f.className = "ls-foot";
    const skip = btn("Not sure? Show me", "ghost", onSkip);
    const go = btn(label, "primary", onCheck); go.disabled = true;
    inner.append(skip, go); f.append(inner);
    R.primary = go;
    return (on) => { go.disabled = !on; };
  }
  function footContinue(label = "Continue", fn = next, hint) {
    const f = R.foot, inner = el("div", "ls-foot-in");
    f.textContent = ""; f.className = "ls-foot";
    inner.append(hint ? el("p", "ls-hint", hint) : el("span"));
    const go = btn(label, "primary", fn); inner.append(go); f.append(inner);
    R.primary = go;
    return go;
  }
  function footGrade(onGrade, suggest) {
    const f = R.foot, inner = el("div", "ls-foot-in ls-grades");
    f.textContent = ""; f.className = "ls-foot";
    inner.append(el("p", "ls-hint", "How did you do?"));
    const row = el("div", "ls-grade");
    [[1, "Missed it", "bad"], [2, "Partly", "part"], [3, "Got it", "good"]].forEach(([g, l, c]) => {
      const b = btn(l, c, () => onGrade(g)); b.prepend(el("kbd", null, String(g)));
      if (suggest === g) b.classList.add("suggest");
      row.append(b);
    });
    inner.append(row); f.append(inner);
    R.primary = null; R.grader = onGrade;
  }
  function feedback(ok, body, title) {
    const f = R.foot, inner = el("div", "ls-foot-in ls-fb");
    f.textContent = ""; f.className = "ls-foot " + (ok ? "ok" : "no");
    const msg = el("div", "ls-fbt"), h = el("p", "ls-fbh"), cr = el("span", "ls-crab");
    cr.innerHTML = Crab.svg(ok ? "right" : "wrong");
    h.append(document.createTextNode(title || (ok ? PRAISE[Math.floor(Math.random() * PRAISE.length)] : "Not quite")));
    const row = el("div", "ls-fbrow"), txt = el("div", "ls-fbtx");
    txt.append(h);
    if (body) txt.append(body);
    row.append(cr, txt); msg.append(row);
    const go = btn("Continue", ok ? "good" : "next", next);
    inner.append(msg, go); f.append(inner);
    R.primary = go;
    tone(ok ? "ok" : "no"); if (!R.cur?.ex?.guess) streak(ok);
    if (!ok && !R.cur?.ex?.guess) R.cur?.view.el.classList.add("ls-shake");
    setTimeout(() => go.focus({ preventScroll: true }), 30);
  }
  // right answers in a row: a small counter in the top bar from three on
  function streak(ok) {
    R.combo = ok ? R.combo + 1 : 0;
    R.best = Math.max(R.best, R.combo);
    const c = R.combo, b = R.comboEl;
    b.textContent = ""; b.title = "";
    if (c < 3) return;
    b.append(K().icon("bolt"), document.createTextNode(String(c)));
    b.title = c + " right in a row";
    if ([3, 5, 10, 15, 20, 30].includes(c)) { b.classList.remove("pop"); void b.offsetWidth; b.classList.add("pop"); }
  }
  function leave() {
    if (!R || R.modal) return;
    const answered = R.log.length;
    if (!answered) { const fn = R.spec.exit; stop(); fn?.(); return; }
    const m = el("div", "ls-modal"), d = el("div", "ls-dialog");
    d.setAttribute("role", "dialog"); d.setAttribute("aria-label", "Leave the lesson?");
    d.append(el("h3", null, "Leave the lesson?"), el("p", null, "What you've answered so far is kept. You can pick it up again any time."));
    const stay = btn("Keep going", "primary", () => { m.remove(); R.modal = null; });
    const go = btn("Leave", "ghost", () => { const fn = R.spec.exit; stop(); fn?.(); });
    const b = el("div", "ls-dbtns"); b.append(go, stay); d.append(b); m.append(d);
    m.addEventListener("click", (e) => { if (e.target === m) { m.remove(); R.modal = null; } });
    R.shell.append(m); R.modal = m; stay.focus();
  }
  function finish() {
    const r = R;
    progress(true);
    r.stage.textContent = ""; r.foot.textContent = "";
    const graded = r.log.filter((l) => l.g != null && !l.ex.retry), right = graded.filter((l) => l.g >= 3).length;
    const result = { log: r.log, graded: graded.length, right, best: r.best, secs: Math.round((Date.now() - r.t0) / 1000) };
    const end = el("section", "ls-end ls-in"), medal = el("div", "ls-medal");
    medal.innerHTML = Crab.svg(r.spec.crab || "done");
    end.append(medal, el("h2", null, r.spec.title || "Lesson complete!"));
    const stats = el("div", "ls-stats");
    const tile = (v, l, cls) => { const t = el("div", "ls-stat " + (cls || "")); t.append(el("b", null, v), el("span", null, l)); stats.append(t); };
    // per thing you answered, how it ended: got it (or partly), or coming back sooner. No percentage.
    const last = new Map();
    r.log.forEach((l) => { if (l.g == null || l.ex.guess || l.ex.type === "where") return; const ids = (l.ex.items || []).map((x) => x.id); (ids.length ? ids : [l.ex.it?.id]).forEach((id) => id && last.set(id, l.g)); });
    const got = [...last.values()].filter((g) => g >= 2).length, back = last.size - got;
    if (got && !r.spec.quiet) tile(String(got), "got it", "acc");   // quiet: a passed card, nothing is kept
    if (back && !r.spec.quiet) tile(String(back), "coming back", "combo");
    // a room's key, earned in this lesson
    const fresh = []; let keyBox = null;
    r.keys.forEach(({ pk, before }, course) => Path.claimKeys(course, pk).forEach((id) => { if (!before.has(id)) { const rm = Path.roomOf(pk, id); if (rm) fresh.push(rm); } }));
    if (fresh.length) {
      const kb = el("div", "ls-keys"), ic = el("span", "ls-keyic"), kt = el("div");
      ic.innerHTML = Crab.key();
      kt.append(el("p", "ls-keyh", fresh.length === 1 ? "A new key!" : fresh.length + " new keys!"));
      fresh.forEach((rm) => kt.append(el("p", null, "Room " + rm.no + ", " + rm.title + ": you'll remember it for three weeks or more now. It's yours.")));
      kb.append(ic, kt); keyBox = kb;
    }
    const m = Math.floor(result.secs / 60), s = result.secs % 60;
    tile(m + ":" + String(s).padStart(2, "0"), "minutes", "time");
    if (r.best >= 3) tile(String(r.best), "in a row, at best", "combo");
    end.append(stats);
    if (keyBox) end.append(keyBox);
    const lucky = r.log.filter((l) => l.lucky).length, sure = r.log.filter((l) => l.sureMiss).length;
    if (lucky || sure) end.append(el("p", "ls-next", [lucky ? (lucky === 1 ? "One lucky guess comes" : lucky + " lucky guesses come") + " back sooner, to make sure it sticks." : "",
      sure ? (sure === 1 ? "One answer you were sure of wasn't right" : sure + " answers you were sure of weren't right") + ": worth a second look." : ""].filter(Boolean).join(" ")));
    r.spec.end?.(end, result);
    // plaques: a class studied within two days of it, then whatever you've newly earned
    r.log.forEach((l) => { const d = l.g != null && l.ex.pk?.classes?.[l.ex.it?.class]?.date; if (d) { const ago = SK().tnum() - SK().dnum(d); if (ago >= 0 && ago <= 2) Awards.mark("fresh"); } });
    Awards.check([...r.keys].map(([id, v]) => ({ id, pk: v.pk })));
    const plaques = Awards.earnedSince(Math.floor(r.t0 / 1000) - 1);
    if (plaques.length) {
      const pb = el("div", "ls-plaques");
      pb.append(el("p", "ls-keyh", plaques.length === 1 ? "A new plaque!" : plaques.length + " new plaques!"));
      plaques.forEach((id) => pb.append(Awards.plaque(id, true)));
      end.append(pb); Awards.seenNow();
    }
    // a question or a scene that stumped you (missed, not a guess): pass it to a classmate
    const hard = r.spec.noPass ? null : r.log.find((l) => l.g === 1 && !l.ex.guess && !l.ex.retry && l.ex.course && ((l.ex.type === "mcq" && l.ex.it?.kind === "mcq") || (l.ex.type === "scene" && l.ex.it?.kind === "topic")));
    if (hard) {
      const p = el("div", "ls-pass"), kind = hard.ex.type === "mcq" ? "q" : "scene";
      p.append(el("p", "small", "Stumped by one? See how a classmate does."), Path.passButton(hard.ex.course, kind, [hard.ex.it.id], kind === "q" ? "Can you answer this one?" : "Which idea is at work in this hotel?"));
      end.append(p);
    }
    r.stage.append(end);
    tone("done"); confetti(r.shell);
    const go = footContinue("Continue", () => { const fn = r.spec.done; stop(); fn?.(result); });
    setTimeout(() => go.focus({ preventScroll: true }), 30);
  }

  /* ---------- the exercises ---------- */
  const KIND = {
    // a message between exercises
    note(ex) {
      const a = card("ls-note");
      a.append(el("div", "ls-noteic"), el("h2", "ls-title", ex.title), el("p", "ls-lede", ex.text));
      a.firstChild.append(K().icon(ex.icon || "reset"));
      footContinue();
      return { el: a };
    },

    // something new: read it, then go on (you'll be asked about it in a moment)
    learn(ex) {
      const it = ex.it, pk = ex.pk, x = it.x, a = card("ls-learn"), links = !!pk.course.slides, n = it.class;
      a.append(kick(ex, it.kind === "topic" ? "New topic" : "New framework"), el("h2", "ls-title", it.title));
      if (it.kind === "topic") {
        if (x) a.append(SK().sec("plain", "In plain words", "", x.plain), SK().sec("hotel", "Picture it in a hotel", "", x.hotel), SK().sec("mix", "Easy to mix up", "", x.mixup));
        else if (it.notes) a.append(SK().notesDoc(it.notes, n, links));
        const refs = K().sourcesLine(x?.refs || it.refs, links); if (refs) a.append(refs);
        a.append(SK().noteBox(ex.course, it.id));
        if (x && it.notes) {
          const nd = el("details", "st-notes"), sum = el("summary");
          sum.append(document.createTextNode("Our notes for this topic"));
          nd.append(sum, SK().notesDoc(it.notes, n, links)); a.append(nd);
        }
      } else a.append(VText.el("p", "ls-gist", it.gist), SK().whereLine(pk, it), SK().noteBox(ex.course, it.id));
      footContinue("Continue", () => { Mem.tick(); R.log.push({ ex, g: null }); next(); }, it.kind === "topic" ? "You'll use it in a moment." : "");
      return { el: a };
    },

    // a topic in small steps: a part of its plain words (the title on the first), or its mix-up, which
    // closes the topic with where to look it up, your own note and ours
    read(ex) {
      const it = ex.it, pk = ex.pk, x = it.x || {}, links = !!pk.course.slides, a = card("ls-read " + ex.part);
      const label = ex.part === "plain" ? (ex.k ? "New topic · " + (ex.k + 1) + " of " + ex.n : "New topic") : ex.part === "hotel" ? "In practice" : ex.part === "mixup" ? "Watch out" : "New topic";
      a.append(kick(ex, label));
      if (ex.part === "plain" && !ex.k) a.append(el("h2", "ls-title", it.title));
      else a.append(el("p", "ls-sub ls-topic", it.title));
      if (ex.part === "plain") {
        if (ex.n > 1) { const d = el("div", "ls-dots"); for (let i = 0; i < ex.n; i++) d.append(el("i", i <= ex.k ? "on" : null)); a.append(d); }
        a.append(VText.el("p", "ls-text", ex.text));
      } else if (ex.part === "hotel") a.append(SK().sec("hotel", "Picture it in a hotel", "", ex.text));
      else if (ex.part === "mixup") a.append(SK().sec("mix", "Easy to mix up", "", ex.text));
      if (ex.last) {
        const refs = K().sourcesLine(x.refs || it.refs, links); if (refs) a.append(refs);
        a.append(SK().noteBox(ex.course, it.id));
        if (it.notes) {
          const nd = el("details", "st-notes"), sum = el("summary");
          sum.append(document.createTextNode("Our notes for this topic"));
          nd.append(sum, SK().notesDoc(it.notes, it.class, links)); a.append(nd);
        }
      }
      footContinue("Continue", () => { if (ex.tick) Mem.tick(); R.log.push({ ex, g: null }); next(); }, ex.part === "plain" && ex.k === 0 ? "A few lines at a time." : "");
      return { el: a };
    },

    // a hotel scene: which idea is at work here?
    scene(ex) {
      const it = ex.it, a = card("ls-scene"), box = el("div", "st-sec hotel ls-scenebox"), p = el("p");
      box.append(el("h3", null, "Picture it in a hotel"), p);
      ex.cue.forEach((x) => p.append(x === null ? el("span", "ls-blank") : document.createTextNode(x)));
      if (ex.more) p.append(document.createTextNode(" …"));
      a.append(kick(ex, ex.guess ? "Guess first · no score" : "Spot the idea"), el("h2", "ls-q", "Which idea is at work in this hotel?"), box);
      if (ex.guess) a.append(el("p", "ls-guessline", "Before you learn it: what's your guess? A guess first helps you remember, even when it's wrong."));
      return choose(a, ex, ex.options, false, ex.answer, (ok) => {
        // the whole scene, names and all
        p.replaceWith(el("p", "ls-in", ex.hotel));
        const b = el("div", "ls-fbody");
        b.append(el("p", "ls-fbl", (ok ? "Yes: " : "It's ") + it.title + "."));
        return b;
      });
    },

    // tap the key terms into the gaps of a sentence from the topic. The highlighted gap takes the next
    // word; tap another gap to fill that one first, or a filled one to take its word out.
    cloze(ex) {
      const a = card("ls-clozecard"), many = ex.answers.length > 1;
      a.append(kick(ex, "Fill in the gaps"), el("h2", "ls-q", "Tap the words that complete it."), el("p", "ls-sub", ex.it.title));
      const line = el("p", "ls-cloze"), slots = [];
      // gaps joined only by "and", "or" or a comma are a list: either order is right
      const JOIN = /^\s*(?:,|,?\s*(?:and|or|&)|\/)\s*$/i, group = [];
      let g = -1;
      ex.parts.forEach((p, i) => {
        if (typeof p === "string") { line.append(...rich("span", null, p).childNodes); return; }
        if (!(typeof ex.parts[i - 1] === "string" && JOIN.test(ex.parts[i - 1]) && typeof ex.parts[i - 2] === "object")) g++;
        group[p.k] = g;
        const s = el("button", "ls-slot"); s.type = "button";
        slots.push({ el: s, k: p.k, tile: null });
        line.append(s);
      });
      const bank = el("div", "ls-bank");
      const tiles = ex.tiles.map((w, i) => {
        const t = el("button", "ls-tile", w); t.type = "button"; t.dataset.n = String(i + 1);
        bank.append(t);
        return { el: t, w, used: false };
      });
      let locked = false, cur = slots[0] || null;   // the gap the next word goes into
      const ready = footCheck(check, skip);
      function refresh() {
        if (cur?.tile) cur = null;
        if (!cur && !locked) cur = slots.find((x) => !x.tile) || null;
        slots.forEach((s) => {
          s.el.classList.toggle("next", !locked && s === cur);
          s.el.setAttribute("aria-label", "Gap " + (s.k + 1) + (s.tile ? ": " + s.tile.w + ". Tap to take it out"
            : s === cur ? ", empty. The next word goes here" : ", empty. Tap to put the next word here"));
        });
        ready(slots.every((s) => s.tile));
      }
      function put(t) {
        if (locked || t.used) return;
        const s = cur && !cur.tile ? cur : slots.find((x) => !x.tile); if (!s) return;
        t.used = true; s.tile = t;
        s.el.textContent = t.w; s.el.classList.add("filled");
        fly(t.el, s.el);
        t.el.classList.add("used"); t.el.setAttribute("aria-hidden", "true"); t.el.tabIndex = -1;
        // then the next empty gap after this one (or before it, if this was the last)
        const i = slots.indexOf(s);
        cur = slots.slice(i + 1).find((x) => !x.tile) || slots.find((x) => !x.tile) || null;
        tone("tap"); refresh();
        if (document.activeElement === t.el) (tiles.find((x) => !x.used)?.el || R.primary)?.focus({ preventScroll: true });
      }
      function back(s) {
        if (locked || !s.tile) return;
        const t = s.tile; s.tile = null;
        t.used = false; t.el.classList.remove("used"); t.el.removeAttribute("aria-hidden"); t.el.tabIndex = 0;
        fly(s.el, t.el);
        s.el.textContent = ""; s.el.classList.remove("filled");
        cur = s;
        tone("tap"); refresh();
      }
      tiles.forEach((t) => t.el.addEventListener("click", () => put(t)));
      slots.forEach((s) => s.el.addEventListener("click", () => {
        if (locked) return;
        if (s.tile) back(s); else { cur = s; refresh(); }
      }));
      refresh();
      const answer = () => { const p = el("div", "ls-fbody"); p.append(el("p", "ls-fbl", "The full sentence"), rich("p", "ls-fbx", ex.full)); return p; };
      // a gap is right with its own word, or with any word of its list when the list holds just its words
      const bag = (xs) => xs.map(norm).sort().join("|");
      function good(s) {
        if (norm(s.tile?.w) === norm(ex.answers[s.k])) return true;
        const same = slots.filter((x) => group[x.k] === group[s.k]);
        return same.length > 1 && bag(same.map((x) => x.tile?.w)) === bag(same.map((x) => ex.answers[x.k]));
      }
      function check() {
        if (locked) return; locked = true; refresh();
        let ok = true;
        slots.forEach((s) => {
          if (good(s)) { s.el.classList.add("right"); return; }
          ok = false;
          // the word you put, struck out, and the right one beside it
          s.el.textContent = ""; s.el.classList.add("wrong");
          s.el.append(el("del", null, s.tile.w), el("ins", null, ex.answers[s.k]));
          s.el.setAttribute("aria-label", "Gap " + (s.k + 1) + ": you put " + s.tile.w + "; it's " + ex.answers[s.k]);
        });
        bank.classList.add("done");
        grade(ex, ok ? 3 : 1);
        // all the right words, only in the wrong gaps: say so, so it doesn't look like the same answer
        const swapped = !ok && many && bag(slots.map((s) => s.tile.w)) === bag(ex.answers);
        feedback(ok, ok ? null : answer(), swapped ? "Right words, wrong gaps" : undefined);
      }
      function skip() {
        if (locked) return; locked = true; refresh();
        slots.forEach((s) => { s.el.textContent = ex.answers[s.k]; s.el.classList.add("filled", "shown"); });
        bank.classList.add("done");
        grade(ex, 1);
        feedback(false, answer(), "Here's how it goes");
      }
      a.append(line, bank);
      if (many) a.append(el("p", "ls-clozehint", "Tap a gap to choose where the next word goes."));
      return {
        el: a, focus: tiles[0]?.el,
        key(e) {
          if (/^[1-9]$/.test(e.key) && tiles[+e.key - 1]) { put(tiles[+e.key - 1]); return; }
          if (e.key === "Backspace") { const s = [...slots].reverse().find((x) => x.tile); if (s) back(s); return; }
          return false;
        },
      };
    },

    // a question with four or five options: choose, then Check
    mcq(ex) {
      const it = ex.it, a = card("ls-mcq");
      a.append(kick(ex, ex.guess ? "Guess first · no score" : "Question"), rich("h2", "ls-q", it.stem));
      if (ex.guess) a.append(el("p", "ls-guessline", "Before you learn it: what's your guess? A guess first helps you remember, even when it's wrong."));
      return choose(a, ex, it.options, true, LETTERS.indexOf(it.answer), (ok, right) => {
        if (ex.guess) { const b = el("div", "ls-fbody"); b.append(el("p", "ls-fbl", (ok ? "Yes: " : "It's ") + LETTERS[right] + ". " + it.options[right]), el("p", "ls-why", "You'll see why in a minute.")); return b; }
        drillStat(it.id, ok);
        const b = el("div", "ls-fbody");
        if (!ok) b.append(el("p", "ls-fbl", "The answer: " + LETTERS[right] + ". " + it.options[right]));
        b.append(rich("p", "ls-why", it.why));
        const refs = K().sourcesLine(it.refs, !!ex.pk.course.slides); if (refs) b.append(refs);
        return b;
      });
    },

    // which framework is this? (its summary, with its own name's words blanked)
    pick(ex) {
      const it = ex.it, a = card("ls-pick");
      a.append(kick(ex, "Which framework is this?"));
      const cue = el("p", "ls-cue");
      ex.pick.cue.forEach((p) => cue.append(p === null ? el("span", "ls-blank") : document.createTextNode(p)));
      a.append(cue);
      return choose(a, ex, ex.pick.options, false, ex.pick.answer, (ok) => {
        const b = el("div", "ls-fbody");
        if (!ok) b.append(el("p", "ls-fbl", "It's " + Today.nameOf(it.title) + "."));
        b.append(el("p", "ls-why", it.gist), SK().whereLine(ex.pk, it));
        return b;
      });
    },

    // where would you look it up? (which class)
    where(ex) {
      const it = ex.it, pk = ex.pk, a = card("ls-where"), topic = it.kind === "topic";
      const gist = it.gist || Path.sentences(String(it.x?.plain || "").replace(/\*\*/g, ""))[0] || "";
      a.append(kick({ ...ex, hideClass: true }, topic ? "Find it fast" : "Where would you look it up?"), el("h2", "ls-title", it.title), el("p", "ls-gist", gist));
      if (topic) a.append(el("p", "ls-guessline", "You need it for a report or an open-book question. Which class's material do you open?"));
      const labels = ex.where.options.map((c) => SK().unit(pk) + " " + c + " · " + pk.classes[c].name);
      return choose(a, ex, labels, false, ex.where.answer, (ok) => {
        const b = el("div", "ls-fbody");
        if (!ok) b.append(el("p", "ls-fbl", "It's in " + SK().unit(pk).toLowerCase() + " " + it.class + "."));
        if (topic) { const refs = K().sourcesLine(it.x?.refs || it.refs, !!pk.course.slides); if (refs) b.append(refs); b.append(el("p", "small", SK().unit(pk) + " " + it.class + ": " + pk.classes[it.class].name)); }
        else b.append(SK().whereLine(pk, it));
        return b;
      });
    },

    // name it: type the framework's name from its summary
    type(ex) {
      const it = ex.it, a = card("ls-type");
      a.append(kick(ex, "Name it"), el("h2", "ls-q", "Which framework is this? Type its name."));
      const cue = el("p", "ls-cue");
      ex.cue.forEach((p) => cue.append(p === null ? el("span", "ls-blank") : document.createTextNode(p)));
      const input = el("input", "ls-input"); input.type = "text"; input.autocomplete = "off"; input.spellcheck = false;
      input.setAttribute("autocapitalize", "off"); input.setAttribute("aria-label", "The framework's name"); input.placeholder = "Its name";
      const hintRow = el("div", "ls-hintrow");
      const hint = el("button", "tbtn", "Show a hint"); hint.type = "button";
      hint.addEventListener("click", () => {
        input.placeholder = ex.answer.split(/(\s+)/).map((w) => (/\s/.test(w) ? w : w[0] + "·".repeat(Math.max(0, w.length - 1)))).join("");
        hint.remove(); input.focus();
      });
      hintRow.append(hint);
      a.append(cue, input, hintRow);
      const ready = footCheck(check, skip);
      input.addEventListener("input", () => ready(!!input.value.trim()));
      let locked = false;
      function check() {
        if (locked) return; locked = true; input.readOnly = true;
        const v = norm(input.value), want = [ex.answer, ...(ex.alt || [])].map(norm);
        const exact = want.includes(v), close = !exact && want.some((w) => lev(v, w) <= Math.max(1, Math.floor(w.length / 7)));
        const ok = exact || close;
        // the name of another framework: a slip between the two
        if (!ok) { const other = ex.pk.items.find((f) => f.kind === "framework" && f.id !== it.id && norm(Today.nameOf(f.title)) === v); if (other) Mem.slip(ex.course, it.id, other.id); }
        input.classList.add(ok ? "right" : "wrong");
        grade(ex, exact ? 3 : close ? 2 : 1);
        const b = el("div", "ls-fbody");
        if (close) b.append(el("p", "ls-fbl", "Mind the spelling: " + ex.answer + "."));
        if (!ok) b.append(el("p", "ls-fbl", "It's " + ex.answer + "."));
        b.append(el("p", "ls-why", it.gist));
        feedback(ok, b, close ? "Almost: a typo" : undefined);
      }
      function skip() {
        if (locked) return; locked = true; input.readOnly = true; input.value = ex.answer; input.classList.add("shown");
        grade(ex, 1);
        const b = el("div", "ls-fbody"); b.append(el("p", "ls-why", it.gist));
        feedback(false, b, "It's " + ex.answer);
      }
      return { el: a, focus: input };
    },

    // match the pairs: tap a name, then what it means
    match(ex) {
      const a = card("ls-match");
      a.append(kick(ex, "Match the pairs"), el("h2", "ls-q", "Tap a name, then what it means."));
      const grid = el("div", "ls-pairs"), left = el("div", "ls-col"), right = el("div", "ls-col r");
      const miss = {}; let sel = null, matched = 0;
      const make = (p, side, text) => {
        const b = el("button", "ls-pair " + side, text); b.type = "button";
        b.addEventListener("click", () => tap(b, p, side));
        return b;
      };
      shuffle(ex.pairs).forEach((p, i) => { const b = make(p, "l", p.name); b.prepend(el("kbd", null, String(i + 1))); left.append(b); });
      shuffle(ex.pairs).forEach((p) => right.append(make(p, "r", p.text)));
      grid.append(left, right); a.append(grid);
      let shown = false;   // "Show me": the pairs are given, nothing more to match or grade
      function tap(b, p, side) {
        if (shown || b.classList.contains("done")) return;
        if (!sel || sel.side === side) {
          if (sel) sel.b.classList.remove("sel");
          sel = sel?.b === b ? null : { b, p, side };
          if (sel) { b.classList.add("sel"); tone("tap"); }
          return;
        }
        const other = sel; sel = null; other.b.classList.remove("sel");
        if (other.p === p) {
          [other.b, b].forEach((x) => { x.classList.add("good"); x.disabled = true; setTimeout(() => x.classList.replace("good", "done"), 450); });
          tone("tap");
          if (++matched === ex.pairs.length) setTimeout(allDone, 450);
        } else {
          [other.b, b].forEach((x) => { x.classList.remove("wrong"); void x.offsetWidth; x.classList.add("wrong"); setTimeout(() => x.classList.remove("wrong"), 600); });
          miss[other.p.id] = (miss[other.p.id] || 0) + 1; miss[p.id] = (miss[p.id] || 0) + 1;
          Mem.slip(ex.course, other.p.id, p.id);
          tone("no");
        }
      }
      function allDone() {
        if (shown || !R || R.cur?.ex !== ex) return;
        const total = Object.values(miss).reduce((s, v) => s + v, 0);
        ex.pairs.forEach((p) => { const m = miss[p.id] || 0; Mem.grade(ex.course, p.id, m === 0 ? 3 : m === 1 ? 2 : 1); });
        R.log.push({ ex, g: total ? 2 : 3 });
        feedback(true, total ? el("p", "ls-why", total === 1 ? "One wrong pairing on the way." : total + " wrong pairings on the way: those come back sooner.") : null, total ? "All matched" : undefined);
      }
      function skip() {
        if (shown) return; shown = true;
        grid.querySelectorAll("button").forEach((x) => (x.disabled = true));
        ex.pairs.forEach((p) => Mem.grade(ex.course, p.id, 1));
        R.log.push({ ex, g: 1 });
        const b = el("ul", "ls-pairlist");
        ex.pairs.forEach((p) => { const li = el("li"); li.append(el("b", null, p.name), document.createTextNode(": " + p.text)); b.append(li); });
        feedback(false, b, "The pairs");
      }
      const f = R.foot, inner = el("div", "ls-foot-in");
      f.textContent = ""; f.className = "ls-foot";
      inner.append(btn("Not sure? Show me", "ghost", skip), el("p", "ls-hint", "Match all the pairs to go on."));
      f.append(inner); R.primary = null;
      const lefts = [...left.children];
      return { el: a, key(e) { if (/^[1-5]$/.test(e.key) && lefts[+e.key - 1]) { lefts[+e.key - 1].click(); return; } return false; } };
    },

    // explain it (out loud or in your head), then see an answer and mark yourself
    say(ex) {
      const it = ex.it, x = it.x, a = card("ls-say"), links = !!ex.pk.course.slides;
      a.append(kick(ex, "Explain it"), el("p", "ls-sub", it.title),
        rich("h2", "ls-q", x?.ask?.q || "Explain it in your own words, with a hotel example."),
        el("p", "ls-lede", "Say it out loud or in your head, then check."));
      // with the microphone: what you said, and the key terms in it
      const heard = el("div", "ls-heard"); heard.hidden = true;
      const said = el("p", "ls-said"), chips = el("div", "ls-terms");
      heard.append(said, chips);
      const mb = el("div", "ls-microw");
      if (mic(mb, (text, interim, end) => {
        heard.hidden = false;
        said.textContent = (text + (interim ? " " + interim : "")).trim() || "…";
        chips.textContent = "";
        const used = termsUsed(it, text + " " + interim);
        if (used.length) {
          chips.append(el("span", "small", "Key terms you used:"));
          used.forEach((u) => { const c = el("span", "ls-term" + (u.used ? " on" : ""), u.term); chips.append(c); });
        }
        if (end && text) { ex.spoke = true; window.Awards?.mark?.("spoke"); }
      })) a.append(mb, heard);
      const back = el("div", "ls-ans"); back.hidden = true;
      if (x) back.append(VText.el("p", null, x.ask.a)); else if (it.notes) back.append(SK().notesDoc(it.notes, it.class, links));
      const refs = K().sourcesLine(x?.refs || it.refs, links); if (refs) back.append(refs);
      const mine = SK().noteShow(ex.course, it.id); if (mine) back.append(mine);
      a.append(back);
      const reveal = () => { back.hidden = false; back.classList.add("ls-in"); footGrade((g) => { grade(ex, g); tone(g >= 3 ? "ok" : "no"); streak(g >= 3); next(); }); };
      footContinue("Show the answer", reveal);
      return { el: a, key(e) { if (!back.hidden && R.grader && /^[1-3]$/.test(e.key)) { R.grader(+e.key); return; } return false; } };
    },

    // a framework flashcard (the daily session): what is it? turn it, mark yourself
    flash(ex) {
      const it = ex.it, a = card("ls-flash");
      a.append(kick(ex, "Flashcard"), el("h2", "ls-title", it.title), el("p", "ls-lede", "What is it, and when would you use it for a hotel?"));
      const back = el("div", "ls-ans"); back.hidden = true;
      back.append(VText.el("p", "ls-gist", it.gist), SK().whereLine(ex.pk, it));
      const mine = SK().noteShow(ex.course, it.id); if (mine) back.append(mine);
      a.append(back);
      footContinue("Turn the card", () => { back.hidden = false; back.classList.add("ls-in"); footGrade((g) => { grade(ex, g); tone(g >= 3 ? "ok" : "no"); streak(g >= 3); next(); }); });
      return { el: a, key(e) { if (!back.hidden && R.grader && /^[1-3]$/.test(e.key)) { R.grader(+e.key); return; } return false; } };
    },

    // a class's story, a paragraph at a time, with a question or two along the way
    story(ex) {
      const pk = ex.pk, c = pk.classes[ex.n], a = card("ls-story");
      a.append(kick(ex, "The story"), el("h2", "ls-title", c.name));
      const flow = el("div", "ls-flow"); a.append(flow);
      const seq = [];
      ex.paras.forEach((p, i) => {
        seq.push({ p });
        const q = i === 1 ? ex.qs[0] : i === 3 ? ex.qs[1] : null;
        if (q) seq.push({ q });
      });
      ex.qs.slice(seq.filter((s) => s.q).length).forEach((q) => seq.push({ q }));   // a short story still asks its questions
      ex.sub = { i: 0, n: seq.length };
      let k = 0;
      function step() {
        if (!R || R.cur?.ex !== ex) return;
        if (k >= seq.length) return next();
        const s = seq[k++]; ex.sub.i = k; progress();
        if (s.p) {
          const p = VText.el("p", "ls-para ls-in", s.p);
          flow.append(p);
          if (k > 1) p.scrollIntoView({ block: "nearest", behavior: reduced() ? "auto" : "smooth" });
          footContinue(k >= seq.length ? "Finish the story" : "Continue", step);
          return;
        }
        const q = s.q, box = el("div", "ls-sq ls-in");
        box.append(el("p", "kicker", "Quick question"), rich("p", "ls-q", q.stem));
        const opts = el("div", "ls-opts"), right = LETTERS.indexOf(q.answer);
        const bs = q.options.map((t, i) => {
          const b = el("button", "ls-opt"); b.type = "button";
          b.append(el("span", "ls-key", LETTERS[i]), el("span", "ls-ot", t));
          b.addEventListener("click", () => answer(i));
          opts.append(b); return b;
        });
        box.append(opts); flow.append(box);
        box.scrollIntoView({ block: "nearest", behavior: reduced() ? "auto" : "smooth" });
        const f = R.foot, inner = el("div", "ls-foot-in"); f.textContent = ""; f.className = "ls-foot";
        inner.append(el("p", "ls-hint", "Choose an answer to go on.")); f.append(inner); R.primary = null;
        let done = false;
        R.storyKey = (i) => answer(i);
        function answer(i) {
          if (done) return; done = true; R.storyKey = null;
          const ok = i === right;
          bs.forEach((b, j) => { b.disabled = true; if (j === right) b.classList.add("right"); else if (j === i) b.classList.add("wrong"); });
          Mem.grade(ex.course, q.id, ok ? 3 : 1); drillStat(q.id, ok);
          R.log.push({ ex: { ...ex, type: "mcq", it: q }, g: ok ? 3 : 1 });
          box.append(rich("p", "ls-why ls-in", (ok ? "" : "The answer is " + LETTERS[right] + ". ") + q.why));
          tone(ok ? "ok" : "no"); streak(ok);
          footContinue(k >= seq.length ? "Finish the story" : "Continue", step);
        }
      }
      setTimeout(step, 0);
      return {
        el: a,
        key(e) {
          const k2 = e.key.toLowerCase(), i = /^[1-5]$/.test(k2) ? +k2 - 1 : /^[a-e]$/.test(k2) ? k2.charCodeAt(0) - 97 : -1;
          if (i >= 0 && R.storyKey) { R.storyKey(i); return; }
          return false;
        },
      };
    },

    // a mix-up: the two ideas side by side, before sorting cards into one or the other
    contrast(ex) {
      const a = card("ls-contrast"), top = el("div", "ls-mixhead"), cr = el("div", "ls-mixcrab"), t = el("div");
      cr.innerHTML = Crab.svg("hold", { cards: ["A", "B"], colors: ["#FBD3C6", "#CCD6FF"] });
      t.append(el("p", "kicker ls-mixk", "Tell them apart"), el("h2", "ls-q", "You've mixed these two up."));
      top.append(cr, t);
      const vs = el("div", "ls-vs"), links = !!ex.pk.course.slides;
      [[ex.a, ex.ga, "a", "A"], [ex.b, ex.gb, "b", "B"]].forEach(([it, g, cls, L]) => {
        const d = el("div", "ls-vsx " + cls), h = el("p", "ls-vsh");
        h.append(el("span", "ls-vsl", L), document.createTextNode(it.title));
        d.append(h, VText.el("p", "ls-vsg", g));
        const refs = K().sourcesLine(it.x?.refs || it.refs, links); if (refs) d.append(refs);
        vs.append(d);
      });
      a.append(top, vs);
      // a topic's own "easy to mix up", when it is about the other one
      // (by a word of the other's name that the two names don't share)
      const own = (it, other) => norm(it.title).split(" ").filter((w) => w.length > 4 && !norm(other.title).split(" ").includes(w));
      const about = (x, it, other) => {
        const ws = own(other, it), hit = ws.filter((w) => new RegExp("\\b" + w + "\\b").test(norm(x?.mixup || ""))).length;
        return !!x?.mixup && ws.length > 0 && hit >= Math.min(2, ws.length);
      };
      const mx = about(ex.a.x, ex.a, ex.b) ? ex.a.x.mixup : about(ex.b.x, ex.b, ex.a) ? ex.b.x.mixup : null;
      if (mx) a.append(SK().sec("mix", "Easy to mix up", "", mx));
      footContinue("Sort them", () => { R.log.push({ ex, g: null }); next(); }, "Then a few quick cards to sort.");
      return { el: a };
    },

    // a mix-up card: which of the two is this? (both names blanked)
    sort(ex) {
      const a = card("ls-sort"), names = [Path.short(ex.a.title), Path.short(ex.b.title)];
      a.append(kick(ex, "Tell them apart · " + ex.k + " of " + ex.of), el("h2", "ls-q", "Which one is this?"));
      const cue = el("p", "ls-cue");
      ex.cue.forEach((p) => cue.append(p === null ? el("span", "ls-blank") : document.createTextNode(p)));
      const bins = el("div", "ls-bins");
      let locked = false;
      const bs = names.map((nm, i) => {
        const b = el("button", "ls-bin " + (i ? "b" : "a")); b.type = "button";
        b.append(el("span", "ls-vsl", i ? "B" : "A"), el("span", "ls-binn", nm));
        b.addEventListener("click", () => pick(i));
        bins.append(b); return b;
      });
      a.append(cue, bins);
      const f = R.foot, inner = el("div", "ls-foot-in"); f.textContent = ""; f.className = "ls-foot";
      inner.append(el("p", "ls-hint", "Tap A or B.")); f.append(inner); R.primary = null;
      function pick(i) {
        if (locked) return; locked = true;
        const ok = i === ex.answer;
        bs.forEach((b, k) => { b.disabled = true; if (k === ex.answer) b.classList.add("right"); else if (k === i) b.classList.add("wrong"); });
        grade(ex, ok ? 3 : 1);
        const it = ex.answer ? ex.b : ex.a, body = el("div", "ls-fbody");
        body.append(el("p", "ls-fbl", (ok ? "Yes: " : "It's ") + it.title + "."));
        feedback(ok, body);
      }
      return { el: a, focus: bs[0], key(e) { const k = e.key.toLowerCase(); if (k === "a" || k === "1") { pick(0); return; } if (k === "b" || k === "2") { pick(1); return; } return false; } };
    },

    // apply it to your hotel (optional): a few lines and the points you covered, for your case notebook
    apply(ex) {
      const a = card("ls-apply"), ed = SK().applyBox(ex.course, ex.pk, ex.it);
      a.append(kick(ex, "Apply it · optional"), ed.el);
      const apTa = ed.el.querySelector(".ap-ta"); if (apTa) dictateInto(ed.el, apTa);
      const f = R.foot, inner = el("div", "ls-foot-in"); f.textContent = ""; f.className = "ls-foot";
      const skip = btn("Skip", "ghost", () => { R.log.push({ ex, g: null }); next(); });
      const save = btn("Save to my case notebook", "primary", () => { ed.save(); Mem.tick(); R.log.push({ ex, g: null }); next(); });
      save.disabled = !ed.text();
      ed.onInput(() => { save.disabled = !ed.text(); });
      inner.append(skip, save); f.append(inner); R.primary = save;
      return { el: a };
    },

    /* ---------- the GM's inbox (inbox.js): the message, the rooms that help, your reply ---------- */
    mail(ex) {
      const a = card("ls-mail");
      a.append(kick(ex, "A message from the GM"), Inbox.letter(ex.course, ex.pk, ex.gm));
      footContinue("Write a reply", next, "Which of your rooms would help?");
      return { el: a };
    },
    // which of your lit rooms help here? one or more; not graded, a wrong pick next to a missed one is a mix-up
    rooms(ex) {
      const a = card("ls-rooms"), m = ex.gm, right = new Set(m.rooms), picked = new Set();
      let locked = false;
      a.append(kick(ex, "Your reply · step 1 of 2"), el("h2", "ls-q", "Which of your rooms help here?"),
        el("p", "ls-guessline", "Pick one or more: rooms you've lit. “" + m.title + "”"));
      const opts = el("div", "ls-opts ls-multi");
      const bs = ex.options.map((id, i) => {
        const it = ex.pk.items.find((x) => x.id === id), rm = Path.roomOf(ex.pk, id);
        const b = el("button", "ls-opt"); b.type = "button"; b.setAttribute("aria-pressed", "false");
        b.style.setProperty("--rc", SK().color(it.class, ex.pk));
        const t = el("span", "ls-ot"); t.append(el("small", "ls-room", rm ? "Room " + rm.no : SK().unit(ex.pk) + " " + it.class), document.createTextNode(it.title));
        b.append(el("span", "ls-key ls-tick", String(i + 1)), t);
        b.addEventListener("click", () => toggle(i));
        opts.append(b); return { b, id, it };
      });
      a.append(opts);
      const ready = footCheck(check, skip);
      function toggle(i) {
        if (locked) return;
        const { b, id } = bs[i];
        if (picked.has(id)) picked.delete(id); else picked.add(id);
        b.setAttribute("aria-pressed", String(picked.has(id))); tone("tap"); ready(picked.size > 0);
      }
      function show(skipped) {
        locked = true;
        bs.forEach(({ b, id }) => { b.disabled = true; if (right.has(id)) b.classList.add(picked.has(id) || skipped ? "right" : "missed"); else if (picked.has(id)) b.classList.add("wrong"); });
        const hit = [...picked].filter((id) => right.has(id)).length, wrong = [...picked].filter((id) => !right.has(id));
        if (ex.gmState) ex.gmState.picked = skipped ? [] : [...picked];
        const missed = m.rooms.filter((id) => !picked.has(id));
        if (!skipped && wrong.length === 1 && missed.length === 1) Mem.slip(ex.course, missed[0], wrong[0]);   // one taken for the other
        Mem.tick(); R.log.push({ ex, g: null });
        const body = el("div", "ls-fbody");
        body.append(el("p", "ls-fbl", m.rooms.length === 1 ? "The room that helps:" : "The rooms that help:"));
        const ul = el("ul", "ls-roomlist");
        m.rooms.forEach((id) => { const it = ex.pk.items.find((x) => x.id === id), rm = Path.roomOf(ex.pk, id); ul.append(el("li", null, (rm ? "Room " + rm.no + ", " : "") + it.title)); });
        body.append(ul, el("p", "ls-why", "Keep them in mind for your reply."));
        const all = !skipped && hit === right.size && !wrong.length;
        feedback(all, body, skipped ? "These help here" : all ? "Right rooms" : hit ? "Partly: " + hit + " of " + right.size : "Other rooms help here");
      }
      function check() { if (!locked && picked.size) show(false); }
      function skip() { if (!locked) show(true); }
      return {
        el: a, focus: bs[0]?.b,
        key(e) { if (/^[1-9]$/.test(e.key) && bs[+e.key - 1]) { toggle(+e.key - 1); return; } return false; },
      };
    },
    // write your reply, then compare it with the key points and tick what you covered; it goes in your case notebook
    reply(ex) {
      const a = card("ls-reply"), m = ex.gm, c = ex.course, old = Mem.caseGet(c, "gm:" + m.id) || {};
      const ticks = new Set(old.ticks || []);
      a.append(kick(ex, "Your reply · step 2 of 2"), el("h2", "ls-q", "Re: " + m.title));
      const msg = el("details", "ls-gmmsg"); msg.append(el("summary", null, "The GM's message"), Inbox.letter(c, ex.pk, m, { small: true }));
      a.append(msg);
      if (!Path.hotelOf(c)) {
        const hl = el("label", "ap-hotel"), hin = el("input");
        hin.type = "text"; hin.maxLength = 80; hin.autocomplete = "off"; hin.placeholder = "Your workplace, the case company, a hotel you know";
        hl.append(el("span", "kicker", "Your hotel (optional)"), hin);
        hin.addEventListener("input", () => Mem.caseSet(c, "_hotel", { text: hin.value.trim() }));
        a.append(hl);
      }
      const ta = el("textarea", "ls-write"); ta.rows = 5; ta.maxLength = Mem.CASE_MAX; ta.value = old.text || "";
      ta.placeholder = "A few lines: what's going on, and what you'd do. Use the ideas from those rooms.";
      ta.setAttribute("aria-label", "Your reply to the GM");
      let tm = null;
      const save = (more = {}) => {
        clearTimeout(tm);
        if (!more.sent && !ta.value.trim() && !Mem.caseGet(c, "gm:" + m.id)?.text) return;   // nothing written, nothing stored
        Mem.caseSet(c, "gm:" + m.id, { text: ta.value, ticks: [...ticks], ...more });
      };
      ta.addEventListener("input", () => { clearTimeout(tm); tm = setTimeout(save, 400); });
      ta.addEventListener("blur", () => save());
      a.append(ta);
      dictateInto(a, ta);
      const ans = el("div", "ls-ans"); ans.hidden = true;
      ans.append(el("p", "kicker", "What a good reply covers"));
      const ol = el("ol", "st-points");
      m.points.forEach((p, k) => {
        const lab = el("label"), cb = el("input"); cb.type = "checkbox"; cb.checked = ticks.has(k);
        cb.addEventListener("change", () => { if (cb.checked) ticks.add(k); else ticks.delete(k); save(); hint(); });
        lab.append(cb, rich("span", null, p));
        const li = el("li"); li.append(lab); ol.append(li);
      });
      ans.append(ol);
      const refs = K().sourcesLine(m.refs, !!ex.pk.course.slides); if (refs) ans.append(refs);
      ans.append(el("p", "small", "One good reply, not the only one. A different route that's well argued counts too."));
      a.append(ans);
      const send = () => {
        save({ sent: true }); Mem.tick();
        // applying is remembering: the rooms you rightly picked get a review
        const lit = Inbox.reviewRooms(c, m, ex.gmState?.picked || [], ticks.size);
        R.log.push({ ex, g: null, gmLit: lit }); next();
      };
      function hint() { const h = R.foot.querySelector(".ls-hint"); if (h) h.textContent = ticks.size ? "You covered " + ticks.size + " of " + m.points.length + "." : "Tick what your reply covered."; }
      footContinue("Compare with the key points", () => {
        save(); ans.hidden = false; ans.classList.add("ls-in");
        footContinue("Send to the GM", send, "Tick what your reply covered."); hint();
        ans.scrollIntoView({ block: "nearest", behavior: "smooth" });
      });
      return { el: a, focus: ta };
    },

    // an open question: write your answer, see the key points, tick what you covered, mark yourself
    explain(ex) {
      const q = ex.it, a = card("ls-explain"), key = ex.course === "ldd" ? "explain" : "explain:" + ex.course;
      const all = store.get("study:" + key) || {}, st = (all[ex.n] || {})[ex.i] || {};
      const save = (fn) => { const s = store.get("study:" + key) || {}; s[ex.n] = s[ex.n] || {}; s[ex.n][ex.i] = s[ex.n][ex.i] || {}; fn(s[ex.n][ex.i]); store.set("study:" + key, s); };
      const ask = el("h2", "ls-q"); ask.innerHTML = Path.withHotel(ex.course, q.ask);   // from our notes; [hotel] becomes yours
      const ta = el("textarea", "ls-write"); ta.value = st.text || ""; ta.placeholder = "Your answer first: a few bullets and an example.";
      ta.setAttribute("aria-label", "Your answer");
      let tm = null;
      ta.addEventListener("input", () => { clearTimeout(tm); tm = setTimeout(() => save((s) => (s.text = ta.value)), 300); });
      a.append(kick(ex, "Explain it in your own words"), ask, ta);
      dictateInto(a, ta);
      const x = q.answer, ans = el("div", "ls-ans"); ans.hidden = true;
      const ticks = new Set(st.ticks || []), hint = el("p", "ls-hint");
      const LABEL = { 3: "got it", 2: "partly", 1: "missed it" };
      const suggestion = () => { const n1 = ticks.size, all2 = x.points.length; return n1 === all2 ? 3 : n1 * 2 >= all2 ? 2 : 1; };
      if (x) {
        ans.append(el("p", "kicker", "Key points of a good answer"));
        if (x.case) ans.append(rich("p", "ls-case", x.case));
        const ol = el("ol", "st-points");
        x.points.forEach((p, k) => {
          const lab = el("label"), cb = el("input"); cb.type = "checkbox"; cb.checked = ticks.has(k);
          cb.addEventListener("change", () => { if (cb.checked) ticks.add(k); else ticks.delete(k); save((s) => (s.ticks = [...ticks])); grader(); });
          lab.append(cb, rich("span", null, p));
          const li = el("li"); li.append(lab); ol.append(li);
        });
        ans.append(ol, rich("p", "st-concl", x.conclusion));
        const refs = K().sourcesLine(x.refs, !!ex.pk.course.slides); if (refs) ans.append(refs);
        ans.append(el("p", "small", "One good answer, not the only one. Another route that is well argued counts too."));
      } else { const d = el("div"); d.innerHTML = q.html || ""; ans.append(d); }   // from our notes
      a.append(ans);
      function grader() {
        const s = x ? suggestion() : null;
        footGrade((g) => { grade(ex, g); tone(g >= 3 ? "ok" : "no"); streak(g >= 3); next(); }, ticks.size ? s : null);
        const h = R.foot.querySelector(".ls-hint");
        if (x && h) h.textContent = ticks.size ? "You covered " + ticks.size + " of " + x.points.length + " key points: that's " + LABEL[s] + "." : "Tick the key points your answer covered.";
      }
      footContinue("Show the key points", () => { ans.hidden = false; ans.classList.add("ls-in"); save((s) => (s.answer = true)); grader(); ans.scrollIntoView({ block: "nearest", behavior: "smooth" }); });
      return { el: a, focus: ta, key(e) { if (!ans.hidden && R.grader && /^[1-3]$/.test(e.key)) { R.grader(+e.key); return; } return false; } };
    },
  };

  // options to choose from, then Check: mcq, pick and where
  function choose(a, ex, labels, letters, right, explain) {
    let picked = null, locked = false;
    const opts = el("div", "ls-opts");
    const bs = labels.map((t, i) => {
      const b = el("button", "ls-opt"); b.type = "button"; b.setAttribute("aria-pressed", "false");
      b.append(el("span", "ls-key", letters ? LETTERS[i] : String(i + 1)), el("span", "ls-ot", t));
      b.addEventListener("click", () => select(i));
      opts.append(b); return b;
    });
    a.append(opts);
    // sure, or guessing? an optional tap once you've chosen, nothing assumed if you don't: a right guess
    // comes back sooner (graded hard), and a miss you were sure of gets a word. Not on a "guess first",
    // where everything is a guess.
    let how = null;   // "sure" | "guess" | null
    const unsure = el("div", "ls-how"); unsure.hidden = true; unsure.setAttribute("role", "group"); unsure.setAttribute("aria-label", "How sure are you? (optional)");
    unsure.append(el("span", null, "How sure?"));
    const hb = [["sure", "Sure", "S"], ["guess", "Guessing", "G"]].map(([k, l, key]) => {
      const b = el("button", "ls-unsure " + k); b.type = "button"; b.setAttribute("aria-pressed", "false"); b.title = l + " (" + key + ")";
      b.append(el("i"), document.createTextNode(l));
      b.addEventListener("click", () => flip(k));
      unsure.append(b); return b;
    });
    const flip = (k) => { if (locked) return; how = how === k ? null : k; hb[0].setAttribute("aria-pressed", String(how === "sure")); hb[1].setAttribute("aria-pressed", String(how === "guess")); tone("tap"); };
    if (!ex.guess) a.append(unsure);
    const ready = footCheck(check, skip);
    function select(i) {
      if (locked) return;
      picked = i; bs.forEach((b, k) => b.setAttribute("aria-pressed", String(k === i)));
      unsure.hidden = false;
      tone("tap"); ready(true);
    }
    function lock() { locked = true; bs.forEach((b, k) => { b.disabled = true; if (k === right) b.classList.add("right"); else if (k === picked) b.classList.add("wrong"); }); }
    function check() {
      if (locked || picked === null) return; lock(); const ok = picked === right;
      hb.forEach((b) => (b.disabled = true));
      const guessing = how === "guess", sure = how === "sure";
      grade(ex, ok ? (guessing ? 2 : 3) : 1);
      const entry = R.log[R.log.length - 1];
      if (entry && !ex.guess) { if (ok && guessing) entry.lucky = true; if (!ok && sure) entry.sureMiss = true; }
      const ids = ex.ids || ex.pick?.ids;
      if (!ok && ids?.[picked] && ex.it && !ex.guess) Mem.slip(ex.course, ex.it.id, ids[picked]);
      const body = explain(ok, right);
      if (!ex.guess && how && !(ok && sure)) body.prepend(el("p", "ls-sure", ok ? "A guess, so it comes back sooner to make sure it sticks." : guessing ? "Just a guess: no harm done." : "You were sure about this one: worth a second look."));
      feedback(ok, body, ex.guess ? (ok ? "Good guess!" : "Not this time") : ok && guessing ? "Good guess!" : undefined);
    }
    function skip() { if (locked) return; lock(); grade(ex, 1); feedback(false, explain(false, right), "Here's the answer"); }
    return {
      el: a, focus: bs[0],
      key(e) {
        const k = e.key.toLowerCase(), i = /^[1-5]$/.test(k) ? +k - 1 : letters && /^[a-e]$/.test(k) ? k.charCodeAt(0) - 97 : -1;
        if (i >= 0 && i < bs.length) { select(i); return; }
        if ((k === "g" || k === "s") && !unsure.hidden && !ex.guess) { flip(k === "g" ? "guess" : "sure"); return; }
        return false;
      },
    };
  }
  function lev(a, b) {
    if (a === b) return 0;
    const m = a.length, n = b.length, d = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
      let prev = d[0]; d[0] = i;
      for (let j = 1; j <= n; j++) { const t = d[j]; d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = t; }
    }
    return d[n];
  }

  /* ---------- keys: Enter checks and continues, numbers and letters choose, Esc leaves ---------- */
  document.addEventListener("keydown", (e) => {
    if (!R || S.tab !== "study" || document.body.classList.contains("slideview-open")) return;
    if (R.modal) { if (e.key === "Escape") { R.modal.remove(); R.modal = null; } return; }
    const tag = e.target?.tagName;
    if (e.key === "Escape") { e.preventDefault(); leave(); return; }
    if (tag === "TEXTAREA") return;   // you're writing
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (tag === "INPUT" && e.target.type !== "checkbox") {
      if (e.key === "Enter" && R.primary && !R.primary.disabled) { e.preventDefault(); R.primary.click(); }
      return;
    }
    if (e.key === "Enter" && (tag === "SUMMARY" || tag === "A")) return;   // opens the section, follows the link
    if (e.key === "Enter") { if (R.primary && !R.primary.disabled) { e.preventDefault(); R.primary.click(); } return; }
    // after an answer the bar's Continue takes Enter; until then the exercise takes its keys
    if (R.foot.classList.contains("ok") || R.foot.classList.contains("no")) return;
    if (R.cur?.view.key && R.cur.view.key(e) !== false) e.preventDefault();
  });

  window.addEventListener("hashchange", () => { if (R && !/^#\/study\//.test(location.hash)) stop(); });

  return { play, stop, active: () => !!R, shuffle, words, norm,
    _finish: () => R && finish(),   // for testing from the console: jump to the end screen
    _steps: () => (R ? R.steps.map((x) => ({ type: x.type, why: x.why || null, whyText: x.whyText || null, id: x.it?.id || null, r: x.r ?? null })) : null) };
})();

window.Lesson = Lesson;
