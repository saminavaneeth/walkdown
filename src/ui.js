/* Walkdown UI: capture, plan review, sending to mock systems, activity log, feedback. */
"use strict";

const CONFIG = {
  publicUrl: "https://saminavaneeth.github.io/walkdown/",
  claudeUrl: "https://claude.ai/artifact/TKfVxNXDnU1z1h51SuavRu",
  repoUrl: "https://github.com/saminavaneeth/walkdown",
  feedbackUrl: "https://github.com/saminavaneeth/walkdown/issues/new",
  author: {name: "@saminavaneeth", url: "https://github.com/saminavaneeth"}
};

const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
function esc(s){ return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function load(k, d){ try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
function store(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
function plural(n, a, b){ return n + " " + (n === 1 ? a : (b || a + "s")); }
function fmt(v){ return v === null || v === undefined ? "" : String(v); }
function now(){ return Date.now(); }
function hhmm(t){ try { return new Date(t).toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"}); } catch (e) { return ""; } }
function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }
const reduceMotion = (() => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; } })();
function toast(msg){ const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, 3400); }
function scrollToEl(el){ if (el) el.scrollIntoView({behavior: reduceMotion ? "auto" : "smooth", block: "center"}); }
function flash(el){ if (!el) return; el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash"); }

const ICON = {
  photo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-2.5h6L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  video: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3z"/></svg>',
  document: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/></svg>',
  mic: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>'
};
const FLAG_META = {
  fast_lane:{label:"Possible serious event", k:"danger"},
  sif_precursor:{label:"SIF precursor", k:"warn"},
  sif_check:{label:"Check for SIF", k:"warn"},
  decision_needed:{label:"Decision for a person", k:"accent"},
  duplicate_check:{label:"Possible repeat", k:"accent"},
  health_open:{label:"Health detail in shared field", k:"private"},
  blame_language:{label:"Judging wording", k:"danger"},
  name_removed:{label:"Name removed", k:"private"},
  unroutable:{label:"Cannot be sent", k:"danger"},
  link_dropped:{label:"Link removed", k:"plain"},
  link_cycle:{label:"Link loop", k:"danger"}
};
const PILL = {draft:"Draft", approved:"Approved", skipped:"Skipped", sent:"Sent", queued:"Queued", failed:"Failed", waiting:"Waiting", sending:"Sending"};

/* ===== State ===== */
let mode = "checking"; // checking | live | demo | denied
let sampleNs = null, imagesOK = false, maxImages = 12;
let sys = load("wd2.sys", null);
if (!sys || !sys.ehs || !sys.cmms || !sys.ptw || !sys.ptw.permits || !sys.lms || !sys.alerts) sys = newSystemsState();
let logs = load("wd2.log", []); if (!Array.isArray(logs)) logs = [];
let plan = load("wd2.plan", null);
let draft = load("wd2.draft", null);
let chk = null, numMap = {}, tab = "capture";
let busy = false, sending = false, runCtl = null, procErr = "", mediaSeq = 0;
const blobs = {}; // media id -> [Blob]; kept in memory only

if (!draft || typeof draft !== "object"){ const s = SCENARIOS[0]; draft = {scenario:s.id, text:s.text, media:s.media.map(m => Object.assign({demo:true}, m))}; }
draft.media = (draft.media || []).filter(m => m.demo);

function saveSys(){ store("wd2.sys", sys); }
function savePlan(){ store("wd2.plan", plan); }
function saveDraft(){ store("wd2.draft", {scenario:draft.scenario, text:draft.text, media:draft.media.filter(m => m.demo)}); }
function addLog(text, kind){ logs.unshift({at:now(), text, kind:kind || ""}); if (logs.length > 300) logs.length = 300; store("wd2.log", logs); if (tab === "activity") renderLog(); }

function recompute(){
  chk = null;
  if (!plan) return;
  try {
    chk = runChecks(plan.injected ? plan.injected.raw : plan.raw, plan.input);
    if (plan.injected) plan.injected.faults.forEach(f => { f.caught = faultCaught(f, chk); });
  } catch (e) { plan = null; chk = null; }
}
recompute();

/* ===== Tabs ===== */
const TABS = ["capture","plan","systems","activity","about"];
function showTab(t, keepScroll){
  if (!TABS.includes(t)) t = "capture";
  tab = t;
  TABS.forEach(x => { $("#v-" + x).hidden = x !== t; });
  $$(".nav button").forEach(b => { if (b.dataset.tab === t) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
  store("wd2.tab", t);
  if (t === "capture") renderCapture();
  if (t === "plan") renderPlan();
  if (t === "systems") renderSystems();
  if (t === "activity") renderLog();
  if (t === "about") renderAbout();
  renderDock();
  if (!keepScroll) window.scrollTo(0, 0);
}
$$(".nav button").forEach(b => b.addEventListener("click", () => showTab(b.dataset.tab)));
document.addEventListener("click", e => { const g = e.target.closest("[data-tab-go]"); if (g) showTab(g.dataset.tabGo); });

/* ===== Live AI availability ===== */
function withTimeout(p, ms){ return Promise.race([p, new Promise(r => setTimeout(() => r(null), ms))]); }
async function detect(){
  try {
    if (window.claude && typeof window.claude.use === "function"){
      sampleNs = await withTimeout(window.claude.use("sample").catch(() => null), 4000);
      if (sampleNs){
        const lim = await withTimeout(sampleNs.limits().catch(() => null), 4000);
        imagesOK = !!(lim && lim.images);
        if (imagesOK && lim.images.maxCount) maxImages = Math.max(1, Math.min(12, lim.images.maxCount));
      }
    }
  } catch (e) { sampleNs = null; }
  mode = sampleNs ? "live" : "demo";
  renderMode(); renderCapture(); renderAbout();
}
function renderMode(){
  const m = $("#mode");
  m.classList.toggle("live", mode === "live");
  m.textContent = mode === "live" ? "Live AI" : mode === "checking" ? "Checking…" : "Demo";
  m.title = mode === "live" ? "Claude reads your captures on your own Claude account." : "Demo scenarios replay a recorded AI result. Everything else runs live in your browser.";
}

/* ===== Capture ===== */
function scen(){ return draft.scenario ? SCENARIOS.find(s => s.id === draft.scenario) || null : null; }
function userMedia(){ return draft.media.filter(m => !m.demo); }
function draftIsPristine(){
  const s = scen();
  return !!s && draft.text.trim() === s.text.trim() && !userMedia().length && draft.media.length === s.media.length;
}
function inputsSummary(s){
  const parts = [s.voice ? "Voice " + s.voice.duration : "Typed notes"];
  const c = k => s.media.filter(m => m.kind === k).length;
  if (c("photo")) parts.push(plural(c("photo"), "photo"));
  if (c("video")) parts.push(plural(c("video"), "video"));
  if (c("document")) parts.push(plural(c("document"), "document"));
  return parts.map(p => "<span>" + esc(p) + "</span>").join("");
}
function renderScenarios(){
  $("#scen").innerHTML = SCENARIOS.map(s => '<button type="button" data-s="' + esc(s.id) + '" aria-pressed="' + (draft.scenario === s.id) + '"' + (busy ? " disabled" : "") + '><b>' + esc(s.title) + '</b><span class="note">' + esc(s.blurb) + '</span><span class="inputs">' + inputsSummary(s) + "</span></button>").join("");
}
function tileHTML(m){
  const pic = m.thumb ? '<img src="' + esc(m.thumb) + '" alt="">' : '<span class="ph">' + (ICON[m.kind] || ICON.photo) + "</span>";
  const sub = m.kind === "video" && m.frames ? " · " + m.frames + " frames" : "";
  return '<div class="tile">' + pic + (m.demo ? '<span class="demo-tag">demo</span>' : '<button type="button" class="rm" data-rm="' + esc(m.id) + '" aria-label="Remove ' + esc(m.label) + '">×</button>')
    + '<div class="cap"><b>' + esc(m.label + sub) + "</b>" + esc(m.caption || "") + "</div></div>";
}
function renderMedia(){ $("#media").innerHTML = draft.media.map(tileHTML).join(""); $("#media").hidden = !draft.media.length; }
function imagesUsed(){ return userMedia().reduce((n, m) => n + ((blobs[m.id] || []).length), 0); }
function renderCapture(){
  renderScenarios();
  const s = scen();
  $("#comp-title").textContent = s ? "Demo capture · " + s.title : "Your capture";
  const v = $("#voice");
  if (s && s.voice){ v.hidden = false; v.innerHTML = ICON.mic + "<b>Voice note " + esc(s.voice.duration) + '</b><span class="wave" aria-hidden="true"></span><span>Transcript below</span>'; }
  else v.hidden = true;
  if ($("#cap-text").value !== draft.text) $("#cap-text").value = draft.text;
  $("#cap-text").disabled = busy;
  renderMedia();
  const canMedia = mode === "live" && imagesOK && !busy;
  $$("#adds .file-btn").forEach(l => { l.classList.toggle("is-off", !canMedia); const i = $("input", l); i.disabled = !canMedia; });
  const mn = $("#media-note");
  if (mode === "live" && imagesOK) mn.textContent = "Up to " + maxImages + " images per capture. A video is sampled into 5 frames; its sound is not used yet.";
  else if (mode === "live") mn.textContent = "Photos cannot be sent from this view, so captures here are text only.";
  else if (mode === "checking") mn.textContent = "";
  else mn.innerHTML = "Your own photos, video and documents work in the live version inside Claude" + (CONFIG.claudeUrl ? ': <a href="' + esc(CONFIG.claudeUrl) + '" target="_blank" rel="noopener">open it</a>.' : ".");
  renderProcess();
}
function renderProcess(){
  const btn = $("#process"), msg = $("#proc-msg");
  const s = scen(), pristine = draftIsPristine();
  const hasInput = !!(draft.text.trim() || userMedia().length);
  let dis = busy, note = "";
  if (busy) note = "";
  else if (pristine){
    note = mode === "live" ? 'Uses the recorded AI result for this scenario, so it is instant. <button type="button" class="link" id="run-live-anyway">Run Claude on these notes instead</button>'
      : "Replays a recorded AI result for this scenario. The checks, the plan and the systems all run live in your browser.";
  } else if (mode === "live"){
    dis = !hasInput;
    note = hasInput ? "Claude reads your capture on your own Claude account. It takes about 20 to 60 seconds." : "Type or dictate what you saw, or add a photo.";
  } else if (mode === "checking"){ dis = true; note = "Checking whether live AI is available…"; }
  else {
    dis = true;
    note = s ? 'You changed the demo notes, and the recorded result only matches the original. <button type="button" class="link" id="restore-scen">Restore the original</button>'
      : "In this demo, choose a scenario above.";
    note += " Live AI on your own notes runs inside Claude" + (CONFIG.claudeUrl ? ': <a href="' + esc(CONFIG.claudeUrl) + '" target="_blank" rel="noopener">open the live version</a>.' : ".");
  }
  btn.disabled = dis;
  btn.textContent = busy ? "Working…" : "Build the plan";
  msg.innerHTML = (procErr ? '<span class="errline">' + esc(procErr) + "</span> " : "") + note;
}
function pickScenario(id){
  if (busy) return;
  const s = SCENARIOS.find(x => x.id === id); if (!s) return;
  userMedia().forEach(m => { delete blobs[m.id]; });
  draft = {scenario:s.id, text:s.text, media:s.media.map(m => Object.assign({demo:true}, m))};
  procErr = ""; saveDraft(); renderCapture();
  scrollToEl($("#composer"));
}
$("#scen").addEventListener("click", e => { const b = e.target.closest("[data-s]"); if (b) pickScenario(b.dataset.s); });
$("#cap-text").addEventListener("input", e => { draft.text = e.target.value; procErr = ""; clearTimeout(saveDraft._t); saveDraft._t = setTimeout(saveDraft, 400); renderProcess(); });
$("#clear-draft").addEventListener("click", () => {
  if (busy) return;
  userMedia().forEach(m => { delete blobs[m.id]; });
  draft = {scenario:null, text:"", media:[]}; procErr = ""; saveDraft(); renderCapture(); $("#cap-text").focus();
});
$("#media").addEventListener("click", e => {
  const b = e.target.closest("[data-rm]"); if (!b || busy) return;
  delete blobs[b.dataset.rm]; draft.media = draft.media.filter(m => m.id !== b.dataset.rm); relabel(); renderCapture();
});
$("#proc-msg").addEventListener("click", e => {
  if (e.target.closest("#run-live-anyway")) runLive(true);
  if (e.target.closest("#restore-scen") && scen()) pickScenario(scen().id);
});
function relabel(){
  const n = {photo:0, video:0, document:0}, name = {photo:"Photo", video:"Video", document:"Document"};
  draft.media.forEach(m => { n[m.kind]++; if (!m.demo) m.label = name[m.kind] + " " + n[m.kind]; });
}

/* Media: photos are downscaled to JPEG, videos are sampled into frames, documents are photos of paper. */
function drawTo(src, w, h, max){
  const k = Math.min(1, max / Math.max(w || 1, h || 1));
  const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
  c.getContext("2d").drawImage(src, 0, 0, c.width, c.height); return c;
}
function toBlob(c){ return new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error("encode")), "image/jpeg", 0.85)); }
async function prepImage(file){
  const url = URL.createObjectURL(file);
  try {
    const img = new Image(); img.src = url; await img.decode();
    const blob = await toBlob(drawTo(img, img.naturalWidth, img.naturalHeight, 1568));
    return {blob, thumb:drawTo(img, img.naturalWidth, img.naturalHeight, 240).toDataURL("image/jpeg", 0.7)};
  } finally { URL.revokeObjectURL(url); }
}
function once(el, ev, ms){
  return new Promise((res, rej) => {
    const t = setTimeout(() => { done(); rej(new Error("timeout")); }, ms);
    const ok = () => { done(); res(); }, bad = () => { done(); rej(new Error("media")); };
    function done(){ clearTimeout(t); el.removeEventListener(ev, ok); el.removeEventListener("error", bad); }
    el.addEventListener(ev, ok); el.addEventListener("error", bad);
  });
}
async function videoFrames(file, n){
  const url = URL.createObjectURL(file);
  const v = document.createElement("video"); v.muted = true; v.playsInline = true; v.preload = "auto"; v.src = url;
  try {
    await once(v, "loadeddata", 12000);
    const d = isFinite(v.duration) && v.duration > 0 ? v.duration : 1, out = []; let thumb = "";
    for (let i = 0; i < n; i++){
      v.currentTime = Math.max(0, Math.min(d - 0.05, d * (i + 0.5) / n));
      await once(v, "seeked", 8000);
      out.push(await toBlob(drawTo(v, v.videoWidth, v.videoHeight, 1280)));
      if (!i) thumb = drawTo(v, v.videoWidth, v.videoHeight, 240).toDataURL("image/jpeg", 0.7);
    }
    return {frames:out, thumb, duration:d};
  } finally { URL.revokeObjectURL(url); }
}
async function addFiles(input, kind){
  const files = Array.from(input.files || []); input.value = "";
  if (!files.length || busy) return;
  if (draftIsPristine() || scen()){ draft.scenario = null; draft.media = draft.media.filter(m => !m.demo); }
  $("#media-note").textContent = "Reading " + plural(files.length, "file") + "…";
  for (const f of files){
    const left = maxImages - imagesUsed();
    if (left <= 0){ toast("Up to " + maxImages + " images per capture."); break; }
    const id = "u" + (++mediaSeq);
    try {
      if (kind === "video"){
        const r = await videoFrames(f, Math.min(5, left));
        blobs[id] = r.frames;
        draft.media.push({id, kind, label:"", caption:Math.round(r.duration) + " s clip", thumb:r.thumb, frames:r.frames.length});
      } else {
        const r = await prepImage(f);
        blobs[id] = [r.blob];
        draft.media.push({id, kind, label:"", caption:kind === "document" ? "Document photo" : "", thumb:r.thumb});
      }
    } catch (err) { toast(kind === "video" ? "That video could not be read in this browser." : "That image could not be read. Try a JPEG or PNG."); }
  }
  relabel(); procErr = ""; renderCapture();
}
$("#add-photo").addEventListener("change", e => addFiles(e.target, "photo"));
$("#add-video").addEventListener("change", e => addFiles(e.target, "video"));
$("#add-doc").addEventListener("change", e => addFiles(e.target, "document"));

/* Building a plan */
const STAGES = ["Reading the media","Splitting the capture into events","Planning steps across the systems","Running the checks"];
function setStage(i, note){
  $("#stages-wrap").hidden = false;
  $("#stages").innerHTML = STAGES.map((s, k) => '<li class="' + (k < i ? "done" : k === i ? "active" : "") + '"><span class="dot">' + (k < i ? "✓" : "") + "</span>" + esc(s) + "</li>").join("");
  if (note !== undefined) $("#stage-note").textContent = note;
}
function inputFromDraft(withDemo){
  return {text:draft.text, media:draft.media.filter(m => withDemo || !m.demo).map(m => ({id:m.id, kind:m.kind, label:m.label, caption:m.caption || "", thumb:m.thumb || "", frames:m.frames || 0}))};
}
function errCopy(e){
  return ({
    not_granted:"Claude access was declined for this page. Reload the page to be asked again.",
    sampling_disabled:"Claude is not available for this account here.",
    not_declared:"Live AI is not set up on this version of the page.",
    capability_disabled:"Live AI is not available in this view.",
    capability_removed:"This app version cannot run live AI. Update or reload the Claude app.",
    rate_limited:"Too many requests right now. Wait a minute, then try again.",
    session_expired:"Your Claude session has expired. Sign in again, then try again.",
    prompt_too_large:"This capture is too long for one run. Split it in two.",
    images_unavailable:"Images cannot be sent from this view. Remove them and try again.",
    image_rejected:"One of the images could not be used. Try a different photo.",
    refused:"Claude declined to process this capture. Edit it and try again.",
    empty_completion:"No plan came back. Try again.",
    invalid_json:"The plan came back in a format the page could not read. Try again.",
    bad_shape:"The plan was missing its list of steps. Try again."
  })[e && e.code] || "The run was interrupted. Try again.";
}
async function replay(){
  const s = scen(); if (!s || busy) return;
  busy = true; procErr = ""; renderCapture(); $("#stop").hidden = true;
  for (let i = 0; i < STAGES.length; i++){ setStage(i, "Recorded AI result"); await sleep(reduceMotion ? 60 : 420); }
  makePlan({raw:clone(s.recorded), input:inputFromDraft(true), source:"recorded", title:s.title, scenario:s.id});
  busy = false; $("#stages-wrap").hidden = true;
  showTab("plan");
}
async function runLive(textOnly){
  if (!sampleNs || busy) return;
  const input = inputFromDraft(false); if (textOnly) input.media = [];
  input.media = input.media.filter(m => (blobs[m.id] || []).length);
  if (!input.text.trim() && !input.media.length){ procErr = "Add notes or a photo first."; renderProcess(); return; }
  const images = [], manifest = [];
  input.media.forEach(m => {
    const b = blobs[m.id], start = images.length + 1;
    b.forEach(x => images.push(x));
    manifest.push({label:m.label, kind:m.kind, images:b.length > 1 ? start + " to " + (start + b.length - 1) : String(start)});
  });
  busy = true; procErr = ""; runCtl = new AbortController(); const t0 = now();
  renderCapture(); $("#stop").hidden = false;
  let stage = images.length ? 0 : 1, steps = 0;
  setStage(stage, "");
  const tick = setInterval(() => { $("#stage-note").textContent = (steps ? plural(steps, "step") + " so far · " : "") + Math.round((now() - t0) / 1000) + " s"; }, 1000);
  try {
    const opts = {signal:runCtl.signal, onText:({text}) => {
      let st = stage;
      if (/"events"\s*:/.test(text)) st = Math.max(st, 1);
      if (/"steps"\s*:/.test(text)) st = Math.max(st, 2);
      const n = (text.match(/"system"\s*:/g) || []).length;
      if (st !== stage || n !== steps){ stage = st; steps = n; setStage(stage); }
    }};
    if (images.length) opts.images = images;
    const raw = await sampleNs.json(buildPrompt(input, manifest), opts);
    if (!raw || typeof raw !== "object" || !Array.isArray(raw.steps)) throw {code:"bad_shape"};
    setStage(3); await sleep(250);
    const first = Array.isArray(raw.events) && raw.events[0] && raw.events[0].summary ? String(raw.events[0].summary) : "";
    makePlan({raw, input, source:"live", title:first ? (raw.events.length > 1 ? first + " and " + plural(raw.events.length - 1, "more event") : first) : "Your capture", scenario:null});
    clearInterval(tick); busy = false; runCtl = null; $("#stages-wrap").hidden = true; $("#stop").hidden = true;
    showTab("plan");
    return;
  } catch (e) {
    if (e && e.code === "cancelled") procErr = "Stopped.";
    else {
      procErr = errCopy(e);
      if (e && ["not_granted","sampling_disabled","not_declared","capability_disabled","capability_removed"].includes(e.code)){ sampleNs = null; mode = e.code === "not_granted" ? "denied" : "demo"; renderMode(); }
    }
  }
  clearInterval(tick); busy = false; runCtl = null; $("#stages-wrap").hidden = true; $("#stop").hidden = true;
  renderCapture();
}
$("#process").addEventListener("click", () => { if (draftIsPristine()) replay(); else runLive(false); });
$("#stop").addEventListener("click", () => { if (runCtl) runCtl.abort(); });

function makePlan(o){
  plan = {id:"cap" + now().toString(36), at:now(), source:o.source, title:o.title, scenario:o.scenario, input:o.input, raw:o.raw, injected:null, review:{}, exec:{}, ids:{}};
  recompute(); savePlan();
  const removed = chk.log.unsupported + chk.log.invalid + chk.log.ungrounded + chk.log.decisions;
  addLog((o.source === "live" ? "Claude drafted a plan: " : "Replayed a recorded plan: ") + plural(chk.steps.length, "step") + " across " + plural(systemsUsed().length, "system") + ". Checks removed " + plural(removed, "value") + (chk.fastTerms.length ? " and raised an immediate alert." : "."), "plan");
}

/* ===== Plan helpers ===== */
function rv(sid){ if (!plan.review[sid]) plan.review[sid] = {status:"draft", values:{}, answers:{}}; return plan.review[sid]; }
function ex(sid){ return plan.exec[sid] || null; }
function stepById(sid){ return chk.steps.find(s => s.id === sid) || null; }
function has(o, k){ return Object.prototype.hasOwnProperty.call(o, k); }
function effVal(step, f){
  if (f.def.kind === "link") return f.linkFrom ? (plan.ids[f.linkFrom] || null) : null;
  const r = plan.review[step.id];
  return r && has(r.values, f.key) ? r.values[f.key] : f.value;
}
function missing(step){ return step.def ? step.fields.filter(f => f.def.kind !== "link" && f.def.required && isEmptyVal(effVal(step, f))) : []; }
function decisionsOpen(step){
  if (!step.def) return [];
  const flagged = step.flags.some(x => x.kind === "decision_needed");
  return step.fields.filter(f => f.def.policy === "person_decides" && isEmptyVal(effVal(step, f)) && (flagged || f.status === "decision"));
}
function stepState(step){ const e = ex(step.id); return e ? e.state : rv(step.id).status; }
function isReady(step){ return !!step.def && !missing(step).length; }
function canEdit(step){ const e = ex(step.id); return e ? e.state === "failed" : rv(step.id).status === "draft"; }
function systemsUsed(){ return Array.from(new Set(chk.steps.map(s => s.system))).filter(id => systemById(id)); }
function sentCount(){ return chk.steps.filter(s => ex(s.id) && ex(s.id).state === "sent").length; }
function valuesFor(step){
  const v = {};
  step.fields.forEach(f => { v[f.key] = effVal(step, f); });
  const r = rv(step.id), qa = step.questions.map((q, i) => ({q, a:(r.answers[i] || "").trim()})).filter(x => x.a);
  if (qa.length) v._followup = qa;
  return v;
}
function editsCount(step){
  const r = plan.review[step.id]; if (!r) return 0;
  return step.fields.filter(f => has(r.values, f.key) && fmt(r.values[f.key]) !== fmt(f.value)).length;
}

/* ===== Plan rendering ===== */
function renderSource(text, ivs){
  const pts = new Set([0, text.length]);
  ivs.forEach(v => { pts.add(Math.max(0, Math.min(text.length, v.start))); pts.add(Math.max(0, Math.min(text.length, v.end))); });
  const arr = Array.from(pts).sort((a, b) => a - b); let html = "";
  for (let i = 0; i < arr.length - 1; i++){
    const a = arr[i], b = arr[i + 1]; if (a >= b) continue;
    const cover = ivs.filter(v => v.start <= a && v.end >= b);
    let s = esc(text.slice(a, b));
    if (cover.some(v => v.kind === "fast")) s = '<span class="fast">' + s + "</span>";
    const ev = cover.filter(v => v.kind === "ev");
    if (ev.length){
      const qs = Array.from(new Set(ev.map(v => v.qid))).join(" "), rs = Array.from(new Set(ev.map(v => v.rid))).join(" ");
      s = '<mark class="ev" data-q="' + esc(qs) + '" data-r="' + esc(rs) + '" title="Used in a step. Tap to see it.">' + s + "</mark>";
    } else if (cover.some(v => v.kind === "skip")) s = '<span class="skip" title="Left out on purpose">' + s + "</span>";
    else if (cover.some(v => v.kind === "gap")) s = '<span class="gap" title="Not used in any step">' + s + "</span>";
    html += s;
  }
  return html;
}
function flagsHTML(step){
  if (!step.flags.length) return "";
  return '<ul class="flags">' + step.flags.map(f => {
    const m = FLAG_META[f.kind] || {label:f.kind.replace(/_/g, " "), k:"plain"};
    return '<li class="flag"><span class="chip k-' + m.k + '">' + esc(m.label) + '</span><span class="ft">' + esc(f.note) + '</span><span class="by" title="' + (f.by === "Rule" ? "Raised by a rule in the app" : "Raised by the AI") + '">' + esc(f.by) + "</span></li>";
  }).join("") + "</ul>";
}
function controlHTML(step, f){
  const id = "f-" + step.id + "-" + f.key, v = effVal(step, f), d = f.def;
  const dis = canEdit(step) ? "" : " disabled";
  const ph = d.policy === "person_decides" ? "Person decides" : d.required ? "Needed" : "Not stated";
  if (d.kind === "enum" || d.kind === "location"){
    const opts = d.kind === "location" ? SITE.locations : (d.options || []);
    return '<select id="' + id + '" class="ctl" data-sid="' + esc(step.id) + '" data-f="' + esc(f.key) + '"' + dis + '><option value="">' + ph + "…</option>" + opts.map(o => "<option" + (o === v ? " selected" : "") + ">" + esc(o) + "</option>").join("") + "</select>";
  }
  const val = fmt(v);
  if (d.kind === "text" && val.length > 42) return '<textarea id="' + id + '" class="ctl" rows="2" data-sid="' + esc(step.id) + '" data-f="' + esc(f.key) + '"' + dis + ">" + esc(val) + "</textarea>";
  return '<input id="' + id + '" class="ctl" type="' + (d.kind === "number" ? "number" : "text") + '" inputmode="' + (d.kind === "number" ? "numeric" : "text") + '" value="' + esc(val) + '" data-sid="' + esc(step.id) + '" data-f="' + esc(f.key) + '" placeholder="' + ph + '"' + dis + ">";
}
function srcLabel(id){ if (id === "notes") return ""; const s = chk.sources.find(x => x.id === id); return s ? s.label : id; }
function evidenceHTML(f){
  if (!f.evidence) return "";
  if (!f.loc) return '<span class="evq bad" title="Not found in the capture">“' + esc(f.evidence) + "”</span>";
  const src = f.loc.src !== "notes" ? '<span class="evsrc">' + esc(srcLabel(f.loc.src)) + "</span> " : "";
  return '<button type="button" class="evq' + (f.loc.exact ? "" : " approx") + '" data-q="' + esc(f.qid) + '" title="Show this in the capture">' + src + "“" + esc(f.evidence) + "”</button>";
}
function fnoteHTML(f){
  if (f.status === "decision") return '<div class="fnote decide">AI suggested <s>' + esc(fmt(f.removed)) + "</s>. " + esc(f.note) + "</div>";
  if (["unsupported","invalid","ungrounded"].includes(f.status)) return '<div class="fnote">AI suggested <s>' + esc(fmt(f.removed)) + "</s>. " + esc(f.note) + "</div>";
  if (f.status === "approx") return '<div class="fnote soft">' + esc(f.note) + "</div>";
  return "";
}
function fieldHTML(step, f){
  const d = f.def, r = plan.review[step.id];
  if (d.kind === "link"){
    const from = f.linkFrom ? stepById(f.linkFrom) : null, id = f.linkFrom ? plan.ids[f.linkFrom] : null;
    const txt = !from ? "Not linked" : id ? id : ex(from.id) && ex(from.id).state === "sent" ? "Nothing to link" : "Gets #" + numMap[from.id] + "'s ID when it is sent";
    return '<div class="frow"><div class="flabel"><span>' + esc(d.label) + '</span></div><div class="fval"><span class="linkval' + (id ? " set" : "") + '">' + esc(txt) + "</span></div></div>";
  }
  const edited = r && has(r.values, f.key) && fmt(r.values[f.key]) !== fmt(f.value);
  const miss = d.required && isEmptyVal(effVal(step, f));
  const cls = ["frow", miss ? "missing" : "", d.policy === "restricted" ? "restricted" : ""].join(" ");
  const pol = d.policy === "person_decides" ? '<span class="pol pol-decide">Person decides</span>' : d.policy === "restricted" ? '<span class="pol pol-priv">Restricted</span>' : "";
  return '<div class="' + cls + '" data-key="' + esc(f.key) + '"><div class="flabel"><label for="f-' + esc(step.id) + "-" + esc(f.key) + '">' + esc(d.label) + "</label>" + (d.required ? '<span class="req" title="Required">*</span>' : "") + pol + (edited ? '<span class="edited">edited</span>' : "") + "</div>"
    + '<div class="fval">' + controlHTML(step, f) + evidenceHTML(f) + fnoteHTML(f) + "</div></div>";
}
function depsHTML(step){
  if (!step.links.length) return "";
  const items = step.links.map(l => { const d = stepById(l.from); if (!d) return ""; const lab = (step.def.fields.find(x => x.key === l.field) || {}).label || l.field; return '<button type="button" class="link" data-goto="' + esc(d.id) + '">#' + numMap[d.id] + " " + esc(d.def ? d.def.label.toLowerCase() : d.object) + "</button> (" + esc(lab.toLowerCase()) + ")"; }).filter(Boolean);
  return items.length ? '<p class="deps">Links to ' + items.join(", ") + ". Sends after " + (items.length === 1 ? "it" : "them") + ".</p>" : "";
}
function resultHTML(step){
  const e = ex(step.id); if (!e) return "";
  const sname = step.sys ? step.sys.name : step.system;
  if (e.state === "sending") return '<div class="result sending">Sending to ' + esc(sname) + "…</div>";
  if (e.state === "queued") return '<div class="result queued"><b>Queued.</b> ' + esc(e.error) + " It will retry when the system is back.</div>";
  if (e.state === "waiting") return '<div class="result waiting"><b>Waiting.</b> Sends after ' + (e.waitFor || []).map(id => "#" + numMap[id]).join(", ") + " " + ((e.waitFor || []).length === 1 ? "is" : "are") + " sent.</div>";
  if (e.state === "failed") return '<div class="result failed"><b>Rejected by ' + esc(sname) + ".</b> " + esc(e.error) + " Fix the values below and send again.</div>";
  if (e.state === "sent"){
    if (step.def && step.def.action === "check"){
      const p = e.result && e.result.permit;
      if (!p) return '<div class="result failed"><b>No active permit matches.</b> Ask the contractor to show their permit before work continues.</div>';
      return '<div class="result sent"><span class="rid">' + esc(p.id) + '</span><span>Active permit: ' + esc(p.contractor) + " · " + esc(p.work) + " · " + esc(p.location) + " · valid " + esc(p.valid) + "</span>" + (p.conditions && p.conditions.length ? "<span>Conditions: " + p.conditions.map(esc).join("; ") + "</span>" : "") + "</div>";
    }
    const links = step.links.map(l => plan.ids[l.from] ? esc(((step.def.fields.find(x => x.key === l.field) || {}).label || l.field)) + " " + esc(plan.ids[l.from]) : "").filter(Boolean);
    return '<div class="result sent"><span class="rid">' + esc(e.id) + "</span><span>Created in " + esc(sname) + " at " + hhmm(e.at) + (e.duplicate ? ". It was already received, so the same ID came back." : ".") + "</span>" + (links.length ? "<span>Linked: " + links.join(", ") + "</span>" : "") + "</div>";
  }
  return "";
}
function footHTML(step){
  const st = stepState(step);
  if (st === "sent" || st === "sending") return "";
  if (st === "queued" || st === "waiting") return '<div class="sfoot"><span class="ready">Will send automatically.</span></div>';
  if (st === "failed") return '<div class="sfoot"><span class="ready">' + (missing(step).length ? "Needs " + missing(step).map(f => f.def.label.toLowerCase()).join(", ") : "Fixed? Press Send.") + '</span><div class="btns"><button type="button" class="btn small" data-act="skip">Skip</button></div></div>';
  if (st === "approved") return '<div class="sfoot"><span class="ready yes">Approved. Sends with the plan.</span><div class="btns"><button type="button" class="btn small" data-act="reopen">Reopen</button></div></div>';
  if (st === "skipped") return '<div class="sfoot"><span class="ready">Skipped. Will not be sent.</span><div class="btns"><button type="button" class="btn small" data-act="reopen">Reopen</button></div></div>';
  if (!step.def) return '<div class="sfoot"><span class="ready">Cannot be sent: unknown record type.</span><div class="btns"><button type="button" class="btn small" data-act="skip">Skip</button></div></div>';
  const miss = missing(step), dec = decisionsOpen(step);
  let msg = miss.length ? "Needs " + miss.map(f => f.def.label.toLowerCase()).join(", ") : "Ready to approve";
  if (!miss.length && dec.length) msg += " · " + plural(dec.length, "decision") + " still open";
  return '<div class="sfoot"><span class="ready' + (miss.length ? "" : " yes") + '">' + esc(msg) + '</span><div class="btns"><button type="button" class="btn small" data-act="skip">Skip</button><button type="button" class="btn small ok" data-act="approve"' + (miss.length ? " disabled" : "") + ">Approve</button></div></div>";
}
function fieldsHTML(step){
  if (!step.def) return "";
  const nonLink = step.fields.filter(f => f.def.kind !== "link");
  const filled = nonLink.filter(f => !isEmptyVal(effVal(step, f))).length;
  const notes = step.fields.some(f => ["unsupported","invalid","ungrounded","decision","approx"].includes(f.status));
  const open = missing(step).length || notes || stepState(step) === "failed";
  const miss = missing(step).length;
  return '<details class="fw"' + (open ? " open" : "") + "><summary>" + plural(nonLink.length, "field") + " · " + filled + " filled" + (miss ? " · " + miss + " needed" : "") + '</summary><div class="fields">' + step.fields.map(f => fieldHTML(step, f)).join("") + "</div></details>";
}
function questionsHTML(step){
  if (!step.questions.length) return "";
  const r = rv(step.id), dis = canEdit(step) ? "" : " disabled";
  return '<div class="qs"><div class="qh">Follow-up questions</div>' + step.questions.map((q, i) => '<div class="q"><label for="q-' + esc(step.id) + "-" + i + '">' + esc(q) + '</label><input id="q-' + esc(step.id) + "-" + i + '" class="ctl" data-sid="' + esc(step.id) + '" data-qi="' + i + '" value="' + esc(r.answers[i] || "") + '" placeholder="Answer now, or leave it for later"' + dis + "></div>").join("") + "</div>";
}
function stepHTML(step){
  const st = stepState(step);
  const cls = ["step", "st-" + rv(step.id).status, ex(step.id) ? "ex-" + ex(step.id).state : ""].join(" ");
  const verb = step.def ? step.def.verb + " · " + step.def.label : "Unknown record type";
  return '<article class="' + cls + '" id="st-' + esc(step.id) + '" data-sid="' + esc(step.id) + '">'
    + '<div class="shead"><span class="num">' + numMap[step.id] + '</span><div class="stitle"><div class="verb"><span class="sys sys-' + esc(step.system) + '" title="' + esc(step.sys ? step.sys.name : "") + '">' + esc(step.sys ? step.sys.code : "?") + "</span>" + esc(verb) + (step.by === "Rule" ? '<span class="by">added by a rule</span>' : "") + "</div><h3>" + esc(step.title) + '</h3></div><span class="pill ' + st + '">' + PILL[st] + "</span></div>"
    + flagsHTML(step) + depsHTML(step) + resultHTML(step) + fieldsHTML(step) + questionsHTML(step) + footHTML(step) + "</article>";
}
function alertHTML(){
  const alerts = chk.steps.filter(s => s.system === "alerts" && s.flags.some(f => f.kind === "fast_lane"));
  if (!alerts.length) return "";
  const open = alerts.filter(s => !["sent","skipped"].includes(stepState(s)));
  const terms = chk.fastTerms.length ? "The capture mentions " + chk.fastTerms.map(t => "“" + esc(t) + "”").join(", ") + ". " : "";
  if (!open.length){
    const sent = alerts.filter(s => stepState(s) === "sent");
    return sent.length ? '<div class="result sent"><b>Immediate alert sent.</b> ' + sent.map(s => esc(ex(s.id).id) + " at " + hhmm(ex(s.id).at)).join(", ") + "</div>" : "";
  }
  return '<div class="alert" role="region" aria-label="Possible serious event"><h3>Possible serious event</h3><p>' + terms + "Send the immediate alert now, then review the rest of the plan.</p>"
    + open.map(s => { const miss = missing(s), st = stepState(s);
      return '<div class="row">' + (st === "queued" || st === "sending" ? '<span class="note">' + (st === "queued" ? "Alert queued: the alert system is offline." : "Sending…") + "</span>" : '<button type="button" class="btn danger" data-fast="' + esc(s.id) + '"' + (miss.length || sending ? " disabled" : "") + ">Send alert now</button>") + '<button type="button" class="link" data-goto="' + esc(s.id) + '">' + (miss.length ? "Needs " + esc(miss.map(f => f.def.label.toLowerCase()).join(", ")) : "Review it first") + "</button></div>"; }).join("")
    + "</div>";
}
function summaryHTML(){
  const steps = chk.steps;
  const approved = steps.filter(s => rv(s.id).status === "approved").length;
  const qOpen = steps.filter(s => rv(s.id).status !== "skipped").reduce((n, s) => n + s.questions.filter((q, i) => !(rv(s.id).answers[i] || "").trim()).length, 0);
  const dec = steps.filter(s => rv(s.id).status !== "skipped").reduce((n, s) => n + decisionsOpen(s).length, 0);
  const removed = chk.log.unsupported + chk.log.invalid + chk.log.ungrounded + chk.log.decisions;
  const cov = chk.coverage.total ? Math.round(100 * chk.coverage.covered / chk.coverage.total) : 100;
  const anySent = Object.keys(plan.exec).length > 0;
  const nf = plan.injected ? plan.injected.faults.length : 4;
  return '<div class="card summary"><div class="recbadge"><b>' + (plan.source === "live" ? "Live from Claude" : "Recorded AI result") + "</b><span>Built " + hhmm(plan.at) + "</span></div>"
    + "<h2>" + esc(plan.title) + "</h2>"
    + '<div class="row">' + systemsUsed().map(id => { const s = systemById(id); return '<span class="sys sys-' + esc(id) + '" title="' + esc(s.name) + '">' + esc(s.code) + "</span>"; }).join("") + "</div>"
    + '<div class="stats"><span><b>' + steps.length + "</b> steps</span><span><b>" + chk.events.length + "</b> events</span><span><b>" + approved + "</b> approved</span><span><b>" + sentCount() + "</b> sent</span><span><b>" + qOpen + "</b> open " + (qOpen === 1 ? "question" : "questions") + "</span><span><b>" + dec + "</b> " + (dec === 1 ? "decision" : "decisions") + " for a person</span><span><b>" + removed + "</b> " + (removed === 1 ? "value" : "values") + " removed by checks</span><span><b>" + cov + "%</b> of sentences used</span></div>"
    + '<div class="row"><button type="button" class="btn small" id="inject"' + (anySent ? " disabled" : "") + ">" + (plan.injected ? "Remove the test mistakes" : "Test the checks: add " + nf + " AI mistakes") + '</button><button type="button" class="btn small" data-tab-go="capture">New capture</button></div>'
    + (anySent && !plan.injected ? '<p class="note">The mistake test is available before anything is sent.</p>' : "")
    + "</div>";
}
function injectHTML(){
  if (!plan.injected) return "";
  const f = plan.injected.faults, caught = f.filter(x => x.caught).length;
  return '<div class="inject"><b>' + plural(f.length, "mistake") + " added to the AI draft. The checks caught " + caught + " of " + f.length + ".</b><ul>"
    + f.map(x => '<li class="' + (x.caught ? "" : "miss") + '"><span class="mk">' + (x.caught ? "✓ caught" : "✗ missed") + "</span>" + esc(x.what) + ' · <button type="button" class="link" data-goto="' + esc(x.sid) + '">see #' + (numMap[x.sid] || "?") + "</button></li>").join("") + "</ul></div>";
}
function capturedHTML(){
  const media = plan.input.media || [];
  const srcs = chk.sources.map(s => {
    const m = media.find(x => x.id === s.id);
    const label = s.id === "notes" ? (plan.scenario && SCENARIOS.find(x => x.id === plan.scenario && x.voice) ? "Voice note transcript" : "Notes") : s.label + " · what the AI read. Check it against the image.";
    return '<div><div class="src-label">' + esc(label) + "</div>" + (m && m.thumb ? '<div class="src-thumbs"><img src="' + esc(m.thumb) + '" alt="' + esc(m.label) + '"></div>' : "") + '<div class="paper">' + (s.text ? renderSource(s.text, chk.intervals.filter(v => v.src === s.id)) : '<span class="muted">No notes.</span>') + "</div></div>";
  }).join("");
  const nr = chk.notRecorded.length ? '<div><div class="src-label" style="margin-top:6px">Left out on purpose</div><ul class="leftout">' + chk.notRecorded.map(x => "<li>“" + esc(x.quote) + "”" + (x.reason ? " · " + esc(x.reason) : "") + (x.found ? "" : ' <span class="muted">(quote not found)</span>') + "</li>").join("") + "</ul></div>" : "";
  const gaps = chk.coverage.total - chk.coverage.covered;
  return '<details class="captured" id="captured"' + (gaps ? " open" : "") + "><summary>Your capture, marked up" + (gaps ? " · " + plural(gaps, "sentence") + " not used" : "") + "</summary>"
    + '<div class="legend"><span><i class="sw ev"></i>Used in a step</span><span><i class="sw gap"></i>Not used in any step</span><span><i class="sw skip"></i>Left out on purpose</span><span><i class="sw fast"></i>Serious-event word</span></div>'
    + '<div class="sources" style="margin-top:10px">' + srcs + "</div>" + nr + "</details>";
}
function displayOrder(){
  const ordered = chk.order.map(stepById).filter(Boolean);
  const evs = chk.events.filter(e => e && e.id);
  const groups = evs.map(e => ({e, steps:ordered.filter(s => s.event === String(e.id))}));
  const known = new Set(evs.map(e => String(e.id)));
  const rest = ordered.filter(s => !known.has(s.event));
  if (rest.length) groups.push({e:{id:"", summary:evs.length ? "Other steps" : "Steps"}, steps:rest});
  return groups.filter(g => g.steps.length);
}
function renderPlan(){
  const box = $("#plan");
  if (!plan || !chk){
    box.innerHTML = '<div class="empty"><h3>No plan yet</h3><p>Choose a demo scenario or describe what you saw, then press <b>Build the plan</b>.</p><div><button type="button" class="btn primary" data-tab-go="capture">Go to Capture</button></div></div>';
    renderDock(); renderBadge(); return;
  }
  const groups = displayOrder(); numMap = {}; let n = 0;
  groups.forEach(g => g.steps.forEach(s => { numMap[s.id] = ++n; }));
  let html = '<div id="alert-slot" style="display:contents">' + alertHTML() + '</div><div id="summary-slot" style="display:contents">' + summaryHTML() + "</div>" + injectHTML() + capturedHTML();
  groups.forEach((g, i) => {
    html += '<section class="event"><div class="event-h"><span class="chip k-plain">' + (g.e.id ? "Event " + (i + 1) : "More") + "</span><p>" + esc(g.e.summary || "") + "</p></div>" + g.steps.map(stepHTML).join("") + "</section>";
  });
  box.innerHTML = '<div class="view">' + html + "</div>";
  renderDock(); renderBadge();
}
function rerenderStep(sid){
  const s = stepById(sid), el = $("#st-" + CSS.escape(sid));
  if (s && el) el.outerHTML = stepHTML(s);
}
function refreshTop(){
  const a = $("#alert-slot"), b = $("#summary-slot");
  if (a) a.innerHTML = alertHTML();
  if (b) b.innerHTML = summaryHTML();
}
function renderBadge(){
  const b = $("#plan-badge");
  const n = plan && chk ? chk.steps.filter(s => rv(s.id).status === "draft" && !ex(s.id)).length : 0;
  b.hidden = !n; b.textContent = n;
}
function renderDock(){
  const d = $("#dock");
  if (tab !== "plan" || !plan || !chk){ d.hidden = true; return; }
  const steps = chk.steps;
  const toSend = steps.filter(s => rv(s.id).status === "approved" && (!ex(s.id) || ["failed","queued","waiting"].includes(ex(s.id).state)));
  const ready = steps.filter(s => rv(s.id).status === "draft" && !ex(s.id) && isReady(s));
  const needs = steps.filter(s => rv(s.id).status === "draft" && !ex(s.id) && !isReady(s));
  const sent = sentCount(), skipped = steps.filter(s => rv(s.id).status === "skipped").length;
  d.hidden = false;
  if (sent + skipped === steps.length && !sending){
    $("#dock-info").textContent = "Done: " + sent + " sent" + (skipped ? ", " + skipped + " skipped" : "") + ". See them in Systems.";
    $("#approve-ready").hidden = true; $("#send").textContent = "Open Systems"; $("#send").disabled = false; $("#send").dataset.go = "systems"; return;
  }
  $("#send").dataset.go = "";
  $("#approve-ready").hidden = false;
  $("#dock-info").textContent = [toSend.length + " to send", ready.length ? ready.length + " ready" : "", needs.length ? needs.length + " need input" : "", sent ? sent + " sent" : ""].filter(Boolean).join(" · ");
  $("#approve-ready").disabled = !ready.length || sending;
  $("#approve-ready").textContent = ready.length ? "Approve " + ready.length + " ready" : "Approve ready";
  $("#send").disabled = !toSend.length || sending;
  $("#send").textContent = sending ? "Sending…" : toSend.length ? "Send " + toSend.length : "Send";
}

/* ===== Plan interactions ===== */
function readCtl(el, f){
  const raw = el.value;
  if (raw === "") return null;
  if (f.def.kind === "number"){ const n = Number(raw); return isFinite(n) ? n : raw; }
  return raw;
}
function liveUpdate(step){
  const el = $("#st-" + CSS.escape(step.id)); if (!el) return;
  const foot = $(".sfoot", el);
  if (foot){ const t = document.createElement("div"); t.innerHTML = footHTML(step); if (t.firstChild) foot.replaceWith(t.firstChild); }
  const r = plan.review[step.id];
  $$(".frow[data-key]", el).forEach(row => {
    const f = step.fields.find(x => x.key === row.dataset.key); if (!f) return;
    row.classList.toggle("missing", !!(f.def.required && isEmptyVal(effVal(step, f))));
    const isEd = !!(r && has(r.values, f.key) && fmt(r.values[f.key]) !== fmt(f.value)), tag = $(".edited", row);
    if (isEd && !tag) $(".flabel", row).insertAdjacentHTML("beforeend", '<span class="edited">edited</span>');
    if (!isEd && tag) tag.remove();
  });
  renderDock();
}
$("#plan").addEventListener("input", e => {
  const c = e.target.closest("[data-sid]"); if (!c || !plan) return;
  const step = stepById(c.dataset.sid); if (!step || !canEdit(step)) return;
  if (c.dataset.f){ const f = step.fields.find(x => x.key === c.dataset.f); if (!f) return; rv(step.id).values[f.key] = readCtl(c, f); liveUpdate(step); }
  else if (c.dataset.qi !== undefined){ rv(step.id).answers[c.dataset.qi] = c.value; }
});
$("#plan").addEventListener("change", e => {
  const c = e.target.closest("[data-sid]"); if (!c || !plan) return;
  savePlan();
  const step = stepById(c.dataset.sid);
  if (step && c.dataset.f){ liveUpdate(step); refreshTop(); }
});
$("#plan").addEventListener("click", e => {
  const t = e.target;
  const act = t.closest("[data-act]");
  if (act){ const el = act.closest("[data-sid]"); if (el) stepAction(el.dataset.sid, act.dataset.act); return; }
  const q = t.closest("button.evq[data-q]"); if (q){ showEvidence(q.dataset.q); return; }
  const m = t.closest("mark.ev"); if (m){ showSteps((m.dataset.r || "").split(" ")); return; }
  const g = t.closest("[data-goto]"); if (g){ goStep(g.dataset.goto); return; }
  const fst = t.closest("[data-fast]"); if (fst){ sendFast(fst.dataset.fast); return; }
  if (t.closest("#inject")) toggleInject();
});
function stepAction(sid, act){
  const step = stepById(sid); if (!step) return;
  const r = rv(sid), n = numMap[sid];
  if (act === "approve"){
    if (!isReady(step)) return;
    r.status = "approved";
    const ed = editsCount(step), ans = Object.values(r.answers).filter(a => (a || "").trim()).length;
    addLog("Approved #" + n + " “" + step.title + "”" + (ed ? " with " + plural(ed, "edit") : "") + (ans ? (ed ? " and " : " with ") + plural(ans, "answer") : "") + ".", "review");
  } else if (act === "skip"){
    r.status = "skipped"; if (ex(sid) && ex(sid).state === "failed") delete plan.exec[sid];
    addLog("Skipped #" + n + " “" + step.title + "”.", "review");
  } else if (act === "reopen"){
    r.status = "draft"; addLog("Reopened #" + n + ".", "review");
  }
  savePlan(); rerenderStep(sid); refreshTop(); renderDock(); renderBadge();
}
function goStep(sid){ const el = $("#st-" + CSS.escape(sid)); if (el){ scrollToEl(el); flash(el); } }
function showEvidence(qid){
  const det = $("#captured"); if (det) det.open = true;
  $$("mark.ev.on").forEach(m => m.classList.remove("on"));
  const ms = $$("mark.ev").filter(m => (m.dataset.q || "").split(" ").includes(qid));
  ms.forEach(m => m.classList.add("on"));
  if (ms[0]) scrollToEl(ms[0]); else toast("That quote is not in the capture.");
}
function showSteps(ids){
  $$(".step.hl").forEach(s => s.classList.remove("hl"));
  const els = ids.map(id => $("#st-" + CSS.escape(id))).filter(Boolean);
  els.forEach(el => el.classList.add("hl"));
  if (els[0]){ scrollToEl(els[0]); setTimeout(() => els.forEach(el => el.classList.remove("hl")), 2600); }
}
function toggleInject(){
  if (!plan || Object.keys(plan.exec).length) return;
  if (plan.injected){ plan.injected = null; addLog("Removed the test mistakes.", "test"); }
  else {
    plan.injected = injectFaults(plan.raw);
    plan.injected.faults.forEach(f => { delete plan.review[f.sid]; });
    addLog("Added " + plural(plan.injected.faults.length, "deliberate AI mistake") + " to test the checks.", "test");
  }
  recompute();
  if (plan.injected){ const c = plan.injected.faults.filter(f => f.caught).length; addLog("Checks caught " + c + " of " + plan.injected.faults.length + " test mistakes.", "test"); }
  savePlan(); renderPlan();
  const box = $(".inject"); if (box) scrollToEl(box);
}
$("#approve-ready").addEventListener("click", () => {
  if (!plan || !chk || sending) return;
  const ready = chk.steps.filter(s => rv(s.id).status === "draft" && !ex(s.id) && isReady(s));
  ready.forEach(s => { rv(s.id).status = "approved"; });
  if (ready.length) addLog("Approved " + plural(ready.length, "ready step") + ": " + ready.map(s => "#" + numMap[s.id]).join(", ") + ".", "review");
  savePlan(); renderPlan();
});
$("#send").addEventListener("click", () => { if ($("#send").dataset.go){ showTab($("#send").dataset.go); return; } sendPlan(null); });
function sendFast(sid){
  const step = stepById(sid); if (!step || !isReady(step) || sending) return;
  rv(sid).status = "approved";
  addLog("Immediate alert #" + numMap[sid] + " approved and sent ahead of the plan.", "fast");
  sendPlan([sid]);
}

/* ===== Sending ===== */
async function sendPlan(only){
  if (!plan || !chk || sending) return;
  sending = true; renderDock();
  const targets = chk.order.map(stepById).filter(s => s && (!only || only.includes(s.id)) && rv(s.id).status === "approved" && (!ex(s.id) || ["failed","queued","waiting"].includes(ex(s.id).state)));
  const tally = {sent:0, queued:0, failed:0, waiting:0};
  for (const s of targets){
    const blockers = s.links.map(l => stepById(l.from)).filter(d => d && rv(d.id).status !== "skipped" && !(ex(d.id) && ex(d.id).state === "sent"));
    if (blockers.length){
      plan.exec[s.id] = {state:"waiting", waitFor:blockers.map(b => b.id), at:now()}; tally.waiting++;
      rerenderStep(s.id); continue;
    }
    plan.exec[s.id] = {state:"sending", at:now()}; rerenderStep(s.id);
    await sleep(reduceMotion ? 0 : 300);
    const res = mockSend(sys, s, valuesFor(s), plan.id + ":" + s.id, now());
    const n = "#" + numMap[s.id], sname = s.sys ? s.sys.name : s.system;
    if (res.ok){
      plan.exec[s.id] = {state:"sent", id:res.id, result:res.result || null, duplicate:!!res.duplicate, at:now()};
      if (!(s.def.action === "check" && !(res.result && res.result.found))) plan.ids[s.id] = res.id;
      tally.sent++;
      const links = s.links.filter(l => plan.ids[l.from]).map(l => plan.ids[l.from]);
      if (s.def.action === "check") addLog(n + " checked " + sname + ": " + (res.result && res.result.found ? "found active permit " + res.id + "." : "no matching permit."), "sent");
      else addLog(n + " sent to " + sname + " as " + res.id + (links.length ? ", linked to " + links.join(", ") : "") + ".", "sent");
    } else if (res.code === 503){
      plan.exec[s.id] = {state:"queued", error:res.error, at:now()}; tally.queued++;
      addLog(n + " queued: " + res.error, "queued");
    } else {
      plan.exec[s.id] = {state:"failed", error:res.error, code:res.code, at:now()}; tally.failed++;
      addLog(n + " rejected by " + sname + " (" + res.code + "): " + res.error, "failed");
    }
    saveSys(); rerenderStep(s.id);
  }
  /* Steps that were waiting on something sent just now can go too. */
  const unblocked = chk.order.map(stepById).filter(s => s && ex(s.id) && ex(s.id).state === "waiting" && s.links.every(l => { const d = stepById(l.from); return !d || rv(d.id).status === "skipped" || (ex(d.id) && ex(d.id).state === "sent"); }));
  sending = false; savePlan();
  if (unblocked.length && tally.sent){ return sendPlan(unblocked.map(s => s.id)); }
  renderPlan();
  const parts = [];
  if (tally.sent) parts.push(tally.sent + " sent");
  if (tally.queued) parts.push(tally.queued + " queued");
  if (tally.waiting) parts.push(tally.waiting + " waiting");
  if (tally.failed) parts.push(tally.failed + " rejected");
  if (parts.length) toast(parts.join(" · "));
}

/* ===== Systems ===== */
function recHTML(sd, r){
  const def = objectDef(sd.id, r.object);
  const kv = def ? def.fields.filter(f => f.kind !== "link" && !isEmptyVal(r.values[f.key]) && f.policy !== "restricted").slice(0, 4).map(f => "<span>" + esc(f.label) + ": " + esc(r.values[f.key]) + "</span>").join("") : "";
  const restricted = def ? def.fields.filter(f => f.policy === "restricted" && !isEmptyVal(r.values[f.key])).length : 0;
  const links = def ? def.fields.filter(f => f.kind === "link" && r.values[f.key]).map(f => "<span>" + esc(f.label) + " → " + esc(r.values[f.key]) + "</span>").join("") : "";
  const fu = Array.isArray(r.values._followup) ? r.values._followup.map(x => esc(x.q) + " " + esc(x.a)).join(" · ") : "";
  return '<li class="rec"><span class="rid">' + esc(r.id) + '</span><span class="rt">' + esc(r.title) + '</span><span class="rv">' + esc(r.label) + " · " + hhmm(r.at) + (restricted ? " · " + plural(restricted, "restricted field") + " held separately" : "") + '</span><span class="rv kv">' + kv + "</span>" + (links ? '<span class="lk">' + links + "</span>" : "") + (fu ? '<span class="rv">Follow-up: ' + fu + "</span>" : "") + "</li>";
}
function renderSystems(){
  $("#systems").innerHTML = SYSTEMS.map(sd => {
    const st = sys[sd.id];
    const permits = sd.id === "ptw" ? '<div class="permits"><b>Active permits</b>' + st.permits.map(p => "<div><span class=\"rid\" style=\"font-family:var(--f-mono)\">" + esc(p.id) + "</span> · " + esc(p.contractor) + " · " + esc(p.location) + " · " + esc(p.work) + " · valid " + esc(p.valid) + "</div>").join("") + "</div>" : "";
    const recs = st.records.length ? '<ul class="recs">' + st.records.map(r => recHTML(sd, r)).join("") + "</ul>" : '<p class="note">' + (sd.id === "ptw" ? "No permit checks yet." : "No records from Walkdown yet.") + "</p>";
    return '<div class="syscard"><div class="syshead"><span class="sys sys-' + esc(sd.id) + '">' + esc(sd.code) + "</span><h3>" + esc(sd.name) + '<span class="note">' + esc(sd.about) + '</span></h3><label class="toggle"><input type="checkbox" data-sys="' + esc(sd.id) + '"' + (st.down ? "" : " checked") + '><span class="tr"></span><span>' + (st.down ? "Offline" : "Online") + "</span></label></div>" + permits + recs + "</div>";
  }).join("");
}
$("#systems").addEventListener("change", e => {
  const c = e.target.closest("[data-sys]"); if (!c) return;
  const id = c.dataset.sys, sd = systemById(id);
  sys[id].down = !c.checked; saveSys();
  addLog(sd.name + (sys[id].down ? " went offline (simulated outage)." : " is back online."), "system");
  renderSystems();
  if (!sys[id].down && plan && chk){
    const retry = chk.steps.filter(s => ex(s.id) && ["queued","waiting"].includes(ex(s.id).state)).map(s => s.id);
    if (retry.length){ toast(sd.name + " is back. Retrying " + plural(retry.length, "step") + "."); addLog("Retrying " + plural(retry.length, "queued step") + ".", "system"); sendPlan(retry).then(() => { if (tab === "systems") renderSystems(); }); }
  }
});
$("#reset-sys").addEventListener("click", () => {
  sys = newSystemsState(); saveSys();
  if (plan){ plan.exec = {}; plan.ids = {}; savePlan(); }
  addLog("All systems reset. Sent steps in the plan are back to approved.", "system");
  renderSystems(); renderBadge(); toast("Systems reset.");
});

/* ===== Activity ===== */
function renderLog(){
  $("#log").innerHTML = logs.length ? logs.map(l => '<li><time>' + hhmm(l.at) + "</time><span>" + esc(l.text) + "</span></li>").join("") : '<li><time></time><span class="muted">Nothing yet. Build a plan to start the trail.</span></li>';
}
$("#clear-log").addEventListener("click", () => { logs = []; store("wd2.log", logs); renderLog(); });

/* ===== About ===== */
function renderAbout(){
  const links = [];
  if (mode !== "live" && CONFIG.claudeUrl) links.push('<a class="btn primary" href="' + esc(CONFIG.claudeUrl) + '" target="_blank" rel="noopener">Try it live in Claude</a>');
  if (mode === "live" && CONFIG.publicUrl) links.push('<a class="btn" href="' + esc(CONFIG.publicUrl) + '" target="_blank" rel="noopener">Public demo link</a>');
  if (CONFIG.repoUrl) links.push('<a class="btn" href="' + esc(CONFIG.repoUrl) + '" target="_blank" rel="noopener">Source on GitHub</a>');
  links.push('<button type="button" class="btn" id="about-fb">Give feedback</button>');
  $("#about-links").innerHTML = links.join("");
  $("#about-by").innerHTML = '<a href="' + esc(CONFIG.author.url) + '" target="_blank" rel="noopener">' + esc(CONFIG.author.name) + "</a>";
}
$("#about-links").addEventListener("click", e => { if (e.target.closest("#about-fb")) openFb(); });

/* ===== Feedback ===== */
let fbRate = 0;
function renderRate(){ $("#fb-rate").innerHTML = [1,2,3,4,5].map(n => '<button type="button" data-rate="' + n + '" aria-pressed="' + (fbRate === n) + '">' + n + "</button>").join(""); }
function openFb(){ renderRate(); $("#fb").hidden = false; $("#fb-err").textContent = ""; $("#fb-out").hidden = true; $("#fb-role").focus(); }
function closeFb(){ $("#fb").hidden = true; $("#fb-open").focus(); }
$("#fb-open").addEventListener("click", openFb);
$("#fb-close").addEventListener("click", closeFb);
$("#fb").addEventListener("click", e => { if (e.target === $("#fb")) closeFb(); });
document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("#fb").hidden) closeFb(); });
$("#fb-rate").addEventListener("click", e => { const b = e.target.closest("[data-rate]"); if (!b) return; fbRate = Number(b.dataset.rate); renderRate(); $("[data-rate=\"" + fbRate + "\"]").focus(); });
$("#fb-send").addEventListener("click", () => {
  const text = $("#fb-text").value.trim();
  if (!fbRate && !text){ $("#fb-err").textContent = "Pick a rating or write a comment first."; return; }
  $("#fb-err").textContent = "";
  const ctx = "Mode: " + (mode === "live" ? "live in Claude" : "demo") + (plan && chk ? " · Last plan: " + (plan.scenario || "own capture") + ", " + chk.steps.length + " steps, " + sentCount() + " sent" : "");
  const body = "**Role:** " + $("#fb-role").value + "\n**Usefulness:** " + (fbRate ? fbRate + " / 5" : "not rated") + "\n\n**Comments:**\n" + (text || "(none)") + "\n\n---\n" + ctx;
  const title = "Feedback: " + (fbRate ? fbRate + "/5 · " : "") + $("#fb-role").value;
  const url = CONFIG.feedbackUrl + "?title=" + encodeURIComponent(title) + "&body=" + encodeURIComponent(body);
  const out = $("#fb-out");
  out.innerHTML = '<a class="btn primary" href="' + esc(url) + '" target="_blank" rel="noopener">Post it on GitHub</a><button type="button" class="btn" id="fb-copy">Copy the text</button><p class="note" style="flex-basis:100%">Posting needs a free GitHub account and is public. No account? Copy the text and send it to the author.</p><textarea class="ctl fbtext" readonly aria-label="Feedback text">' + esc(title + "\n\n" + body) + "</textarea>";
  out.hidden = false;
});
$("#fb-out").addEventListener("click", async e => {
  if (!e.target.closest("#fb-copy")) return;
  const ta = $(".fbtext", $("#fb-out"));
  try { await navigator.clipboard.writeText(ta.value); toast("Copied."); }
  catch (err) { ta.focus(); ta.select(); toast("Selected. Copy it with your keyboard or the share menu."); }
});

/* ===== Start ===== */
renderMode();
showTab(load("wd2.tab", "capture"), true);
detect();
