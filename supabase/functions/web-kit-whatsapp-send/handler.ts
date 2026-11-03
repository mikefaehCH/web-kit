// Versandlogik der Edge Function web-kit-whatsapp-send, ohne Plattform-Imports und damit testbar.
// index.ts verdrahtet die echten Abhängigkeiten (Supabase-Clients, fetch, Deno.env).
//
// Ablauf: Origin -> JWT -> Admin (app_metadata) -> Eingabe -> claim (service_role, atomar,
// Idempotenz + Rate-Limit) -> GREEN-API an fest konfigurierte Gruppe -> finish (service_role).

export const GROUP_ID = "120363431174972238@g.us";
export const MAX_LENGTH = 4000;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROVIDER_ID = /^[A-Za-z0-9._:@-]{1,128}$/;
const PROVIDER_TIMEOUT_MS = 12000;

export type AdminUser = { id: string; aal?: string | null; app_metadata?: Record<string, unknown> | null };
export type RpcResult = { data: unknown; error: unknown };
export type DispatchStatus = "accepted" | "failed" | "unknown";

export type Deps = {
  env: (name: string) => string | undefined;
  /** Prüft das Benutzer-JWT bei Supabase Auth. null = ungültig/abgelaufen. */
  getUser: (jwt: string) => Promise<AdminUser | null>;
  /** RPC mit service_role (nur dieser Dienst darf claim/finish ausführen). */
  serviceRpc: (fn: string, args: Record<string, unknown>) => Promise<RpcResult>;
  fetch: typeof fetch;
  /** Strukturierte Logs ohne Nachrichtentext, Token oder JWT. */
  log: (event: string, fields?: Record<string, unknown>) => void;
};

function validAdminOrigin(value: string | undefined): string | null {
  if (!value || value.trim() !== value) return null;
  try {
    const url = new URL(value);
    const validHostname = url.hostname.length <= 253 && url.hostname.includes(".") &&
      url.hostname.split(".").every((label) =>
        label.length > 0 && label.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label)
      );
    if (
      url.protocol !== "https:" || url.username || url.password || url.port ||
      url.pathname !== "/" || url.search || url.hash || url.origin !== value || !validHostname
    ) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function corsHeaders(env: Deps["env"]): Record<string, string> {
  const origin = validAdminOrigin(env("WEB_KIT_ADMIN_ORIGIN"));
  return {
    "Access-Control-Allow-Origin": origin || "null",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function handle(req: Request, deps: Deps): Promise<Response> {
  const configuredOrigin = validAdminOrigin(deps.env("WEB_KIT_ADMIN_ORIGIN"));
  const cors = corsHeaders(deps.env);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });

  const origin = req.headers.get("origin");
  if (!configuredOrigin) return json({ error: "Admin origin not configured" }, 503);
  if (!origin || origin !== configuredOrigin) return json({ error: "Origin not allowed" }, 403);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ") || auth.length < 20) return json({ error: "Authentication required" }, 401);

  let user: AdminUser | null = null;
  try {
    user = await deps.getUser(auth.slice(7));
  } catch {
    user = null;
  }
  if (!user || typeof user.id !== "string") return json({ error: "Invalid session" }, 401);
  // Admin-Recht nur über vertrauenswürdige app_metadata, nie über user_metadata.
  if (user.app_metadata?.web_kit_admin !== true) return json({ error: "Admin access required" }, 403);
  // Die Oberfläche fordert TOTP an; diese serverseitige Prüfung verhindert den direkten AAL1-Aufruf.
  if (user.aal !== "aal2") return json({ error: "Second factor required" }, 403);

  const apiToken = deps.env("GREEN_API_TOKEN");
  const instance = deps.env("GREEN_API_INSTANCE_ID") || "710722787774";
  const host = deps.env("GREEN_API_HOST") || "https://7107.api.greenapi.com";
  if (!apiToken || !/^[0-9]{6,20}$/.test(instance) || !/^https:\/\/[a-z0-9.-]+$/.test(host)) {
    return json({ error: "Messaging not configured" }, 503);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Invalid JSON" }, 400);
  // Nur explizit auf Anforderung eines MFA-geschützten Admins. Keine Kontaktdaten in Logs.
  if ((body as { action?: unknown }).action === "list_contacts") {
    let response: Response;
    try {
      response = await deps.fetch(
        host + "/waInstance" + encodeURIComponent(instance) + "/getContacts/" + encodeURIComponent(apiToken),
        { method: "GET", redirect: "error", signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS) },
      );
    } catch {
      return json({ error: "Contacts temporarily unavailable" }, 502);
    }
    if (!response.ok) return json({ error: "Contacts temporarily unavailable" }, 502);
    let contacts: unknown;
    try { contacts = await response.json(); } catch { return json({ error: "Invalid contacts response" }, 502); }
    if (!Array.isArray(contacts) || contacts.length > 10000) return json({ error: "Invalid contacts response" }, 502);
    const seen = new Set<string>();
    const result: { id: string; name: string; type: string }[] = [];
    for (const entry of contacts) {
      if (!entry || typeof entry !== "object") continue;
      const { id, type, name, contactName } = entry as Record<string, unknown>;
      if (typeof id !== "string" || typeof type !== "string") continue;
      if (!(type === "user" && /^[0-9]{6,20}@c\.us$/.test(id)) &&
          !(type === "group" && /^[0-9]{6,24}(?:-[0-9]{1,20})?@g\.us$/.test(id))) continue;
      if (seen.has(id)) continue;
      seen.add(id);
      const label = typeof contactName === "string" && contactName.trim() ? contactName : name;
      result.push({ id, type, name: typeof label === "string" ? label.trim().slice(0, 120) : "" });
    }
    return json({ contacts: result, incomplete: result.length !== contacts.length });
  }
  const { message, requestKey, action, chatId } = body as { message?: unknown; requestKey?: unknown; action?: unknown; chatId?: unknown };
  // Legacy-Aufrufe bleiben auf Camino beschränkt. Neue Empfänger nur nach expliziter Aktion.
  let destination = GROUP_ID;
  if (action === "send_selected") {
    if (typeof chatId !== "string" || !(/^[0-9]{6,20}@c\.us$/.test(chatId) || /^[0-9]{6,24}(?:-[0-9]{1,20})?@g\.us$/.test(chatId))) {
      return json({ error: "Invalid recipient" }, 400);
    }
    destination = chatId;
  } else if (action !== undefined) {
    return json({ error: "Invalid action" }, 400);
  }
  if (typeof message !== "string" || !message.trim() || message.length > MAX_LENGTH) {
    return json({ error: "Message must be 1–4000 characters" }, 400);
  }
  if (typeof requestKey !== "string" || !UUID_V4.test(requestKey)) return json({ error: "Invalid request key" }, 400);

  const text = message.trim();
  const key = requestKey.toLowerCase();
  const hash = await sha256Hex(action === "send_selected" ? JSON.stringify([destination, text]) : text);
  const ref = key.slice(0, 8); // Log-Referenz ohne Personenbezug

  let claim: RpcResult;
  try {
    claim = await deps.serviceRpc("web_kit_whatsapp_claim", { p_actor: user.id, p_key: key, p_hash: hash });
  } catch {
    claim = { data: null, error: true };
  }
  if (claim.error) {
    deps.log("dispatch_claim_error", { ref });
    return json({ error: "Dispatch control unavailable" }, 503);
  }
  if (claim.data !== true) return json({ error: "Duplicate request or rate limit exceeded" }, 429);

  const actor = user.id;
  const finish = async (status: DispatchStatus, providerId: string | null = null): Promise<boolean> => {
    try {
      const res = await deps.serviceRpc("web_kit_whatsapp_finish", {
        p_actor: actor, p_key: key, p_status: status, p_provider_id: providerId,
      });
      if (res.error || res.data !== true) {
        deps.log("dispatch_finish_not_recorded", { ref, status });
        return false;
      }
      return true;
    } catch {
      deps.log("dispatch_finish_not_recorded", { ref, status });
      return false;
    }
  };

  let upstream: Response;
  try {
    upstream = await deps.fetch(
      host + "/waInstance" + encodeURIComponent(instance) + "/sendMessage/" + encodeURIComponent(apiToken),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId: destination, message: text }),
        signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
      },
    );
  } catch {
    // Timeout/Netzwerkfehler: Die Nachricht kann trotzdem angekommen sein. Nie automatisch wiederholen.
    await finish("unknown");
    deps.log("dispatch_provider_unreachable", { ref });
    return json({ error: "Delivery status unknown; check the group before sending again", status: "unknown" }, 504);
  }

  if (upstream.status >= 400 && upstream.status < 500) {
    await finish("failed");
    deps.log("dispatch_provider_rejected", { ref, http: upstream.status });
    return json({ error: "Messaging provider rejected request", status: "failed" }, 502);
  }
  if (!upstream.ok) {
    await finish("unknown");
    deps.log("dispatch_provider_error", { ref, http: upstream.status });
    return json({ error: "Delivery status unknown; check the group before sending again", status: "unknown" }, 504);
  }

  const result = await upstream.json().catch(() => null) as { idMessage?: unknown } | null;
  const providerId = result && typeof result.idMessage === "string" && PROVIDER_ID.test(result.idMessage)
    ? result.idMessage
    : null;
  if (!providerId) {
    await finish("unknown");
    deps.log("dispatch_provider_unconfirmed", { ref });
    return json({ error: "Delivery status unknown; check the group before sending again", status: "unknown" }, 504);
  }

  const recorded = await finish("accepted", providerId);
  if (!recorded) {
    // Provider accepted the message, but audit confirmation failed: never claim a fully successful dispatch.
    deps.log("dispatch_audit_unconfirmed", { ref, providerId });
    return json({ error: "Message accepted by provider but audit status unconfirmed; check the group and contact administrator before retrying", status: "unknown" }, 504);
  }
  deps.log("dispatch_accepted", { ref });
  return json({ ok: true, status: "accepted", idMessage: providerId });
}
