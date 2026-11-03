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
  if (/<!DOCTYPE|<!ENTITY|url\s*\(/i.test(svg)) return null;
  const safeTags = /<(\/?)(svg|g|path|rect)\b([^>]*)>/gi;
  const tokens = [...svg.matchAll(safeTags)];
  if (!tokens.length || svg.replace(safeTags, '').replace(/\s/g, '').length) return null;
  for (const [, closing, , attributes] of tokens) {
    if (closing) {
      if (attributes.trim()) return null;
      continue;
    }
    if (!/^(?:\s+(?:xmlns|width|height|viewBox|fill|d|x|y|shape-rendering)="[^"<]*")*\s*\/?$/.test(attributes)) return null;
  }
  return svg;
}

export async function clearStaleTotpEnrollments(mfaApi, friendlyName) {
  const { data, error } = await mfaApi.listFactors();
  if (error) throw error;
  if (!Array.isArray(data?.totp)) throw new Error('Invalid MFA factors response');
  const staleFactors = data.totp.filter(factor =>
    factor.status === 'unverified' &&
    factor.friendly_name === friendlyName &&
    typeof factor.id === 'string'
  );
  for (const factor of staleFactors) {
    const { error: unenrollError } = await mfaApi.unenroll({ factorId: factor.id });
    if (unenrollError) throw unenrollError;
  }
  return staleFactors.length;
}
