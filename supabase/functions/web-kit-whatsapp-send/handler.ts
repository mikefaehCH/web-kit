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

export type AdminUser = { id: string; app_metadata?: Record<string, unknown> | null };
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

export function corsHeaders(env: Deps["env"]): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": env("WEB_KIT_ADMIN_ORIGIN") || "https://mikefaehch.github.io",
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
  const cors = corsHeaders(deps.env);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  const origin = req.headers.get("origin");
  if (origin && origin !== cors["Access-Control-Allow-Origin"]) return json({ error: "Origin not allowed" }, 403);
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
  const { message, requestKey } = body as { message?: unknown; requestKey?: unknown };
  // Empfänger werden bewusst nicht gelesen: Die Gruppe ist serverseitig fixiert.
  if (typeof message !== "string" || !message.trim() || message.length > MAX_LENGTH) {
    return json({ error: "Message must be 1–4000 characters" }, 400);
  }
  if (typeof requestKey !== "string" || !UUID_V4.test(requestKey)) return json({ error: "Invalid request key" }, 400);

  const text = message.trim();
  const key = requestKey.toLowerCase();
  const hash = await sha256Hex(text);
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
        body: JSON.stringify({ chatId: GROUP_ID, message: text }),
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
    // Provider-ID loggen (kein Personenbezug), damit der Versand nachträglich abgeglichen werden kann.
    deps.log("dispatch_audit_unconfirmed", { ref, providerId });
    return json({ error: "Message accepted by provider but audit status unconfirmed; check the group and contact administrator before retrying", status: "unknown" }, 504);
  }
  deps.log("dispatch_accepted", { ref });
  return json({ ok: true, status: "accepted", idMessage: providerId });
}
