// Build: node build.js
// Writes docs/index.html (full page for GitHub Pages) and dist/walkdown-artifact.html (fragment for a Claude artifact).
const fs = require("fs"), path = require("path");
const rd = f => fs.readFileSync(path.join(__dirname, "src", f), "utf8");
const tpl = rd("app.html");
const parts = {DATA: rd("data.js"), ENGINE: rd("engine.js"), UI: rd("ui.js")};
for (const [k, v] of Object.entries(parts)) if (/<\/script/i.test(v)) throw new Error(k + " contains a closing script tag");
let page = tpl;
for (const [k, v] of Object.entries(parts)) page = page.replace("/*" + k + "*/", () => "\n" + v + "\n");

const m = page.match(/<!--HEAD-->([\s\S]*?)<!--\/HEAD-->/);
if (!m) throw new Error("HEAD markers missing");
const head = m[1].trim(), body = page.replace(m[0], "").trim();

fs.mkdirSync(path.join(__dirname, "dist"), {recursive: true});
fs.writeFileSync(path.join(__dirname, "dist", "walkdown-artifact.html"), head + "\n" + body + "\n");

const og = [
  '<meta property="og:title" content="Walkdown: field capture to linked EHS records">',
  '<meta property="og:description" content="Describe what you saw on a floor walk by voice, photo, video or notes. Walkdown plans the linked records across your EHS, maintenance, permit, training and alert systems, with checks and human approval.">',
  '<meta property="og:type" content="website">',
  '<meta property="og:url" content="https://saminavaneeth.github.io/walkdown/">'
].join("\n");
const full = '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n<meta name="theme-color" content="#EDF1EF" media="(prefers-color-scheme: light)">\n<meta name="theme-color" content="#0F1513" media="(prefers-color-scheme: dark)">\n'
  + head.replace(/<meta name="claude:viewport-fit-sides"[^>]*>\n?/, "") + "\n" + og + "\n</head>\n<body>\n" + body + "\n</body>\n</html>\n";
fs.mkdirSync(path.join(__dirname, "docs"), {recursive: true});
fs.writeFileSync(path.join(__dirname, "docs", "index.html"), full);
fs.writeFileSync(path.join(__dirname, "docs", ".nojekyll"), "");
console.log("built docs/index.html", full.length, "bytes; dist/walkdown-artifact.html", (head + body).length, "bytes");
