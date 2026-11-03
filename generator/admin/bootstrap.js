try {
  await import('./wizard.js');
} catch {
  document.querySelector('#message').textContent =
    'Wizard konnte nicht geladen werden. Bitte die Verbindung prüfen und die Seite neu laden.';
}
