/* Visual text: the course's own words, drawn so their shape shows. Nothing is rewritten.
   - Key terms (**bold** in the packs) get a highlighter stroke that sweeps across as the text appears
     (or when a card is turned over).
   - A list after a colon ("Slide 44 names its capabilities: memory, tools, reasoning and planning.")
     becomes chips that pop in one by one: numbered when the text gives a count ("four forces", "six Ds"),
     joined by arrows when it's a sequence ("trace the path", "in a line", "from ... to").
   - A mnemonic, a list whose words share a first letter (the six Ds) or spell an acronym written just
     before them ("C.A.R.L.T. (complete, accurate, ...)"), becomes a strip of big initial letters, each
     over its word.
   - Figures (amounts, percentages) stand out as small pills.
   The sentence still reads as a sentence; commas stay for screen readers. Still for reduced motion.
   VText.el(tag, cls, text) builds the element; VText.inline(text) only the inline marks. */

const VText = (() => {
  const make = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const COUNT = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
  const SEQ = /\b(path|steps?|stages?|phases?|sequence|in a line|in order|waves?|journey|evolv\w*|ladder)\b/i;
  const FIG = /([€$£]\s?\d+(?:[.,]\d+)*(?:\s?(?:bn|m|million|billion|k)\b)?|\b\d+(?:[.,]\d+)?(?:[-–]\d+(?:[.,]\d+)?)?\s?%)/;   // no trailing comma or full stop
  const ARTICLE = /^(?:the|a|an)\s+/i;

  // inline marks: **key terms** and figures; i counts the marks so they sweep in one after another
  function inline(text, into, ctr = { i: 0 }) {
    String(text || "").split(/\*\*(.+?)\*\*/).forEach((part, k) => {
      if (k % 2) { const b = make("b", "kt", part); b.style.setProperty("--i", ctr.i++); into.append(b); return; }
      part.split(FIG).forEach((seg, j) => {
        if (!seg) return;
        if (j % 2) { const f = make("span", "fig", seg); into.append(f); } else into.append(document.createTextNode(seg));
      });
    });
    return into;
  }
  const plain = (s) => String(s).replace(/\*\*/g, "");
  // the items of a list: "a, b, c and d" (commas or semicolons; the last joined by and/or)
  function itemsOf(s) {
    // a list written all in bold ("**protect, identify and recover**"): each item a key term
    const allBold = /^\*\*[^*]+\*\*$/.test(s.trim());
    if (allBold) s = s.trim().slice(2, -2);
    const parts = s.split(/\s*[,;]\s+(?:and\s+|or\s+)?/);
    const last = parts.pop(), m = /^(.*?)\s+(?:and|or)\s+(.+)$/.exec(last);
    if (m && parts.length) parts.push(m[1], m[2]); else parts.push(last);
    return parts.map((x) => x.trim()).filter(Boolean).map((x) => (allBold ? "**" + x + "**" : x));
  }
  const words = (s) => plain(s).split(/\s+/).filter(Boolean).length;
  const initial = (s) => plain(s).replace(ARTICLE, "").replace(/^[^A-Za-z]+/, "").charAt(0).toLowerCase();

  // find the lists in a text: [{ start, end, lead, items, kind: "chips" | "seq" | "acro", n, acro }]
  function lists(text) {
    const out = [], t = String(text || "");
    // an acronym and its words: C.A.R.L.T. (complete, accurate, relevant, location-based, time-stamped)
    const ACR = /\b((?:[A-Z]\.){2,8}|[A-Z]{3,8})\s*\(([^()]{5,200})\)/g;
    for (const m of t.matchAll(ACR)) {
      const letters = m[1].replace(/\./g, "").toLowerCase(), items = itemsOf(m[2]);
      if (items.length === letters.length && items.every((x, i) => initial(x) === letters[i]) && items.every((x) => words(x) <= 4))
        out.push({ start: m.index + m[1].length, end: m.index + m[0].length, lead: m[1], items, kind: "acro", acro: m[1] });
    }
    // a lead, a colon, three to eight short items, then the end of the sentence
    const LIST = /([^:.;!?]{3,140}):\s+((?:[^,;:.!?()]{1,48}(?:\([^)]{0,40}\))?[,;]\s+){2,7}(?:and\s+|or\s+)?[^,;:.!?()]{1,48}(?:\([^)]{0,40}\))?)(?=[.;!?]|$)/g;
    for (const m of t.matchAll(LIST)) {
      const start = m.index + m[1].length + 1, end = start + m[0].length - m[1].length - 1;
      if (out.some((o) => start < o.end && end > o.start)) continue;
      const items = itemsOf(m[2]);
      if (items.length < 3 || items.length > 8 || items.some((x) => words(x) > 5)) continue;
      const lead = plain(m[1]);
      const cm = lead.match(/\b(two|three|four|five|six|seven|eight|nine|ten|\d)\b/i), n = cm ? COUNT[cm[1].toLowerCase()] || +cm[1] : 0;
      const same = items.every((x) => initial(x) && initial(x) === initial(items[0]));
      out.push({ start, end, lead, items, n: n === items.length ? n : 0, kind: same ? "acro" : SEQ.test(lead) ? "seq" : "chips", seq: SEQ.test(lead) });
    }
    // a text that opens with its words sharing a first letter (a framework's summary: "Digitize, deceptive, ...;")
    const OPEN = /^((?:[^,;:.!?()]{1,30},\s+){2,7}(?:and\s+)?[^,;:.!?()]{1,30})(?=[.;:])/.exec(t);
    if (OPEN && !out.some((o) => o.start === 0)) {
      const items = itemsOf(OPEN[1]);
      if (items.length >= 3 && items.every((x) => words(x) <= 2 && initial(x) === initial(items[0]))) out.push({ start: 0, end: OPEN[1].length, lead: "", items, kind: "acro" });
    }
    return out.sort((a, b) => a.start - b.start).slice(0, 3);
  }

  // one list, drawn
  function drawList(L, ctr) {
    const box = make("span", "vl vl-" + L.kind + (L.n ? " vl-n" : "") + (L.seq ? " vl-seq" : ""));
    const seq = L.kind === "seq" || L.seq;
    L.items.forEach((x, i) => {
      if (i) box.append(make("span", "sr", seq ? ", then " : ", "));
      // in a sequence an arrow leads into each step, kept with it so a row never ends on an arrow
      // (a mnemonic shows its order as small numbers instead)
      let host = box;
      if (seq && i && L.kind !== "acro") { host = make("span", "vg"); const a = make("span", "vl-arrow", "→"); a.setAttribute("aria-hidden", "true"); a.style.setProperty("--i", ctr.i); host.append(a); box.append(host); }
      const it = make("span", "vi"); it.style.setProperty("--i", ctr.i++);
      if (L.kind === "acro" && seq) { const o = make("i", "va-n", String(i + 1)); o.setAttribute("aria-hidden", "true"); it.append(o); }
      if (L.kind === "acro") {
        const w = plain(x), art = (w.match(ARTICLE) || [""])[0], rest = w.slice(art.length);
        const k = rest.search(/[A-Za-z]/);
        it.append(make("span", "va-l", rest.charAt(k).toUpperCase()));
        const word = make("span", "va-w"); word.append(document.createTextNode(art + rest.slice(0, k)), make("u", null, rest.charAt(k)), document.createTextNode(rest.slice(k + 1))); it.append(word);
      } else {
        if (L.n) it.append(make("i", "vl-num", String(i + 1)));
        inline(x, it, ctr);
      }
      host.append(it);
    });
    return box;
  }

  const capFirst = (s) => s.replace(/^(\s*(?:\*\*)?)([a-z])/, (m, a, b) => a + b.toUpperCase());
  // the whole text: inline marks, with its lists drawn where they are
  function el(tag, cls, text) {
    const e = make(tag, (cls ? cls + " " : "") + "vt"), t = String(text || ""), ctr = { i: 0 };
    let at = 0;
    let cap = false;
    lists(t).forEach((L) => {
      inline(cap ? capFirst(t.slice(at, L.start)) : t.slice(at, L.start), e, ctr);
      e.append(make("span", "sr", " "), drawList(L, ctr));
      at = L.end;
      // the list is its own block: its closing full stop or semicolon goes (read aloud still), and what
      // follows starts its line with a capital
      const m = /^\s*([.;])\s*/.exec(t.slice(at));
      if (m) { e.append(make("span", "sr", m[1] + " ")); at += m[0].length; cap = m[1] === ";"; } else cap = false;
    });
    inline(cap ? capFirst(t.slice(at)) : t.slice(at), e, ctr);
    return e;
  }

  return { el, inline: (text) => inline(text, document.createDocumentFragment()), lists };
})();

window.VText = VText;
