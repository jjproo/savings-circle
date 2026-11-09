const sessionCookie = "__Host-savings_session";
const sessionLifetime = 8 * 60 * 60;
const cookieOptions = "Path=/; Secure; HttpOnly; SameSite=Lax";
const signInWindow = 600;
const signInLimit = 10;
const encoder = new TextEncoder();

function roleCode(env, role) {
  if (role === "accountant") return env.ACCOUNTANT_ACCESS_CODE;
  if (role === "member") return env.MEMBER_ACCESS_CODE;
}

async function matchingCode(code, expected) {
  if (!expected) return false;
  const [left, right] = await Promise.all([code, expected].map(value =>
    crypto.subtle.digest("SHA-256", encoder.encode(value))
  ));
  const expectedBytes = new Uint8Array(right);
  return new Uint8Array(left).reduce((difference, byte, i) => difference | (byte ^ expectedBytes[i]), 0) === 0;
}

function sessionKey(secret) {
  return crypto.subtle.importKey(
    "raw", encoder.encode(secret), {name:"HMAC", hash:"SHA-256"}, false, ["sign", "verify"]
  );
}

function hexBytes(buffer) {
  return Array.from(new Uint8Array(buffer), byte => byte.toString(16).padStart(2, "0")).join("");
}

function sessionMessage(payload, code) {
  return encoder.encode("session:" + payload + ":" + code);
}

async function signedSession(role, code, key) {
  const expires = Math.floor(Date.now() / 1000) + sessionLifetime;
  const payload = role + "." + expires + "." + crypto.randomUUID();
  const signature = await crypto.subtle.sign("HMAC", key, sessionMessage(payload, code));
  return payload + "." + hexBytes(signature);
}

async function sessionRole(request, env) {
  const cookie = request.headers.get("Cookie")?.split(/;\s*/).find(value => value.startsWith(sessionCookie + "="));
  const token = cookie?.slice(sessionCookie.length + 1);
  const parsed = token?.match(/^(accountant|member)\.(\d{10})\.([a-f0-9-]{36})\.([a-f0-9]{64})$/);
  if (!parsed) return null;
  const [, role, expires, nonce, hex] = parsed;
  const code = roleCode(env, role);
  if (!code || !env.SESSION_SIGNING_KEY || Number(expires) <= Math.floor(Date.now() / 1000)) return null;
  const signature = Uint8Array.from(hex.match(/../g), byte => parseInt(byte, 16));
  const valid = await crypto.subtle.verify(
    "HMAC", await sessionKey(env.SESSION_SIGNING_KEY), signature,
    sessionMessage(role + "." + expires + "." + nonce, code)
  );
  return valid ? role : null;
}

function goHome(cookie, failure = "") {
  const headers = {...safeHeaders, Location:failure ? "/?failed=" + failure : "/"};
  if (cookie) headers["Set-Cookie"] = cookie;
  return new Response(null, {status:303, headers});
}

async function allowSignIn(request, db, key) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const hash = await crypto.subtle.sign("HMAC", key, encoder.encode("limit:" + ip));
  const now = Math.floor(Date.now() / 1000);
  await db.prepare("DELETE FROM sign_in_limits WHERE expires_at <= ?").bind(now).run();
  const result = await db.prepare(
    "INSERT INTO sign_in_limits (source, expires_at, attempts) VALUES (?, ?, 1) " +
    "ON CONFLICT(source) DO UPDATE SET attempts = attempts + 1 " +
    "WHERE attempts < ? RETURNING attempts"
  ).bind(hexBytes(hash), now + signInWindow, signInLimit).first();
  return Boolean(result);
}

async function changeSession(request, url, env) {
  if (request.method !== "POST") return reply({error:"Method not allowed."}, 405);
  if (request.headers.get("Origin") !== url.origin) return reply({error:"Invalid request."}, 403);
  if (url.pathname === "/logout") return goHome(sessionCookie + "=; Max-Age=0; " + cookieOptions);
  if (!request.headers.get("Content-Type")?.startsWith("application/x-www-form-urlencoded")) {
    return reply({error:"Invalid request."}, 400);
  }
  const reader = request.body?.getReader();
  if (!reader) return goHome(null, "1");
  const bytes = new Uint8Array(256);
  let length = 0;
  for (;;) {
    const {done, value} = await reader.read();
    if (done) break;
    if (length + value.length > bytes.length) {
      await reader.cancel();
      return reply({error:"Invalid request."}, 400);
    }
    bytes.set(value, length);
    length += value.length;
  }
  const code = new URLSearchParams(new TextDecoder().decode(bytes.subarray(0, length))).get("code")?.trim();
  if (!code || code.length > 64) return goHome(null, "1");
  if (!env.SESSION_SIGNING_KEY) return reply({error:"Sign-in is temporarily unavailable."}, 503);
  const key = await sessionKey(env.SESSION_SIGNING_KEY);
  if (!await allowSignIn(request, env.DB, key)) return goHome(null, "limited");
  const [accountant, member] = await Promise.all([
    matchingCode(code, roleCode(env, "accountant")), matchingCode(code, roleCode(env, "member"))
  ]);
  const role = accountant ? "accountant" : member ? "member" : null;
  if (!role) return goHome(null, "1");
  const token = await signedSession(role, code, key);
  return goHome(sessionCookie + "=" + token + "; Max-Age=" + sessionLifetime + "; " + cookieOptions);
}
