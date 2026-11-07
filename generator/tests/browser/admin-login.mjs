import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium, webkit } = await import(process.env.PLAYWRIGHT_CORE_MODULE || 'playwright-core');
const admin = fileURLToPath(new URL('../../../admin/', import.meta.url));
const dist = resolve(admin, 'dist');
execFileSync(process.execPath, [resolve(admin, 'build-static.mjs')]);

// Substitute the Auth SDK at the browser boundary. No credentials, messages or
// requests reach production, while the shipped HTML, CSS and auth logic run as built.
const authFixture = `
  const admin = { email: 'admin@example.test', app_metadata: { web_kit_admin: true } };
  const factor = { id: 'totp', status: 'verified' };
  const state = window.authFixture = { user: null, level: 'aal1', factors: [factor], signOutScopes: [] };
  let onAuthStateChange;
  const ok = data => ({ data, error: null });
  const fail = code => ({ error: { code } });
  const signOut = () => {
    state.user = null;
    state.level = 'aal1';
    onAuthStateChange('SIGNED_OUT');
  };
  state.recover = () => {
    state.user = admin;
    onAuthStateChange('PASSWORD_RECOVERY');
  };
  state.expire = signOut;
  export function createClient() {
    return { auth: {
      onAuthStateChange(callback) { onAuthStateChange = callback; },
      getUser: async () => ok({ user: state.user }),
      getSession: async () => ok({ session: null }),
      async signInWithPassword({ email, password }) {
        if (password !== 'synthetic-password') return fail('invalid_credentials');
        state.user = email === admin.email ? admin : { email, app_metadata: {} };
        onAuthStateChange('SIGNED_IN');
        return ok();
      },
      async signOut({ scope }) {
        state.signOutScopes.push(scope);
        if (state.signOutFails) return fail('unexpected_failure');
        signOut();
        return ok();
      },
      async resetPasswordForEmail(email) { state.resetRequestedFor = email; return ok(); },
      async updateUser({ password }) { state.newPassword = password; return ok(); },
      mfa: {
        listFactors: async () => state.factorCheckFails ? fail('unexpected_failure') : ok({ totp: state.factors }),
        getAuthenticatorAssuranceLevel: async () => ok({ currentLevel: state.level, nextLevel: 'aal2' }),
        async enroll() {
          return ok({ id: factor.id, totp: { secret: 'FAKESECRET', qr_code: '<svg xmlns="http://www.w3.org/2000/svg"></svg>' } });
        },
        async unenroll() { return ok(); },
        async challenge() { return state.sessionExpired ? fail('session_expired') : ok({ id: 'challenge' }); },
        async verify({ code }) {
          if (code !== '001234') return fail('mfa_verification_failed');
          state.level = 'aal2';
          state.factors = [factor];
          onAuthStateChange('MFA_CHALLENGE_VERIFIED');
          return ok();
        },
      },
    } };
  }
`;

const engine = process.env.ADMIN_TEST_BROWSER === 'webkit' ? webkit : chromium;
const browser = await engine.launch(engine === chromium ? {
  executablePath: process.env.CHROMIUM_EXECUTABLE,
  args: ['--no-sandbox'],
} : {});

try {
  for (const width of [390, 1280]) {
    const context = await browser.newContext({
      viewport: { width, height: 844 }, isMobile: width === 390, hasTouch: width === 390,
    });
    context.setDefaultTimeout(6000);
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== 'http://localhost') return route.abort();
      if (url.pathname === '/vendor/supabase.js') {
        return route.fulfill({ contentType: 'text/javascript', body: authFixture });
      }
      const file = resolve(dist, '.' + url.pathname);
      if (!file.startsWith(dist + sep) || !existsSync(file)) return route.fulfill({ status: 404 });
      return route.fulfill({ path: file });
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://localhost/whatsapp.html');
    await page.waitForFunction(() => window.authFixture);
    const email = page.locator('#email');
    const password = page.locator('#password');
    const code = page.locator('#mfa-code');
    const login = page.locator('#login-form');
    const reset = page.locator('#reset-password');
    const workspace = page.locator('#workspace');
    const switchAccount = page.getByRole('button', { name: 'Konto wechseln' });
    const signIn = async (value = 'synthetic-password', address = 'admin@example.test') => {
      await email.fill(address);
      await password.fill(value);
      await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
    };
    const expectPasswordStepHidden = async () => {
      await login.waitFor({ state: 'hidden' });
      assert.equal(await reset.isVisible(), false);
      assert.equal(await password.inputValue(), '');
      assert.equal(await workspace.isVisible(), false);
    };

    await signIn('wrong-password');
    await page.getByText('Anmeldung fehlgeschlagen.', { exact: false }).waitFor();
    assert.equal(await login.isVisible(), true);
    assert.equal(await password.inputValue(), '');

    await signIn('synthetic-password', 'visitor@example.test');
    await page.getByText('Dieses Konto ist nicht für die Administration berechtigt.').waitFor();
    assert.equal(await workspace.isVisible(), false);

    await signIn();
    await page.getByText('Passwort bestätigt.', { exact: false }).waitFor();
    await expectPasswordStepHidden();
    assert.equal(await code.evaluate(el => el === document.activeElement), true);
    assert.equal(await code.getAttribute('inputmode'), 'numeric');
    assert.equal(await code.getAttribute('autocomplete'), 'one-time-code');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);

    await code.fill('123456');
    await page.getByRole('button', { name: 'Code prüfen' }).click();
    await page.getByText('Der Code war ungültig', { exact: false }).waitFor();
    await expectPasswordStepHidden();
    assert.equal(await code.inputValue(), '');
    assert.equal(await code.evaluate(el => el === document.activeElement), true);

    await page.evaluate(() => { window.authFixture.signOutFails = true; });
    await switchAccount.click();
    await page.getByText('Der Kontowechsel konnte nicht abgeschlossen werden.', { exact: false }).waitFor();
    await expectPasswordStepHidden();
    await page.evaluate(() => { window.authFixture.signOutFails = false; });
    await switchAccount.click();
    await login.waitFor();
    assert.equal(await email.inputValue(), '');
    assert.equal(await page.evaluate(() => window.authFixture.signOutScopes.at(-1)), 'local');

    await signIn();
    await code.waitFor();
    await page.evaluate(() => { window.authFixture.sessionExpired = true; });
    await code.fill('001234');
    await page.getByRole('button', { name: 'Code prüfen' }).click();
    await page.getByText('Deine Anmeldesitzung ist abgelaufen', { exact: false }).waitFor();
    await login.waitFor();
    assert.equal(await workspace.isVisible(), false);
    await page.evaluate(() => {
      window.authFixture.expire();
      window.authFixture.sessionExpired = false;
      window.authFixture.factorCheckFails = true;
    });

    await signIn();
    await page.getByText('Der Sicherheitsstatus konnte nicht geprüft werden.', { exact: false }).waitFor();
    await expectPasswordStepHidden();
    await switchAccount.click();
    await login.waitFor();

    await page.evaluate(() => { window.authFixture.factorCheckFails = false; });
    await signIn();
    await code.fill('001234');
    await page.getByRole('button', { name: 'Code prüfen' }).click();
    await workspace.waitFor();
    await page.getByRole('button', { name: 'Abmelden' }).click();
    await login.waitFor();

    await page.evaluate(() => { window.authFixture.factors = []; });
    await signIn();
    const enroll = page.getByRole('button', { name: 'Authenticator einrichten' });
    await enroll.waitFor();
    await expectPasswordStepHidden();
    await enroll.click();
    await code.waitFor();
    await page.getByRole('button', { name: 'Einrichtung abbrechen' }).click();
    await enroll.waitFor();
    await expectPasswordStepHidden();
    assert.equal(await page.locator('#mfa-secret').textContent(), '');
    await enroll.click();
    await code.fill('001234');
    await page.getByRole('button', { name: 'Code prüfen' }).click();
    await workspace.waitFor();

    await page.getByRole('button', { name: 'Abmelden' }).click();
    await login.waitFor();
    await email.fill('admin@example.test');
    await reset.click();
    await page.waitForFunction(() => window.authFixture.resetRequestedFor === 'admin@example.test');
    await page.evaluate(() => window.authFixture.recover());
    await page.getByRole('heading', { name: 'Neues Passwort festlegen' }).waitFor();
    assert.equal(await login.isVisible(), false);
    assert.equal(await workspace.isVisible(), false);
    await page.locator('#new-password').fill('new-synthetic-password');
    await page.locator('#confirm-password').fill('new-synthetic-password');
    await page.getByRole('button', { name: 'Passwort speichern' }).click();
    await page.getByText('Passwort aktualisiert.', { exact: false }).waitFor();
    await login.waitFor();
    assert.equal(await page.evaluate(() => window.authFixture.newPassword), 'new-synthetic-password');
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`Admin login passed on ${engine.name()} at ${width}px`);
  }
} finally {
  await browser.close();
}
