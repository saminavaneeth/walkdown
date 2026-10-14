// Run: node tests/engine.test.js
const fs = require("fs"), vm = require("vm"), path = require("path");
const ctx = {console};
vm.createContext(ctx);
for (const f of ["data.js", "engine.js"]) vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "src", f), "utf8"), ctx);
vm.runInContext("this.E = {SCENARIOS, runChecks, newSystemsState, mockSend, objectDef, injectFaults, faultCaught, buildPrompt, isEmptyVal};", ctx);
const E = ctx.E;
let failures = 0;
const check = (cond, msg) => { if (!cond){ failures++; console.log("  FAIL:", msg); } };

for (const sc of E.SCENARIOS){
  const input = {text: sc.text, media: sc.media};
  const chk = E.runChecks(sc.recorded, input);
  console.log(`\n${sc.id}: ${chk.steps.length} steps, order ${chk.order.join(" > ")}, coverage ${chk.coverage.covered}/${chk.coverage.total}, fast [${chk.fastTerms}]`);
  console.log("  log", JSON.stringify(chk.log));
  check(chk.log.unsupported + chk.log.invalid + chk.log.ungrounded === 0, sc.id + " recorded plan has removed values");
  chk.steps.forEach(s => {
    const bad = s.fields.filter(f => ["unsupported","invalid","ungrounded","approx"].includes(f.status)).map(f => f.key + ":" + f.status);
    console.log(`  ${s.id} ${s.system}/${s.object} | ${s.title} | flags ${s.flags.map(f => f.kind + "/" + f.by).join(",")}${bad.length ? " | BAD " + bad : ""}`);
    check(!bad.length, `${sc.id} ${s.id} fields ${bad}`);
  });
  const gaps = chk.intervals.filter(v => v.kind === "gap").map(v => (chk.sources.find(s => s.id === v.src).text).slice(v.start, v.end));
  if (gaps.length) console.log("  not captured:", gaps);

  // Execute in order against mock systems, filling links.
  const state = E.newSystemsState(); const ids = {};
  for (const sid of chk.order){
    const s = chk.steps.find(x => x.id === sid);
    const values = {};
    s.fields.forEach(f => { values[f.key] = f.linkFrom ? (ids[f.linkFrom] || null) : f.value; });
    // reviewer fills missing required fields for the test
    s.fields.forEach(f => { if (f.def.required && E.isEmptyVal(values[f.key]) && f.def.kind === "enum") values[f.key] = f.def.options[0]; });
    const res = E.mockSend(state, s, values, "cap1:" + s.id, 0);
    if (res.ok) ids[s.id] = res.id;
    console.log(`  send ${s.id} -> ${res.ok ? res.id : res.code + " " + res.error}${s.links.length ? "  links " + s.links.map(l => l.field + "=" + values[l.field]).join(", ") : ""}`);
    check(res.ok, `${sc.id} ${s.id} send failed`);
  }
  const again = E.mockSend(state, chk.steps[0], {}, "cap1:" + chk.steps[0].id, 0);
  check(again.duplicate, sc.id + " idempotency");
  const inj = E.injectFaults(sc.recorded);
  const chk2 = E.runChecks(inj.raw, input);
  inj.faults.forEach(f => { const c = E.faultCaught(f, chk2); console.log(`  fault ${f.kind} on ${f.sid}: ${c ? "caught" : "MISSED"}`); check(c, sc.id + " fault " + f.kind); });
}

// Outage and validation
const st = E.newSystemsState(); st.cmms.down = true;
const sc = E.SCENARIOS[0]; const chk = E.runChecks(sc.recorded, {text: sc.text, media: sc.media});
const wo = chk.steps.find(s => s.system === "cmms");
const r1 = E.mockSend(st, wo, Object.fromEntries(wo.fields.map(f => [f.key, f.value])), "x:wo", 0);
check(!r1.ok && r1.code === 503, "outage returns 503");
st.cmms.down = false;
const r2 = E.mockSend(st, wo, {asset: "Press 7", location: "Loading Bay 9", problem: "x", work_type: "Safety"}, "x:wo2", 0);
check(!r2.ok && r2.code === 422, "bad location returns 422: " + r2.error);

// Fast-lane rule step when the model misses the alert
const raw = JSON.parse(JSON.stringify(E.SCENARIOS[1].recorded)); raw.steps = raw.steps.filter(s => s.system !== "alerts");
const chk3 = E.runChecks(raw, {text: E.SCENARIOS[1].text, media: E.SCENARIOS[1].media});
const rule = chk3.steps.find(s => s.id === "alert-now");
check(rule && rule.by === "Rule" && rule.fields.find(f => f.key === "urgency").value === "Immediate", "rule adds an immediate alert");
console.log("\nrule step:", rule && rule.title, rule && rule.fields.map(f => f.key + "=" + f.value + "/" + f.status).join(", "));
console.log("prompt chars:", E.buildPrompt({text: sc.text}, [{label: "Photo 1", kind: "photo", images: "1"}]).length);
console.log(failures ? `\n${failures} FAILURES` : "\nALL CHECKS PASSED");
process.exit(failures ? 1 : 0);
