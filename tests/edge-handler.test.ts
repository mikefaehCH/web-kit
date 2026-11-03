// Verhaltenstests der Edge-Function-Logik (ohne Netzwerk, ohne echte WhatsApp-Nachricht).
// Ausführen: node --experimental-strip-types --test tests/edge-handler.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { handle, GROUP_ID, type Deps } from "../supabase/functions/web-kit-whatsapp-send/handler.ts";

const ORIGIN = "https://web-kit-admin.onrender.com";
const ADMIN = { id: "11111111-1111-4111-8111-111111111111", app_metadata: { web_kit_admin: true }, aal: "aal2" };
const KEY = "aaaaaaaa-0000-4000-8000-000000000001";
const JWT = "Bearer eyJhbGciOiJIUzI1NiJ9.test.signature";
const TOKEN = "secret-green-token-123";

type Call = { fn: string; args: Record<string, unknown> };

function setup(over: Partial<{
  user: typeof ADMIN | { id: string; app_metadata: Record<string, unknown>; aal?: string } | null;
  claim: { data: unknown; error: unknown };
  finishResult: { data: unknown; error: unknown };
  provider: () => Promise<Response>;
  env: Record<string, string | undefined>;
}> = {}) {
  const rpc: Call[] = [];
  const fetches: { url: string; body: unknown; redirect?: RequestRedirect }[] = [];
  const logs: string[] = [];
  const env: Record<string, string | undefined> = { GREEN_API_TOKEN: TOKEN, WEB_KIT_ADMIN_ORIGIN: ORIGIN, ...over.env };
  const deps: Deps = {
    env: (n) => env[n],
    getUser: async () => (over.user === undefined ? ADMIN : over.user),
    serviceRpc: async (fn, args) => {
      rpc.push({ fn, args });
      if (fn === "web_kit_whatsapp_claim") return over.claim ?? { data: true, error: null };
      return over.finishResult ?? { data: true, error: null };
    },
    fetch: (async (url: string, init: RequestInit) => {
      fetches.push({ url, body: init.body ? JSON.parse(String(init.body)) : null, redirect: init.redirect });
      return over.provider ? over.provider() : new Response(JSON.stringify({ idMessage: "BAE5F4886AD4B04E" }), { status: 200 });
    }) as unknown as typeof fetch,
    log: (event, fields) => logs.push(JSON.stringify({ event, ...fields })),
  };
  return { deps, rpc, fetches, logs };
}

function req(body: unknown, headers: Record<string, string> = {}, method = "POST") {
  return new Request("https://x.supabase.co/functions/v1/web-kit-whatsapp-send", {
    method,
    headers: { "content-type": "application/json", origin: ORIGIN, authorization: JWT, ...headers },
    body: method === "POST" ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined,
  });
}

const ok = { message: "  Hallo Camino  ", requestKey: KEY };

test("legitimer Admin-Versand: claim, fixe Gruppe, finish accepted via service_role", async () => {
  const t = setup();
  const res = await handle(req(ok), t.deps);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.status, "accepted");
  assert.equal(t.fetches.length, 1);
  assert.deepEqual(t.fetches[0].body, { chatId: GROUP_ID, message: "Hallo Camino" });
  assert.deepEqual(t.rpc.map((c) => c.fn), ["web_kit_whatsapp_claim", "web_kit_whatsapp_finish"]);
  assert.equal(t.rpc[0].args.p_actor, ADMIN.id);
  assert.match(String(t.rpc[0].args.p_hash), /^[0-9a-f]{64}$/);
  assert.deepEqual(t.rpc[1].args, { p_actor: ADMIN.id, p_key: KEY, p_status: "accepted", p_provider_id: "BAE5F4886AD4B04E" });
});

test("Browser kann keinen Empfänger bestimmen", async () => {
  const t = setup();
  await handle(req({ ...ok, chatId: "4179000000@c.us", recipient: "x" }), t.deps);
  assert.equal(t.fetches[0].body && (t.fetches[0].body as { chatId: string }).chatId, GROUP_ID);
});

test("ohne JWT 401, ohne Versand und ohne DB-Zugriff", async () => {
  const t = setup();
  const res = await handle(req(ok, { authorization: "" }), t.deps);
  assert.equal(res.status, 401);
  assert.equal(t.fetches.length + t.rpc.length, 0);
});

test("ungültige oder abgelaufene Session 401", async () => {
  const t = setup({ user: null });
  assert.equal((await handle(req(ok), t.deps)).status, 401);
  assert.equal(t.fetches.length + t.rpc.length, 0);
});

test("Nicht-Admin 403, auch mit user_metadata-Flag", async () => {
  for (const user of [
    { id: ADMIN.id, app_metadata: {} },
    { id: ADMIN.id, app_metadata: { web_kit_admin: "true" } },
  ]) {
    const t = setup({ user });
    assert.equal((await handle(req(ok), t.deps)).status, 403);
    assert.equal(t.fetches.length + t.rpc.length, 0);
  }
});

test("Admin ohne verifizierte MFA (AAL1) wird vor Datenbank und Provider abgewiesen", async () => {
  const t = setup({ user: { id: ADMIN.id, app_metadata: { web_kit_admin: true }, aal: "aal1" } });
  const res = await handle(req(ok), t.deps);
  assert.equal(res.status, 403);
  assert.equal((await res.json()).error, "Second factor required");
  assert.equal(t.fetches.length + t.rpc.length, 0);
});

test("fremde Origin 403, OPTIONS 204, GET 405", async () => {
  const t = setup();
  assert.equal((await handle(req(ok, { origin: "https://evil.example" }), t.deps)).status, 403);
  const pre = await handle(req(null, {}, "OPTIONS"), t.deps);
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get("access-control-allow-origin"), ORIGIN);
  assert.equal((await handle(req(null, {}, "GET"), t.deps)).status, 405);
  assert.equal(t.fetches.length, 0);
});

test("Eingabevalidierung 400", async () => {
  const cases: unknown[] = [
    "{kaputt", [], { requestKey: KEY }, { message: "   ", requestKey: KEY },
    { message: "x".repeat(4001), requestKey: KEY }, { message: "hi" },
    { message: "hi", requestKey: "not-a-uuid" }, { message: 42, requestKey: KEY },
  ];
  for (const c of cases) {
    const t = setup();
    const res = await handle(req(c), t.deps);
    assert.equal(res.status, 400, JSON.stringify(c).slice(0, 40));
    assert.equal(t.fetches.length + t.rpc.length, 0);
  }
});

test("fehlendes GREEN-API-Secret 503 erst nach Auth", async () => {
  const anon = setup({ env: { GREEN_API_TOKEN: undefined } });
  assert.equal((await handle(req(ok, { authorization: "" }), anon.deps)).status, 401);
  const t = setup({ env: { GREEN_API_TOKEN: undefined } });
  assert.equal((await handle(req(ok), t.deps)).status, 503);
  assert.equal(t.fetches.length, 0);
});

test("Duplikat oder Rate-Limit (claim=false) 429 ohne Versand", async () => {
  const t = setup({ claim: { data: false, error: null } });
  assert.equal((await handle(req(ok), t.deps)).status, 429);
  assert.equal(t.fetches.length, 0);
});

test("Versandkontrolle nicht verfügbar 503, fail-closed", async () => {
  const t = setup({ claim: { data: null, error: { code: "42501" } } });
  assert.equal((await handle(req(ok), t.deps)).status, 503);
  assert.equal(t.fetches.length, 0);
});

test("Provider-Timeout: Status unknown, 504, kein automatischer Neuversand", async () => {
  const t = setup({ provider: () => Promise.reject(new DOMException("timeout", "TimeoutError")) });
  const res = await handle(req(ok), t.deps);
  assert.equal(res.status, 504);
  assert.equal((await res.json()).status, "unknown");
  assert.equal(t.fetches.length, 1);
  assert.equal(t.rpc[1].args.p_status, "unknown");
});

test("Provider 4xx failed, 5xx unknown, 2xx ohne gültige ID unknown", async () => {
  const a = setup({ provider: async () => new Response("no", { status: 401 }) });
  assert.equal((await handle(req(ok), a.deps)).status, 502);
  assert.equal(a.rpc[1].args.p_status, "failed");
  const b = setup({ provider: async () => new Response("err", { status: 500 }) });
  assert.equal((await handle(req(ok), b.deps)).status, 504);
  assert.equal(b.rpc[1].args.p_status, "unknown");
  for (const payload of ["{}", "kein json", JSON.stringify({ idMessage: "<script>" })]) {
    const c = setup({ provider: async () => new Response(payload, { status: 200 }) });
    assert.equal((await handle(req(ok), c.deps)).status, 504);
    assert.equal(c.rpc[1].args.p_status, "unknown");
  }
});

test("finish nicht protokolliert: trotz Provider-Annahme kein Erfolg und kein automatischer Neuversand", async () => {
  const t = setup({ finishResult: { data: false, error: null } });
  const res = await handle(req(ok), t.deps);
  assert.equal(res.status, 504);
  const body = await res.json();
  assert.equal(body.ok, undefined);
  assert.equal(body.status, "unknown");
  assert.equal(t.fetches.length, 1);
  assert.ok(t.logs.some((l) => l.includes("dispatch_finish_not_recorded")));
  assert.ok(t.logs.some((l) => l.includes("dispatch_audit_unconfirmed") && l.includes("BAE5F4886AD4B04E")), "Provider-ID für Abgleich geloggt");
});

test("keine Secrets oder Nachrichtentexte in Antworten und Logs", async () => {
  for (const provider of [
    undefined,
    () => Promise.reject(new Error("boom " + TOKEN)),
    async () => new Response("bad " + TOKEN, { status: 400 }),
  ]) {
    const t = setup(provider ? { provider } : {});
    const res = await handle(req({ message: "Geheimer Inhalt", requestKey: KEY }), t.deps);
    const text = await res.text();
    for (const out of [text, ...t.logs]) {
      assert.ok(!out.includes(TOKEN), "Token geleakt");
      assert.ok(!out.includes("Geheimer Inhalt"), "Nachricht geleakt");
      assert.ok(!out.includes(JWT.slice(7)), "JWT geleakt");
      assert.ok(!out.includes(ADMIN.id), "User-ID im Log");
    }
  }
});


test("fehlende oder ungueltige Admin-Origin blockiert alle Requests ohne Versand", async () => {
  for (const value of [
    undefined,
    "",
    "http://insecure.example",
    "https://example.com/path",
    "https://example.com/",
    "https://example.com?query=1",
    "https://user@example.com",
    "https://example.com:443",
    "https://example.com:8443",
    "https://..example.com",
    "https://example..com",
    "https://-bad.example.com",
    "https://bad-.example.com",
    " https://example.com",
    "https://EXAMPLE.com",
  ]) {
    const t = setup({ env: { WEB_KIT_ADMIN_ORIGIN: value } });
    const res = await handle(req(ok), t.deps);
    assert.equal(res.status, 503);
    assert.equal(t.fetches.length + t.rpc.length, 0);
    assert.equal(res.headers.get("access-control-allow-origin"), "null");
  }
});

test("fehlender Origin-Header wird abgewiesen", async () => {
  const t = setup();
  const request = new Request("https://x.supabase.co/functions/v1/web-kit-whatsapp-send", {
    method: "POST", headers: { authorization: JWT, "content-type": "application/json" }, body: JSON.stringify(ok),
  });
  assert.equal((await handle(request, t.deps)).status, 403);
  assert.equal(t.fetches.length + t.rpc.length, 0);
});


test("Kontaktabruf benötigt Admin und AAL2 und versendet keine Nachricht", async () => {
  for (const user of [null, { id: ADMIN.id, app_metadata: {}, aal: "aal2" }, { ...ADMIN, aal: "aal1" }]) {
    const t = setup({ user });
    assert.ok([401, 403].includes((await handle(req({ action: "list_contacts" }), t.deps)).status));
    assert.equal(t.fetches.length, 0);
  }
  const t = setup({ provider: async () => new Response(JSON.stringify([
    { id: "41790000000@c.us", type: "user", name: "Profil", contactName: "Kontakt", phone: "secret" },
    { id: "120363123456789000@g.us", type: "group", name: "Gruppe" },
    { id: "41790000000@c.us", type: "user", name: "Duplikat" },
    { id: "attacker@c.us", type: "user", name: "Ungültig" },
  ])) });
  const response = await handle(req({ action: "list_contacts" }), t.deps);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { contacts: [
    { id: "41790000000@c.us", name: "Kontakt", type: "user" },
    { id: "120363123456789000@g.us", name: "Gruppe", type: "group" },
  ], incomplete: true });
  assert.match(t.fetches[0].url, /\/getContacts\//);
  assert.equal(t.fetches[0].body, null);
  assert.equal(t.fetches[0].redirect, "error");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(t.rpc.length, 0);
  assert.equal(t.logs.length, 0);
});

test("Kontaktabruf meldet Providerfehler ohne sensible Details", async () => {
  for (const provider of [async () => { throw Error(TOKEN); }, async () => new Response("bad", { status: 500 }), async () => new Response("bad")]) {
    const t = setup({ provider });
    const res = await handle(req({ action: "list_contacts" }), t.deps);
    assert.equal(res.status, 502);
    assert.ok(!(await res.text()).includes(TOKEN));
  }
});


test("ausgewählter Kontakt oder Gruppe wird nur mit expliziter Aktion gesendet", async () => {
  for (const destination of ["41790000000@c.us", "120363123456789000@g.us", "79001234567-1479621234@g.us"]) {
    const t=setup();
    const res=await handle(req({ ...ok, action: "send_selected", chatId: destination }),t.deps);
    assert.equal(res.status,200);
    assert.deepEqual(t.fetches[0].body,{chatId:destination,message:"Hallo Camino"});
    assert.equal(t.rpc[0].fn,"web_kit_whatsapp_claim");
    assert.equal(t.rpc[1].args.p_status,"accepted");
  }
});

test("ungültige Empfänger und unbekannte Aktion werden vor Claim und Versand blockiert", async () => {
  for (const chatId of ["bad@c.us", "x@example.com", "123456@c.us/evil", null, 42]) {
    const t=setup();
    assert.equal((await handle(req({ ...ok, action:"send_selected", chatId }),t.deps)).status,400);
    assert.equal(t.rpc.length+t.fetches.length,0);
  }
  const t=setup();
  assert.equal((await handle(req({ ...ok, action:"unknown", chatId:"41790000000@c.us" }),t.deps)).status,400);
  assert.equal(t.rpc.length+t.fetches.length,0);
});

test("Empfänger ist Bestandteil des Audit-Hashes", async () => {
  const a=setup(), b=setup();
  await handle(req({...ok,action:"send_selected",chatId:"41790000000@c.us"}),a.deps);
  await handle(req({...ok,action:"send_selected",chatId:"41790000001@c.us"}),b.deps);
  assert.notEqual(a.rpc[0].args.p_hash,b.rpc[0].args.p_hash);
});
