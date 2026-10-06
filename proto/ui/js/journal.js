// Erreurs de l'interface, écrites dans data\ui.log.
(() => {
  const noter = (t) => window.__TAURI__?.core.invoke('journal', { texte: `${new Date().toISOString()} ${location.pathname} ${t}` }).catch(() => {});
  addEventListener('error', (e) => e.message && noter(`${e.message} @ ${(e.filename || '').split('/').pop()}:${e.lineno}:${e.colno}`));
  addEventListener('unhandledrejection', (e) => noter(`promesse : ${e.reason?.stack || e.reason}`));
  addEventListener('securitypolicyviolation', (e) => noter(`CSP : ${e.violatedDirective} ${e.blockedURI}`));
})();
