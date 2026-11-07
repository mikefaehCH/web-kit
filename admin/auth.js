import { createClient } from './vendor/supabase.js';
import { authGateState, clearStaleTotpEnrollments, isAdminUser, safeTotpQrSvg, totpFactorFriendlyName, totpNonceFromUuid } from './auth-policy.js';

const url = 'https://qoensghjemruqafrbmjd.supabase.co';
const publishable = 'sb_publishable_Qeom38G18vSgrrE5MxoXEw_LhJM1f6S';
const sb = createClient(url, publishable, { auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true, flowType: 'pkce' } });
const login = document.querySelector('#login-panel');
const workspace = document.querySelector('#workspace');
const email = document.querySelector('#email');
const password = document.querySelector('#password');
const passwordStep = document.querySelector('#password-step');
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
const mfaStatus = document.querySelector('#mfa-status');
const switchAccount = document.querySelector('#mfa-switch-account');

let recoveryMode = false;
let pendingFactorId = null;
let mfaStage = null;
let switchingAccount = false;
let sessionVersion = 0;
let refreshPending = Promise.resolve();

window.WEB_KIT_WHATSAPP_ENDPOINT = url + '/functions/v1/web-kit-whatsapp-send';
window.WEB_KIT_GET_ACCESS_TOKEN = async () => {
  const { data: { session } } = await sb.auth.getSession();
  return session?.access_token ?? null;
};

function hideWorkspace() {
  workspace.hidden = true;
  login.hidden = false;
  passwordStep.hidden = recoveryMode;
  mfaPanel.hidden = true;
  mfaEnrollment.hidden = true;
  mfaForm.hidden = true;
  mfaCancel.hidden = true;
  mfaQr.hidden = true;
  mfaQr.removeAttribute('src');
  mfaSecret.textContent = '';
  mfaCode.value = '';
  pendingFactorId = null;
  mfaStage = null;
  mfaStatus.textContent = '';
}

function showMfa(message, stage) {
  const stageChanged = mfaStage !== stage;
  mfaStage = stage;
  login.hidden = false;
  passwordStep.hidden = true;
  workspace.hidden = true;
  mfaPanel.hidden = false;
  mfaInstructions.textContent = message;
  mfaEnrollButton.hidden = stage !== 'enroll';
  mfaEnrollment.hidden = stage !== 'enrolling';
  mfaForm.hidden = stage !== 'challenge' && stage !== 'enrolling';
  mfaCancel.hidden = stage !== 'enrolling';
  loginStatus.textContent = '';
  if (stageChanged) {
    mfaStatus.textContent = '';
    if (!mfaForm.hidden) mfaCode.focus();
    else if (stage === 'enroll' && !mfaEnrollButton.disabled) mfaEnrollButton.focus();
    else if (stage === 'blocked') switchAccount.focus();
  }
}

function sessionEnded(error) {
  return error?.name === 'AuthSessionMissingError' ||
    ['session_not_found', 'session_expired', 'refresh_token_not_found', 'refresh_token_already_used'].includes(error?.code);
}

function showLoginAfterSessionEnd() {
  sessionVersion += 1;
  const interrupted = mfaStage !== null && !switchingAccount;
  hideWorkspace();
  if (interrupted) {
    loginStatus.textContent = 'Deine Anmeldesitzung ist abgelaufen oder wurde beendet. Bitte melde dich erneut an.';
    email.focus();
  }
}

function refresh() {
  refreshPending = refreshPending.then(refreshSession);
  return refreshPending;
}

async function refreshSession() {
  if (switchingAccount) return;
  const version = sessionVersion;
  try {
    const { data: { user }, error } = await sb.auth.getUser();
    if (version !== sessionVersion || switchingAccount) return;
    if (error && !sessionEnded(error)) throw error;
    if (error || !user) {
      showLoginAfterSessionEnd();
      return;
    }
    if (!isAdminUser(user)) {
      hideWorkspace();
      if (!recoveryMode) {
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
    if (version !== sessionVersion || switchingAccount) return;
    if (sessionEnded(factorError) || sessionEnded(aalError)) {
      showLoginAfterSessionEnd();
      return;
    }
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
      if (mfaStage === 'enrolling' && pendingFactorId) return;
      showMfa('Für den Zugriff ist ein TOTP-Authenticator erforderlich. Richte ihn einmalig ein; bis zur Bestätigung bleibt das Cockpit gesperrt.', 'enroll');
      return;
    }
    if (state === 'challenge') {
      const selectedFactor = mfaFactor.value;
      mfaFactor.replaceChildren();
      for (const factor of verifiedFactors) {
        const option = document.createElement('option');
        option.value = factor.id;
        option.textContent = factor.friendly_name || 'Authenticator';
        mfaFactor.append(option);
      }
      if (verifiedFactors.some(factor => factor.id === selectedFactor)) mfaFactor.value = selectedFactor;
      mfaFactor.hidden = verifiedFactors.length < 2;
      mfaFactor.previousElementSibling.hidden = verifiedFactors.length < 2;
      showMfa('Passwort bestätigt. Gib den 6-stelligen Code aus deiner Authenticator-App ein.', 'challenge');
      return;
    }
    if (state !== 'ready') {
      hideWorkspace();
      showMfa('Die Zwei-Faktor-Anmeldung ist nicht vollständig. Der geschützte Bereich bleibt gesperrt.', 'blocked');
      return;
    }

    mfaStage = null;
    mfaPanel.hidden = true;
    login.hidden = true;
    workspace.hidden = false;
    identity.textContent = user.email ?? 'Administrator';
    window.dispatchEvent(new Event('web-kit-admin-authenticated'));
  } catch {
    if (version !== sessionVersion || switchingAccount) return;
    hideWorkspace();
    showMfa('Der Anmeldestatus konnte nicht sicher geprüft werden. Bitte erneut anmelden oder später nochmals versuchen.', 'blocked');
  }
}

loginForm.addEventListener('submit', async event => {
  event.preventDefault();
  const button = loginForm.querySelector('button');
  button.disabled = true;
  loginStatus.textContent = 'Anmeldung wird geprüft …';
  try {
    const { error } = await sb.auth.signInWithPassword({ email: email.value.trim(), password: password.value });
    if (error) throw error;
    password.value = '';
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
  const version = sessionVersion;
  mfaEnrollButton.disabled = true;
  switchAccount.disabled = true;
  mfaStatus.textContent = '';
  pendingFactorId = null;
  try {
    // Cleanup is best effort: a fresh unique name prevents an old unverified
    // factor from blocking this attempt even if Supabase cannot remove it.
    await clearStaleTotpEnrollments(sb.auth.mfa, 'Web-Kit Cockpit').catch(() => 0);
    if (version !== sessionVersion) return;
    const friendlyName = totpFactorFriendlyName(totpNonceFromUuid(crypto.randomUUID()));
    const { data, error } = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName });
    if (version !== sessionVersion) return;
    if (error || !data?.id) throw error || new Error('Invalid MFA enrollment response');
    pendingFactorId = data.id;
    if (typeof data.totp?.secret !== 'string' || !data.totp.secret) throw new Error('Missing TOTP secret');

    // The secret is sufficient to complete setup if a provider SVG variant is
    // unsupported. Never embed an unvalidated SVG returned by an API.
    mfaSecret.textContent = data.totp.secret;
    const qrSvg = safeTotpQrSvg(data.totp.qr_code);
    if (qrSvg) {
      mfaQr.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(qrSvg);
      mfaQr.hidden = false;
      showMfa('Authenticator mit dem QR-Code oder dem Einrichtungsschlüssel verbinden und danach einen Code eingeben.', 'enrolling');
    } else {
      mfaQr.removeAttribute('src');
      mfaQr.hidden = true;
      showMfa('Der QR-Code konnte nicht angezeigt werden. Gib den Einrichtungsschlüssel manuell in deiner Authenticator-App ein und danach den aktuellen Code.', 'enrolling');
    }
  } catch (error) {
    if (version !== sessionVersion) return;
    if (sessionEnded(error)) {
      showLoginAfterSessionEnd();
      return;
    }
    if (pendingFactorId) {
      try { await sb.auth.mfa.unenroll({ factorId: pendingFactorId }); } catch { /* A later retry cleans up this unverified factor. */ }
    }
    if (version !== sessionVersion) return;
    pendingFactorId = null;
    mfaSecret.textContent = '';
    mfaQr.removeAttribute('src');
    mfaQr.hidden = true;
    showMfa('Authenticator konnte nicht eingerichtet werden. Ein abgebrochener Setup-Versuch wird beim nächsten Versuch bereinigt. Bitte erneut versuchen.', 'enroll');
  } finally {
    mfaEnrollButton.disabled = false;
    switchAccount.disabled = false;
  }
});
mfaForm.addEventListener('submit', async event => {
  event.preventDefault();
  const submit = mfaForm.querySelector('button');
  const factorId = pendingFactorId || mfaFactor.value;
  if (!factorId || !/^[0-9]{6}$/.test(mfaCode.value)) {
    mfaStatus.textContent = 'Bitte den sechsstelligen Code eingeben.';
    return;
  }
  const version = sessionVersion;
  submit.disabled = true;
  mfaCode.disabled = true;
  mfaCancel.disabled = true;
  switchAccount.disabled = true;
  mfaStatus.textContent = '';
  try {
    const challenge = await sb.auth.mfa.challenge({ factorId });
    if (version !== sessionVersion) return;
    if (challenge.error || !challenge.data?.id) throw challenge.error || new Error('MFA challenge failed');
    const result = await sb.auth.mfa.verify({ factorId, challengeId: challenge.data.id, code: mfaCode.value });
    if (version !== sessionVersion) return;
    if (result.error) throw result.error;
    pendingFactorId = null;
    mfaSecret.textContent = '';
    mfaQr.removeAttribute('src');
    mfaCode.value = '';
    await refresh();
  } catch (error) {
    if (version !== sessionVersion) return;
    if (sessionEnded(error)) {
      showLoginAfterSessionEnd();
      return;
    }
    mfaCode.value = '';
    mfaStatus.textContent = 'Der Code war ungültig, ist abgelaufen oder konnte nicht geprüft werden. Bitte gib einen neuen Code ein.';
  } finally {
    submit.disabled = false;
    mfaCode.disabled = false;
    mfaCancel.disabled = false;
    switchAccount.disabled = false;
    if (!mfaPanel.hidden && !mfaForm.hidden) mfaCode.focus();
  }
});

mfaCancel.addEventListener('click', async () => {
  const version = sessionVersion;
  mfaCancel.disabled = true;
  mfaForm.inert = true;
  switchAccount.disabled = true;
  try {
    if (pendingFactorId) await sb.auth.mfa.unenroll({ factorId: pendingFactorId });
  } catch { /* A later retry cleans up this unverified factor. */ }
  finally {
    mfaCancel.disabled = false;
    mfaForm.inert = false;
    switchAccount.disabled = false;
  }
  if (version !== sessionVersion) return;
  pendingFactorId = null;
  mfaSecret.textContent = '';
  mfaQr.removeAttribute('src');
  mfaQr.hidden = true;
  mfaCode.value = '';
  showMfa('Richte einen Authenticator ein, um auf das Cockpit zuzugreifen.', 'enroll');
  mfaStatus.textContent = 'Einrichtung abgebrochen. Du kannst sie erneut starten.';
});

switchAccount.addEventListener('click', async () => {
  switchingAccount = true;
  switchAccount.disabled = true;
  mfaPanel.inert = true;
  try {
    const { error } = await sb.auth.signOut({ scope: 'local' });
    if (error) throw error;
    showLoginAfterSessionEnd();
    email.value = '';
    password.value = '';
    loginStatus.textContent = 'Melde dich mit dem gewünschten Konto an.';
    email.focus();
  } catch {
    mfaStatus.textContent = 'Der Kontowechsel konnte nicht abgeschlossen werden. Bitte versuche es erneut.';
  } finally {
    mfaPanel.inert = false;
    switchAccount.disabled = false;
    switchingAccount = false;
    if (!mfaPanel.hidden) switchAccount.focus();
  }
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
    hideWorkspace();
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
    sessionVersion += 1;
    recoveryMode = true;
    hideWorkspace();
    recoveryForm.hidden = false;
    loginStatus.textContent = 'Lege ein neues Passwort fest.';
    return;
  }
  if (event === 'SIGNED_OUT') {
    showLoginAfterSessionEnd();
    return;
  }
  // Defer SDK calls until the Auth state callback has returned.
  setTimeout(refresh, 0);
});
await refresh();
