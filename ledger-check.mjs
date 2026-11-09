import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import worker from "./dist/server/index.js";

const database = new DatabaseSync(":memory:");
database.exec(readFileSync("drizzle/0000_savings_ledger.sql", "utf8"));
const DB = { prepare(sql) {
  const stmt = database.prepare(sql);
  return {
    first: () => stmt.get(),
    bind: (...args) => ({run: () => ({meta: {changes:stmt.run(...args).changes}})}),
  };
} };
const origin = "https://savings.example";
const env = {DB, ACCOUNTANT_EMAIL:"accountant@example.com"};
const ledger = {members:[{id:"m1",name:"Member One",target:100000,since:"2026-11"}],amounts:{"2026-11":{m1:65000}}};
function send(email, options = {}) {
  const headers = new Headers(options.headers);
  if (email) {
    headers.set("oai-authenticated-user-id", email);
    headers.set("oai-authenticated-user-email", email);
  }
  return worker.fetch(new Request(origin + (options.path ?? "/api/ledger"), {...options,headers}), options.env ?? env);
}
const put = {method:"PUT",headers:{origin,"content-type":"application/json"},body:JSON.stringify({revision:0,ledger})};
assert.equal((await send(null)).status, 401);
assert.equal((await send("member@example.com", put)).status, 403);
assert.equal((await send("accountant@example.com", {...put,env:{DB}})).status, 403);
assert.equal((await send("accountant@example.com", {...put,headers:{...put.headers,origin:"https://other.example"}})).status, 403);
assert.equal((await send("accountant@example.com", {...put,body:"null"})).status, 400);
assert.equal((await send("ACCOUNTANT@example.com", put)).status, 200);
assert.equal((await send("accountant@example.com", put)).status, 409);
const result = await (await send("member@example.com")).json();
assert.equal(result.canEdit, false);
assert.equal(result.revision, 1);
assert.equal(result.monthlyTarget, 50000);
assert.deepEqual(result.ledger, {...ledger, members:[{...ledger.members[0], target:50000}]});
database.prepare("UPDATE savings_ledger SET data = ? WHERE id = 1").run(JSON.stringify(ledger));
const existing = await (await send("member@example.com")).json();
assert.equal(existing.ledger.members[0].target, 50000);
assert.equal(existing.ledger.amounts["2026-11"].m1, 65000);
assert.equal((await send(null,{path:"/"})).status,302);
const page = await (await send("member@example.com",{path:"/"})).text();
assert.match(page,/Monthly contributions/);
new Function(page.match(/<script>([\s\S]+)<\/script>/)[1]);
console.log("Passed sign-in, accountant and member permissions, same-origin, validation, concurrent updates, shared reads, and browser script syntax.");

