# Web-Kit WhatsApp sender

This function is not deployed by this PR. Deploy after independent review and confirmation of server-side admin roles.

Required Supabase Edge Function secrets: GREEN_API_TOKEN, GREEN_API_INSTANCE_ID, GREEN_API_HOST, WEB_KIT_ADMIN_ORIGIN. Never commit secrets.

The caller must be a valid Supabase user with trusted app_metadata.web_kit_admin === true. The browser supplies only the message; the destination group is fixed server-side.

Before production: add durable per-admin rate limiting, delivery audit and idempotency, test non-admin 403, missing secrets 503, invalid body 400 and authorized test send. Provider acceptance does not guarantee delivery.
