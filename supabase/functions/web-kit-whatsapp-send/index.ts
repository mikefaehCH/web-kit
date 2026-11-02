// Supabase Edge Function: manueller WhatsApp-Versand an die Camino-Gruppe, fail-closed.
// Die Logik liegt in handler.ts (testbar), hier nur die Verdrahtung.
import { createClient } from "npm:@supabase/supabase-js@2.57.0";
import { handle, type Deps } from "./handler.ts";

const url = Deno.env.get("SUPABASE_URL");
const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
// Wird von Supabase automatisch bereitgestellt. Verlässt diese Funktion nie.
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const authClient = url && anonKey ? createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
const serviceClient = url && serviceKey
  ? createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;

const deps: Deps = {
  env: (name) => Deno.env.get(name),
  getUser: async (jwt) => {
    if (!authClient) return null;
    const { data, error } = await authClient.auth.getUser(jwt);
    return error || !data.user ? null : { id: data.user.id, app_metadata: data.user.app_metadata };
  },
  serviceRpc: async (fn, args) => {
    if (!serviceClient) return { data: null, error: "service client not configured" };
    const { data, error } = await serviceClient.rpc(fn, args);
    return { data, error };
  },
  fetch: (input, init) => fetch(input, init),
  log: (event, fields = {}) => console.log(JSON.stringify({ fn: "web-kit-whatsapp-send", event, ...fields })),
};

Deno.serve((req) => handle(req, deps));
