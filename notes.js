/* ---------- connection ---------- */
const SUPABASE_URL = "https://fziyuauwrfdmiomwelij.supabase.co";
const SUPABASE_KEY = "sb_publishable_ADg1MNwF3XHtn0bdRYv8cw_NfdZomZ6";   // the public key; every function checks the group code
const MAX_FILE = 50 * 1024 * 1024;
const MAX_TEXT = 450000;
const POLL_MS = 10000;
const LS = "block-a-notes:";

const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(LS + k)); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(LS + k, JSON.stringify(v)); } catch (e) {} },
  del(k) { try { localStorage.removeItem(LS + k); } catch (e) {} },
};

async function rpc(fn, args) {
  const r = await fetch(SUPABASE_URL + "/rest/v1/rpc/" + fn, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY },
    body: JSON.stringify(args),
  });
  if (!r.ok) throw new Error("network " + r.status);
  return r.json();
}

/* ---------- state ---------- */
const S = {
  g: null,                 // group code from the invitation link
  me: null,                // { id, token, name } once signed in on this device
  pages: new Map(),        // id -> { id, name, body, files, updated }
  selected: "join",
  myFiles: [],
  dirty: false, uploading: false,
  saveState: "", savedAt: null, saveError: "",
  tab: "practise",
};

/* ---------- helpers ---------- */
const $ = (s) => document.querySelector(s);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const words = (t) => (t || "").trim() ? t.trim().split(/\s+/).length : 0;
const kb = (n) => n >= 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB";
const plural = (n, w) => n.toLocaleString("en-GB") + " " + w + (n === 1 ? "" : "s");
const clock = (d) => d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
function ago(iso) {
  if (!iso) return "";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return Math.floor(s / 60) + " min ago";
  if (s < 86400) return Math.floor(s / 3600) + " h ago";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
const PATH_RE = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[A-Za-z0-9._-]{1,120}$/;
function filesOf(p) { return Array.isArray(p?.files) ? p.files.filter((f) => f && typeof f.path === "string" && PATH_RE.test(f.path)) : []; }
function fileUrl(path) { return SUPABASE_URL + "/storage/v1/object/public/files/" + path.split("/").map(encodeURIComponent).join("/"); }
function badge(name) {
  const ext = (String(name).split(".").pop() || "").toLowerCase();
  const map = { pdf: "PDF", doc: "DOC", docx: "DOC", ppt: "PPT", pptx: "PPT", xls: "XLS", xlsx: "XLS", csv: "CSV", txt: "TXT", md: "MD", png: "IMG", jpg: "IMG", jpeg: "IMG", gif: "IMG", webp: "IMG", heic: "IMG", mp4: "VID", mov: "VID", mp3: "AUD", m4a: "AUD", zip: "ZIP", key: "KEY", pages: "PAGES", numbers: "NUM" };
  return map[ext] || "FILE";
}
function gate(t, p) { $("#notesview").hidden = true; $("#practise").hidden = true; $("#tabs").hidden = true; $("#gate").hidden = false; $("#gateT").textContent = t; $("#gateP").textContent = p; }
function upmsg(t, warn) { const m = $("#upmsg"); m.textContent = t; m.classList.toggle("warn", !!warn); }

/* ---------- tabs (the router in practise.js decides which one shows) ---------- */
function showTab(tab) {
  const was = S.tab;
  S.tab = ["practise", "topics", "notes"].includes(tab) ? tab : "practise";
  [["practise", "#tabP"], ["topics", "#tabT"], ["notes", "#tabN"]].forEach(([t, id]) => {
    if (S.tab === t) $(id).setAttribute("aria-current", "page"); else $(id).removeAttribute("aria-current");
  });
  $("#practise").hidden = S.tab === "notes";
  $("#notesview").hidden = S.tab !== "notes";
  document.body.dataset.tab = S.tab;
  if (S.tab === "notes" && was !== "notes") { renderPeople(); renderSheet(true); poll(); }
}

/* ---------- people list ---------- */
const PB = new Map();   // rows are kept between renders so a click is never lost
function row(key, cls, onClick) {
  let r = PB.get(key);
  if (!r) {
    const li = el("li");
    const b = el("button", "pbtn" + (cls ? " " + cls : "")); b.type = "button";
    const pn = el("span", "pn"); const nm = el("span", "nm"); const you = el("span", "you", "You"); you.hidden = true;
    pn.append(nm, you);
    const pm = el("span", "pm");
    b.append(pn, pm); b.addEventListener("click", onClick);
    li.append(b);
    r = { li, b, nm, you, pm }; PB.set(key, r);
  }
  return r;
}
function renderPeople() {
  const ul = $("#people");
  const ids = [...S.pages.keys()].sort((a, b) => {
    if (S.me && a === S.me.id) return -1; if (S.me && b === S.me.id) return 1;
    return String(S.pages.get(b)?.updated || "").localeCompare(String(S.pages.get(a)?.updated || ""));
  });
  const keys = S.me ? ids : ["join", ...ids];
  keys.forEach((key, i) => {
    let r;
    if (key === "join") {
      r = row("join", "pjoin", () => select("join"));
      r.nm.textContent = "Open your page";
      r.pm.textContent = "Name and PIN";
    } else {
      r = row(key, "", () => select(key));
      const p = S.pages.get(key);
      const name = p?.name || "Someone";
      const meta = p && (p.body || filesOf(p).length || p.updated)
        ? plural(words(p.body), "word") + " · " + plural(filesOf(p).length, "file") + (p.updated ? " · " + ago(p.updated) : "")
        : "Not started";
      if (r.nm.textContent !== name) r.nm.textContent = name;
      if (r.pm.textContent !== meta) r.pm.textContent = meta;
      r.you.hidden = !(S.me && key === S.me.id);
    }
    r.b.setAttribute("aria-current", String(key === S.selected));
    if (ul.children[i] !== r.li) ul.insertBefore(r.li, ul.children[i] || null);
  });
  for (const [k, r] of PB) if (!keys.includes(k)) { r.li.remove(); PB.delete(k); }
  $("#phint").textContent = ids.length <= 1 ? "When others open the link, their pages appear here." : "";
}

/* ---------- the sheet ---------- */
let docEl = null, lastSig = "";

function select(id) {
  if (S.selected === id) return;
  if (S.dirty) flush();
  S.selected = id;
  if (!S.uploading) upmsg("");
  renderPeople();
  renderSheet(true);
  if (window.matchMedia("(max-width: 760px)").matches) $("#sheet").scrollIntoView({ block: "start" });
}

function renderSheet(rebuild) {
  const id = S.selected;
  const head = $("#shead"), body = $("#body");
  if (id === "join") { lastSig = ""; docEl = null; renderJoin(); return; }
  const own = !!S.me && id === S.me.id;
  const p = S.pages.get(id) || { name: own ? S.me.name : "Someone", body: "", files: [] };

  if (!own) {
    const sig = JSON.stringify([id, p.name, p.body, p.files, p.updated]);
    if (!rebuild && sig === lastSig) { renderStamp(); return; }
    lastSig = sig;
  } else lastSig = "";

  if (rebuild || !own || !docEl) {
    head.textContent = ""; body.textContent = ""; docEl = null;
    head.append(el("h2", "name", p.name));
    const st = el("p", "stamp"); st.id = "stamp"; head.append(st);
    if (own) {
      docEl = el("textarea", "doc"); docEl.id = "mydoc";
      docEl.setAttribute("aria-label", "Your notes");
      docEl.placeholder = "Write your notes here.\n\nAnything helps: what was said in class, what you think will be on the exam, summaries of readings, cases and examples, questions you still have.";
      docEl.value = typeof p.body === "string" ? p.body : "";
      docEl.addEventListener("input", () => { grow(); scheduleSave(); });
      docEl.addEventListener("blur", () => { if (S.dirty) flush(); });
      body.append(docEl);
      requestAnimationFrame(grow);
    } else {
      const t = typeof p.body === "string" ? p.body : "";
      body.append(el("div", "docro" + (t.trim() ? "" : " empty"), t.trim() ? t : "Nothing written yet."));
    }
  } else if (!S.dirty && document.activeElement !== docEl && typeof p.body === "string" && docEl.value !== p.body) {
    docEl.value = p.body; grow();   // my own page changed on another device
  }
  renderStamp();
  renderFiles();
}

/* A name + PIN form. Used here and, smaller, in the practice tab when someone shares an answer. */
function joinForm(opts) {
  const f = el("form", "join"); f.noValidate = true;
  if (opts.lead) f.append(el("p", null, opts.lead));
  const n = el("label", "field"); n.append(el("span", null, "Your name"));
  const ni = el("input"); ni.type = "text"; ni.maxLength = 40; ni.autocomplete = "name"; ni.required = true; n.append(ni);
  const pn = el("label", "field"); pn.append(el("span", null, "PIN"));
  const pi = el("input", "pin"); pi.type = "password"; pi.inputMode = "numeric"; pi.pattern = "[0-9]*"; pi.maxLength = 8; pi.autocomplete = "off"; pn.append(pi);
  const err = el("p", "err"); err.setAttribute("aria-live", "polite");
  const go = el("button", "btn primary", opts.button || "Open my page"); go.type = "submit";
  const bt = el("div", "btns"); bt.append(go);
  if (opts.cancel) { const c = el("button", "btn ghost", "Cancel"); c.type = "button"; c.addEventListener("click", opts.cancel); bt.append(c); }
  f.append(n, pn, err, bt);
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    go.disabled = true;
    const msg = await openPage(ni.value, pi.value);
    go.disabled = false;
    if (msg) { err.textContent = msg; return; }
    if (opts.done) opts.done();
  });
  return { form: f, focus: () => ni.focus(), ni, pi, err };
}

function renderJoin() {
  const head = $("#shead"), body = $("#body");
  $("#files").hidden = true;
  if ($("#joinForm")) return;      // keep what they are typing
  head.textContent = ""; body.textContent = "";
  head.append(el("h2", "name", "Open your page"));
  const j = joinForm({ lead: "First time here? Type your name and choose any 4-digit PIN. Remember the PIN: it opens your page on another phone or laptop, and stops anyone else editing it." });
  j.form.id = "joinForm"; j.ni.id = "jname"; j.pi.id = "jpin"; j.err.id = "jerr";
  body.append(j.form);
  setTimeout(j.focus, 0);
}

/* Returns an error message, or null once this device is signed in. */
async function openPage(name, pin) {
  name = String(name || "").trim();
  if (!name) return "Type your name.";
  if (!/^[0-9]{4,8}$/.test(pin)) return "Use a PIN of 4 to 8 digits.";
  try {
    const r = await rpc("open_page", { g: S.g, p_name: name, p_pin: pin });
    if (r.error === "wrong_pin") return "That PIN doesn't match the page called “" + name + "”. If it's not yours, use another name.";
    if (r.error === "locked") return "Too many wrong PINs. Try again after " + clock(new Date(r.until)) + ".";
    if (r.error === "bad_group") { gate("This invitation link isn't valid", "Ask Antonis for the current link."); return "This invitation link isn't valid."; }
    if (r.error) return "Check your name and PIN and try again.";
    S.me = { id: r.id, token: r.token, name: r.name };
    store.set("me", S.me);
    await refresh();
    S.selected = r.id;
    S.myFiles = filesOf(S.pages.get(r.id));
    PB.get("join")?.li.remove(); PB.delete("join");
    renderPeople(); if (S.tab === "notes") renderSheet(true);
    upmsg(r.created ? "Your page is ready. It saves as you type." : "Welcome back.");
    if (window.Practise) Practise.signedIn();
    return null;
  } catch (e) { return "No connection. Check your internet and try again."; }
}

async function signOut() {
  if (S.dirty) await flush();
  try { await rpc("leave_page", { g: S.g, p_token: S.me.token }); } catch (e) {}
  store.del("me"); S.me = null; S.myFiles = [];
  PB.forEach((r) => r.li.remove()); PB.clear();
  S.selected = "join"; renderPeople(); renderSheet(true);
  if (window.Practise) Practise.signedIn();
}

function grow() {
  if (!docEl) return;
  const min = window.matchMedia("(max-width: 760px)").matches ? 240 : 380;
  docEl.style.height = "auto"; docEl.style.height = Math.max(min, docEl.scrollHeight + 4) + "px";
}

function renderStamp() {
  const st = $("#stamp"); if (!st) return;
  st.textContent = "";
  const id = S.selected, own = !!S.me && id === S.me.id, p = S.pages.get(id);
  const text = own && docEl ? docEl.value : p?.body;
  st.append(el("span", null, plural(words(text), "word")));
  if (own) {
    if (S.saveState === "saving") st.append(el("span", null, "Saving…"));
    else if (S.saveState === "editing") st.append(el("span", null, "Editing…"));
    else if (S.saveState === "error") st.append(el("span", "warn", S.saveError || "Not saved yet. Check your connection; your text is still here."));
    else if (S.savedAt) st.append(el("span", null, "Saved " + clock(S.savedAt)));
    else if (p?.updated) st.append(el("span", null, "Last edited " + ago(p.updated)));
    if (text && text.length > MAX_TEXT * 0.9) st.append(el("span", "warn", "Your page is nearly full. Attach longer notes as a file."));
    const sw = el("button", "tbtn", "Not you? Switch"); sw.type = "button"; sw.addEventListener("click", signOut);
    st.append(sw);
  } else if (p?.updated) st.append(el("span", null, "Last edited " + ago(p.updated)));
}

/* ---------- files ---------- */
function renderFiles() {
  const id = S.selected, own = !!S.me && id === S.me.id;
  $("#files").hidden = false;
  const list = own ? S.myFiles : filesOf(S.pages.get(id));
  const ul = $("#flist"); ul.textContent = "";
  $("#fcount").textContent = list.length ? plural(list.length, "file") : "";
  if (!list.length) ul.append(el("li", "fempty", own ? "No files yet." : "No files attached."));
  list.forEach((f) => {
    const li = el("li");
    li.append(el("span", "badge", badge(f.name)));
    const a = el("a", "fname", String(f.name || "file")); a.href = fileUrl(f.path); a.target = "_blank"; a.rel = "noopener";
    li.append(a, el("span", "fsize", typeof f.size === "number" ? kb(f.size) : ""));
    const act = el("span");
    if (own) {
      const rm = el("button", "tbtn", "Remove"); rm.type = "button";
      rm.addEventListener("click", () => {
        act.textContent = "";
        const c = el("span", "confirm"); c.append(el("span", null, "Remove from your page?"));
        const yes = el("button", "tbtn danger", "Remove"); yes.type = "button";
        const no = el("button", "tbtn", "Keep"); no.type = "button";
        yes.addEventListener("click", () => removeFile(f.path));
        no.addEventListener("click", () => renderFiles());
        c.append(yes, no); act.append(c); yes.focus();
      });
      act.append(rm);
    }
    li.append(act); ul.append(li);
  });
  $("#drop").hidden = !own;
  $("#upmsg").hidden = !own;
}

function safeName(name) {
  const base = String(name).split("/").pop().normalize("NFKD").replace(/[̀-ͯ]/g, "");
  return (base.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || "file").slice(-120);
}

async function uploadOne(file) {
  const path = S.me.id + "/" + crypto.randomUUID() + "/" + safeName(file.name);
  const r = await fetch(SUPABASE_URL + "/storage/v1/object/files/" + path.split("/").map(encodeURIComponent).join("/"), {
    method: "POST",
    headers: { apikey: SUPABASE_KEY, "Content-Type": file.type || "application/octet-stream", "x-upsert": "false", "cache-control": "3600" },
    body: file,
  });
  if (!r.ok) { const e = new Error("upload " + r.status); e.status = r.status; throw e; }
  return path;
}

async function addFiles(fileList) {
  if (!S.me || S.uploading) return;
  const files = [...fileList].filter((f) => f.size > 0 && !f.name.startsWith("."));
  if (!files.length) { upmsg("Nothing to attach. To attach a whole folder, use Attach a folder.", true); return; }
  S.uploading = true; $("#pickFiles").disabled = $("#pickFolder").disabled = true;
  let done = 0; const skipped = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const label = (f.webkitRelativePath || f.name).slice(0, 300);
    if (f.size > MAX_FILE) { skipped.push(label + " (over 50 MB)"); continue; }
    upmsg("Uploading " + (i + 1) + " of " + files.length + ": " + label);
    let path = null;
    for (let attempt = 0; attempt < 2 && !path; attempt++) {
      try { path = await uploadOne(f); }
      catch (e) { if (attempt === 0 && (!e.status || e.status >= 500 || e.status === 429)) { await wait(1500); continue; } skipped.push(label + (e.status === 413 ? " (too big)" : " (failed)")); break; }
    }
    if (path) {
      S.myFiles = [...S.myFiles, { path, name: label, size: f.size, at: new Date().toISOString() }];
      done++; S.dirty = true; await flush(); renderFiles();
    }
  }
  S.uploading = false; $("#pickFiles").disabled = $("#pickFolder").disabled = false;
  let msg = done ? "Attached " + plural(done, "file") + "." : "";
  if (skipped.length) msg += (msg ? " " : "") + "Not attached: " + skipped.slice(0, 6).join(", ") + (skipped.length > 6 ? " and " + (skipped.length - 6) + " more" : "") + ".";
  upmsg(msg, skipped.length > 0);
  renderFiles(); renderPeople();
}

async function removeFile(path) {
  S.myFiles = S.myFiles.filter((f) => f.path !== path);
  S.dirty = true; await flush();
  upmsg("File removed from your page.");
  renderFiles(); renderPeople();
}

/* ---------- saving ---------- */
let saveTimer = null, chain = Promise.resolve();
function scheduleSave() {
  S.dirty = true; S.saveState = "editing"; renderStamp();
  clearTimeout(saveTimer); saveTimer = setTimeout(flush, 900);
}
function flush() {
  clearTimeout(saveTimer);
  if (!S.dirty || !S.me) return chain;
  S.dirty = false;
  const mine = S.pages.get(S.me.id) || {};
  const body = { g: S.g, p_token: S.me.token, p_body: docEl && S.selected === S.me.id ? docEl.value : (mine.body || ""), p_files: S.myFiles };
  chain = chain.then(() => write(body));
  return chain;
}
async function write(args) {
  if (args.p_body.length > MAX_TEXT) { S.saveState = "error"; S.saveError = "Too long to save. Move part of it into a file and attach it."; S.dirty = true; renderStamp(); return; }
  S.saveState = "saving"; renderStamp();
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await rpc("save_page", args);
      if (r.error === "signed_out") { S.saveState = ""; await signOut(); const je = $("#jerr"); if (je) je.textContent = "You were signed out on this device. Open your page again with your name and PIN."; return; }
      if (r.error) { S.saveState = "error"; S.saveError = r.error === "too_long" ? "Too long to save. Move part of it into a file and attach it." : ""; S.dirty = true; renderStamp(); return; }
      const p = S.pages.get(S.me.id) || { id: S.me.id, name: S.me.name };
      S.pages.set(S.me.id, { ...p, body: args.p_body, files: args.p_files, updated: r.updated });
      S.saveState = S.dirty ? "editing" : ""; S.savedAt = new Date(); S.saveError = "";
      renderStamp(); renderPeople(); return;
    } catch (e) {
      if (attempt === 0) { await wait(1200); continue; }
      S.dirty = true; S.saveState = "error"; S.saveError = ""; renderStamp();
      clearTimeout(saveTimer); saveTimer = setTimeout(flush, 8000);   // try again shortly
    }
  }
}

/* ---------- loading ---------- */
async function refresh() {
  const r = await rpc("list_pages", { g: S.g });
  if (r && r.error === "bad_group") { gate("This invitation link isn't valid", "Ask Antonis for the current link."); return false; }
  const next = new Map();
  (Array.isArray(r) ? r : []).forEach((p) => { if (p && p.id) next.set(p.id, p); });
  S.pages = next;
  if (S.me && !S.uploading && !S.dirty) S.myFiles = filesOf(next.get(S.me.id));
  return true;
}

async function poll() {
  if (document.visibilityState !== "visible" || S.tab !== "notes") return;
  try {
    if (await refresh()) { renderPeople(); if (S.selected !== "join") renderSheet(false); }
  } catch (e) { /* offline: try again next time */ }
}

function wireFiles() {
  $("#pickFiles").addEventListener("click", () => $("#inFiles").click());
  $("#pickFolder").addEventListener("click", () => $("#inFolder").click());
  $("#inFiles").addEventListener("change", (e) => { addFiles(e.target.files); e.target.value = ""; });
  $("#inFolder").addEventListener("change", (e) => { addFiles(e.target.files); e.target.value = ""; });
  const drop = $("#drop");
  ["dragenter", "dragover"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
  drop.addEventListener("drop", (e) => { if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files); });
}

async function start() {
  wireFiles();
  const m = location.hash.match(/[#&]g=([A-Za-z0-9_-]{8,64})/);
  if (m) { store.set("g", m[1]); history.replaceState(null, "", location.pathname + location.search); }
  S.g = store.get("g");
  if (!S.g) { gate("Open the invitation link", "This page opens from the link Antonis sent you."); return; }

  try {
    if (!(await refresh())) return;
  } catch (e) { gate("Can't reach the notes", "Check your internet connection and reload the page."); return; }

  const saved = store.get("me");
  if (saved && saved.id && saved.token) {
    try {
      const w = await rpc("whoami", { g: S.g, p_token: saved.token });
      if (!w.error) { S.me = { id: w.id, token: saved.token, name: w.name }; store.set("me", S.me); }
      else store.del("me");
    } catch (e) { S.me = saved; }
  }
  if (S.me) { S.selected = S.me.id; S.myFiles = filesOf(S.pages.get(S.me.id)); }
  $("#tabs").hidden = false;
  Practise.init();
  Practise.route();

  setInterval(poll, POLL_MS);
  setInterval(() => { if (S.tab === "notes") { renderPeople(); renderStamp(); } }, 60000);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") poll(); else if (S.dirty) flush(); });
  window.addEventListener("pagehide", () => { if (S.dirty) flush(); });
}
