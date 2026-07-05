#!/usr/bin/env bun
// build.ts — concatenate src/*.js (in filename order) back into a single
// rogue-racer.html by substituting the // @@BUNDLE@@ marker in src/index.html.
//
// The game ships as ONE self-contained file (the self-updating loader
// document.write()s it). Edit files under src/, run `bun build.ts`, commit the
// regenerated rogue-racer.html. Do NOT hand-edit rogue-racer.html.
//
// No module system: the src/*.js files share one global scope, exactly like the
// original inline <script>. Numeric filename prefixes fix concatenation order.

import { readdir } from "node:fs/promises";

const MARKER = "// @@BUNDLE@@";
const OUT = "rogue-racer.html";

const shell = await Bun.file("src/index.html").text();
if (!shell.includes(MARKER)) {
  throw new Error(`src/index.html is missing the ${MARKER} marker — cannot build.`);
}

const numPrefix = (f: string) => {
  const m = f.match(/^(\d+)/);
  if (!m) throw new Error(`src/${f} has no numeric order prefix (expected e.g. 05-foo.js)`);
  return parseInt(m[1], 10);
};
const files = (await readdir("src"))
  .filter((f) => f.endsWith(".js"))
  .sort((a, b) => numPrefix(a) - numPrefix(b)); // order by numeric prefix, NOT lexicographically

if (files.length === 0) throw new Error("No src/*.js files found — nothing to bundle.");

const parts = await Promise.all(files.map((f) => Bun.file(`src/${f}`).text()));
// Files were emitted as slices of the original JS joined with "\n"; rejoining the
// file contents with "\n" reproduces the original inline JS byte-for-byte.
const js = parts.join("\n");

const out = shell.replace(MARKER, () => js); // function replacer: no $-substitution surprises
await Bun.write(OUT, out);

console.log(`Bundled ${files.length} files -> ${OUT}`);
files.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
