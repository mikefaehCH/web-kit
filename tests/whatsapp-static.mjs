import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html=readFileSync(new URL('../admin/whatsapp.html',import.meta.url),'utf8');
const js=readFileSync(new URL('../admin/whatsapp.js',import.meta.url),'utf8');
const auth=readFileSync(new URL('../admin/auth.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../admin/whatsapp.css',import.meta.url),'utf8');
const edgeIndex=readFileSync(new URL('../supabase/functions/web-kit-whatsapp-send/index.ts',import.meta.url),'utf8');
const edge=readFileSync(new URL('../supabase/functions/web-kit-whatsapp-send/handler.ts',import.meta.url),'utf8');
const hardening=readFileSync(new URL('../supabase/migrations/20261102061405_web_kit_whatsapp_service_role_only.sql',import.meta.url),'utf8');
assert.match(html,/id="message"/);
assert.match(html,/id="review"/);
assert.match(html,/maxlength="4000"/);
assert.match(js,/review.hidden/);
assert.match(js,/Authorization:'Bearer '/);
assert.doesNotMatch(js,/GREEN_API_TOKEN|waInstance/);
assert.match(edge,/app_metadata\?\.web_kit_admin/);
assert.match(edge,/GROUP_ID = "120363431174972238@g.us"/);
console.log('WhatsApp static checks passed');

assert.match(html,/id="login-panel"/);
assert.match(html,/id="workspace" hidden/);
assert.ok(css.includes("[hidden]{display:none!important}"));
assert.match(auth,/shouldCreateUser:false/);
assert.match(auth,/app_metadata\?\.web_kit_admin/);
assert.match(js,/approvedMessage/);
assert.match(js,/requestKey/);
assert.match(edge,/web_kit_whatsapp_claim/);
assert.match(edge,/web_kit_whatsapp_finish/);

// Befund A: Versandkontrolle nur über service_role, nie mit dem Benutzer-JWT.
assert.match(edgeIndex,/SUPABASE_SERVICE_ROLE_KEY/);
assert.doesNotMatch(edgeIndex,/headers:\s*\{\s*Authorization/);
assert.doesNotMatch(edge,/SERVICE_ROLE/);
assert.match(hardening,/revoke all on function public\.web_kit_whatsapp_finish\(uuid, uuid, text, text\) from public, anon, authenticated/);
assert.match(hardening,/revoke all on function public\.web_kit_whatsapp_claim\(uuid, uuid, text\) from public, anon, authenticated/);
assert.doesNotMatch(hardening,/grant execute[^;]*to authenticated/);
assert.doesNotMatch(hardening,/create policy/i);
assert.doesNotMatch(js+auth+html,/service_role|sb_secret_|GREEN_API/);
console.log('Security static checks passed');

// Migrationsdateien müssen den in Supabase angewendeten Versionen entsprechen (sonst würde `supabase db push` sie erneut ausführen).
import { readdirSync } from 'node:fs';
const migrations=readdirSync(new URL('../supabase/migrations/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort();
assert.deepEqual(migrations,[
  '20261102053907_web_kit_whatsapp_dispatch_control.sql',
  '20261102053911_web_kit_whatsapp_dispatch_finish.sql',
  '20261102061405_web_kit_whatsapp_service_role_only.sql',
]);
// Autonomer Runner: exakter HEAD, aktueller main-Basisstand, Opt-in und normale Merge-API.
// GitHub selbst erzwingt konfigurierte Reviews und Pflichtchecks; der Runner nutzt keinen Bypass.
const runner=readFileSync(new URL('../.github/workflows/autonomous-merge.yml',import.meta.url),'utf8');
assert.match(runner,/\.head\.sha==\$sha/);
assert.match(runner,/\.base\.ref=="main"/);
assert.match(runner,/\.head\.repo\.full_name==\.base\.repo\.full_name/);
assert.match(runner,/Autonomy-Release: true/);
assert.match(runner,/pulls\/\$pr\/merge/);
assert.match(runner,/merge_method=squash/);
assert.match(runner,/sha="\$RUN_SHA"/);
assert.doesNotMatch(runner,/--admin|--force|bypass/i);
console.log('Release and migration checks passed');

// Current Render, local SDK and PKCE assertions from main.
// Isoliertes Admin-Hosting: Security-Header und PKCE muessen in PR-CI geprueft werden.
const render=readFileSync(new URL('../render.yaml',import.meta.url),'utf8');
const sdkPackage=JSON.parse(readFileSync(new URL('../admin/package.json',import.meta.url),'utf8'));
const sdkLock=JSON.parse(readFileSync(new URL('../admin/package-lock.json',import.meta.url),'utf8'));
assert.match(render,/name: Strict-Transport-Security/);
assert.match(render,/max-age=31536000/);
assert.match(render,/name: Content-Security-Policy/);
assert.match(render,/frame-ancestors 'none'/);
assert.match(render,/name: Cache-Control/);
assert.match(render,/value: no-store/);
assert.match(render,/script-src 'self';/);
assert.doesNotMatch(render,/esm\.sh/);
assert.match(auth,/from '\.\/vendor\/supabase\.js'/);
assert.doesNotMatch(auth,/https:\/\/esm\.sh/);
assert.equal(sdkPackage.dependencies['@supabase/supabase-js'],'2.118.0');
assert.equal(sdkLock.packages['node_modules/@supabase/supabase-js'].version,'2.118.0');
assert.match(render,/staticPublishPath: \.\/admin\/dist/);
assert.match(auth,/flowType:'pkce'/);
console.log('Render headers, local SDK and PKCE checks passed');
