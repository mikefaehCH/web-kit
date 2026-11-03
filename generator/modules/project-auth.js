// Prepared adapter: no client is created and no login starts until explicitly called.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PROVIDERS = Object.freeze(['google', 'apple', 'azure']);
export class AccessError extends Error {
  constructor(code, message, cause) {
    super(message, { cause });
    this.name = 'AccessError';
    this.code = code;
  }
}
export function createProjectAuth({
  url,
  publishableKey,
  projectId,
  siteUrl,
  providers = [],
  clientFactory,
}) {
  const api = new URL(url);
  const site = new URL(siteUrl);
  if (globalThis.location && site.origin !== globalThis.location.origin)
    throw new Error('Login-Callback muss auf derselben Website liegen');
  if (
    api.protocol !== 'https:' ||
    api.username ||
    api.password ||
    api.pathname !== '/' ||
    api.search ||
    api.hash
  )
    throw new Error('Ungültige API-Adresse');
  if (!UUID.test(projectId || '') || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(publishableKey || ''))
    throw new Error('Projekt-ID oder öffentlicher Schlüssel ungültig');
  if (
    (site.protocol !== 'https:' &&
      !(site.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(site.hostname))) ||
    site.username ||
    site.password ||
    !site.pathname.endsWith('/') ||
    site.search ||
    site.hash
  )
    throw new Error('Website braucht eine feste HTTPS-Basisadresse (oder localhost)');
  if (
    !Array.isArray(providers) ||
    providers.some((provider) => !PROVIDERS.includes(provider)) ||
    new Set(providers).size !== providers.length ||
    typeof clientFactory !== 'function'
  )
    throw new Error('Login-Konfiguration ungültig');
  const enabledProviders = Object.freeze([...providers]);
  const redirectTo = new URL('index.html', site).href;
  const client = clientFactory(api.origin, publishableKey, {
    auth: {
      flowType: 'pkce',
      detectSessionInUrl: true,
      persistSession: true,
      storageKey: `travel-auth:${api.host}:${site.href}:${projectId}`,
    },
  });
  let generation = 0;
  let sessionIdentity;
  let disposed = false;
  const listeners = new Set();
  function invalidate() {
    generation++;
    for (const listener of listeners) {
      try {
        listener();
      } catch {
        /* A consumer must not break SDK callbacks. */
      }
    }
  }
  const {
    data: { subscription },
  } = client.auth.onAuthStateChange((event, session) => {
    const identity = session?.user?.id || null;
    // Bootstrap and refresh for the same account do not discard an editor's draft.
    // Logout still ends the session even when the same account signs in again.
    if (event === 'SIGNED_OUT' || (sessionIdentity !== undefined && identity !== sessionIdentity))
      invalidate();
    sessionIdentity = identity;
  });
  function active() {
    if (disposed) throw new AccessError('disposed', 'Login-Modul ist beendet');
  }
  async function currentUser() {
    active();
    const { data, error } = await client.auth.getUser();
    active();
    if (error && error.name !== 'AuthSessionMissingError')
      throw new AccessError('auth_failed', 'Anmeldestatus konnte nicht geprüft werden', error);
    const user = error ? null : data?.user;
    const identity = user?.id || null;
    if (sessionIdentity === undefined) sessionIdentity = identity;
    else if (sessionIdentity !== identity)
      throw new AccessError('session_changed', 'Anmeldung hat sich geändert. Bitte neu laden.');
    // Anonymous Supabase users also have the authenticated database role.
    return user && !user.is_anonymous ? user : null;
  }
  function assertCurrent(access) {
    active();
    if (access.generation !== generation || access.projectId !== projectId)
      throw new AccessError('session_changed', 'Anmeldung hat sich geändert. Bitte neu laden.');
  }
  async function access() {
    const epoch = generation;
    const user = await currentUser();
    assertCurrent({ projectId, generation: epoch });
    if (!user) return Object.freeze({ projectId, userId: null, role: null, generation: epoch });
    const { data, error } = await client
      .from('travel_project_members')
      .select('project_id,user_id,role')
      .eq('project_id', projectId)
      .eq('user_id', user.id)
      .maybeSingle();
    assertCurrent({ projectId, generation: epoch });
    if (error)
      throw new AccessError(
        'membership_failed',
        'Projektzugriff konnte nicht geprüft werden',
        error,
      );
    if (
      data &&
      (data.project_id !== projectId ||
        data.user_id !== user.id ||
        !['viewer', 'editor'].includes(data.role))
    )
      throw new AccessError('invalid_membership', 'Ungültige Projektzuordnung');
    return Object.freeze({
      projectId,
      userId: user.id,
      role: data?.role || null,
      generation: epoch,
    });
  }
  async function requireMember(write = false) {
    const result = await access();
    if (!result.userId) throw new AccessError('signed_out', 'Bitte zuerst anmelden');
    if (!result.role || (write && result.role !== 'editor'))
      throw new AccessError('forbidden', 'Für diese Aktion fehlt die Projektfreigabe');
    return result;
  }
  async function signIn(provider) {
    active();
    if (!enabledProviders.includes(provider))
      throw new AccessError(
        'provider_disabled',
        'Dieser Anbieter ist für die Website nicht aktiviert',
      );
    invalidate();
    const { error } = await client.auth.signInWithOAuth({
      provider,
      options: { redirectTo, ...(provider === 'azure' ? { scopes: 'email' } : {}) },
    });
    if (error)
      throw new AccessError('signin_failed', 'Anmeldung konnte nicht gestartet werden', error);
  }
  async function sendMagicLink(email) {
    active();
    if (
      typeof email !== 'string' ||
      email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    )
      throw new AccessError('invalid_email', 'E-Mail-Adresse ungültig');
    const { error } = await client.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo, shouldCreateUser: false },
    });
    if (error && error.code !== 'otp_disabled')
      throw new AccessError('email_failed', 'Anmeldelink konnte nicht angefordert werden', error);
    // Neutral UI response for unknown accounts; direct Auth API responses remain observable.
    return 'Wenn das Konto freigeschaltet ist, erhältst du einen Anmeldelink.';
  }
  async function signOut() {
    active();
    invalidate();
    const { error } = await client.auth.signOut({ scope: 'local' });
    if (error)
      throw new AccessError(
        'signout_failed',
        'Abmelden fehlgeschlagen. Das Konto ist möglicherweise noch angemeldet.',
        error,
      );
  }
  function onChange(listener) {
    active();
    if (typeof listener !== 'function') throw new TypeError('Listener fehlt');
    listeners.add(listener);
    return () => listeners.delete(listener);
  }
  function dispose() {
    if (disposed) return;
    invalidate();
    disposed = true;
    listeners.clear();
    subscription.unsubscribe();
  }
  return Object.freeze({
    client,
    projectId,
    providers: enabledProviders,
    access,
    requireMember,
    assertCurrent,
    signIn,
    sendMagicLink,
    signOut,
    onChange,
    dispose,
  });
}
