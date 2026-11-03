import { createClient } from './vendor/supabase.js';
import { authGateState, isAdminUser } from './auth-policy.js';

const url = 'https://qoensghjemruqafrbmjd.supabase.co';
const publishable = 'sb_publishable_Qeom38G18vSgrrE5MxoXEw_LhJM1f6S';
const sb = createClient(url, publishable, { auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true, flowType: 'pkce' } });
const login = document.querySelector('#login-panel');
const workspace = document.querySelector('#workspace');
const email = document.querySelector('#email');
const password = document.querySelector('#password');
const loginForm = document.querySelector('#login-form');
const loginStatus = document.querySelector('#login-status');
const logout = document.querySelector('#logout');
const identity = document.querySelector('#identity');
const resetButton = document.querySelector('#reset-password');
const recoveryForm = document.querySelector('#recovery-form');
const mfaPanel = document.querySelector('#mfa-panel');
const mfaInstructions = document.querySelector('#mfa-instructions');
const mfaEnrollButton = document.querySelector('#mfa-enroll');
const mfaEnrollment = document.querySelector('#mfa-enrollment');
const mfaQr = document.querySelector('#mfa-qr');
const mfaSecret = document.querySelector('#mfa-secret');
const mfaForm = document.querySelector('#mfa-form');
const mfaFactor = document.querySelector('#mfa-factor');
const mfaCode = document.querySelector('#mfa-code');
const mfaCancel = document.querySelector('#mfa-cancel');

let recoveryMode = false;
let denialNotice = false;
let pendingFactorId = null;
let busy = false;

window.WEB_KIT_WHATSAPP_ENDPOINT = url + '/functions/v1/web-kit-whatsapp-send';
window.WEB_KIT_GET_ACCESS_TOKEN = async () => {
  const { data: { session } } = await sb.auth.getSession();
  return session?.access_token ?? null;
};

function hideWorkspace() {
  workspace.hidden = true;
  login.hidden = false;
  mfaPanel.hidden = true;
  mfaEnrollment.hidden = true;
  mfaForm.hidden = true;
  mfaCancel.hidden = true;
  mfaQr.hidden = true;
  mfaQr.removeAttribute('src');
  mfaSecret.textContent = '';
  mfaCode.value = '';
  pendingFactorId = null;
}

function showMfa(message, stage) {
  login.hidden = false;
  workspace.hidden = true;
  mfaPanel.hidden = false;
  mfaInstructions.textContent = message;
  mfaEnrollButton.hidden = stage !== 'enroll';
  mfaEnrollment.hidden = stage !== 'enrolling';
  mfaForm.hidden = stage !== 'challenge' && stage !== 'enrolling';
  mfaCancel.hidden = stage !== 'enrolling';
  loginStatus.textContent = '';
}

async function refresh() {
  if (busy) return;
  busy = true;
  try {
    const { data: { user }, error } = await sb.auth.getUser();
    if (error || !user) {
      hideWorkspace();
      if (!recoveryMode && !denialNotice) loginStatus.textContent = '';
      return;
    }
    if (!isAdminUser(user)) {
      hideWorkspace();
      if (!recoveryMode) {
        denialNotice = true;
        await sb.auth.signOut({ scope: 'local' });
        loginStatus.textContent = 'Dieses Konto ist nicht für die Administration berechtigt.';
      }
      return;
    }
    if (recoveryMode) {
      hideWorkspace();
      return;
    }

    const [{ data: factorData, error: factorError }, { data: aal, error: aalError }] = await Promise.all([
      sb.auth.mfa.listFactors(),
      sb.auth.mfa.getAuthenticatorAssuranceLevel(),
    ]);
    if (factorError || aalError || !factorData || !aal) {
      hideWorkspace();
      showMfa('Der Sicherheitsstatus konnte nicht geprüft werden. Der geschützte Bereich bleibt gesperrt. Bitte erneut anmelden oder später nochmals versuchen.', 'blocked');
      return;
    }
    const verifiedFactors = (factorData.totp || []).filter(factor => factor.status === 'verified');
    const state = authGateState({
      user,
      admin: isAdminUser(user),
      currentLevel: aal.currentLevel,
      nextLevel: aal.nextLevel,
      verifiedTotp: verifiedFactors.length > 0,
    });
    if (state === 'enroll') {
      showMfa('Für den Zugriff ist ein TOTP-Authenticator erforderlich. Richte ihn einmalig ein; bis zur Bestätigung bleibt das Cockpit gesperrt.', 'enroll');
      return;
    }
    if (state === 'challenge') {
      mfaFactor.replaceChildren();
      for (const factor of verifiedFactors) {
        const option = document.createElement('option');
        option.value = factor.id;
        option.textContent = factor.friendly_name || 'Authenticator';
        mfaFactor.append(option);
      }
      mfaFactor.hidden = verifiedFactors.length < 2;
      mfaFactor.previousElementSibling.hidden = verifiedFactors.length < 2;
      showMfa('Gib den aktuellen Code aus deiner Authenticator-App ein.', 'challenge');
      return;
    }
    if (state !== 'ready') {
      hideWorkspace();
      showMfa('Die Zwei-Faktor-Anmeldung ist nicht vollständig. Der geschützte Bereich bleibt gesperrt.', 'blocked');
      return;
    }

    mfaPanel.hidden = true;
    login.hidden = true;
    workspace.hidden = false;
    identity.textContent = user.email ?? 'Administrator';
    window.dispatchEvent(new Event('web-kit-admin-authenticated'));
  } catch {
    hideWorkspace();
    showMfa('Der Anmeldestatus konnte nicht sicher geprüft werden. Bitte erneut anmelden oder später nochmals versuchen.', 'blocked');
  } finally {
    busy = false;
  }
}

loginForm.addEventListener('submit', async event => {
  event.preventDefault();
  const button = loginForm.querySelector('button');
  button.disabled = true;
  denialNotice = false;
  loginStatus.textContent = 'Anmeldung wird geprüft …';
  try {
    const { error } = await sb.auth.signInWithPassword({ email: email.value.trim(), password: password.value });
    if (error) throw error;
    await refresh();
  } catch {
    loginStatus.textContent = 'Anmeldung fehlgeschlagen. Benutzername oder Passwort prüfen.';
  } finally {
    password.value = '';
    button.disabled = false;
  }
});

resetButton.addEventListener('click', async () => {
  if (!email.value.trim()) {
    loginStatus.textContent = 'Bitte zuerst deine E-Mail-Adresse als Benutzernamen eingeben.';
    email.focus();
    return;
  }
  resetButton.disabled = true;
  loginStatus.textContent = 'Falls dieses Konto existiert, wurde eine Anleitung zum Zurücksetzen versendet.';
  try {
    await sb.auth.resetPasswordForEmail(email.value.trim(), { redirectTo: location.origin + location.pathname });
  } catch {
    // Absichtlich generische Antwort gegen Account-Enumeration.
  } finally {
    resetButton.disabled = false;
  }
});

mfaEnrollButton.addEventListener('click', async () => {
  mfaEnrollButton.disabled = true;
  try {
    const { data, error } = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Web-Kit Cockpit' });
    if (error || !data?.id || !data?.totp?.secret || typeof data.totp.qr_code !== 'string') throw error || new Error('Invalid MFA enrollment response');
    if (!/^<svg[\s>]/i.test(data.totp.qr_code) || /<script|<foreignObject|\bon[a-z]+\s*=|(?:href|src)\s*=|url\(/i.test(data.totp.qr_code)) throw new Error('Unsafe MFA QR response');
    pendingFactorId = data.id;
    mfaSecret.textContent = data.totp.secret;
    mfaQr.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(data.totp.qr_code);
    mfaQr.hidden = false;
    showMfa('Authenticator mit dem QR-Code oder dem Einrichtungsschlüssel verbinden und danach einen Code eingeben.', 'enrolling');
  } catch {
    showMfa('Authenticator konnte nicht eingerichtet werden. Bitte später erneut versuchen.', 'enroll');
  } finally {
    mfaEnrollButton.disabled = false;
  }
});

mfaForm.addEventListener('submit', async event => {
  event.preventDefault();
  const submit = mfaForm.querySelector('button');
  const factorId = pendingFactorId || mfaFactor.value;
  if (!factorId || !/^[0-9]{6}$/.test(mfaCode.value)) {
    mfaInstructions.textContent = 'Bitte den sechsstelligen Code eingeben.';
    return;
  }
  submit.disabled = true;
  mfaCode.disabled = true;
  try {
    const challenge = await sb.auth.mfa.challenge({ factorId });
    if (challenge.error || !challenge.data?.id) throw challenge.error || new Error('MFA challenge failed');
    const result = await sb.auth.mfa.verify({ factorId, challengeId: challenge.data.id, code: mfaCode.value });
    if (result.error) throw result.error;
    pendingFactorId = null;
    mfaSecret.textContent = '';
    mfaQr.removeAttribute('src');
    mfaCode.value = '';
    await refresh();
  } catch {
    mfaCode.value = '';
    mfaInstructions.textContent = 'Der Code war ungültig oder konnte nicht geprüft werden. Bitte neuen Code eingeben.';
  } finally {
    submit.disabled = false;
    mfaCode.disabled = false;
  }
});

mfaCancel.addEventListener('click', async () => {
  if (pendingFactorId) {
    try { await sb.auth.mfa.unenroll({ factorId: pendingFactorId }); } catch { /* No secret is retained; retry can start a fresh enrollment. */ }
  }
  hideWorkspace();
  loginStatus.textContent = 'Einrichtung abgebrochen. Ohne bestätigten Authenticator ist kein Zugriff möglich.';
});

recoveryForm.addEventListener('submit', async event => {
  event.preventDefault();
  const next = document.querySelector('#new-password').value;
  const confirm = document.querySelector('#confirm-password').value;
  if (next !== confirm) {
    loginStatus.textContent = 'Die Passwörter stimmen nicht überein.';
    return;
  }
  const button = recoveryForm.querySelector('button');
  button.disabled = true;
  try {
    const { error } = await sb.auth.updateUser({ password: next });
    if (error) throw error;
    const { error: signOutError } = await sb.auth.signOut({ scope: 'local' });
    recoveryMode = false;
    recoveryForm.hidden = true;
    login.hidden = false;
    loginStatus.textContent = signOutError ? 'Passwort aktualisiert. Bitte den Browser schliessen, bevor du dich erneut anmeldest.' : 'Passwort aktualisiert. Du kannst dich jetzt anmelden.';
  } catch {
    loginStatus.textContent = 'Das Passwort konnte nicht aktualisiert werden. Fordere einen neuen Link an.';
  } finally {
    document.querySelector('#new-password').value = '';
    document.querySelector('#confirm-password').value = '';
    button.disabled = false;
  }
});

logout.addEventListener('click', async () => {
  logout.disabled = true;
  try {
    const { error } = await sb.auth.signOut({ scope: 'local' });
    if (error) throw error;
    denialNotice = false;
    hideWorkspace();
    loginStatus.textContent = 'Du bist abgemeldet.';
  } catch {
    loginStatus.textContent = 'Abmeldung konnte nicht bestätigt werden. Bitte Browser schliessen und später erneut versuchen.';
  } finally {
    logout.disabled = false;
  }
});

sb.auth.onAuthStateChange((event) => {
  if (event === 'PASSWORD_RECOVERY') {
    recoveryMode = true;
    hideWorkspace();
    recoveryForm.hidden = false;
    loginStatus.textContent = 'Lege ein neues Passwort fest.';
  }
  if (event === 'SIGNED_OUT') {
    hideWorkspace();
    if (!recoveryMode && !denialNotice) loginStatus.textContent = '';
  }
  queueMicrotask(refresh);
});
await refresh();
