import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
const html = readFileSync("public/index.html", "utf8").replace(/^\uFEFF/, "");
const worker = readFileSync("worker/ledger.js", "utf8");
mkdirSync("dist/server", {recursive:true});
mkdirSync("dist/.openai", {recursive:true});
writeFileSync("dist/server/index.js", "const page = " + JSON.stringify(html) + ";\n" + worker);
writeFileSync("dist/.openai/hosting.json", readFileSync(".openai/hosting.json"));
