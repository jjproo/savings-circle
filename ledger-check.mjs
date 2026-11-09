import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import worker from "./dist/server/index.js";

const database = new DatabaseSync(":memory:");
database.exec(readFileSync("drizzle/0000_savings_ledger.sql", "utf8"));
database.exec(readFileSync("drizzle/0001_sign_in_limits.sql", "utf8"));
const DB = { prepare(sql) {
  const stmt = database.prepare(sql);
  return {
    first: () => stmt.get(),
    bind: (...args) => ({
      first: () => stmt.get(...args),
      run: () => ({meta: {changes:stmt.run(...args).changes}}),
    }),
  };
} };
const origin = "https://savings.example";
const env = {DB, ACCOUNTANT_ACCESS_CODE:"test.admin", MEMBER_ACCESS_CODE:"test.member", SESSION_SIGNING_KEY:"test-key"};
const ledger = {members:[{id:"m1",name:"Member One",target:100000,since:"2026-11"}],amounts:{"2026-11":{m1:65000}}};
function send(cookie, options = {}) {
  const headers = new Headers(options.headers);
  if (cookie) headers.set("Cookie", cookie);
  return worker.fetch(new Request(origin + (options.path ?? "/api/ledger"), {...options,headers}), options.env ?? env);
}
function signIn(code) {
  return send(null, {path:"/login", method:"POST", headers:{origin,"content-type":"application/x-www-form-urlencoded"}, body:new URLSearchParams({code})});
}
assert.equal((await signIn("invalid")).headers.get("Location"), "/?failed=1");
const accountantSession = await signIn(env.ACCOUNTANT_ACCESS_CODE);
assert.equal(accountantSession.status, 303);
assert.match(accountantSession.headers.get("Set-Cookie"), /Secure; HttpOnly/);
const accountantCookie = accountantSession.headers.get("Set-Cookie").split(";")[0];
const memberCookie = (await signIn(env.MEMBER_ACCESS_CODE)).headers.get("Set-Cookie").split(";")[0];
assert.equal((await send(memberCookie.replace("member", "accountant"))).status, 401);
assert.equal((await send(accountantCookie, {env:{...env, ACCOUNTANT_ACCESS_CODE:"B".repeat(32)}})).status, 401);
assert.equal((await send(null, {headers:{"oai-authenticated-user-id":"injected"}})).status, 401);
const logout = await send(accountantCookie,{path:"/logout", method:"POST", headers:{origin}});
assert.match(logout.headers.get("Set-Cookie"), /Max-Age=0/);
for (let i = 0; i < 7; i++) {
  assert.equal((await signIn("wrong")).headers.get("Location"), "/?failed=1");
}
assert.equal((await signIn(env.ACCOUNTANT_ACCESS_CODE)).headers.get("Location"), "/?failed=limited");
const put = {method:"PUT",headers:{origin,"content-type":"application/json"},body:JSON.stringify({revision:0,ledger})};
assert.equal((await send(null)).status, 401);
assert.equal((await send(memberCookie, put)).status, 403);
assert.equal((await send(accountantCookie, {...put,env:{DB}})).status, 401);
assert.equal((await send(accountantCookie, {...put,headers:{...put.headers,origin:"https://other.example"}})).status, 403);
assert.equal((await send(accountantCookie, {...put,body:"null"})).status, 400);
assert.equal((await send(accountantCookie, put)).status, 200);
assert.equal((await send(accountantCookie, put)).status, 409);
const result = await (await send(memberCookie)).json();
assert.equal(result.canEdit, false);
assert.equal(result.revision, 1);
assert.equal(result.monthlyTarget, 50000);
assert.deepEqual(result.ledger, {...ledger, members:[{...ledger.members[0], target:50000}]});
database.prepare("UPDATE savings_ledger SET data = ? WHERE id = 1").run(JSON.stringify(ledger));
const existing = await (await send(memberCookie)).json();
assert.equal(existing.ledger.members[0].target, 50000);
assert.equal(existing.ledger.amounts["2026-11"].m1, 65000);
assert.match(await (await send(null,{path:"/"})).text(), /Use your accountant or member access code/);
const page = await (await send(memberCookie,{path:"/"})).text();
assert.match(page,/Monthly contributions/);
new Function(page.match(/<script>([\s\S]+)<\/script>/)[1]);
console.log("Passed sign-in, accountant and member permissions, same-origin, validation, concurrent updates, shared reads, and browser script syntax.");


