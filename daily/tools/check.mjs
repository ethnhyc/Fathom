// Checks one day's reserved prompts before they're pushed.
// Usage: node daily/tools/check.mjs daily/2026-10-06.json
// Exits 1 and lists every problem if the file isn't ready.
import fs from "fs";
import path from "path";
import vm from "vm";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dailyDir = path.resolve(here, "..");
const file = process.argv[2];
if (!file) { console.error("Usage: node daily/tools/check.mjs daily/YYYY-MM-DD.json"); process.exit(2); }

const ctx = { console }; ctx.globalThis = ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(here, "engine.js"), "utf8"), ctx);
const F = ctx.F;
const PACKS = ["geo", "nat", "sci", "his", "cul", "food", "word", "sport"];
const problems = [];
const bad = (m) => problems.push(m);

const raw = fs.readFileSync(file, "utf8");
if (/[^\x00-\x7f]/.test(raw)) bad("File has non-ASCII characters (write accents and curly quotes as plain ASCII).");
let j;
try { j = JSON.parse(raw); } catch (e) { console.error("Not valid JSON: " + e.message); process.exit(1); }

const key = path.basename(file, ".json");
if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) bad("File name must be YYYY-MM-DD.json");
if (j.date !== key) bad(`"date" is ${JSON.stringify(j.date)} but the file is ${key}.json`);
if (!Array.isArray(j.prompts) || j.prompts.length !== 7) bad("Needs exactly 7 prompts.");

// prompts already used: the main bank and every other day's file
const used = new Map();
fs.readFileSync(path.join(here, "bank.txt"), "utf8").split("\n").filter((l) => l && !l.startsWith("#"))
  .forEach((l) => used.set(F.norm(l.split("\t")[2]), "the main bank"));
for (const f of fs.readdirSync(dailyDir)) {
  if (!/^\d{4}-\d{2}-\d{2}\.json$/.test(f) || f === key + ".json") continue;
  try { JSON.parse(fs.readFileSync(path.join(dailyDir, f), "utf8")).prompts.forEach((p) => used.set(F.norm(p.q), f)); } catch (e) {}
}

const perPack = {}, seen = new Set();
let hard = 0;
(j.prompts || []).forEach((p, n) => {
  const tag = `#${n + 1} ${p && p.q ? JSON.stringify(p.q) : ""}`;
  if (!p || typeof p.q !== "string" || !/^Name (a|an|the|any|someone|something|one) /i.test(p.q)) { bad(`${tag}: "q" must start "Name a/an …" (the answer checker only accepts those).`); return; }
  const qk = F.norm(p.q);
  if (used.has(qk)) bad(`${tag}: already used in ${used.get(qk)}.`);
  if (seen.has(qk)) bad(`${tag}: appears twice in this file.`);
  seen.add(qk);
  if (!PACKS.includes(p.pack)) bad(`${tag}: pack must be one of ${PACKS.join(", ")}.`);
  perPack[p.pack] = (perPack[p.pack] || 0) + 1;
  if (![1, 2, 3].includes(p.d)) bad(`${tag}: d must be 1, 2 or 3.`);
  if (p.d === 3) hard++;
  if (typeof p.pearl !== "string" || !p.pearl.trim()) bad(`${tag}: needs a pearl.`);
  if (!Array.isArray(p.tiers) || p.tiers.length !== 5 || p.tiers.some((t) => typeof t !== "string")) { bad(`${tag}: "tiers" must be 5 strings.`); return; }
  const owner = new Map();
  const pearlKeys = String(p.pearl).split("=").map(F.norm);
  p.tiers.forEach((s, t) => s.split("|").map((x) => x.trim()).filter(Boolean).forEach((item, i) => {
    const id = t + ":" + i;
    item.split("=").map((x) => x.trim()).filter(Boolean).forEach((k) => {
      const nk = F.norm(k);
      if (!nk) { bad(`${tag}: empty answer in tier ${t + 1} (${item}).`); return; }
      if (pearlKeys.includes(nk)) bad(`${tag}: the pearl also appears in tier ${t + 1} (${item}).`);
      if (owner.has(nk) && owner.get(nk).id !== id) bad(`${tag}: "${k}" is listed twice (${owner.get(nk).item} / ${item}).`);
      else if (!owner.has(nk)) owner.set(nk, { id, item });
    });
  }));
  const q = F.prep({ id: "x", pack: p.pack, d: p.d, q: p.q, pearl: p.pearl, raw: p.tiers.slice() });
  const sizes = q.tiers.slice(0, 5).map((l) => l.length);
  if (sizes[0] < 5) bad(`${tag}: tier 1 (Sprat) needs at least 5 common answers, has ${sizes[0]}.`);
  if (sizes[1] < 2) bad(`${tag}: tier 2 (Red herring) needs at least 2, has ${sizes[1]}.`);
  if (sizes[2] < 15) bad(`${tag}: tier 3 (Reef) needs at least 15, has ${sizes[2]}.`);
  if (sizes[3] < 6) bad(`${tag}: tier 4 (Rare find) needs at least 6, has ${sizes[3]}.`);
  if (q.count < 45) bad(`${tag}: only ${q.count} accepted answers in total; aim for 60+.`);
  console.log(`${tag}  [${p.pack}, d${p.d}]  ${sizes.join("/")} + pearl = ${q.count} answers`);
});
for (const k in perPack) if (perPack[k] > 2) bad(`Pack "${k}" is used ${perPack[k]} times; at most 2 per day.`);
if (hard > 1) bad(`${hard} prompts have d 3; at most 1 per day.`);

if (problems.length) { console.log("\nNOT READY:"); problems.forEach((m) => console.log(" - " + m)); process.exit(1); }
console.log("\nOK: " + key + " is ready to push.");
