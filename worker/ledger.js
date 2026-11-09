const monthlyTarget = 50_000;
const moneyLimit = 999_999_999_999;
const monthPattern = /^(19\d{2}|[2-9]\d{3})-(0[1-9]|1[0-2])$/;
const safeHeaders = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "same-origin",
};

function reply(data, status = 200) {
  return Response.json(data, { status, headers: safeHeaders });
}

function validLedger(data) {
  if (!data || !Array.isArray(data.members) || data.members.length > 2000 ||
      !data.amounts || Object.getPrototypeOf(data.amounts) !== Object.prototype) return false;
  const members = new Map();
  for (const member of data.members) {
    if (!member || typeof member.id !== "string" || !/^[a-z0-9]{1,40}$/.test(member.id) ||
        members.has(member.id) || typeof member.name !== "string" || !member.name.trim() ||
        member.name.length > 70 || !monthPattern.test(member.since)) return false;
    members.set(member.id, member);
  }
  for (const [month, amounts] of Object.entries(data.amounts)) {
    if (!monthPattern.test(month) || !amounts || Object.getPrototypeOf(amounts) !== Object.prototype) return false;
    for (const [id, amount] of Object.entries(amounts)) {
      const member = members.get(id);
      if (!member || member.since > month || !Number.isSafeInteger(amount) || amount < 0 || amount > moneyLimit) return false;
    }
  }
  return true;
}

function applyTarget(ledger) {
  return {members:ledger.members.map(member => ({
    id:member.id, name:member.name, since:member.since, target:monthlyTarget
  })), amounts:ledger.amounts};
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const signedIn = Boolean(request.headers.get("oai-authenticated-user-id"));
    if (url.pathname === "/" && request.method === "GET") {
      if (!signedIn) return Response.redirect(new URL("/signin-with-chatgpt?return_to=%2F", url), 302);
      return new Response(page, { headers: {...safeHeaders, "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy": "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; object-src 'none'; base-uri 'none'; form-action 'self'"} });
    }
    if (url.pathname !== "/api/ledger") return reply({error:"Page not found."}, 404);
    if (!signedIn) return reply({error:"Sign in to see the ledger."}, 401);
    const email = request.headers.get("oai-authenticated-user-email")?.trim().toLowerCase();
    const accountant = env.ACCOUNTANT_EMAIL?.trim().toLowerCase();
    const canEdit = Boolean(accountant && email === accountant);
    try {
      if (request.method === "GET") {
        const row = await env.DB.prepare("SELECT revision, data FROM savings_ledger WHERE id = 1").first();
        return reply({revision:row.revision, ledger:applyTarget(JSON.parse(row.data)), monthlyTarget, canEdit, configured:Boolean(accountant)});
      }
      if (request.method !== "PUT") return reply({error:"Method not allowed."}, 405);
      if (!canEdit) return reply({error:"Only the accountant can edit the ledger."}, 403);
      if (request.headers.get("origin") !== url.origin || !request.headers.get("content-type")?.startsWith("application/json")) {
        return reply({error:"Invalid request."}, 403);
      }
      const raw = await request.text();
      if (raw.length > 2_000_000) return reply({error:"The ledger is too large."}, 413);
      let change;
      try { change = JSON.parse(raw); } catch { return reply({error:"Invalid ledger data."}, 400); }
      if (!change || !Number.isSafeInteger(change.revision) || change.revision < 0 || !validLedger(change.ledger)) {
        return reply({error:"Invalid ledger data."}, 400);
      }
      const result = await env.DB.prepare("UPDATE savings_ledger SET data = ?, revision = revision + 1 WHERE id = 1 AND revision = ?")
        .bind(JSON.stringify(applyTarget(change.ledger)), change.revision).run();
      if (result.meta.changes !== 1) return reply({error:"The ledger changed. Close this form and review the updated totals before trying again."}, 409);
      return reply({revision:change.revision + 1});
    } catch {
      return reply({error:"The shared ledger is temporarily unavailable."}, 503);
    }
  },
};

