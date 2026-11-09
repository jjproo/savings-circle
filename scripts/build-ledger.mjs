import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
const html = readFileSync("public/index.html", "utf8").replace(/^\uFEFF/, "");
const signIn = readFileSync("public/sign-in.html", "utf8");
const access = readFileSync("worker/access.js", "utf8");
const worker = readFileSync("worker/ledger.js", "utf8");
mkdirSync("dist/server", {recursive:true});
mkdirSync("dist/.openai", {recursive:true});
writeFileSync("dist/server/index.js", [
  "const page = " + JSON.stringify(html) + ";",
  "const signInPage = " + JSON.stringify(signIn) + ";",
  access,
  worker,
].join("\n"));
writeFileSync("dist/.openai/hosting.json", readFileSync(".openai/hosting.json"));
