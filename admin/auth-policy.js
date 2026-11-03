export function isAdminUser(user) {
  return user?.app_metadata?.web_kit_admin === true;
}

export function authGateState({ user, admin, currentLevel, nextLevel, verifiedTotp }) {
  if (!user) return 'login';
  if (!admin) return 'denied';
  if (!verifiedTotp) return 'enroll';
  if (currentLevel === 'aal2') return 'ready';
  if (nextLevel === 'aal2') return 'challenge';
  return 'blocked';
}


export function safeTotpQrSvg(value) {
  if (typeof value !== 'string' || value.length > 100_000) return null;
  const svg = value.trim().replace(/^\uFEFF/, '').replace(/^<\?xml[^>]*>\s*/i, '');
  if (!/^<svg(?:\s|>)/i.test(svg) || !/<\/svg>\s*$/i.test(svg)) return null;
  if (/<!DOCTYPE|<!ENTITY|<script|<foreignObject|\bon[a-z]+\s*=|(?:href|src)\s*=|url\s*\(|style\s*=/i.test(svg)) return null;
  return svg;
}

export async function clearStaleTotpEnrollments(mfaApi, friendlyName) {
  const { data, error } = await mfaApi.listFactors();
  if (error) throw error;
  if (!Array.isArray(data?.totp)) throw new Error('Invalid MFA factors response');
  const staleFactors = data.totp.filter(factor =>
    factor.status === 'unverified' &&
    (factor.friendly_name === friendlyName || factor.friendly_name?.startsWith(friendlyName + ' ')) &&
    typeof factor.id === 'string'
  );
  for (const factor of staleFactors) {
    const { error: unenrollError } = await mfaApi.unenroll({ factorId: factor.id });
    if (unenrollError) throw unenrollError;
  }
  return staleFactors.length;
}

export function totpFactorFriendlyName(nonce) {
  if (typeof nonce !== 'string' || !/^[a-f0-9]{12}$/i.test(nonce)) throw new Error('Invalid TOTP setup nonce');
  return `Web-Kit Cockpit ${nonce.toLowerCase()}`;
}

export function totpNonceFromUuid(uuid) {
  if (typeof uuid !== 'string') throw new Error('Invalid TOTP setup UUID');
  const nonce = uuid.replaceAll('-', '').slice(0, 12);
  if (!/^[a-f0-9]{12}$/i.test(nonce)) throw new Error('Invalid TOTP setup UUID');
  return nonce.toLowerCase();
}
