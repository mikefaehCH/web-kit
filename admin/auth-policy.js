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
