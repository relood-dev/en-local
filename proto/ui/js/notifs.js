/*
 * Centre de notifications : invitations, défis, sessions et mises à jour.
 * S'ouvre avec la cloche ou R2. Les 50 dernières sont gardées sur ce PC.
 */
let notifs = JSON.parse(localStorage.notifs || '[]');
const garderNotifs = () => (localStorage.notifs = JSON.stringify(notifs.slice(0, 50)));

/** Ajoute une notification et l'affiche (bulle en jeu, message dans les menus). */
function notifier(n, { bulle = true } = {}) {
  notifs.unshift({ ...n, id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, at: Date.now(), lu: false });
  notifs = notifs.slice(0, 50);
  garderNotifs();
  drawCloche();
  if (!bulle) return;
  if (current) window.__TAURI__.event.emitTo('habillage', 'notif', { texte: n.texte, image: n.image || 'img/loc/loc_coucou.gif' }).catch(() => {});
  else toast(n.texte);
}

/** Invitations envoyées par Loc avec la présence. */
function recevoirNotifs(liste) {
  for (const x of Array.isArray(liste) ? liste : []) {
    if (x?.type === 'tournoi' && typeof x.texte === 'string' && typeof x.tournoi === 'string') {
      son('notif', true);
      notifier({ type: 'tournoi', texte: x.texte, image: 'img/loc/loc_gg.gif', tournoi: x.tournoi, code: typeof x.code === 'string' ? x.code : '' });
      if (onglet === 'tournois') chargerTournois();
      continue;
    }
    if (x?.type !== 'invitation' || typeof x.code !== 'string' || typeof x.game !== 'string') continue;
    if (notifs.some((y) => y.type === 'invitation' && y.code === x.code && !y.lu)) continue;
    son('notif', true);
    notifier({ type: 'invitation', texte: `${String(x.de?.name || 'Un membre')} t'invite sur ${x.game}`, image: typeof x.de?.avatar === 'string' ? x.de.avatar : '', code: x.code, game: x.game, console: x.console });
  }
}

const nonLues = () => notifs.filter((n) => !n.lu).length;
function drawCloche() {
  const el = $('#cloche');
  if (!el) return;
  const n = nonLues();
  el.innerHTML = `${icone(ICONE_CLOCHE)}${n ? `<b class="badge-n">${n > 9 ? '9+' : n}</b>` : ''}`;
  el.classList.toggle('active', n > 0);
}
const ICONE_CLOCHE = '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>';

const ilYaNotif = (ms) => {
  const min = Math.round((Date.now() - ms) / 60000);
  return min < 1 ? 'à l\'instant' : min < 60 ? `il y a ${min} min` : min < 1440 ? `il y a ${Math.floor(min / 60)} h` : `il y a ${Math.floor(min / 1440)} j`;
};
const TYPES_NOTIF = { invitation: 'Invitation', defi: 'Défi réussi', session: 'Session', maj: 'Mise à jour', tournoi: 'Tournoi' };

/** Ouvre le centre. Une invitation mène à sa session. */
function ouvrirNotifs() {
  const liste = notifs.slice(0, 30);
  const carte = (n) => `<img class="av" src="${esc(n.image || 'img/loc/loc_coucou.gif')}" alt=""><span class="nt"><small>${TYPES_NOTIF[n.type] || 'Info'} · ${ilYaNotif(n.at)}</small><b>${esc(n.texte)}</b>${n.type === 'invitation' ? `<small class="nt-action">${sessionsLocal.some((s) => s.code === n.code) ? 'Voir la session' : 'Session terminée'}</small>` : ''}</span>${n.lu ? '' : '<i class="point"></i>'}`;
  const action = (n) => () => {
    if (n.type === 'tournoi') return allerA('tournois').then(() => ouvrirTournoi(n.tournoi));
    if (n.type !== 'invitation') return ouvrirNotifs();
    const s = sessionsLocal.find((x) => x.code === n.code);
    return s ? detailSession(s) : (toast('Cette session est terminée.'), ouvrirNotifs());
  };
  sheet('Notifications', liste.length ? '' : 'Rien pour l\'instant : invitations, défis et sessions arrivent ici.', [
    ...liste.map((n) => ({ html: carte(n), cls: 'carte-notif', fn: action(n) })),
    ...(liste.length ? [{ label: 'Tout effacer', fn: () => ((notifs = []), garderNotifs(), drawCloche(), ouvrirNotifs()) }] : []),
    { label: 'Fermer', cancel: true },
  ]);
  // À l'ouverture, tout passe en lu.
  notifs.forEach((n) => (n.lu = true));
  garderNotifs();
  drawCloche();
}
