import test from 'node:test';
import assert from 'node:assert/strict';
import { createProjectAuth } from '../modules/project-auth.js';
import { createSharedPlan } from '../modules/shared-plan.js';
// Ausschliesslich synthetische Testkonfiguration; keine Runtime-Beispielreise nötig.
const city = {
  id: 'test-trip',
  title: 'Test',
  description: 'Nur Tests',
  locale: 'de-CH',
  color: '#28594f',
  start: '2028-05-12',
  end: '2028-05-14',
  modules: { places: true, map: false, favorites: true, planning: true, offline: false },
  places: [
    {
      id: 'museum',
      name: 'Testort',
      category: 'Test',
      description: 'Nur Tests',
      coordinates: [0, 0],
    },
  ],
};

const PROJECT_A = '11111111-1111-4111-8111-111111111111';
const PROJECT_B = '22222222-2222-4222-8222-222222222222';
const entry = () => ({ placeId: 'museum', day: city.start });
const copy = (value) => structuredClone(value);
const code = (expected) => (error) => error.code === expected;
function harness({
  projectId = PROJECT_A,
  role = 'editor',
  userId = 'alice',
  providers = ['google', 'apple', 'azure'],
} = {}) {
  let user = userId ? { id: userId } : null;
  let listener;
  const calls = [];
  const members = new Map([
    [PROJECT_A + '/alice', role],
    [PROJECT_B + '/bob', 'editor'],
  ]);
  const rows = new Map();
  const options = {};
  const control = {
    authError: null,
    memberError: null,
    planError: null,
    oauthError: null,
    signoutError: null,
    afterRead: null,
    afterWrite: null,
    anonymous: false,
    afterUser: null,
    emailError: null,
  };
  const client = {
    auth: {
      getUser: async () => {
        const result = {
          data: { user: user ? { ...user, is_anonymous: control.anonymous } : null },
          error: control.authError,
        };
        control.afterUser?.();
        return result;
      },
      onAuthStateChange: (callback) => {
        listener = callback;
        return {
          data: { subscription: { unsubscribe: () => calls.push({ type: 'unsubscribe' }) } },
        };
      },
      signInWithOAuth: async (args) => {
        calls.push({ type: 'oauth', args });
        return { error: control.oauthError };
      },
      signInWithOtp: async (args) => {
        calls.push({ type: 'email', args });
        return { error: control.emailError };
      },
      signOut: async (args) => {
        calls.push({ type: 'signout', args });
        if (!control.signoutError) {
          user = null;
          listener('SIGNED_OUT');
        }
        return { error: control.signoutError };
      },
    },
    from(table) {
      let action = 'select',
        value;
      const filters = {};
      const builder = {
        select() {
          return builder;
        },
        eq(field, expected) {
          filters[field] = expected;
          return builder;
        },
        insert(data) {
          action = 'insert';
          value = copy(data);
          return builder;
        },
        update(data) {
          action = 'update';
          value = copy(data);
          return builder;
        },
        async maybeSingle() {
          calls.push({ table, action, filters: { ...filters }, value });
          if (table === 'travel_project_members') {
            assert.equal(filters.project_id, projectId, 'Membership query needs project filter');
            assert.equal(filters.user_id, user?.id, 'Membership query needs verified user filter');
            const memberRole = members.get(filters.project_id + '/' + filters.user_id);
            return {
              data: memberRole
                ? { project_id: filters.project_id, user_id: filters.user_id, role: memberRole }
                : null,
              error: control.memberError,
            };
          }
          assert.equal(table, 'travel_project_plans');
          if (control.planError) return { data: null, error: control.planError };
          if (action === 'select') {
            assert.equal(filters.project_id, projectId, 'Read needs project filter');
            const result = copy(rows.get(filters.project_id) || null);
            control.afterRead?.();
            return { data: result, error: null };
          }
          const currentRole = members.get(projectId + '/' + user?.id);
          if (currentRole !== 'editor') return { data: null, error: { code: '42501' } };
          if (action === 'insert') {
            assert.equal(value.project_id, projectId);
            if (rows.has(projectId)) return { data: null, error: { code: '23505' } };
            rows.set(projectId, copy(value));
          } else {
            assert.equal(filters.project_id, projectId, 'Write needs project filter');
            assert.ok(Number.isSafeInteger(filters.revision), 'Write needs revision filter');
            const existing = rows.get(projectId);
            if (!existing || existing.revision !== filters.revision)
              return { data: null, error: null };
            rows.set(projectId, { ...existing, ...copy(value) });
          }
          control.afterWrite?.();
          return { data: copy(rows.get(projectId)), error: null };
        },
      };
      return builder;
    },
  };
  const auth = createProjectAuth({
    url: 'https://example.supabase.co',
    publishableKey: 'sb_publishable_test',
    projectId,
    siteUrl: 'https://example.test/my-trip/',
    providers,
    clientFactory: (url, key, config) => {
      Object.assign(options, { url, key, config });
      return client;
    },
  });
  const plan = createSharedPlan({ auth, trip: city });
  const changeUser = (id) => {
    user = id ? { id } : null;
    listener('SIGNED_IN', user ? { user } : null);
  };
  const emit = (event) => listener(event, user ? { user } : null);
  return { auth, plan, client, options, calls, members, rows, control, changeUser, emit };
}

test('Auth: initial session and same-user refresh preserve loaded plans', async () => {
  const h = harness();
  h.control.afterUser = () => h.emit('INITIAL_SESSION');
  const loaded = await h.plan.load();
  h.control.afterUser = null;
  let changes = 0;
  h.auth.onChange(() => changes++);
  h.emit('SIGNED_IN');
  h.emit('TOKEN_REFRESHED');
  h.emit('USER_UPDATED');
  const saved = await h.plan.save(loaded, [entry()]);
  assert.equal(saved.revision, 1);
  assert.equal(changes, 0);
});

test('Auth: a switch during the first user verification rejects the old identity', async () => {
  const h = harness();
  h.control.afterUser = () => h.changeUser('bob');
  await assert.rejects(h.plan.load(), code('session_changed'));
});

test('Auth: sign-out then same-user sign-in invalidates the old snapshot', async () => {
  const h = harness();
  const loaded = await h.plan.load();
  h.emit('SIGNED_OUT');
  h.emit('SIGNED_IN');
  await assert.rejects(h.plan.save(loaded, []), code('stale_session'));
});

test('Auth: unknown email is neutral while rate-limit and network errors remain errors', async () => {
  const h = harness();
  const success = await h.auth.sendMagicLink('person@example.test');
  h.control.emailError = { code: 'otp_disabled', message: 'Signups not allowed for otp' };
  assert.equal(await h.auth.sendMagicLink('unknown@example.test'), success);
  for (const error of [{ code: 'over_email_send_rate_limit' }, { name: 'NetworkError' }]) {
    h.control.emailError = error;
    await assert.rejects(h.auth.sendMagicLink('person@example.test'), code('email_failed'));
  }
});

test('Auth: PKCE, fester Callback und isolierter Sitzungsschlüssel', () => {
  const a = harness();
  const b = harness({ projectId: PROJECT_B });
  assert.equal(a.options.config.auth.flowType, 'pkce');
  assert.notEqual(a.options.config.auth.storageKey, b.options.config.auth.storageKey);
  assert.ok(a.options.config.auth.storageKey.includes('/my-trip/'));
});
test('Auth: Google, Apple und Microsoft nur explizit aktiviert; E-Mail erzeugt keine Konten', async () => {
  const h = harness();
  for (const provider of ['google', 'apple', 'azure']) await h.auth.signIn(provider);
  assert.equal(
    h.calls.find((call) => call.type === 'oauth').args.options.redirectTo,
    'https://example.test/my-trip/index.html',
  );
  assert.equal(h.calls.filter((call) => call.type === 'oauth')[2].args.options.scopes, 'email');
  await assert.rejects(h.auth.signIn('github'), code('provider_disabled'));
  await assert.rejects(harness({ providers: [] }).auth.signIn('google'), code('provider_disabled'));
  await assert.rejects(h.auth.sendMagicLink('bad-address'), code('invalid_email'));
  await h.auth.sendMagicLink('person@example.test');
  assert.equal(h.calls.find((call) => call.type === 'email').args.options.shouldCreateUser, false);
  h.control.oauthError = { message: 'provider failure' };
  await assert.rejects(h.auth.signIn('google'), code('signin_failed'));
});
test('Auth: Secret-Schlüssel, fremde Callbacks und ungültige Providerkonfiguration ablehnen', () => {
  const base = {
    url: 'https://example.supabase.co',
    publishableKey: 'sb_publishable_test',
    projectId: PROJECT_A,
    siteUrl: 'https://example.test/trip/',
    clientFactory: () => {
      throw Error('must not create client');
    },
  };
  for (const changes of [
    { publishableKey: 'sb_secret_test' },
    { projectId: 'wrong' },
    { siteUrl: 'https://example.test/trip/?redirect=evil' },
    { siteUrl: 'https://user:password@example.test/' },
    { siteUrl: 'http://example.test/' },
    { providers: ['google', 'google'] },
    { providers: ['github'] },
  ])
    assert.throws(() => createProjectAuth({ ...base, ...changes }));
});
test('Zugriff: Login allein und anonyme Supabase-Konten erlauben keinen Planabruf', async () => {
  for (const h of [
    harness({ userId: null }),
    harness({ userId: 'mallory' }),
    harness({ projectId: PROJECT_B }),
  ]) {
    await assert.rejects(h.plan.load());
    assert.equal(
      h.calls.some((call) => call.table === 'travel_project_plans'),
      false,
    );
  }
  const h = harness();
  h.control.anonymous = true;
  await assert.rejects(h.plan.load(), code('signed_out'));
});
test('Zugriff: Auth-/Mitgliedschaftsfehler und entzogene Freigabe sperren Schreibzugriff', async () => {
  const h = harness();
  h.control.authError = { name: 'NetworkError' };
  await assert.rejects(h.plan.load(), code('auth_failed'));
  h.control.authError = null;
  h.control.memberError = { message: 'unavailable' };
  await assert.rejects(h.plan.load(), code('membership_failed'));
  h.control.memberError = null;
  const previous = await h.plan.load();
  h.members.delete(PROJECT_A + '/alice');
  await assert.rejects(h.plan.save(previous, [entry()]), code('forbidden'));
  assert.equal(h.rows.size, 0);
});
test('Plan: Viewer liest, schreibt aber nicht; Editor legt an und aktualisiert mit Versionsprüfung', async () => {
  const viewer = harness({ role: 'viewer' });
  const empty = await viewer.plan.load();
  await assert.rejects(viewer.plan.save(empty, [entry()]), code('forbidden'));
  const h = harness();
  const first = await h.plan.save(await h.plan.load(), [entry()]);
  assert.equal(first.revision, 1);
  assert.deepEqual(first.plan, [entry()]);
  assert.equal('favorites' in h.rows.get(PROJECT_A).payload, false);
  const second = await h.plan.save(first, []);
  assert.equal(second.revision, 2);
  assert.deepEqual(second.plan, []);
});
test('Plan: paralleles Anlegen und paralleles Speichern überschreiben keine neuere Version', async () => {
  const h = harness();
  const a = await h.plan.load();
  const b = await h.plan.load();
  const first = await h.plan.save(a, [entry()]);
  await assert.rejects(h.plan.save(b, []), code('conflict'));
  const stale = await h.plan.load();
  await h.plan.save(first, []);
  await assert.rejects(h.plan.save(stale, [entry()]), code('conflict'));
  assert.deepEqual(h.rows.get(PROJECT_A).payload.plan, []);
});
test('Plan: Konto-/Projektwechsel und verspätete Antworten werden verworfen', async () => {
  const h = harness();
  const previous = await h.plan.load();
  h.changeUser('bob');
  h.members.set(PROJECT_A + '/bob', 'editor');
  await assert.rejects(h.plan.save(previous, [entry()]), code('stale_session'));
  const other = harness({ projectId: PROJECT_B, userId: 'bob' });
  await assert.rejects(other.plan.save(previous, []), code('stale_session'));
  const pending = harness();
  pending.control.afterRead = () => pending.changeUser('bob');
  await assert.rejects(pending.plan.load(), code('session_changed'));
  const writing = harness();
  const before = await writing.plan.load();
  writing.control.afterWrite = () => writing.changeUser('bob');
  await assert.rejects(writing.plan.save(before, [entry()]), code('session_changed'));
  assert.equal(
    writing.rows.get(PROJECT_A).revision,
    1,
    'Server may have committed before a session change; do not replay',
  );
});
test('Plan: ungültige Orte, Tage und Payloads werden nicht still bereinigt', async () => {
  const h = harness();
  const previous = await h.plan.load();
  for (const plan of [
    [{ placeId: 'unknown', day: city.start }],
    [entry(), entry()],
    [{ placeId: 'museum', day: '1900-01-01' }],
    [{ ...entry(), favorites: ['private'] }],
  ])
    await assert.rejects(h.plan.save(previous, plan), code('invalid_plan'));
  h.rows.set(PROJECT_A, {
    project_id: PROJECT_B,
    revision: 1,
    payload: { version: 1, tripId: city.id, plan: [] },
  });
  await assert.rejects(h.plan.load(), code('invalid_response'));
});
test('Plan: Netzwerkfehler erzeugt weder automatische Wiederholung noch lokale Speicherung', async () => {
  const h = harness();
  const previous = await h.plan.load();
  h.control.planError = { message: 'network' };
  await assert.rejects(h.plan.save(previous, [entry()]), code('save_failed'));
  assert.equal(h.calls.filter((call) => call.action === 'insert').length, 1);
  assert.equal(h.rows.size, 0);
});
test('Auth: Abmelden ist lokal, macht Snapshots ungültig und Listener sind aufräumbar', async () => {
  const h = harness();
  const previous = await h.plan.load();
  let changes = 0;
  const unsubscribe = h.auth.onChange(() => {
    changes++;
  });
  await h.auth.signOut();
  assert.equal(h.calls.find((call) => call.type === 'signout').args.scope, 'local');
  assert.throws(() => h.auth.assertCurrent(previous), code('session_changed'));
  assert.ok(changes > 0);
  unsubscribe();
  const count = changes;
  h.changeUser('alice');
  assert.equal(changes, count);
  h.auth.dispose();
  h.auth.dispose();
  assert.equal(h.calls.filter((call) => call.type === 'unsubscribe').length, 1);
  await assert.rejects(h.auth.access(), code('disposed'));
});

test('Auth: fehlgeschlagenes Abmelden bestätigt keine Abmeldung und invalidiert alte Snapshots', async () => {
  const h = harness();
  const previous = await h.plan.load();
  h.control.signoutError = { message: 'network' };
  await assert.rejects(h.auth.signOut(), code('signout_failed'));
  assert.throws(() => h.auth.assertCurrent(previous), code('session_changed'));
});

test('Auth: Callback kann im Browser nicht auf eine fremde Origin zeigen', () => {
  globalThis.location = { origin: 'https://other.example.test' };
  try {
    assert.throws(() => harness(), /derselben Website/);
  } finally {
    delete globalThis.location;
  }
});
