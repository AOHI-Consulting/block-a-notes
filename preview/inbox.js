/* The GM's inbox: now and then the general manager of the hotel you study with (your case notebook's
   hotel) writes with a real problem that some of your rooms help with. You pick the rooms that apply,
   write a few lines, and compare with the points a good reply covers; your reply goes in your case
   notebook, and the GM answers. Messages are written per class (pack items of kind "gm").

   Tolerant of gaps: one message waits at a time in a course, never more. The next one arrives three days
   after you've replied to (or set aside) the last, and only once you've learnt the rooms it needs.
   Nothing expires; a set-aside message can still be answered later. Marks on the path (mem:path-<course>,
   synced): gm:<id> when it arrived, gmdone:<id> once replied or set aside. Your reply is in the case
   notebook (mem:case) as gm:<id>. The player steps (mail, rooms, reply) are drawn by lesson.js.

   Applying is remembering: when you send a reply, each room you picked that helps gets a review (good
   if your reply covered at least half the key points, hard otherwise), so a good reply brightens its
   windows and can earn their keys. A room you missed isn't marked down. The GM remembers your last
   advice and says so at the top of the next message. */

const Inbox = (() => {
  const K = () => Practise.kit, SK = () => Study.kit;
  const GAP = 3 * 86400;   // seconds between dealing with one message and the next arriving
  const now = () => Math.floor(Date.now() / 1000);

  const msgsOf = (pk) => pk._gm || (pk._gm = pk.items.filter((it) => it.kind === "gm").sort((a, b) => a.class - b.class));
  const has = (pk) => msgsOf(pk).length > 0;
  const arrivedAt = (c, id) => Mem.flagAt(c, "gm:" + id);
  const doneAt = (c, id) => Mem.flagAt(c, "gmdone:" + id);
  const replyOf = (c, id) => Mem.caseGet(c, "gm:" + id);
  const ready = (c, m) => m.rooms.every((id) => Mem.get(c, id));
  // waiting | replied | aside (set aside, or left with a draft) | null (not arrived)
  function state(c, m) {
    if (!arrivedAt(c, m.id)) return null;
    if (!doneAt(c, m.id)) return "waiting";
    return replyOf(c, m.id)?.sent ? "replied" : "aside";
  }

  // the message waiting in a course (one at most); delivers the next one when it's due
  const off = () => !!store.get("study:gm:off");   // turned off in More: nothing arrives or shows outside the inbox
  function deliver(c, pk, t = now()) {
    const ms = msgsOf(pk);
    if (!ms.length || off()) return null;
    const open = ms.find((m) => arrivedAt(c, m.id) && !doneAt(c, m.id));
    if (open) return open;
    const last = Math.max(0, ...ms.map((m) => doneAt(c, m.id) || 0));
    if (t - last < GAP) return null;
    const nx = ms.find((m) => !arrivedAt(c, m.id) && ready(c, m));
    if (!nx) return null;
    Mem.flag(c, "gm:" + nx.id, t);
    return nx;
  }
  // when nothing is waiting: what comes next, in words
  function nextLine(c, pk) {
    const ms = msgsOf(pk), left = ms.filter((m) => !arrivedAt(c, m.id));
    if (!left.length) return "That's every message for now. More come with new classes.";
    const last = Math.max(0, ...ms.map((m) => doneAt(c, m.id) || 0));
    if (left.some((m) => ready(c, m)) && now() - last < GAP) return "The next message comes in a few days.";
    return "The next message comes once you've learnt the rooms it needs: keep going on the path.";
  }
  const hotelName = (c) => Path.hotelOf(c);
  const fill = (s, c) => String(s || "").replace(/\{hotel\}/g, hotelName(c) || "our hotel");
  const when = (t) => new Date(t * 1000).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

  // the message itself, as a letter (used by the player and the inbox page)
  function letter(c, pk, m, opts = {}) {
    const box = el("div", "gm-letter" + (opts.small ? " small" : ""));
    const head = el("div", "gm-from"), ic = el("span", "gm-ic");
    ic.append(K().icon("mail"));
    const who = el("div");
    who.append(el("b", null, "The general manager"), el("span", null, hotelName(c) || "of the hotel you study with"));
    head.append(ic, who);
    const at = arrivedAt(c, m.id); if (at) head.append(el("small", null, when(at)));
    box.append(head, el("h2", "gm-subj", m.title));
    const body = el("div", "gm-body");
    const prev = before(c, pk, m);
    if (prev) body.append(el("p", "gm-thanks", "Thanks again for your advice on “" + prev.title + "”. " + (prev.done ? "It worked." : "We're trying it now.")));
    fill(m.body, c).split(/\n\n+/).forEach((p) => body.append(SK().rich("p", null, p)));
    body.append(el("p", "gm-sign", "— The GM"));
    box.append(body);
    return box;
  }
  // the last message before this one that you replied to (done: it's been more than two weeks)
  function before(c, pk, m) {
    const at = arrivedAt(c, m.id); if (!at) return null;
    const prev = msgsOf(pk).filter((x) => x !== m && replyOf(c, x.id)?.sent && (arrivedAt(c, x.id) || 0) < at)
      .sort((a, b) => arrivedAt(c, b.id) - arrivedAt(c, a.id))[0];
    return prev ? { title: prev.title, done: at - (doneAt(c, prev.id) || at) > 14 * 86400 } : null;
  }
  // the GM's answer, once you've replied
  function answer(c, m) {
    if (!m.reply) return null;
    const box = el("div", "gm-answer"), head = el("p", "kicker");
    head.append(K().icon("mail"), document.createTextNode(" The GM replied"));
    box.append(head, SK().rich("p", null, fill(m.reply, c)));
    return box;
  }

  /* ---------- replying: three steps in the lesson player ---------- */
  // the rooms to choose from: the ones that help, and other rooms you've lit (near ones first)
  function roomOptions(c, pk, m) {
    const right = new Set(m.rooms), classes = new Set(m.rooms.map((id) => pk.items.find((it) => it.id === id)?.class));
    const lit = pk.items.filter((it) => it.kind === "topic" && !right.has(it.id) && Mem.get(c, it.id) && !/^cases\b/i.test(it.title));
    const near = Lesson.shuffle(lit.filter((it) => classes.has(it.class))), far = Lesson.shuffle(lit.filter((it) => !classes.has(it.class)));
    const others = [...near.slice(0, 2), ...far, ...near.slice(2)].slice(0, Math.max(2, 6 - right.size));
    return Lesson.shuffle([...m.rooms, ...others.map((it) => it.id)]);
  }
  function steps(c, pk, m) {
    const base = { course: c, pk, gm: m, items: [], retryable: false, hideClass: true, gmState: { picked: [] } };
    return [
      { ...base, type: "mail" },
      { ...base, type: "rooms", options: roomOptions(c, pk, m) },
      { ...base, type: "reply" },
    ];
  }
  function play(w, course, pk, home, id) {
    const m = msgsOf(pk).find((x) => x.id === id);
    const back = home + "/inbox";
    if (!m || !arrivedAt(course, m.id)) { location.replace(back); return; }
    Lesson.play(w, {
      color: "var(--accent)", steps: steps(course, pk, m), crab: "done", title: "Reply sent!",
      end(box, res) {
        if (!doneAt(course, m.id)) Mem.flag(course, "gmdone:" + m.id);
        const a = answer(course, m); if (a) box.append(a);
        const lit = res.log.find((l) => l.gmLit)?.gmLit || [];
        if (lit.length) box.append(el("p", "ls-runnote", (lit.length === 1 ? "Room " : "Rooms ") + lit.map((id) => Path.roomOf(pk, id)?.no).filter(Boolean).join(" and ") + (lit.length === 1 ? " is" : " are") + " brighter: applying an idea counts as remembering it."));
        box.append(el("p", "ls-runnote", "Your reply is in your case notebook. " + nextLine(course, pk)));
      },
      done() { location.replace(back); }, exit() { location.replace(back); },
    });
  }

  /* ---------- the inbox page ---------- */
  function render(w, { course: c, pk }) {
    const crs = pk.course;
    const head = el("section", "st-head");
    head.append(SK().crumbs("#/study/" + c, (crs.code || crs.name) + " hotel"), el("p", "kicker", "The GM's inbox · " + (crs.code || crs.name)), el("h1", null, "The GM's inbox"),
      el("p", "line", "Now and then the general manager of your hotel writes with a problem. Pick the rooms that help, write a few lines, then compare with the key points. Your replies go in your case notebook."));
    w.append(head);
    const page = el("div", "st-page gm-page");
    // whose GM: the hotel of your case notebook
    const hl = el("label", "panel cn-hotel"), hin = el("input");
    hin.type = "text"; hin.maxLength = 80; hin.value = hotelName(c); hin.autocomplete = "off";
    hin.placeholder = "Your workplace, the case company, a hotel you know";
    hl.append(el("span", "kicker", "Your hotel"), hin);
    hin.addEventListener("input", () => Mem.caseSet(c, "_hotel", { text: hin.value.trim() }));
    page.append(hl);
    const waiting = deliver(c, pk);
    if (waiting) {
      const card = el("article", "panel gm-new");
      card.append(el("p", "kicker gm-k", "New message"), letter(c, pk, waiting, { small: true }));
      const draft = replyOf(c, waiting.id)?.text?.trim();
      const b = el("div", "btns");
      b.append(SK().link(draft ? "Carry on with your reply" : "Reply · 5 min", "#/study/" + c + "/l/gm-" + waiting.id, "primary", "pen"),
        K().textBtn("Set it aside", () => { Mem.flag(c, "gmdone:" + waiting.id); K().render(); }));
      card.append(b, el("p", "small", "Set aside, it stays in the list below and you can still reply. The next message then comes in a few days."));
      page.append(card);
    } else page.append(el("p", "panel gm-none", off() ? "Messages from the GM are off. You can turn them on again in More." : nextLine(c, pk)));
    // earlier messages, newest first
    const earlier = msgsOf(pk).filter((m) => m !== waiting && arrivedAt(c, m.id)).sort((a, b) => arrivedAt(c, b.id) - arrivedAt(c, a.id));
    if (earlier.length) {
      const s = el("section", "gm-list");
      s.append(el("h2", "cn-h", "Earlier messages"));
      earlier.forEach((m) => s.append(row(c, pk, m)));
      page.append(s);
    }
    w.append(page);
    SK().syncLine(w);
  }
  function row(c, pk, m) {
    const st = state(c, m), r = replyOf(c, m.id), d = el("details", "panel gm-row"), sm = el("summary");
    const tag = st === "replied" ? "Replied" : r?.text?.trim() ? "Draft" : "Set aside";
    sm.append(el("b", null, m.title), el("span", "gm-tag " + (st === "replied" ? "ok" : ""), tag), el("small", null, when(arrivedAt(c, m.id))));
    d.append(sm);
    const in_ = el("div", "gm-rowin");
    in_.append(letter(c, pk, m, { small: true }));
    if (r?.text?.trim()) {
      const y = el("div", "gm-yours");
      y.append(el("p", "kicker", "Your reply"), el("p", "cn-text", r.text));
      if (st === "replied") y.append(el("p", "small", (r.ticks || []).length + " of " + m.points.length + " key points covered"));
      in_.append(y);
    }
    if (st === "replied") { const a = answer(c, m); if (a) in_.append(a); }
    else { const b = el("div", "btns"); b.append(SK().link(r?.text?.trim() ? "Finish your reply" : "Reply now", "#/study/" + c + "/l/gm-" + m.id, "small", "pen")); in_.append(b); }
    d.append(in_);
    return d;
  }

  // a sent reply reviews the rooms you rightly picked: good with half the key points or more, else hard
  function reviewRooms(c, m, picked, ticks) {
    const g = ticks * 2 >= m.points.length ? 3 : 2, done = [];
    picked.filter((id) => m.rooms.includes(id)).forEach((id) => { Mem.grade(c, id, g); done.push(id); });
    return done;
  }
  // the rooms used in replies you've sent (for the envelope on their doors)
  function usedRooms(c, pk) {
    const out = new Set();
    msgsOf(pk).forEach((m) => { if (replyOf(c, m.id)?.sent) m.rooms.forEach((id) => out.add(id)); });
    return out;
  }
  // for the case notebook: your sent replies, oldest first
  function sent(c, pk) {
    return msgsOf(pk).filter((m) => replyOf(c, m.id)?.sent && replyOf(c, m.id)?.text?.trim())
      .map((m) => ({ m, r: replyOf(c, m.id) })).sort((a, b) => (arrivedAt(c, a.m.id) || 0) - (arrivedAt(c, b.m.id) || 0));
  }

  return { has, deliver, state, render, play, letter, answer, fill, sent, nextLine, msgsOf, reviewRooms, usedRooms, GAP };
})();

window.Inbox = Inbox;
