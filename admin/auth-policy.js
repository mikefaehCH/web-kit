export function isAdminUser(user) {
  return user?.app_metadata?.web_kit_admin === true;
}
