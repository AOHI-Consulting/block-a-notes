/* The crab: Check-in's mascot, a hermit crab with a hotel for a shell. Its face looks out of the hotel's
   front door. It is kind on purpose: a wrong answer gets a head tilt, a missed day is a nap.
   Crab.svg(state, opt) draws it in a state: idle | right | wrong | done | run | rest | hold | icon.
   Crab.hotel(spec) draws a course as a hotel: a floor per class, a window per topic, lit when you know
   it and dimming as it fades, with the crab carrying the building. Crab.mini() is the small hotel on a
   course tile and Crab.door() a room's door on a floor.
   Marks that sit on the page (z's, rays, the shadow, floor numbers) use currentColor, so they follow the
   theme; the crab and its hotel keep their own colours in light and dark. */

const Crab = (() => {
  const INK = "#2B1B17", CORAL = "#F07A5A", MINT = "#8FD3C7", NAVY = "#2F3E66", GLASS = "#33426E",
    LIT = "#FFD45C", WHITE = "#FFFDF8", GOLD = "#F2C14E", SKY = "#7FB3FF", DOOR = "#1F2747";
  const S = 2.4, F = 'font-family="Inter, system-ui, sans-serif"';
  const r2 = (n) => Math.round(n * 100) / 100;

  // a thick outlined stroke (a leg or an arm): ink under, colour on top
  const limb = (d, col = CORAL, w = 4.6) =>
    `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${w + 3.4}" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="${d}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
  // a pincer: a disc with a notch facing angle a (degrees; -90 is up)
  function claw(cx, cy, r, a) {
    const h = 30, p = (d) => r2(cx + r * Math.cos(d * Math.PI / 180)) + " " + r2(cy + r * Math.sin(d * Math.PI / 180));
    return `<path d="M${cx} ${cy} L${p(a + h)} A${r} ${r} 0 1 1 ${p(a - h)} Z" fill="${CORAL}" stroke="${INK}" stroke-width="${S}" stroke-linejoin="round"/>`;
  }
  // eyes on stalks: open, look (up and away), happy, sleep
  function eyes(xs, y, r, style) {
    const d = (Math.random() * -6).toFixed(2);   // so two crabs on a page don't blink together
    return xs.map((x) => {
      let s = `<circle cx="${x}" cy="${y}" r="${r}" fill="${WHITE}" stroke="${INK}" stroke-width="2"/>`;
      if (style === "open") s += `<circle cx="${r2(x + r * .08)}" cy="${r2(y + r * .1)}" r="${r2(r * .5)}" fill="${INK}"/><circle cx="${r2(x + r * .3)}" cy="${r2(y - r * .12)}" r="${r2(r * .17)}" fill="#fff"/>`;
      if (style === "look") s += `<circle cx="${r2(x - r * .32)}" cy="${r2(y - r * .32)}" r="${r2(r * .48)}" fill="${INK}"/>`;
      if (style === "happy") s += `<path d="M${r2(x - r * .55)} ${r2(y + r * .25)} Q${x} ${r2(y - r * .8)} ${r2(x + r * .55)} ${r2(y + r * .25)}" fill="none" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/>`;
      if (style === "open") return `<g class="cr-eye" style="animation-delay:${d}s">${s}</g>`;
      if (style === "sleep") s += `<path d="M${x - r} ${y} A${r} ${r} 0 0 1 ${x + r} ${y} Z" fill="${CORAL}" stroke="${INK}" stroke-width="2"/><path d="M${r2(x - r * .6)} ${r2(y + r * .3)} Q${x} ${r2(y + r * .75)} ${r2(x + r * .6)} ${r2(y + r * .3)}" fill="none" stroke="${INK}" stroke-width="1.8" stroke-linecap="round"/>`;
      return s;
    }).join("");
  }
  function mouth(x, y, style, w = 8) {
    if (style === "smile") return `<path d="M${x - w / 2} ${y} Q${x} ${r2(y + w * .5)} ${x + w / 2} ${y}" fill="none" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/>`;
    if (style === "open") return `<path d="M${x - w / 2} ${y - .5} Q${x} ${r2(y + w * .85)} ${x + w / 2} ${y - .5} Z" fill="${INK}" stroke="${INK}" stroke-width="1.4" stroke-linejoin="round"/>`;
    if (style === "o") return `<ellipse cx="${x}" cy="${y + 1.6}" rx="${r2(w * .16)}" ry="${r2(w * .21)}" fill="${INK}"/>`;
    if (style === "sleep") return `<ellipse cx="${x}" cy="${y + 1.4}" rx="${r2(w * .12)}" ry="${r2(w * .1)}" fill="${INK}"/>`;
    return "";
  }
  const sparkle = (x, y, k = 1) => `<path transform="translate(${x} ${y}) scale(${k})" d="M0 -7 C1 -2 2 -1 7 0 C2 1 1 2 0 7 C-1 2 -2 1 -7 0 C-2 -1 -1 -2 0 -7Z" fill="${GOLD}" stroke="${INK}" stroke-width="1.4" stroke-linejoin="round"/>`;
  const confetti = () => [[14, 22, CORAL, 20], [29, 10, GOLD, -30], [93, 10, SKY, 40], [108, 28, MINT, -15], [8, 46, SKY, 60], [110, 52, CORAL, 10], [22, 36, MINT, 0], [100, 40, GOLD, 70]]
    .map(([x, y, c, a]) => `<rect x="${x - 2}" y="${y - 3.5}" width="4" height="7" rx="1.2" fill="${c}" transform="rotate(${a} ${x} ${y})"/>`).join("");
  const ask = (x, y) => `<circle cx="${x - 10}" cy="${y + 11}" r="2.2" fill="${WHITE}" stroke="${INK}" stroke-width="1.4"/><circle cx="${x}" cy="${y}" r="9.5" fill="${WHITE}" stroke="${INK}" stroke-width="1.8"/><text x="${x}" y="${y + 4.8}" text-anchor="middle" ${F} font-weight="800" font-size="13.5" fill="${INK}">?</text>`;
  const zz = (x, y) => `<g fill="currentColor" ${F} font-weight="800"><text x="${x}" y="${y}" font-size="9">z</text><text x="${x + 7}" y="${y - 9}" font-size="12.5">z</text></g>`;
  const moon = (x, y) => `<path d="M${x} ${y - 9} A9 9 0 1 0 ${x + 8.6} ${y + 3.2} A7 7 0 1 1 ${x} ${y - 9} Z" fill="${GOLD}" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>`;

  /* ---------- the crab ----------
     Its shell grows with the Master: a beach hut in Block A, a boutique hotel in Block B, a grand hotel
     from Block C. opt: shell, count (on the flag when your run counts today), lights (December). */
  const POSE = { hold: ["up", "up"], idle: ["idle", "idle"], icon: ["idle", "idle"], right: ["up", "up"], wrong: ["idle", "think"], done: ["up", "up"], run: ["idle", "up"], rest: ["tuck", "tuck"] };
  const EYE = { hold: "open", idle: "open", icon: "open", right: "happy", done: "happy", run: "happy", wrong: "look", rest: "sleep" };
  const MOUTH = { hold: "smile", idle: "smile", icon: "smile", right: "open", done: "open", run: "smile", wrong: "o", rest: "sleep" };
  const WOOD = "#E8C08A", GRAND = "#ECE4F8", BULBS = [CORAL, LIT, MINT, SKY];
  const flagAt = (x, base, top, state, count) => `<path d="M${x} ${base} V${top}" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/>` +
    (state === "run" ? `<path d="M${x} ${top - 2.5} H${x + 26} L${x + 21.5} ${top + 4.5} L${x + 26} ${top + 11.5} H${x} Z" fill="${CORAL}" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/><text x="${x + 12}" y="${top + 9}" text-anchor="middle" ${F} font-weight="800" font-size="11" fill="#fff">${count ?? ""}</text>`
      : `<path d="M${x} ${top + 1} L${x + 15} ${top + 5.5} L${x} ${top + 10} Z" fill="${CORAL}" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>`);
  // a string of fairy lights through points, sagging between them
  function bulbs(pts, cls = "ho-bulb") {
    let d = `M${pts[0][0]} ${pts[0][1]}`, out = "";
    for (let i = 1; i < pts.length; i++) { const [x, y] = pts[i], [px, py] = pts[i - 1]; d += ` Q${(x + px) / 2} ${(y + py) / 2 + 4} ${x} ${y}`; }
    out += `<path d="${d}" fill="none" stroke="${INK}" stroke-width="1" opacity=".7"/>`;
    pts.forEach(([x, y], i) => { out += `<circle class="${cls}" style="animation-delay:${(i % 4) * .35}s" cx="${x}" cy="${y + 2.4}" r="3.1" fill="${BULBS[i % 4]}" stroke="${INK}" stroke-width=".8"/>`; });
    return out;
  }
  function crab(state = "idle", opt = {}) {
    const lit = ["right", "done", "run", "icon"].includes(state), shell = opt.shell || "boutique";
    const [x0, x1] = { hut: [34, 86], boutique: [28, 92], grand: [22, 98] }[shell] || [28, 92];
    const win = (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2" fill="${lit ? LIT : GLASS}" stroke="${INK}" stroke-width="2"/>` +
      (lit ? "" : `<path d="M${x + 2.5} ${y + h - 3} L${x + w * .55} ${y + 2.5}" stroke="#fff" stroke-opacity=".35" stroke-width="1.6" stroke-linecap="round"/>`);
    let s = opt.noShadow ? "" : `<ellipse cx="60" cy="113" rx="${shell === "grand" ? 38 : 34}" ry="3.2" fill="currentColor" opacity=".13"/>`;
    [[x0 + 8, 99, x0 + 1, 110], [x0 + 17, 100, x0 + 14, 111.5], [x1 - 8, 99, x1 - 1, 110], [x1 - 17, 100, x1 - 14, 111.5]]
      .forEach(([a, b, c, d]) => (s += limb(`M${a} ${b} Q${(a + c) / 2 + (c < a ? -2 : 2)} ${b + 3} ${c} ${d}`, CORAL, 4)));
    const L = { idle: [x0 - 11, 86, 8, -55, `M${x0 + 2} 90 Q${x0 - 5} 92 ${x0 - 9} 89`], up: [x0 - 13, 60, 8, -75, `M${x0 + 2} 88 Q${x0 - 12} 84 ${x0 - 13} 67`], tuck: [x0 - 6, 95, 7, -30, `M${x0 + 2} 95 L${x0 - 3} 95`] };
    const R = { idle: [x1 + 12, 84, 11, -125, `M${x1 - 2} 90 Q${x1 + 6} 92 ${x1 + 9} 88`], up: [x1 + 14, 54, 11, -105, `M${x1 - 2} 88 Q${x1 + 13} 84 ${x1 + 14} 64`],
      think: [x1 + 6, 62, 10, 175, `M${x1 - 2} 90 Q${x1 + 16} 86 ${x1 + 10} 70`], tuck: [x1 + 7, 94, 9, -150, `M${x1 - 2} 95 L${x1 + 2} 95`] };
    const pose = POSE[state] || POSE.idle, arm = ([cx, cy, r, a, d]) => limb(d) + claw(cx, cy, r, a);
    s += arm(L[pose[0]]) + `<g class="cr-arm" style="transform-origin:${x1 - 2}px 90px">${arm(R[pose[1]])}</g>`;
    let b = "";
    if (shell === "hut") {
      // a beach hut: planks, a pitched roof, a round window
      b += flagAt(60, 30, 13, state, opt.count);
      b += `<rect x="34" y="58" width="52" height="42" rx="3" fill="${WOOD}" stroke="${INK}" stroke-width="${S}"/><path d="M35 68 H85 M35 78 H85 M35 88 H85" stroke="#B98A52" stroke-width="1.6"/>`;
      b += `<path d="M27 61 L60 29 L93 61 Z" fill="${NAVY}" stroke="${INK}" stroke-width="${S}" stroke-linejoin="round"/>`;
      b += `<circle cx="60" cy="49" r="6.2" fill="${lit ? LIT : GLASS}" stroke="${INK}" stroke-width="2"/>`;
      if (opt.lights) b += bulbs([[29, 61], [37, 53], [45, 45], [53, 37], [60, 31], [67, 37], [75, 45], [83, 53], [91, 61]]);
    } else if (shell === "grand") {
      // a grand hotel: a dome, columns, two rows of windows
      b += state === "run" ? flagAt(60, 21, 4, state, opt.count) : `<path d="M60 21 V15" stroke="${INK}" stroke-width="2"/><circle cx="60" cy="14" r="2.4" fill="${GOLD}" stroke="${INK}" stroke-width="1.4"/>`;
      b += `<path d="M45 34 A15 13 0 0 1 75 34 Z" fill="${GOLD}" stroke="${INK}" stroke-width="${S}"/>`;
      b += `<rect x="22" y="40" width="76" height="60" rx="4" fill="${GRAND}" stroke="${INK}" stroke-width="${S}"/><rect x="18" y="33" width="84" height="8" rx="3" fill="${NAVY}" stroke="${INK}" stroke-width="${S}"/>`;
      b += win(28, 46, 11, 10) + win(45, 46, 11, 10) + win(64, 46, 11, 10) + win(81, 46, 11, 10) + win(28, 60, 11, 10) + win(81, 60, 11, 10);
      b += `<path d="M37 71 L60 61 L83 71 Z" fill="${WHITE}" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>`;
      b += `<rect x="36.5" y="71" width="4.5" height="29" fill="${WHITE}" stroke="${INK}" stroke-width="1.8"/><rect x="79" y="71" width="4.5" height="29" fill="${WHITE}" stroke="${INK}" stroke-width="1.8"/>`;
      if (opt.lights) b += bulbs([[20, 42], [31, 42], [42, 42], [53, 42], [64, 42], [75, 42], [86, 42], [97, 42]]);
    } else {
      // the boutique hotel
      b += flagAt(60, 33, 12, state, opt.count);
      b += `<rect x="28" y="40" width="64" height="60" rx="5" fill="${MINT}" stroke="${INK}" stroke-width="${S}"/>`;
      b += `<rect x="24" y="33" width="72" height="9" rx="3" fill="${NAVY}" stroke="${INK}" stroke-width="${S}"/>`;
      b += win(35, 47, 12, 9) + win(54, 47, 12, 9) + win(73, 47, 12, 9) + win(35, 59.5, 12, 9) + win(73, 59.5, 12, 9);
      if (opt.lights) b += bulbs([[26, 43], [36, 43], [46, 43], [56, 43], [66, 43], [76, 43], [86, 43], [95, 43]]);
    }
    b += `<path d="M42 100 V86 A18 14 0 0 1 78 86 V100 Z" fill="${state === "done" ? "#FFE7A0" : DOOR}" stroke="${INK}" stroke-width="${S}"/>`;
    b += `<path d="M44.5 100 V93.5 Q60 80 75.5 93.5 V100 Z" fill="${CORAL}" stroke="${INK}" stroke-width="2"/>`;
    b += eyes([52.5, 67.5], 83.5, 5.6, EYE[state] || "open") + mouth(60, 94, MOUTH[state] || "smile");
    s += state === "wrong" ? `<g transform="rotate(-6 60 100)">${b}</g>` : b;
    if (state === "right") s += sparkle(14, 38, .85) + sparkle(105, 26, 1);
    if (state === "done") s += confetti() + sparkle(60, shell === "grand" ? 4 : 8, .9);
    if (state === "wrong") s += ask(102, 22);
    if (state === "rest") s += moon(98, 16) + zz(86, 74);
    if (state === "hold") s += card(16, 46, -12, opt.cards?.[0] || "", opt.colors?.[0]) + card(106, 38, 12, opt.cards?.[1] || "", opt.colors?.[1]);
    return shell === "grand" ? `<g transform="translate(60 106) scale(.9) translate(-60 -106)">${s}</g>` : s;
  }
  // a card held in a claw (the mix-ups: one idea in each claw)
  const card = (cx, cy, a, t, col = WHITE) => `<g transform="rotate(${a} ${cx} ${cy})"><rect x="${cx - 13}" y="${cy - 9}" width="26" height="17" rx="3" fill="${col}" stroke="${INK}" stroke-width="1.8"/>` +
    (t ? `<text x="${cx}" y="${cy + 3.5}" text-anchor="middle" ${F} font-weight="800" font-size="9.5" fill="${INK}">${t}</text>` : "") + `</g>`;
  function svg(state = "idle", opt = {}) {
    const label = opt.label ? ` role="img" aria-label="${opt.label}"` : ` aria-hidden="true"`;
    if (state === "icon") return `<svg viewBox="0 0 120 120"${opt.xmlns ? ' xmlns="http://www.w3.org/2000/svg"' : ""}${label}><rect width="120" height="120" rx="${opt.square ? 0 : 27}" fill="${LIT}"/><g transform="translate(1 -3) scale(.98)" style="color:${INK}">${crab("icon", { noShadow: true })}</g></svg>`;
    return `<svg viewBox="${state === "hold" ? "-2 6 124 112" : "0 0 120 120"}"${label}>${crab(state, opt)}</svg>`;
  }

  /* ---------- the time of day and the season, for the hotel's sky ---------- */
  function skyAt(d = new Date()) { const h = d.getHours(); return h >= 7 && h < 18 ? "day" : (h >= 18 && h < 22) || h === 6 ? "dusk" : "night"; }
  function seasonAt(d = new Date()) { const m = d.getMonth(), day = d.getDate(); return m === 11 || (m === 0 && day <= 6) ? "lights" : null; }
  const SKIES = {
    day: { a: "#BFE3F7", b: "#EAF6FC", ground: "#D3D8E1" },
    dusk: { a: "#5E5193", b: "#F3A47C", ground: "#8D7F95" },
    night: { a: "#121A36", b: "#2B3964", ground: "#283150" },
  };
  const STARS = [[24, 14], [44, 34], [70, 12], [96, 26], [212, 16], [236, 40], [276, 58], [18, 62], [282, 112], [30, 120], [262, 150], [14, 176]];

  /* ---------- a course as a hotel ----------
     spec: { code, label, mood, sky (day | dusk | night), lights (December), floors: [{ n, windows, href,
     aria, done, just, keys, scaffold, unscaffold }] from the ground floor up }.
     windows: L lit (you know it), D dimming (fading), C the next one, P started, - not yet; keys: the
     windows whose key is yours (a gold frame); scaffold: the floor needs a renovation; unscaffold: its
     renovation just finished (the scaffolding comes down); fresh: its class was this past week (a coral
     plate); planned: a class still to come (whitewashed, with its date; no windows yet). A crane stands
     on the roof while floors are still to come. */
  function hotel(spec) {
    const floors = spec.floors, slots = Math.max(6, ...floors.map((f) => (f.windows || "").length));
    const x0 = 50, x1 = 256, FH = 22, top = 38, sw = (x1 - x0 - 8) / slots, ww = Math.min(13, sw * .66), wh = 13;
    const fb = top + floors.length * FH, lb = fb + 40, H = lb + 18, mid = (x0 + x1) / 2;
    const sky = SKIES[spec.sky] ? spec.sky : null, dark = sky === "night" || sky === "dusk";
    let s = `<svg class="ho-svg${sky ? " sky-" + sky : ""}" viewBox="0 0 300 ${H}" role="group" aria-label="${spec.label || "The course as a hotel"}">`;
    if (sky) {
      const c = SKIES[sky];
      s += `<defs><linearGradient id="hoSkyG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c.a}"/><stop offset="1" stop-color="${c.b}"/></linearGradient>` +
        `<filter id="hoGlowF" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="2.4"/></filter></defs>`;
      s += `<g class="ho-skybg"><rect x="4" y="0" width="292" height="${lb + 2}" rx="18" fill="url(#hoSkyG)"/>`;
      s += `<path d="M4 ${lb - 2} H296 V${H - 6} a8 8 0 0 1 -8 8 H12 a8 8 0 0 1 -8 -8 Z" fill="${c.ground}"/>`;
      if (sky === "day") s += `<circle cx="279" cy="20" r="15" fill="${LIT}" opacity=".3"/><circle cx="279" cy="20" r="10" fill="${LIT}"/>` +
        [[30, 52, 1], [244, 92, .8]].map(([x, y, k]) => `<path transform="translate(${x} ${y}) scale(${k})" d="M0 8 a6 6 0 0 1 6 -8 a8 8 0 0 1 15 2 a5.5 5.5 0 0 1 3 10 H2 a4 4 0 0 1 -2 -4 Z" fill="#fff" opacity=".92"/>`).join("");
      if (sky === "dusk") s += `<circle cx="270" cy="${lb - 26}" r="20" fill="#FFB45C" opacity=".3"/><circle cx="270" cy="${lb - 26}" r="12" fill="#FFB45C"/>` + STARS.slice(0, 4).map(([x, y]) => `<circle cx="${x}" cy="${y}" r=".9" fill="#fff" opacity=".7"/>`).join("");
      if (sky === "night") s += moon(279, 21) + STARS.filter(([, y]) => y < lb - 10).map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${i % 3 ? 1 : 1.4}" fill="#fff" opacity="${i % 2 ? .6 : .9}"/>`).join("");
      s += `</g>`;
    } else s += `<ellipse cx="${mid}" cy="${lb + 13}" rx="122" ry="4" fill="currentColor" opacity=".12"/>`;
    [[x0 + 16, x0 + 8], [x0 + 36, x0 + 32], [x1 - 16, x1 - 8], [x1 - 36, x1 - 32]].forEach(([a, c]) => (s += limb(`M${a} ${lb - 1} Q${(a + c) / 2 + (c < a ? -2 : 2)} ${lb + 3} ${c} ${lb + 11}`, CORAL, 4.4)));
    s += limb(`M${x0 + 2} ${fb + 26} Q${x0 - 8} ${fb + 27} ${x0 - 14} ${fb + 20}`) + claw(x0 - 18, fb + 13, 9, -60);
    s += limb(`M${x1 - 2} ${fb + 26} Q${x1 + 8} ${fb + 27} ${x1 + 14} ${fb + 19}`) + claw(x1 + 19, fb + 10, 12, -120);
    // the sign on the roof, the building, its cornice
    const sw2 = Math.max(52, 14 + String(spec.code || "").length * 10);
    s += `<path d="M${mid - 14} 24 V30 M${mid + 14} 24 V30" stroke="${INK}" stroke-width="2"/><rect x="${mid - sw2 / 2}" y="5" width="${sw2}" height="20" rx="4" fill="${NAVY}" stroke="${INK}" stroke-width="2"/>`;
    s += `<text x="${mid}" y="19.5" text-anchor="middle" font-family="JetBrains Mono, ui-monospace, monospace" font-weight="700" font-size="12" letter-spacing="2" fill="${LIT}">${spec.code || ""}</text>`;
    s += `<rect x="${x0}" y="${top}" width="${x1 - x0}" height="${lb - top}" rx="4" fill="${MINT}" stroke="${INK}" stroke-width="2.4"/>`;
    s += `<rect x="${x0 - 6}" y="${top - 9}" width="${x1 - x0 + 12}" height="10" rx="3" fill="${NAVY}" stroke="${INK}" stroke-width="2.4"/>`;
    const n = floors.length, glow = [];
    floors.forEach((f, k) => {
      const y = top + (n - 1 - k) * FH, row = [...(f.windows || "")], keys = new Set(f.keys || []);
      let g = "";
      if (k < n - 1) g += `<path d="M${x0} ${y + FH} H${x1}" stroke="${INK}" stroke-opacity=".22" stroke-width="1.2"/>`;
      g += `<rect class="ho-hit" x="4" y="${y}" width="292" height="${FH}" rx="5"/>`;
      // the floor's number on a plate, so it reads against any sky (green once the floor is complete)
      g += `<rect class="ho-plate" x="${x0 - 27}" y="${y + 4}" width="20" height="14" rx="4" fill="${f.fresh ? CORAL : f.done ? "#CDEFD9" : WHITE}" stroke="${INK}" stroke-width=".9"${f.planned ? ' stroke-dasharray="2 1.6"' : ""}/>`;
      g += `<text class="ho-num" x="${x0 - 17}" y="${y + 14.4}" text-anchor="middle" font-family="JetBrains Mono, ui-monospace, monospace" font-weight="700" font-size="9.5" fill="${f.fresh ? "#fff" : INK}">${f.n}</text>`;
      if (f.planned) {
        g += `<rect x="${x0 + 1.2}" y="${y + 1}" width="${x1 - x0 - 2.4}" height="${FH - 1.4}" fill="${WHITE}" opacity=".55"/>`;
        g += `<rect x="${x0 + 8}" y="${y + 4}" width="${x1 - x0 - 16}" height="${FH - 8}" rx="3" fill="none" stroke="${INK}" stroke-width="1" stroke-dasharray="3 2.4" opacity=".45"/>`;
        if (f.date) g += `<text x="${(x0 + x1) / 2}" y="${y + 14.6}" text-anchor="middle" font-family="JetBrains Mono, ui-monospace, monospace" font-weight="700" font-size="8.6" letter-spacing=".5" fill="${INK}" opacity=".7">${f.date}</text>`;
      }
      const start = x0 + 4 + (slots - row.length) * sw / 2;
      row.forEach((st, j) => {
        const wx = r2(start + j * sw + (sw - ww) / 2), wy = y + 4.5, key = keys.has(j);
        if (dark && (st === "L" || st === "D")) glow.push(`<rect x="${r2(wx - 2)}" y="${wy - 2}" width="${r2(ww + 4)}" height="${wh + 4}" rx="3" fill="${LIT}" opacity="${st === "L" ? .95 : .45}"/>`);
        g += `<rect x="${wx}" y="${wy}" width="${r2(ww)}" height="${wh}" rx="2" fill="${st === "L" ? LIT : GLASS}" stroke="${key ? GOLD : INK}" stroke-width="${key ? 2.6 : 1.6}"/>`;
        if (st === "D") g += `<rect x="${wx}" y="${wy}" width="${r2(ww)}" height="${wh}" rx="2" fill="${LIT}" opacity=".42"/>`;
        if (st === "P") g += `<rect x="${wx}" y="${wy + wh - 4}" width="${r2(ww)}" height="4" rx="1" fill="${LIT}" opacity=".8"/>`;
        if (key) g += `<rect x="${r2(wx + 1.3)}" y="${wy + 1.3}" width="${r2(ww - 2.6)}" height="${wh - 2.6}" rx="1.2" fill="none" stroke="${INK}" stroke-width=".7" opacity=".6"/>`;
        if (st === "C") g += `<rect class="ho-pulse" x="${r2(wx - 3)}" y="${wy - 3}" width="${r2(ww + 6)}" height="${wh + 6}" rx="4" fill="none" stroke="${CORAL}" stroke-width="2.6"/>`;
        if (j === f.just) g += `<rect class="ho-glow" x="${r2(wx - 4)}" y="${wy - 4}" width="${r2(ww + 8)}" height="${wh + 8}" rx="5" fill="${LIT}" opacity="0"/>`;   // the light that just came on
      });
      if (f.scaffold || f.unscaffold) g += scaffold(x0, x1, y, FH, f.unscaffold);
      s += f.href ? `<a href="${f.href}" aria-label="${f.aria || "Floor " + f.n}">${g}</a>` : `<g>${g}</g>`;
    });
    // at dusk and at night the lit windows glow (drawn under the building's windows would hide it: over, softly)
    if (glow.length) s += `<g filter="url(#hoGlowF)" opacity=".55" pointer-events="none">${glow.join("")}</g>`;
    if (spec.lights) s += bulbs(Array.from({ length: 11 }, (_, i) => [r2(x0 - 6 + i * (x1 - x0 + 12) / 10), top + 2]));
    // a crane on the roof while floors are still to come
    if (floors.some((f) => f.planned)) {
      const cx = x1 - 26, Y = top - 9;
      s += `<g class="ho-crane" pointer-events="none"><path d="M${cx} ${Y} V${Y - 26} M${cx - 42} ${Y - 24} H${cx + 12} M${cx} ${Y - 26} L${cx - 26} ${Y - 24} M${cx} ${Y - 26} L${cx + 12} ${Y - 24}" stroke="${INK}" stroke-width="3.4" stroke-linecap="round"/>`;
      s += `<path d="M${cx} ${Y} V${Y - 26} M${cx - 42} ${Y - 24} H${cx + 12}" stroke="${GOLD}" stroke-width="1.8" stroke-linecap="round"/>`;
      s += `<path d="M${cx - 36} ${Y - 24} V${Y - 12}" stroke="${INK}" stroke-width="1"/><path d="M${cx - 39} ${Y - 12} h6 l-1.5 4 h-3 z" fill="${GOLD}" stroke="${INK}" stroke-width=".8"/>`;
      s += `<rect x="${cx + 6}" y="${Y - 23}" width="8" height="6" rx="1" fill="${NAVY}" stroke="${INK}" stroke-width=".8"/></g>`;
    }
    // the lobby, and the crab in its door
    s += `<path d="M${x0} ${fb} H${x1}" stroke="${INK}" stroke-width="2"/>`;
    s += `<rect x="${x0 + 12}" y="${fb + 9}" width="40" height="20" rx="3" fill="${LIT}" stroke="${INK}" stroke-width="1.8"/><rect x="${x1 - 52}" y="${fb + 9}" width="40" height="20" rx="3" fill="${LIT}" stroke="${INK}" stroke-width="1.8"/>`;
    s += `<path d="M${mid - 18} ${lb} V${lb - 17} A18 14 0 0 1 ${mid + 18} ${lb - 17} V${lb} Z" fill="${DOOR}" stroke="${INK}" stroke-width="2.4"/>`;
    s += `<path d="M${mid - 15.5} ${lb} V${lb - 7} Q${mid} ${lb - 20} ${mid + 15.5} ${lb - 7} V${lb} Z" fill="${CORAL}" stroke="${INK}" stroke-width="2"/>`;
    // a letter from the GM waiting: an envelope in the left lobby window
    if (spec.mail) {
      const ex = x0 + 21, ey = fb + 11.5;
      s += `<g class="ho-mail"><rect x="${ex}" y="${ey}" width="22" height="15" rx="2" fill="${WHITE}" stroke="${INK}" stroke-width="1.6"/><path d="M${ex} ${ey + 1} L${ex + 11} ${ey + 8.5} L${ex + 22} ${ey + 1}" fill="none" stroke="${INK}" stroke-width="1.5" stroke-linejoin="round"/><circle cx="${ex + 22}" cy="${ey}" r="3.4" fill="${CORAL}" stroke="${INK}" stroke-width="1.2"/></g>`;
    }
    const mood = spec.mood || "idle";
    s += eyes([mid - 7.5, mid + 7.5], lb - 17.5, 5.4, mood === "happy" ? "happy" : "open") + mouth(mid, lb - 7, mood === "happy" ? "open" : "smile", 7);
    return s + "</svg>";
  }
  // scaffolding over a floor that needs a renovation (or coming down once it's done)
  function scaffold(x0, x1, y, FH, off) {
    const P = "#B5813A", W = "#E3B062", xs = [x0 + 4, x0 + (x1 - x0) / 3, x0 + 2 * (x1 - x0) / 3, x1 - 4].map(r2);
    let g = `<g class="ho-scaf${off ? " off" : ""}" pointer-events="none">`;
    for (let i = 0; i < xs.length - 1; i++) g += `<path d="M${xs[i]} ${y + FH - 3} L${xs[i + 1]} ${y + 2}" stroke="${P}" stroke-width="1.3" opacity=".8"/>`;
    xs.forEach((x) => (g += `<path d="M${x} ${y - 3} V${y + FH + 3}" stroke="${INK}" stroke-width="3.6" stroke-linecap="round"/><path d="M${x} ${y - 3} V${y + FH + 3}" stroke="${P}" stroke-width="2" stroke-linecap="round"/>`));
    [y - 1, y + FH - 2.6].forEach((py) => (g += `<rect x="${x0 - 5}" y="${r2(py)}" width="${x1 - x0 + 10}" height="3.4" rx="1" fill="${W}" stroke="${INK}" stroke-width=".9"/>`));
    return g + `</g>`;
  }

  // a small hotel for a course tile: its floors, lit from the ground up as you learn; a coming course is
  // still being built (a dashed outline)
  function mini(floors, frac, coming) {
    const f = Math.max(3, Math.min(10, floors || 5)), h = 9 + f * 5 + 7;
    if (coming) return `<svg viewBox="0 0 34 ${h}" aria-hidden="true"><rect x="3" y="5" width="28" height="${h - 6}" rx="2" fill="none" stroke="currentColor" stroke-width="1.4" stroke-dasharray="3 2.4" opacity=".55"/><path d="M1 ${h - 1} H33" stroke="currentColor" stroke-width="1.4" opacity=".55"/></svg>`;
    let lit = Math.round(Math.max(0, Math.min(1, frac || 0)) * f * 4);
    let s = `<svg viewBox="0 0 34 ${h}" aria-hidden="true"><rect x="3" y="5" width="28" height="${h - 6}" rx="2" fill="${MINT}" stroke="${INK}" stroke-width="1.4"/><rect x="1" y="2" width="32" height="4" rx="1.5" fill="${NAVY}" stroke="${INK}" stroke-width="1.2"/>`;
    for (let k = 0; k < f; k++) { const y = h - 13 - k * 5; for (let j = 0; j < 4; j++) s += `<rect x="${6 + j * 6.2}" y="${y}" width="3.6" height="3" rx=".6" fill="${lit-- > 0 ? LIT : GLASS}"/>`; }
    return s + `<path d="M14 ${h - 1} V${h - 5} a3 3 0 0 1 6 0 V${h - 1}" fill="${DOOR}"/></svg>`;
  }

  // a room's door on a floor: lit under the door when you know it, dim when it's fading, open for the next
  function door(st, label = "") {
    const fill = st === "dark" ? "#8C93A6" : st === "cur" ? CORAL : MINT;
    const glow = st === "lit" ? LIT : st === "dim" ? "#C9B470" : st === "cur" ? LIT : st === "part" ? "#E8D9A0" : null;
    return `<svg viewBox="0 0 26 34" aria-hidden="true">${glow ? `<rect x="2" y="30" width="22" height="3" rx="1.5" fill="${glow}"/>` : ""}` +
      `<rect x="3" y="2" width="20" height="28" rx="2" fill="${fill}" stroke="${INK}" stroke-width="1.6"/>` +
      `<rect x="6.5" y="6" width="13" height="7" rx="1" fill="${WHITE}" stroke="${INK}" stroke-width="1"/>` +
      (label ? `<text x="13" y="11.6" text-anchor="middle" font-family="JetBrains Mono, ui-monospace, monospace" font-weight="700" font-size="5" fill="${INK}">${label}</text>` : "") +
      `<circle cx="18.5" cy="18" r="1.7" fill="${GOLD}" stroke="${INK}" stroke-width=".8"/>` +
      (st === "cur" ? `<g class="cr-peek"><circle cx="23.5" cy="17" r="3" fill="${WHITE}" stroke="${INK}" stroke-width="1"/><circle cx="24" cy="17.4" r="1.4" fill="${INK}"/><path d="M22 23 Q25.5 21 25.5 25" fill="${CORAL}" stroke="${INK}" stroke-width=".9"/></g>` : "") + `</svg>`;
  }
  // a room key: brass, with its hotel tag
  const key = (dim) => `<svg viewBox="0 0 30 22" aria-hidden="true"${dim ? ' opacity=".35"' : ""}><path d="M10 9 Q6 12 5 17" fill="none" stroke="${INK}" stroke-width="1"/>` +
    `<path d="M5 15.5 L8.6 19 L5 22 L1.4 19 Z" fill="#8E2C3B" stroke="${INK}" stroke-width=".9" stroke-linejoin="round"/>` +
    `<circle cx="11" cy="8" r="5.4" fill="#EDBE4E" stroke="${INK}" stroke-width="1.3"/><circle cx="11" cy="8" r="1.9" fill="${WHITE}" stroke="${INK}" stroke-width=".9"/>` +
    `<path d="M16 6.7 H28.4 V9.3 H26.5 V12.4 H24.4 V9.3 H22.6 V11.6 H20.6 V9.3 H16 Z" fill="#EDBE4E" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/></svg>`;

    return { svg, hotel, mini, door, key, skyAt, seasonAt, COLORS: { INK, CORAL, MINT, NAVY, GLASS, LIT, WHITE, GOLD } };
})();

window.Crab = Crab;
