/* Walkdown engine: checks, plan ordering, prompt and mock connectors. Pure functions, no DOM. */
"use strict";

const BLAME_RE = /\b(careless\w*|lazy|stupid|idiot\w*|dumb|reckless\w*|complacent|incompetent|negligen\w*|clueless|as usual|didn'?t care|should have known better|not paying attention)\b/i;
const HEALTH_RE = /\b(sore\w*|pain|pains|painful|aches?|aching|strain\w*|sprain\w*|numb\w*|tingl\w*|swollen|swelling|bleed\w*|laceration\w*|burn|burns|burned|fractur\w*|stitch\w*|doctor|clinic|physio\w*|medical\w*|symptom\w*|discomfort)\b/i;
const SIF_RE = /\b(forklifts?|lift trucks?|pedestrians?|trailers?|vehicles?|cranes?|hoists?|suspended|lockout|locked out|tag ?out|tagged out|disconnect|energi[sz]ed|arc flash|live wire|falls?|falling|fell|edge|heights?|ladders?|roofs?|scaffold\w*|tie-?off|harness|mezzanine|confined space|sump|gas monitor|trench\w*|excavation|line of fire|caught|struck|dropped|guards?|guarding|conveyors?|rotating|light curtain)\b/i;
const FAST_RE = /\b(ambulance|hospital\w*|paramedics?|911|amputat\w*|unconscious|passed out|fatal\w*|died|death|fractur\w*|broken (?:arm|leg|wrist|hand|bone|finger)s?|loss of (?:an )?eye|lost (?:a|an|his|her|their) (?:finger|eye|hand)|critical injur\w*)\b/gi;
const SIF_OBJECTS = new Set(["concern","incident","finding","observation","contractor_obs"]);
const NUMW = {one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,seventeen:17,eighteen:18,nineteen:19,twenty:20};

function clone(o){ return JSON.parse(JSON.stringify(o)); }
function escRe(s){ return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function systemById(id){ return SYSTEMS.find(s => s.id === id) || null; }
function objectDef(sysId, obj){ const s = systemById(sysId); return s && s.objects[obj] ? s.objects[obj] : null; }
function isEmptyVal(v){
  if (v === undefined || v === null) return true;
  if (typeof v === "string"){ const t = v.trim(); return !t || /^(null|none|unknown|n\/a|not stated|not specified)$/i.test(t); }
  return false;
}

/* ---- Text matching: lower-case, unify quotes and dashes, collapse whitespace, keep a map to original offsets ---- */
function normMap(s){
  const out = [], map = []; let prevSpace = true;
  for (let i = 0; i < s.length; i++){
    let c = s[i];
    if (/[‘’‛′`]/.test(c)) c = "'";
    else if (/[“”″]/.test(c)) c = '"';
    else if (/[–—−]/.test(c)) c = "-";
    c = c.toLowerCase();
    if (/\s/.test(c)){ if (prevSpace) continue; c = " "; prevSpace = true; } else prevSpace = false;
    out.push(c); map.push(i);
  }
  if (out.length && out[out.length - 1] === " "){ out.pop(); map.pop(); }
  return {n:out.join(""), map};
}
function normStr(s){ return normMap(String(s == null ? "" : s)).n; }
function tokenize(n){ const re = /[a-z0-9']+/g, toks = []; let m; while ((m = re.exec(n))) toks.push({t:m[0], s:m.index, e:m.index + m[0].length}); return toks; }
function trimQuote(q){ return normStr(q).replace(/^[\s"'.,;:!?()\-]+|[\s"'.,;:!?()\-]+$/g, ""); }

function makeSources(input, raw){
  const list = [{id:"notes", label:"Notes", text:String(input.text || "")}];
  const notes = (raw && Array.isArray(raw.media_notes)) ? raw.media_notes : [];
  notes.forEach((n, i) => {
    if (!n || !n.text) return;
    const key = String(n.media || "");
    const m = (input.media || []).find(x => x.id === key || x.label.toLowerCase() === key.toLowerCase());
    list.push({id:m ? m.id : "m" + (i + 1), label:(m ? m.label : (key || "Media " + (i + 1))), text:String(n.text)});
  });
  list.forEach(s => { s.nm = normMap(s.text); s.toks = tokenize(s.nm.n); });
  return list;
}
function approxIn(src, q){
  const qt = tokenize(q).map(x => x.t); if (qt.length < 3) return null;
  const L = qt.length, T = src.toks; let best = {score:0};
  for (let i = 0; i < T.length; i++){
    for (const w of [L - 1, L, L + 1, L + 2]){
      if (w < 1 || i + w > T.length) continue;
      const bag = {}; for (let k = i; k < i + w; k++) bag[T[k].t] = (bag[T[k].t] || 0) + 1;
      let hit = 0; for (const t of qt){ if (bag[t] > 0){ hit++; bag[t]--; } }
      const score = hit / L - Math.max(0, w - L) * 0.02;
      if (score > best.score) best = {score, s:T[i].s, e:T[i + w - 1].e};
    }
  }
  return best.score >= 0.8 ? best : null;
}
function locate(quote, sources){
  const q = trimQuote(quote); if (q.length < 2) return null;
  for (const s of sources){
    const idx = s.nm.n.indexOf(q);
    if (idx >= 0) return {src:s.id, start:s.nm.map[idx], end:s.nm.map[idx + q.length - 1] + 1, exact:true};
  }
  let best = null;
  for (const s of sources){
    const a = approxIn(s, q);
    if (a && (!best || a.score > best.score)) best = {src:s.id, start:s.nm.map[a.s], end:s.nm.map[a.e - 1] + 1, exact:false, score:a.score};
  }
  return best;
}
function grounded(kind, value, evidence){
  const e = normStr(evidence);
  if (kind === "number"){
    const n = Number(value); if (!isFinite(n)) return false;
    if (new RegExp("(^|[^0-9])" + n + "([^0-9]|$)").test(e)) return true;
    return Object.keys(NUMW).some(w => NUMW[w] === n && new RegExp("\\b" + w + "\\b").test(e));
  }
  const stop = new Set(["the","and","from","with","for","team","crew","dept","department","self"]);
  const toks = (normStr(String(value)).match(/[a-z][a-z'\-]{2,}/g) || []).filter(t => !stop.has(t));
  if (!toks.length) return true;
  return toks.every(t => new RegExp("\\b" + escRe(t)).test(e));
}
function sentenceSpans(text){
  const out = [], re = /[^.!?\n]+[.!?]*/g; let m;
  while ((m = re.exec(text))){
    const s = m[0], lead = s.length - s.replace(/^\s+/, "").length, t = s.trim();
    if (t.replace(/[^a-z0-9]/gi, "").length >= 3) out.push({start:m.index + lead, end:m.index + lead + t.length});
  }
  return out;
}

/* ---- Checks: run on every plan, independent of the model ---- */
function checkStep(r, ri, ctx){
  const id = String(r.id || ("s" + (ri + 1)));
  const def = objectDef(r.system, r.object), sys = systemById(r.system);
  const step = {id, event:r.event ? String(r.event) : "", system:String(r.system || ""), object:String(r.object || ""), sys, def,
    title:String(r.title || "Untitled step"), fields:[], flags:[], by:r.by || "AI",
    questions:(Array.isArray(r.questions) ? r.questions : []).map(String).filter(s => s.trim()), links:[]};
  (Array.isArray(r.flags) ? r.flags : []).forEach(f => { if (f && f.kind) step.flags.push({kind:String(f.kind), note:String(f.note || ""), by:r.by || "AI"}); });
  if (!def){ step.flags.push({kind:"unroutable", note:"“" + step.system + " / " + step.object + "” is not a record type in the connected systems, so this step cannot be sent.", by:"Rule"}); return step; }
  const rf = (r.fields && typeof r.fields === "object") ? r.fields : {};
  def.fields.forEach(fd => {
    const f = {key:fd.key, def:fd, value:null, evidence:"", status:"empty", note:"", loc:null, removed:null, qid:id + "." + fd.key, linkFrom:null};
    if (fd.kind === "link"){ step.fields.push(f); return; }
    let got = rf[fd.key]; if (got === undefined || got === null) got = {}; if (typeof got !== "object") got = {value:got, evidence:""};
    let value = isEmptyVal(got.value) ? null : got.value;
    if (value !== null && typeof value === "object") value = JSON.stringify(value);
    f.value = value; f.evidence = got.evidence ? String(got.evidence) : "";
    if (value !== null){
      ctx.log.filled++; f.status = "ok";
      if (fd.policy === "person_decides"){ f.removed = value; f.value = null; f.status = "decision"; f.note = "Cleared: a person decides this."; ctx.log.decisions++; }
      else if (!f.evidence.trim()){ f.removed = value; f.value = null; f.status = "unsupported"; f.note = "No quote from the capture, so the value was removed."; ctx.log.unsupported++; }
      else {
        const loc = locate(f.evidence, ctx.sources);
        if (!loc){ f.removed = value; f.value = null; f.status = "unsupported"; f.note = "The quote is not in the capture, so the value was removed."; ctx.log.unsupported++; }
        else {
          f.loc = loc;
          if (!loc.exact){ f.status = "approx"; f.note = "The quote only roughly matches the capture. Check the wording."; }
          const opts = fd.kind === "location" ? SITE.locations : fd.options;
          if (opts && opts.length){
            const m = opts.find(o => o.toLowerCase() === String(value).toLowerCase().trim());
            if (!m){ f.removed = value; f.value = null; f.status = "invalid"; f.note = "Not on the system's pick-list, so the value was removed."; ctx.log.invalid++; }
            else f.value = m;
          }
          if (f.value !== null && (fd.kind === "person" || fd.kind === "number") && !grounded(fd.kind, f.value, f.evidence)){
            f.removed = f.value; f.value = null; f.status = "ungrounded";
            f.note = fd.kind === "person" ? "That name is not in the quote, so the value was removed." : "That number is not in the quote, so the value was removed.";
            ctx.log.ungrounded++;
          }
        }
      }
    } else if (f.evidence.trim()){ const loc = locate(f.evidence, ctx.sources); if (loc) f.loc = loc; }
    if (f.value !== null && fd.kind === "number" && typeof f.value === "string" && isFinite(Number(f.value))) f.value = Number(f.value);
    if (f.loc) ctx.intervals.push({src:f.loc.src, start:f.loc.start, end:f.loc.end, qid:f.qid, rid:id, kind:"ev"});
    step.fields.push(f);
  });
  (Array.isArray(r.links) ? r.links : []).forEach(l => {
    if (!l) return;
    const f = step.fields.find(x => x.key === l.field && x.def.kind === "link");
    if (f && l.from && String(l.from) !== id){ f.linkFrom = String(l.from); step.links.push({field:f.key, from:String(l.from)}); }
  });
  if (def.noNames && ctx.people.length){
    const removed = [];
    ctx.people.forEach(p => {
      const rx = () => new RegExp("\\b" + escRe(p) + "\\b", "gi"); let hit = false;
      if (rx().test(step.title)){ step.title = step.title.replace(rx(), "[worker]"); hit = true; }
      step.fields.forEach(f => { if (typeof f.value === "string" && f.def.policy !== "restricted" && rx().test(f.value)){ f.value = f.value.replace(rx(), "[worker]"); hit = true; } });
      if (hit) removed.push(p);
    });
    if (removed.length){ ctx.log.namesRemoved += removed.length; step.flags.push({kind:"name_removed", note:"Removed " + removed.map(n => "“" + n + "”").join(", ") + ". This record type tracks what was done, not who did it.", by:"Rule"}); }
  }
  const openTexts = [step.title].concat(step.fields.filter(f => typeof f.value === "string" && f.def.kind === "text" && f.def.policy !== "restricted").map(f => f.value));
  const blame = openTexts.join(" \n ").match(BLAME_RE);
  if (blame) step.flags.push({kind:"blame_language", note:"“" + blame[0] + "” judges a person. Describe the condition or the action instead.", by:"Rule"});
  if (step.object !== "incident"){
    const h = openTexts.join(" \n ").replace(/\b(?:no|without|not|nobody|none|un)\b[^.;,\n]{0,14}?injur\w*|\buninjured\b/gi, "").match(HEALTH_RE);
    if (h) step.flags.push({kind:"health_open", note:"“" + h[0] + "” is a health detail in a field many people can see. Move it to a restricted field.", by:"Rule"});
  }
  const safeObs = step.object === "observation" && step.fields.some(f => f.key === "observation" && f.value === "Safe");
  if (SIF_OBJECTS.has(step.object) && !safeObs && !step.flags.some(f => f.kind === "sif_precursor")){
    const hay = [step.title].concat(step.fields.map(f => f.evidence || ""), step.fields.map(f => typeof f.value === "string" ? f.value : "")).join(" ");
    const m = hay.match(SIF_RE);
    if (m) step.flags.push({kind:"sif_check", note:"Mentions “" + m[0] + "”. Check whether someone was exposed to a serious-injury hazard.", by:"Rule"});
  }
  return step;
}

function orderSteps(steps){
  const ids = new Set(steps.map(s => s.id)), indeg = {}, next = {};
  steps.forEach(s => { indeg[s.id] = 0; next[s.id] = []; });
  steps.forEach(s => s.links.forEach(l => { if (ids.has(l.from)){ indeg[s.id]++; next[l.from].push(s.id); } }));
  const queue = steps.filter(s => indeg[s.id] === 0).map(s => s.id), out = [];
  while (queue.length){ const id = queue.shift(); out.push(id); next[id].forEach(n => { if (--indeg[n] === 0) queue.push(n); }); }
  const cyclic = steps.filter(s => !out.includes(s.id)).map(s => s.id);
  return {order:out.concat(cyclic), cyclic};
}

function runChecks(raw, input){
  const sources = makeSources(input, raw);
  const people = ((raw && raw.people_mentioned) || []).map(String).map(s => s.trim()).filter(s => s.length > 1);
  const ctx = {sources, people, intervals:[], log:{filled:0, unsupported:0, invalid:0, ungrounded:0, decisions:0, namesRemoved:0, linksDropped:0}};
  const rawSteps = ((raw && raw.steps) || []).filter(r => r && typeof r === "object");
  const steps = rawSteps.map((r, i) => checkStep(r, i, ctx));
  const known = new Set(steps.map(s => s.id));
  steps.forEach(s => {
    const bad = s.links.filter(l => !known.has(l.from));
    if (bad.length){
      ctx.log.linksDropped += bad.length;
      s.links = s.links.filter(l => known.has(l.from));
      s.fields.forEach(f => { if (f.linkFrom && !known.has(f.linkFrom)) f.linkFrom = null; });
      s.flags.push({kind:"link_dropped", note:"A link pointed to a step that does not exist, so it was removed.", by:"Rule"});
    }
  });

  /* Serious-event scan of the raw capture: runs on the text itself, not on the model's output. */
  const fastTerms = [];
  sources.forEach(s => {
    for (const m of s.text.matchAll(FAST_RE)){
      ctx.intervals.push({src:s.id, start:m.index, end:m.index + m[0].length, kind:"fast"});
      if (!fastTerms.some(t => t.toLowerCase() === m[0].toLowerCase())) fastTerms.push(m[0]);
    }
  });
  const hasImmediate = steps.some(s => s.system === "alerts" && s.fields.some(f => f.key === "urgency" && f.value === "Immediate"));
  if (fastTerms.length && !hasImmediate){
    const quote = fastTerms[0];
    const ruleStep = checkStep({id:"alert-now", event:steps[0] ? steps[0].event : "", system:"alerts", object:"message", by:"Rule",
      title:"Possible serious event: alert the EHS manager now",
      fields:{to:{value:"EHS manager", evidence:quote}, urgency:{value:"Immediate", evidence:quote},
        message:{value:"The capture mentions " + fastTerms.map(t => "“" + t + "”").join(", ") + ". Review it now; reporting deadlines may apply.", evidence:quote}},
      flags:[{kind:"fast_lane", note:"Added by a rule because the capture mentions a possible serious event.", evidence:quote}], links:[]}, steps.length, ctx);
    ruleStep.by = "Rule";
    steps.unshift(ruleStep);
  }
  steps.forEach(s => { if (s.system === "alerts" && s.fields.some(f => f.key === "urgency" && f.value === "Immediate") && !s.flags.some(f => f.kind === "fast_lane")) s.flags.push({kind:"fast_lane", note:"Immediate alerts can be sent before the rest of the plan.", by:"Rule"}); });

  const notRecorded = ((raw && raw.not_recorded) || []).filter(x => x && x.quote).map(x => {
    const loc = locate(String(x.quote), sources);
    if (loc) ctx.intervals.push({src:loc.src, start:loc.start, end:loc.end, kind:"skip"});
    return {quote:String(x.quote), reason:String(x.reason || ""), found:!!loc};
  });
  /* Coverage applies to what the person said or wrote; media notes are the model's own reading. */
  let covered = 0, total = 0;
  sources.filter(s => s.id === "notes").forEach(s => sentenceSpans(s.text).forEach(sp => {
    total++;
    const hit = ctx.intervals.some(v => v.src === s.id && (v.kind === "ev" || v.kind === "skip") && Math.min(v.end, sp.end) - Math.max(v.start, sp.start) >= 3);
    if (hit) covered++; else ctx.intervals.push({src:s.id, start:sp.start, end:sp.end, kind:"gap"});
  }));
  const ord = orderSteps(steps);
  ord.cyclic.forEach(id => { const s = steps.find(x => x.id === id); if (s) s.flags.push({kind:"link_cycle", note:"This step's links form a loop, so its order could not be worked out.", by:"Rule"}); });
  return {steps, order:ord.order, events:Array.isArray(raw && raw.events) ? raw.events : [], sources, intervals:ctx.intervals, fastTerms, notRecorded, people, log:ctx.log, coverage:{covered, total}};
}

/* ---- Prompt for live drafting ---- */
function catalogForPrompt(){
  return SYSTEMS.map(s => ({system:s.id, name:s.name, record_types:Object.keys(s.objects).map(k => {
    const d = s.objects[k];
    return {type:k, label:d.label, verb:d.verb, no_names:!!d.noNames, fields:d.fields.map(f => { const o = {key:f.key, label:f.label, kind:f.kind}; if (f.kind !== "location" && f.options) o.options = f.options; if (f.required) o.required = true; if (f.policy) o.policy = f.policy; return o; })};
  })}));
}
function buildPrompt(input, manifest){
  const mediaLines = manifest && manifest.length ? manifest.map(m => "- " + m.label + (m.kind === "video" ? " (video): images " + m.images + ", frames sampled from the clip; sound is not available" : m.kind === "document" ? " (photo of a document): image " + m.images : " (photo): image " + m.images)).join("\n") : "- none";
  return "You turn a safety professional's field capture into a PLAN of steps across the customer's existing EHS systems. A person reviews and approves every step before anything is sent, so accuracy matters more than completeness.\n\n"
  + "Site: " + SITE.name + ". Locations: " + JSON.stringify(SITE.locations) + "\n"
  + "Connected systems and their record types (JSON):\n" + JSON.stringify(catalogForPrompt()) + "\n"
  + "The permit system's \"permit_check\" looks up a contractor's permit; it creates nothing.\n\n"
  + "Media attached, in order:\n" + mediaLines + "\n\n"
  + "Rules\n"
  + "1. Split the capture into separate events. One event can need steps in several systems. Create a step only when the capture supports it. Small talk, admin work and items already closed go in \"not_recorded\" with a short reason.\n"
  + "2. Each step targets one system and one record type from the list above.\n"
  + "3. Every field value needs \"evidence\": words copied exactly from the notes or from your media_notes, the shortest span that supports the value (usually 3 to 20 words). If nothing supports a field, use \"value\": null and \"evidence\": \"\". Never guess names, dates, numbers, owners or causes.\n"
  + "4. \"enum\" fields take one of their options exactly, or null. \"location\" fields take one of the site locations exactly, or null. \"number\" fields take a number stated in the capture.\n"
  + "5. Fields with \"policy\": \"person_decides\" must be null. When such a decision matters, add a flag {\"kind\":\"decision_needed\"} saying what a person must decide.\n"
  + "6. Fields with \"policy\": \"restricted\" hold personal and health details. Put symptoms, body parts and treatment only there, never in titles or other fields.\n"
  + "7. Record types with \"no_names\": true must not contain any person's name, including in the title.\n"
  + "8. Titles under 12 words. Write titles and text fields in neutral, factual language about conditions and actions, not people's character. Do not repeat judging words such as \"careless\".\n"
  + "9. Flags are objects {\"kind\",\"note\",\"evidence\"}: \"sif_precursor\" when someone was or could have been exposed to high energy (vehicles near people, hazardous energy or lockout gaps, open edges and work at height, falling objects, suspended loads, confined spaces, line of fire, caught-in points, electrical); \"fast_lane\" for a possible fatality, hospital visit, ambulance, amputation, loss of an eye or unconsciousness; \"decision_needed\" as in rule 5; \"duplicate_check\" when the capture says it happened or was reported before.\n"
  + "10. Fields of kind \"link\" are filled by the systems after sending. Never fill them. When a record should reference another step's record (a corrective action and its work order, a contractor observation and its permit check, a training assignment or alert and the record it is about), add {\"field\":\"<link field key>\",\"from\":\"<step id>\"} to that step's \"links\".\n"
  + "11. A commitment (\"Mike will fix it by end of shift\") becomes a corrective action, and a work order when maintenance does the work, with owner and due date exactly as said. Create training assignments and alerts only when the capture asks for them, except an Immediate alert to the EHS manager for anything that meets rule 9's \"fast_lane\". Do not invent work nobody asked for; add a question instead.\n"
  + "12. For each required field left null, add one short follow-up question to the step.\n"
  + "13. List every person named in the capture in \"people_mentioned\".\n"
  + "14. For each media item, add a \"media_notes\" entry keyed by its label: first any written words copied exactly (labels, tags, permit numbers), then a line starting \"Seen:\" that plainly describes what is visible. For video, describe what the frames show and do not claim anything about sound.\n\n"
  + "Reply with only JSON in exactly this shape:\n"
  + "{\"media_notes\":[{\"media\":\"Photo 1\",\"text\":\"...\"}],\n \"events\":[{\"id\":\"e1\",\"summary\":\"...\"}],\n \"steps\":[{\"id\":\"s1\",\"event\":\"e1\",\"system\":\"<system id>\",\"object\":\"<record type>\",\"title\":\"...\",\"fields\":{\"<field key>\":{\"value\":null,\"evidence\":\"\"}},\"questions\":[],\"flags\":[],\"links\":[]}],\n \"not_recorded\":[{\"quote\":\"...\",\"reason\":\"...\"}],\n \"people_mentioned\":[]}\n"
  + "Include every non-link field key of the record type in \"fields\".\n\n"
  + "Notes, typed or dictated:\n\"\"\"\n" + (input.text && input.text.trim() ? input.text : "(no notes; use the media)") + "\n\"\"\"";
}

/* ---- Mock systems ---- */
function newSystemsState(){
  return {idem:{}, ehs:{down:false, records:[], seq:1040}, cmms:{down:false, records:[], seq:20871}, ptw:{down:false, records:[], seq:0, permits:clone(PERMITS)}, lms:{down:false, records:[], seq:310}, alerts:{down:false, records:[], seq:5520}};
}
function validateValues(def, values){
  const errs = [];
  def.fields.forEach(f => {
    if (f.kind === "link") return;
    const v = values[f.key];
    if (isEmptyVal(v)){ if (f.required) errs.push(f.label + " is required."); return; }
    if (f.kind === "enum" && !(f.options || []).includes(String(v))) errs.push(f.label + " must be one of the allowed values.");
    if (f.kind === "location" && !SITE.locations.includes(String(v))) errs.push(f.label + " must be a site location.");
    if (f.kind === "number" && !isFinite(Number(v))) errs.push(f.label + " must be a number.");
  });
  return errs;
}
function findPermit(permits, values){
  const num = String(values.permit_number || "").trim().toLowerCase();
  if (num){ const p = permits.find(x => x.id.toLowerCase() === num); if (p) return p; }
  const c = String(values.contractor || "").trim().toLowerCase();
  if (!c) return null;
  const hits = permits.filter(p => p.contractor.toLowerCase().includes(c) || c.includes(p.contractor.toLowerCase()));
  if (!hits.length) return null;
  const loc = String(values.location || "").toLowerCase();
  return hits.find(p => p.location.toLowerCase() === loc) || hits[0];
}
function mockSend(state, step, values, idemKey, now){
  const sys = state[step.system], def = objectDef(step.system, step.object), sdef = systemById(step.system);
  if (!sys || !def) return {ok:false, code:400, error:"This record type does not exist in the connected systems."};
  if (state.idem[idemKey]) return Object.assign({ok:true, duplicate:true}, state.idem[idemKey]);
  if (sys.down) return {ok:false, code:503, error:sdef.name + " is not responding."};
  const errs = validateValues(def, values);
  if (errs.length) return {ok:false, code:422, error:errs.join(" ")};
  let id, result = null;
  if (def.action === "check"){
    const p = findPermit(sys.permits, values);
    id = p ? p.id : "No matching permit"; result = p ? {found:true, permit:p} : {found:false};
  } else { sys.seq++; id = def.prefix + "-" + sys.seq; }
  sys.records.unshift({id, object:step.object, label:def.label, title:step.title, values:clone(values), at:now, result, key:idemKey});
  state.idem[idemKey] = {id, result};
  return {ok:true, id, result};
}

/* ---- Deliberate faults for the guardrail demo ---- */
function injectFaults(raw){
  const r = clone(raw), faults = [];
  const steps = r.steps || [];
  const findField = pred => { for (const s of steps){ const d = objectDef(s.system, s.object); if (!d) continue; const f = d.fields.find(x => pred(x, s)); if (f) return {s, f}; } return null; };
  const a = findField(f => f.kind === "person" && !f.policy);
  if (a){ a.s.fields = a.s.fields || {}; a.s.fields[a.f.key] = {value:"Dave Kowalski", evidence:"Dave Kowalski said he would handle it"}; faults.push({sid:a.s.id, key:a.f.key, kind:"unsupported", what:"Invented " + a.f.label.toLowerCase() + " “Dave Kowalski” with a quote that is not in the capture"}); }
  const b = findField(f => f.policy === "person_decides");
  if (b){ b.s.fields = b.s.fields || {}; b.s.fields[b.f.key] = {value:(b.f.options && b.f.options[0]) || "Low", evidence:""}; faults.push({sid:b.s.id, key:b.f.key, kind:"decision", what:"AI filled " + b.f.label.toLowerCase() + ", which a person must decide"}); }
  const c = findField(f => f.kind === "location");
  if (c){ const ev = (c.s.fields && c.s.fields[c.f.key] && c.s.fields[c.f.key].evidence) || ""; c.s.fields[c.f.key] = {value:"Loading Bay 9", evidence:ev}; faults.push({sid:c.s.id, key:c.f.key, kind:"invalid", what:"Location “Loading Bay 9”, which is not in the site's location list"}); }
  const d = steps.find(x => SIF_OBJECTS.has(x.object));
  if (d){ d.title = d.title + ", careless operator"; faults.push({sid:d.id, kind:"blame", what:"Added “careless operator” to a title"}); }
  return {raw:r, faults};
}
function faultCaught(f, chk){
  const s = chk.steps.find(x => x.id === f.sid); if (!s) return false;
  if (f.kind === "blame") return s.flags.some(x => x.kind === "blame_language");
  const fld = s.fields.find(x => x.key === f.key); if (!fld) return false;
  if (f.kind === "decision") return fld.status === "decision";
  if (f.kind === "invalid") return fld.status === "invalid" || fld.status === "unsupported";
  return ["unsupported","ungrounded","invalid"].includes(fld.status);
}
