import { readFile } from "node:fs/promises";

const root = new URL("..", import.meta.url);
const tokens = JSON.parse(await readFile(new URL("design/yor-tokens.json", root), "utf8"));
const css = await readFile(new URL("src/styles.css", root), "utf8");
const index = await readFile(new URL("index.html", root), "utf8");
const readme = await readFile(new URL("README.md", root), "utf8");
const required = [...Object.values(tokens.palette), tokens.gradient];
const missing = required.filter((value) => !css.toLowerCase().includes(value.toLowerCase()));
missing.push(...tokens.evidenceStates.filter((state) => !readme.includes(state)));
if (!index.includes("#000000") || !index.includes("YOR // Ayrin field hub")) missing.push("YOR index metadata");
if (missing.length) {
  console.error(`YOR design contract failed: ${missing.join(", ")}`);
  process.exit(1);
}
console.log("YOR design contract: PASS");
