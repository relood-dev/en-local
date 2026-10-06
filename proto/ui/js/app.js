/* En Local : interface principale. */
const { invoke, Channel } = window.__TAURI__.core;

function drawGlyphs() {
  document.querySelector('#menu-aide').innerHTML = `Appuie sur ${glyphs.home} pour revenir au jeu.`;
  document.querySelector('#menu-touches').innerHTML = `<span>${glyphs.a}Valider</span><span>${glyphs.b}Reprendre</span>`;
  if (typeof drawHome === 'function') drawHome();
}
const { listen } = window.__TAURI__.event;
const $ = (s) => document.querySelector(s);
const status = (t) => ($('#status').textContent = t);
let toastTimer = null;
function toast(t) {
  status(t);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('#status').textContent === t && status(''), 3000);
}

let games = [], menuFocus = 0, current = null;
const shown = (s) => $(s).style.display === 'grid';
const view = () => (shown('#menu') ? 'menu' : shown('#sheet') ? 'sheet' : saisieOuverte() ? 'saisie' : vueOuverte() ? 'vue' : salle ? 'salle' : current ? 'jeu' : bienvenueOuverte() ? 'bienvenue' : 'biblio');
// Les noms viennent aussi des autres membres : jamais de HTML brut.
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// --- Compte et sessions (API de Loc) ---
const API = 'https://loc-lab.fr/enlocal';
let me = null, session = null, beat = null;

async function api(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (localStorage.token) headers.Authorization = `Bearer ${localStorage.token}`;
  const res = await fetch(API + path, { method, headers, body: body && JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) { delete localStorage.token; me = null; drawHome(); }
  if (!res.ok) throw data.error || `Erreur ${res.status}`;
  return data;
}

const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function login() {
  try {
    status('Connexion : termine-la dans ton navigateur…');
    // Le secret reste ici. Loc ne voit que son empreinte.
    const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
    const challenge = b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
    const q = new URLSearchParams(await invoke('login', { challenge }));
    if (q.get('error')) throw q.get('error');
    const r = await api('POST', '/auth/redeem', { ticket: q.get('ticket'), verifier });
    localStorage.token = r.token;
    me = { ...r.user, name: nomVisible(r.user) };
    chargerMembres();
    envoyerPresence();
    envoyerBibliotheque();
    drawHome();
    status('');
    if (bienvenueOuverte()) connexionFaite();
    else if (!localStorage.bienvenue) ouvrirBienvenue();
    if (pendingCode) openLink(pendingCode), (pendingCode = null);
  } catch (e) {
    status('');
    oops(e);
  }
}

// Fenêtre de choix pilotable à la manette.
let sheetBtns = [], sheetFocus = 0;
function sheet(titre, texte, btns, corps = '') {
  $('#sheet').classList.remove('capture');
  $('#sheet-titre').textContent = titre;
  $('#sheet-texte').innerHTML = texte;
  $('#sheet-corps').innerHTML = corps;
  sheetBtns = btns;
  sheetFocus = 0;
  // html : bouton riche, sinon le texte de label.
  $('#sheet-btns').innerHTML = btns.map((b) => `<button class="btn${b.cls ? ` ${b.cls}` : ''}">${b.html || esc(b.label)}</button>`).join('');
  $('#sheet-btns').querySelectorAll('.btn').forEach((el, i) => (el.onclick = () => pick(i)));
  $('#sheet').style.display = 'grid';
  drawSheet();
}
/** Bouton de ○ / Échap : celui marqué cancel, sinon le dernier. */
function cancelSheet() {
  const i = sheetBtns.findIndex((b) => b.cancel);
  pick(i >= 0 ? i : sheetBtns.length - 1);
}
function drawSheet() {
  const btns = $('#sheet-btns').querySelectorAll('.btn');
  btns.forEach((b, i) => b.classList.toggle('focus', i === sheetFocus));
  montrer($('#sheet .panel'), btns[sheetFocus]);
}
function pick(i) {
  $('#sheet').style.display = 'none';
  $('#sheet').classList.remove('capture');
  sheetBtns[i]?.fn?.();
}
const oops = (e) => sheet('Oups', esc(e), [{ label: 'OK' }]);

function choose(i) {
  const g = games[i];
  if (!me || !enSession(g)) return play(i);
  sheet(g.name, 'Seul, ou avec les membres du Local ?', [
    { label: 'Jouer seul', fn: () => play(i) },
    { label: 'Créer une session', fn: () => host(i) },
    { label: 'Annuler' },
  ]);
}

// DS : pas de salon. Chacun se connecte au Wi-Fi du jeu (Kaeru WFC) et échange son code ami.
const dsKey = (g) => (g.product_code || '').slice(0, 3);
// Code ami de la session. Le code de l'hôte ne garde que lettres et chiffres.
const cleAmi = (g) => (/^[A-Z0-9]{3}$/.test(session?.gameKey || '') ? session.gameKey : dsKey(g));

/** Versions qui jouent ensemble (échanges, combats). */
const FAMILLES = [
  ['ADA', 'APA', 'CPU', 'IPK', 'IPG'], // Diamant, Perle, Platine, HeartGold, SoulSilver
  ['IRB', 'IRA', 'IRE', 'IRD'], // Noire, Blanche, Noire 2, Blanche 2
  ['0004000000055D00', '0004000000055E00', '000400000011C400', '000400000011C500'], // X, Y, Rubis Oméga, Saphir Alpha
  ['0004000000164800', '0004000000175E00', '00040000001B5000', '00040000001B5100'], // Soleil, Lune, Ultra-Soleil, Ultra-Lune
];
const familleDe = (cle) => FAMILLES.find((f) => f.includes(cle)) || [cle];

/** Demande une fois le code ami du joueur pour ce jeu DS. */
async function ensureFriendCode(g) {
  if (g.console !== 'DS') return;
  if (await syncFriendCode(g)) return;
  const { code } = await api('GET', `/friendcodes/${encodeURIComponent(cleAmi(g))}`);
  if (!code) await editFriendCode(g);
}

/** Code ami lu dans la sauvegarde, enregistré s'il a changé. */
async function syncFriendCode(g) {
  const auto = await invoke('ds_friend_code', { path: g.path }).catch(() => null);
  if (!auto) return null;
  const { code } = await api('GET', `/friendcodes/${encodeURIComponent(cleAmi(g))}`).catch(() => ({}));
  if (code !== auto) await api('PUT', `/friendcodes/${encodeURIComponent(cleAmi(g))}`, { code: auto }).catch(() => {});
  return auto;
}

async function editFriendCode(g, current = '') {
  if (!current) current = (await invoke('ds_friend_code', { path: g.path }).catch(() => null)) || (await api('GET', `/friendcodes/${encodeURIComponent(cleAmi(g))}`).catch(() => ({}))).code || '';
  await new Promise((done) => {
    const save = async () => {
      try {
        await api('PUT', `/friendcodes/${encodeURIComponent(cleAmi(g))}`, { code: $('#fc').value });
        done();
      } catch (e) {
        sheet('Code ami', esc(e), [{ label: 'Réessayer', fn: () => editFriendCode(g).then(done) }, { label: 'Plus tard', fn: done }]);
      }
    };
    sheet('Ton code ami', `Les autres joueurs en ont besoin pour te trouver dans <b>${esc(g.name)}</b>. Il apparaît dans le jeu une fois connecté au Wi-Fi (Pokémon : Carnet d'amis, ta propre fiche).`, [
      { label: 'Enregistrer', fn: save },
      { label: 'Plus tard', fn: done },
    ], '<input id="fc" maxlength="14" placeholder="0000-0000-0000" spellcheck="false" autocomplete="off" inputmode="numeric">');
    $('#fc').value = current;
    $('#fc').focus();
  });
}

/** Signe de vie toutes les 30 s. En DS, rapporte aussi les codes ami. */
const heartbeatNow = () => session && api('POST', `/sessions/${session.code}/heartbeat`).then((v) => {
  if (!session) return;
  if (v.members && JSON.stringify(v.members) !== JSON.stringify(session.members)) {
    const avant = new Map(session.members.map((m) => [m.id, m.name]));
    const apres = new Map(v.members.map((m) => [m.id, m.name]));
    const arrives = [...apres].filter(([id]) => !avant.has(id)).map(([, n]) => n);
    const partis = [...avant].filter(([id]) => !apres.has(id)).map(([, n]) => n);
    if (arrives.length) son('arrivee', true);
    else if (partis.length) son('fermer', true);
    const texte = [arrives.length && `${noms(arrives)} ${arrives.length > 1 ? 'ont' : 'a'} rejoint la session`, partis.length && `${noms(partis)} ${partis.length > 1 ? 'ont' : 'a'} quitté la session`].filter(Boolean).join(' · ');
    if (texte) notifier({ type: 'session', texte, image: 'img/loc/loc_enligne.gif' }, { bulle: !current });
    session.members = v.members;
    if (current) envoyerHabillage();
    if (salle?.mode === 'salle') drawSalle(); // quelqu'un entre dans la salle
  }
  if (v.waiting) {
    session.waiting = v.waiting;
    onWaiting(v.waiting);
  }
  if (v.players !== session.players) {
    session.players = v.players;
    updatePresence();
  }
}).catch(() => {});
function startBeat() {
  clearInterval(beat);
  beat = setInterval(heartbeatNow, 10000); // 10 s pour que l'hôte voie vite qui attend
}

/** Switch : salon sur le serveur du Local ou sur le PC de l'hôte. Rend null, 'pc' ou false (annulé). */
function choisirSalon(g) {
  if (g.console !== 'Switch') return Promise.resolve(null);
  return new Promise((ok) => sheet('Où héberger la partie ?', 'Le serveur du Local marche pour tout le monde. Sur ton PC, les autres se connectent directement à toi : moins de latence, si ta connexion est bonne (la fibre de préférence).', [
    { label: 'Serveur du Local', fn: () => ok(null) },
    { label: 'Sur mon PC', fn: () => ok('pc') },
    { label: 'Annuler', cancel: true, fn: () => ok(false) },
  ]));
}
/** Salon sur ce PC : pare-feu, box, puis Loc vérifie qu'on est joignable. */
async function salonSurMonPc(g, places) {
  status('Préparation du salon sur ton PC…');
  try {
    const port = await invoke('salon_preparer');
    const { jeton } = await api('POST', '/sessions/sonde', { port });
    if (!(await invoke('salon_sonde', { jeton }))) throw new Error('ton PC n\'est pas joignable depuis Internet (box sans UPnP, ou adresse partagée par ton opérateur)');
    return { port, password: await invoke('salon_lancer', { places: places || 4 }) };
  } catch (e) {
    invoke('salon_fermer');
    toast(`Salon sur ton PC impossible : ${e.message || e}. La partie passe par le serveur du Local.`);
  } finally {
    status('');
  }
}

/** Session en pleine partie, sans relancer le jeu (Switch et DS). */
function sessionEnJeu() {
  const g = current;
  if (!g) return;
  const retour = () => (($('#menu').style.display = 'grid'), drawMenu());
  $('#menu').style.display = 'none';
  if (!me) return sheet('Session en ligne', 'Connecte-toi avec Discord pour jouer avec les membres.', [{ label: 'Retour', cancel: true, fn: retour }]);
  if (!['Switch', 'DS', '3DS'].includes(g.console)) {
    return sheet('Session en ligne', `En ${LONG[g.console]}, le jeu en ligne demande de lancer la partie ensemble : quitte le jeu, puis crée ou rejoins la session depuis la bibliothèque.`, [{ label: 'Retour', cancel: true, fn: retour }]);
  }
  if (session) {
    return sheet(`Session ${session.code}`, 'Tu es dans cette session. Donne ce code aux autres : « Rejoindre avec un code » dans En Local.', [
      { label: 'Quitter la session', fn: () => quitterSessionEnJeu(g) },
      { label: 'Retour', cancel: true, fn: retour },
    ]);
  }
  sheet('Session en ligne', 'Sans quitter ta partie : les autres te rejoignent avec un code, ou tu rejoins le leur. Dans le jeu, choisis ensuite le mode sans fil local.', [
    { label: 'Créer une session (code)', fn: () => creerSessionEnJeu(g).catch((e) => (oops(e), retour())) },
    { label: 'Rejoindre avec un code', fn: () => ouvrirCode('', { suite: (code) => rejoindreEnJeu(g, code).catch((e) => (oops(e), retour())), annuler: retour }) },
    { label: 'Retour', cancel: true, fn: retour },
  ]);
}
/** Quitte la session sans quitter le jeu : l'émulateur sort du salon, la partie continue en solo. */
function quitterSessionEnJeu(g) {
  const code = session?.code;
  leaveSession();
  if (['Switch', '3DS'].includes(g.console)) invoke('salon_en_jeu', { room: { host: '', port: 0, nickname: '', password: '' } }).catch(() => {});
  updatePresence();
  envoyerHabillage();
  toast(`Session ${code} quittée : ta partie continue en solo.`);
  $('#menu').style.display = 'grid';
  drawMenu();
}
async function creerSessionEnJeu(g) {
  const f = fiche(g);
  const places = f && Math.max(f.players || 0, f.online || 0);
  const slots = places > 1 ? Math.min(8, places) : undefined;
  const ou = await choisirSalon(g);
  if (ou === false) return sessionEnJeu();
  const salon = ou === 'pc' ? await salonSurMonPc(g, slots) : undefined;
  const s = await api('POST', '/sessions', { game: g.name, console: g.console, titleId: ['3DS', 'Switch'].includes(g.console) ? g.title_id || '' : '', gameKey: dsKey(g), slots, salon }).catch((e) => {
    if (salon) invoke('salon_fermer');
    throw e;
  });
  if (salon && !s.chezHote) invoke('salon_fermer');
  session = { code: s.code, members: s.members, players: s.players, slots: s.slots, gameKey: s.gameKey };
  compter('sessionsCreees');
  compterJeu(g, 's');
  startBeat(s.code);
  if (s.room) await invoke('salon_en_jeu', { room: s.room });
  updatePresence();
  sheet(`Session ${s.code}`, 'Donne ce code aux autres : « Rejoindre avec un code » dans En Local, ou invite-les depuis Social. Dans le jeu, choisis le mode sans fil local.', [{ label: 'Reprendre le jeu', fn: () => (($('#menu').style.display = 'grid'), closeMenu()) }]);
}
async function rejoindreEnJeu(g, code) {
  const s = await api('POST', `/sessions/${encodeURIComponent(code)}/join`);
  // Pas le même jeu : on sort de la session.
  // Versions compatibles (Pokémon Noir dans une session de Blanc) acceptées en DS et 3DS.
  const cle = g.console === 'DS' ? dsKey(g) : g.title_id;
  const sienne = s.console === 'DS' ? s.gameKey : s.titleId;
  const meme = s.console === g.console && (!sienne || sienne === cle || (['DS', '3DS'].includes(g.console) && familleDe(sienne).includes(cle)));
  if (!meme) {
    api('DELETE', `/sessions/${s.code}`).catch(() => {});
    throw new Error(`Cette session est sur ${s.game} (${NOMS[s.console] || s.console}) : quitte ta partie pour la rejoindre.`);
  }
  session = { code: s.code, members: s.members, players: s.players, slots: s.slots, gameKey: s.gameKey };
  compter('sessionsRejointes');
  compterJeu(g, 's');
  startBeat(s.code);
  if (s.room) await invoke('salon_en_jeu', { room: s.room });
  updatePresence();
  sheet(`Session ${s.code}`, 'Tu es dans la session. Dans le jeu, choisis le mode sans fil local pour retrouver les autres.', [{ label: 'Reprendre le jeu', fn: () => (($('#menu').style.display = 'grid'), closeMenu()) }]);
}

async function host(i) {
  const g = games[i];
  try {
    await ensureFriendCode(g);
    // Places selon GameTDB. GameCube et Wii : 4 au plus (netplay Dolphin).
    const f = fiche(g);
    const places = f && (['GC', 'Wii'].includes(g.console) ? f.players : Math.max(f.players || 0, f.online || 0));
    const slots = places > 1 ? Math.min(8, places) : undefined;
    const ou = await choisirSalon(g);
    if (ou === false) return;
    const salon = ou === 'pc' ? await salonSurMonPc(g, slots) : undefined;
    const s = await api('POST', '/sessions', { game: g.name, console: g.console, titleId: ['3DS', 'Switch'].includes(g.console) ? g.title_id || '' : '', gameKey: g.disc_id ? g.disc_id.slice(0, 4) : dsKey(g), slots, salon }).catch((e) => {
      if (salon) invoke('salon_fermer');
      throw e;
    });
    if (salon && !s.chezHote) invoke('salon_fermer'); // Loc a refusé le salon du PC : le serveur du Local
    session = { code: s.code, members: s.members, players: s.players, slots: s.slots, gameKey: s.gameKey };
    compter('sessionsCreees');
    compterJeu(g, 's');
    // Sans signe de vie de l'hôte pendant 2 min, Loc ferme la session.
    startBeat(s.code);
    if (g.console === 'GC' || g.console === 'Wii') return netplayLobby(i, '');
    const aide = {
      DS: 'Une fois dans le jeu, connectez-vous au Wi-Fi : vos codes ami sont dans le menu (touche Accueil).',
      Switch: 'Les autres le tapent dans « Rejoindre avec un code ». Dans le jeu, choisissez le mode sans fil local.',
    }[g.console] || 'Les autres le tapent dans « Rejoindre avec un code », ou cliquent sur Rejoindre dans Discord.';
    salleSession({ i, hosting: true, texte: aide, actions: [
      { label: 'Lancer le jeu', k: 'a', fn: () => (fermerSalle(), play(i, s.room)) },
      { label: 'Inviter', k: 'x', fn: choisirInvite },
      { label: 'Annuler', k: 'b', fn: () => (fermerSalle(), leaveSession()) },
    ] });
  } catch (e) {
    oops(e);
  }
}

// Lien enlocal://join/CODE, reçu au lancement ou par l'instance déjà ouverte.
let pendingCode = null;
function openLink(code) {
  if (!code) return;
  if (current) return oops(`Quitte le jeu en cours pour rejoindre la session ${code}.`);
  if (!me) {
    pendingCode = code;
    return status(`Connecte-toi avec Discord pour rejoindre la session ${code}.`);
  }
  ouvrirCode(code);
}
listen('lien', (e) => openLink(e.payload));

async function join(code) {
  try {
    const s = await api('POST', `/sessions/${encodeURIComponent(code.trim())}/join`);
    // Chacun joue avec son propre jeu : même title ID, même jeu DS, sinon même nom.
    let i = games.findIndex((g) => (s.console === 'DS' ? s.gameKey && dsKey(g) === s.gameKey : s.titleId && g.title_id === s.titleId));
    // Sinon une version compatible.
    if (i < 0 && (s.console === 'DS' || s.console === '3DS')) {
      const f = familleDe(s.console === 'DS' ? s.gameKey : s.titleId);
      i = games.findIndex((g) => g.console === s.console && f.includes(s.console === 'DS' ? dsKey(g) : g.title_id));
    }
    if (i < 0 && (s.console === 'GC' || s.console === 'Wii')) i = games.findIndex((g) => g.console === s.console && g.disc_id && g.disc_id.slice(0, 4) === s.gameKey);
    if (i < 0) i = games.findIndex((g) => g.name === s.game);
    if (i < 0) {
      api('DELETE', `/sessions/${s.code}`).catch(() => {});
      return oops(`Il te faut ton propre exemplaire de ${s.game} (ou d'une version compatible) pour rejoindre cette session.`);
    }
    session = { code: s.code, members: s.members, players: s.players, slots: s.slots, gameKey: s.gameKey };
    await ensureFriendCode(games[i]);
    compter('sessionsRejointes');
    compterJeu(games[i], 's');
    startBeat(s.code);
    if (s.console === 'GC' || s.console === 'Wii') return netplayJoin(i, s);
    play(i, s.room);
  } catch (e) {
    oops(e);
  }
}

/*
 * Netplay GameCube / Wii (Dolphin) : pas d'arrivée en pleine partie.
 * Ceux qui arrivent attendent, l'hôte relance avec eux.
 */
let lobbyGame = null;
let netplay = null;

/** hostCode vide : on héberge. */
async function netplayLobby(i, hostCode) {
  const g = games[i];
  lobbyGame = i;
  const hosting = !hostCode;
  netplay = { hosting, game: g, players: 1, relaunchTarget: 0, relaunchUntil: 0 };
  let sentCode = '';
  let playing = false;
  let lancement = false;
  const aide = (n) => hosting
    ? `${n} joueur${n > 1 ? 's' : ''} dans la salle netplay. Lance quand tout le monde est là.`
    : `${n} joueur${n > 1 ? 's' : ''} dans la salle. La partie démarre quand l'hôte la lance.`;
  const launch = () => {
    lancement = true;
    invoke('netplay_launch');
    salleSession({ i, hosting, texte: 'Lancement de la partie chez tout le monde…', actions: [{ label: 'Annuler', k: 'b', fn: cancelLobby }] });
  };
  const showLobby = (texte) => {
    lancement = false;
    salleSession({ i, hosting, texte, actions: hosting
      ? [{ label: 'Lancer la partie', k: 'a', fn: launch }, { label: 'Inviter', k: 'x', fn: choisirInvite }, { label: 'Annuler', k: 'b', fn: cancelLobby }]
      : [{ label: 'Quitter la salle', k: 'b', fn: cancelLobby }] });
  };
  showLobby('Connexion au netplay…');
  // Statut Discord dès la salle d'attente, pour que les autres puissent rejoindre.
  lobbyPresence = g;
  playStart = Math.floor(Date.now() / 1000);
  updatePresence();
  const stop = await listen('netplay', async (e) => {
    const l = e.payload;
    netplay && (netplay.players = l.players || 1);
    if (hosting && l.code && l.code !== sentCode && session) {
      sentCode = l.code;
      api('PUT', `/sessions/${session.code}/hostcode`, { hostCode: l.code }).catch(() => {});
    }
    if (l.closed || l.error) {
      stop();
      const wasPlaying = current;
      cancelLobby();
      if (wasPlaying) { compterTemps(); current = null; $('#jeu').style.display = 'none'; status(''); updatePresence(); }
      return oops(l.error ? 'Connexion au netplay impossible (partie en cours chez l\'hôte, ou hôte parti).' : 'La partie en ligne est terminée.');
    }
    if (l.playing && !playing) {
      playing = true;
      fermerSalle();
      current = g;
      dernierCompte = Date.now();
      for (const ms of [0, 2000, 6000, 15000]) setTimeout(() => current === g && volumeJeu(), ms);
      setTimeout(() => current === g && envoyerHabillage(), 500);
      lobbyPresence = null;
      netplay.relaunchTarget = 0;
      if (hosting && session) api('PUT', `/sessions/${session.code}/running`, { running: true }).catch(() => {});
      updatePresence();
      status(`${g.name} : partie en ligne`);
      return;
    }
    if (!l.playing && playing) {
      // Partie arrêtée pour une relance : retour en salle.
      playing = false;
      if (shown('#menu')) $('#menu').style.display = 'none';
      if (hosting && session) api('PUT', `/sessions/${session.code}/running`, { running: false }).catch(() => {});
      showLobby(aide(l.players || 1));
    }
    if (!l.playing && hosting && netplay.relaunchTarget) {
      // Relance dès que les nouveaux sont là, ou au bout de 40 s.
      if ((l.players || 1) >= netplay.relaunchTarget || Date.now() > netplay.relaunchUntil) {
        netplay.relaunchTarget = 0;
        launch();
        return;
      }
      if (salle) salleSession({ i, texte: `Relance de la partie : ${l.players || 1} joueur${l.players > 1 ? 's' : ''} sur ${netplay.relaunchTarget} dans la salle…` });
      return;
    }
    if (!l.playing && salle && !lancement) salleSession({ i, texte: aide(l.players || 1) });
  });
  try {
    await invoke('netplay', { path: g.path, hostCode, name: me?.name || 'Joueur', opts: optsDe(g) });
  } catch (err) {
    stop();
    cancelLobby();
    oops(err);
  }
}

let announced = new Set();
function onWaiting(waiting) {
  if (!netplay?.hosting || !current) return;
  const nouveaux = waiting.filter((w) => !announced.has(w.id));
  nouveaux.forEach((w) => announced.add(w.id));
  if (nouveaux.length) {
    const noms = nouveaux.map((w) => w.name).join(', ');
    invoke('netplay_message', { text: `${noms} veut rejoindre : touche Accueil, puis « Relancer avec ${nouveaux.length > 1 ? 'eux' : 'lui'} »` }).catch(() => {});
  }
}

async function relaunchWithWaiting() {
  const n = session?.waiting?.length || 0;
  netplay.relaunchTarget = (netplay.players || 1) + n;
  netplay.relaunchUntil = Date.now() + 40000;
  $('#menu').style.display = 'none';
  await invoke('netplay_stop');
}

async function netplayJoin(i, s) {
  let info = s;
  let cancelled = false;
  salleSession({ i, hosting: false, texte: info.running ? `L'hôte joue déjà à ${info.game}. Il est prévenu : tu entres dès qu'il relance la partie.` : 'L\'hôte prépare la partie…', actions: [{ label: 'Annuler', k: 'b', fn: () => { cancelled = true; fermerSalle(); leaveSession(); } }] });
  if (info.running) {
    while (!cancelled && info.running) {
      await new Promise((r) => setTimeout(r, 2000));
      info = await api('POST', `/sessions/${s.code}/join`).catch(() => ({ running: false, hostCode: null }));
    }
    if (cancelled) return;
    salleSession({ i, texte: 'L\'hôte prépare la partie…' });
  }
  let hostCode = info.hostCode;
  for (let n = 0; !hostCode && n < 20; n++) {
    await new Promise((r) => setTimeout(r, 1500));
    if (cancelled) return;
    hostCode = (await api('POST', `/sessions/${s.code}/join`).catch(() => ({}))).hostCode;
  }
  if (!hostCode) {
    fermerSalle();
    leaveSession();
    return oops('L\'hôte n\'a pas encore ouvert sa partie. Réessaie dans un moment.');
  }
  netplayLobby(i, hostCode);
}

function cancelLobby() {
  invoke('netplay_cancel');
  lobbyPresence = null;
  netplay = null;
  announced = new Set();
  if (!current) updatePresence();
  fermerSalle();
  lobbyGame = null;
  leaveSession();
}

/* Statut Discord « Joue à En Local » */
const CONSOLES = { DS: 'Nintendo DS', '3DS': 'Nintendo 3DS', GC: 'GameCube', Wii: 'Wii', WiiU: 'Wii U', Switch: 'Nintendo Switch' };
let playStart = 0;
let lobbyPresence = null;
const appStart = Math.floor(Date.now() / 1000);
function updatePresence() {
  envoyerPresence();
  // « Montrer à quoi je joue » sur Non : jeu caché, sauf en session.
  const g = session || partage('montrerJeu') ? current || lobbyPresence : null;
  if (!g) return invoke('presence', { p: { details: 'Dans les menus', start: appStart } }).catch(() => {});
  const p = { details: g.name, state: CONSOLES[g.console] || g.console, start: playStart };
  if (session) {
    Object.assign(p, {
      state: `Session ${session.code}`,
      session: session.code,
      players: session.players || 1,
      slots: session.slots || 4,
      joinUrl: `https://loc-lab.fr/enlocal/join/${session.code}`,
    });
  }
  invoke('presence', { p }).catch(() => {});
}

/** Données envoyées à la fenêtre d'habillage. */
function envoyerHabillage() {
  const g = current;
  if (!g) return;
  const parId = new Map(membres.map((m) => [m.id, m]));
  const ds = g.console === 'DS';
  // DS : l'image est dans notre fenêtre, à la taille de son canvas.
  const format = ds ? (localStorage.habillage === 'noir' || !canvas.height ? 0 : canvas.width / canvas.height) : Number(optsDe(g).format_jeu) || 0;
  window.__TAURI__.event.emitTo('habillage', 'habillage', {
    format,
    moi: me?.avatar || '',
    ecrans: ds ? null : ecransJeu(g, optsDe(g)),
    session: session ? { code: session.code, places: session.slots, membres: (session.members || []).map((m) => ({ id: m.id, name: m.name, avatar: parId.get(m.id)?.avatar || (m.id === me?.id ? me.avatar : '') })) } : null,
    widgets: localStorage.widgetsJeu !== 'non',
    chasse: chasseActive(g) ? +localStorage[`resets:${g.path}`] || 0 : null,
    theme: document.body.classList.contains('oled') ? 'oled' : '',
  }).catch((e) => invoke('journal', { texte: `habillage : envoi impossible ${e}` }));
  if (ds) {
    $('#jeu').classList.toggle('habille', format > 0 && !shown('#menu'));
    invoke('habillage_ds', { format, visible: !shown('#menu') }).catch(() => {});
  }
}
listen('habillage-pret', envoyerHabillage);

/** Mises à jour : vérifiées au démarrage, installées hors jeu. */
async function verifierMaj() {
  if (!localStorage.token) return;
  const [v, notes] = (await invoke('verifier_maj', { jeton: localStorage.token }).catch(() => null)) || [];
  if (!v) return;
  const installer = async () => {
    if (current) return toast('Quitte ton jeu pour installer la mise à jour.');
    // Progression en direct ; En Local se ferme tout seul à la fin pour installer.
    sheet(`Mise à jour ${v}`, 'Téléchargement…', []);
    const fin = await listen('maj-progres', ({ payload: [fait, total, essai] }) => {
      const mo = (x) => Math.round(x / 1048576);
      $('#sheet-texte').textContent = `${total ? `${Math.floor((fait / total) * 100)} %` : `${mo(fait)} Mo`} · ${mo(fait)} Mo sur ${mo(total) || '?'} Mo${essai > 1 ? ` · nouvel essai (${essai}/3)` : ''}. En Local redémarre tout seul à la fin.`;
    });
    await invoke('installer_maj', { jeton: localStorage.token }).catch((e) => {
      fin();
      sheet('Mise à jour impossible', `Le téléchargement a été coupé (${esc(String(e))}). Ta connexion a peut-être coupé : réessaie, ou installe la mise à jour depuis le site.`, [
        { label: 'Réessayer', fn: installer },
        { label: 'Ouvrir le site', fn: () => invoke('ouvrir_site').catch(() => {}) },
        { label: 'Plus tard', cancel: true },
      ]);
    });
  };
  const liste = (notes || '').split('\n').filter(Boolean).map((l) => `• ${esc(l)}`).join('<br>');
  if (!notifs.some((n) => n.type === 'maj' && n.version === v)) notifier({ type: 'maj', texte: `En Local ${v} est disponible`, image: 'img/loc/loc_maj.gif', version: v }, { bulle: false });
  sheet(`En Local ${v} est disponible`, `${liste ? `${liste}<br><br>` : ''}Elle s'installe en une minute, puis l'app redémarre (tes réglages et tes jeux ne bougent pas).`, [
    { label: 'Installer maintenant', fn: installer },
    { label: 'Plus tard', cancel: true },
  ]);
}

function leaveSession() {
  if (!session) return;
  clearInterval(beat);
  invoke('salon_fermer'); // salon sur ce PC, s'il y en a un
  api('DELETE', `/sessions/${session.code}`).catch(() => {});
  session = null;
}

/* ---------- Accueil ---------- */
const NOMS = { DS: 'DS', '3DS': '3DS', GC: 'GameCube', Wii: 'Wii', WiiU: 'Wii U', Switch: 'Switch' };
let onglet = 'accueil', sessionsLocal = [], tileFocus = 0;

// Temps de jeu par jeu, gardé dans data\stats.json.
const stats = {};
const saveStats = () => invoke('save_stats', { json: JSON.stringify(stats) }).catch(() => {});
async function chargerStats() {
  const fichier = await invoke('load_stats').catch(() => '');
  if (fichier) Object.assign(stats, JSON.parse(fichier));
  // Ancienne version : les comptes étaient dans le cache, on les déplace.
  else if (localStorage.stats) (Object.assign(stats, JSON.parse(localStorage.stats)), await saveStats());
  delete localStorage.stats;
  if (rattacherStats()) await saveStats();
}
/** Un jeu déplacé garde son temps (même console, même nom de fichier). */
function rattacherStats() {
  const ici = new Set(games.map((g) => g.path));
  // Wii U décompressé : le nom du dossier du jeu.
  const cle = (p) => { const m = p.split(/[\\/]/); return /\.rpx$/i.test(m.at(-1)) ? 'rpx:' + m.at(-3) : m.at(-1).toLowerCase(); };
  let bouge = false;
  for (const [p, s] of Object.entries(stats)) {
    if (ici.has(p)) continue;
    const g = games.find((x) => cle(x.path) === cle(p));
    if (!g) continue;
    const d = (stats[g.path] ||= { secs: 0, last: 0 });
    d.secs += s.secs || 0;
    d.last = Math.max(d.last || 0, s.last || 0);
    delete stats[p];
    bouge = true;
  }
  return bouge;
}
/** Temps réel depuis le dernier compte, arrêté pendant le menu du jeu. */
let dernierCompte = 0;
function compterTemps() {
  const now = Date.now();
  if (current && dernierCompte && !shown('#menu')) {
    const s = (stats[current.path] ||= { secs: 0, last: 0 });
    s.secs += Math.min(3600, Math.round((now - dernierCompte) / 1000));
    s.last = now;
    saveStats();
  }
  dernierCompte = current ? now : 0;
}
setInterval(() => {
  if (!current) return;
  compterTemps();
  if (shown('#menu')) return;
  jourDeJeu();
  compterJeu(current, 'jour');
}, 60000);

/** Dernière image de la partie, pour la tuile « Reprendre ». */
function saveShot(g) {
  if (!g || !canvas.width) return;
  const url = cadrer(canvas, g.console);
  try { if (url) localStorage['shot:' + g.path] = url; } catch {}
}
/** Image cadrée : sans bandes noires et, en DS et 3DS, l'écran du haut seulement. */
function cadrer(src, console) {
  const w = src.width, h = src.height;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(src, 0, 0);
  const px = x.getImageData(0, 0, w, h).data;
  const noir = (i, j) => { const k = (j * w + i) * 4; return px[k] + px[k + 1] + px[k + 2] < 75; };
  // Vide : 98 % noir.
  const vide = (n, at) => { let k = 0; for (let t = 0; t < n; t++) k += at(t); return k >= n * 0.98; };
  let haut = 0, bas = h, gauche = 0, droite = w;
  while (haut < bas && vide(w, (i) => noir(i, haut))) haut++;
  while (bas > haut && vide(w, (i) => noir(i, bas - 1))) bas--;
  while (gauche < droite && vide(bas - haut, (j) => noir(gauche, haut + j))) gauche++;
  while (droite > gauche && vide(bas - haut, (j) => noir(droite - 1, haut + j))) droite--;
  const cw = droite - gauche;
  if (cw < 16 || bas - haut < 16) return null;
  const ecranHaut = { DS: 192 / 256, '3DS': 240 / 400 }[console];
  const ch = ecranHaut ? Math.min(bas - haut, Math.round(cw * ecranHaut)) : bas - haut;
  const out = document.createElement('canvas');
  out.width = Math.min(cw, 960);
  out.height = Math.round(out.width * ch / cw);
  out.getContext('2d').drawImage(c, gauche, haut, cw, ch, 0, 0, out.width, out.height);
  return out.toDataURL('image/jpeg', 0.85);
}
async function recadrerAnciennes() {
  if (localStorage.cadrage) return;
  for (const g of games) {
    const img = new Image();
    img.src = shotOf(g) || '';
    if (!img.src.startsWith('data:') || !(await img.decode().then(() => true, () => false))) continue;
    const url = cadrer(img, g.console);
    try { if (url) localStorage['shot:' + g.path] = url; } catch {}
  }
  localStorage.cadrage = 1;
}
const shotOf = (g) => localStorage['shot:' + g.path];

/**
 * Jaquettes GameTDB, recadrées sur l'illustration.
 * ratio : largeur / hauteur une fois recadrée.
 */
const JAQUETTES = {
  Wii: { ratio: 0.715, variantes: [['wii/coverfullHQ', 'png', 'inset(0 0 0 52.5%)'], ['wii/cover', 'png', '']] },
  GC: { ratio: 0.71, variantes: [['wii/coverfullHQ', 'png', 'inset(0 0 0 53%)'], ['wii/cover', 'png', '']] },
  DS: { ratio: 0.95, variantes: [['ds/coverHQ', 'jpg', 'inset(0 0 0 16%)'], ['ds/coverM', 'jpg', 'inset(0 0 0 16%)'], ['ds/coverS', 'png', '']] },
  '3DS': { ratio: 0.99, variantes: [['3ds/coverHQ', 'jpg', 'inset(0 12% 0 0)'], ['3ds/coverM', 'jpg', 'inset(0 12% 0 0)'], ['3ds/box', 'png', '']] },
  WiiU: { ratio: 0.8, variantes: [['wiiu/coverHQ', 'jpg', 'inset(11% 0 0 0)'], ['wiiu/cover3D', 'png', '']] },
  Switch: { ratio: 0.62, variantes: [['switch/coverHQ', 'jpg', ''], ['switch/coverM', 'jpg', ''], ['switch/box', 'png', '']] },
};
/** Jeu Switch eShop : la jaquette GameTDB est un modèle rouge, on garde l'image du milieu. */
const cadreEshop = (g, url) => (fiche(g)?.eshop && /\/switch\/cover(HQ|M)\//.test(url) ? 'inset(30.2% 10.3% 42.8% 10.3%)' : null);
const CADRE_ESHOP = 'inset(30.2% 10.3% 42.8% 10.3%)';
/** Reconnaît un modèle eShop à son rouge, en trois points. */
function modeleEshop(fichier) {
  return new Promise((ok) => {
    const im = new Image();
    im.crossOrigin = 'anonymous';
    im.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = 40;
        c.height = 64;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(im, 0, 0, 40, 64);
        const rouge = ([x, y]) => {
          const [r, v, b] = ctx.getImageData(Math.round(x * 39), Math.round(y * 63), 1, 1).data;
          return r > 180 && v < 60 && b < 70;
        };
        ok([[0.85, 0.1], [0.12, 0.66], [0.88, 0.94]].every(rouge) ? CADRE_ESHOP : '');
      } catch {
        ok('');
      }
    };
    im.onerror = () => ok('');
    im.src = asset(fichier);
  });
}
/** Identifiant GameTDB d'un jeu. */
const idGametdb = (g) => g.gametdb || (g.console === 'Switch' ? fiche(g)?.id : g.console === 'GC' || g.console === 'Wii' ? g.disc_id : g.product_code);
/** Jeu d'un membre que je n'ai pas : de quoi afficher sa jaquette. */
const jeuDeMembre = (c, t, id) => ({ path: `membre:${c}:${id}`, console: c, name: t, gametdb: id });
function covers(g) {
  const id = idGametdb(g);
  const j = JAQUETTES[g.console];
  if (!id || !j) return [];
  const region = { E: 'US', P: 'EN', F: 'FR', D: 'DE', S: 'ES', I: 'IT', J: 'JA', A: 'EN' }[id[3]] || 'EN';
  const regions = [...new Set([region, 'EN', 'US', 'FR', 'JA'])];
  return j.variantes.flatMap(([chemin, ext, crop]) => regions.map((r) => ({ url: `https://art.gametdb.com/${chemin}/${r}/${id}.${ext}`, crop })));
}
/** Essaie les jaquettes une à une et retient celle qui marche (ou l'absence de jaquette). */
const jaquettes = JSON.parse(localStorage.jaquettes || '{}');
const retenir = (k, v) => {
  jaquettes[k] = v;
  try { localStorage.jaquettes = JSON.stringify(jaquettes); } catch (e) { invoke('journal', { texte: `jaquettes non gardées : ${e}` }); }
};
let coverSeq = 0;
function coverImg(g, cls, loin = false) {
  const cle = g.path;
  // « Pas de jaquette » n'est retenu qu'un jour.
  if (jaquettes[cle]?.aucune > Date.now() - 864e5) return '';
  const k = ++coverSeq;
  const j = jaquettes[cle];
  if (j?.fichier && g.console === 'Switch' && !j.crop && !j.eshopVu) {
    j.eshopVu = 1;
    modeleEshop(j.fichier).then((cr) => {
      retenir(cle, { ...j, crop: cr });
      if (cr) for (const img of document.querySelectorAll(`img.jaquette[src="${CSS.escape(asset(j.fichier))}"]`)) (img.style.objectViewBox = cr), img.classList.add('eshop'), (img.dataset.cadre = 'attente'), cadrerEshop(img);
    });
  }
  // Jaquette déjà sur le PC : affichée tout de suite.
  if (j?.fichier) return `<img class="${cls} jaquette${j.crop === CADRE_ESHOP ? ' eshop" data-cadre="attente' : ''}" src="${esc(asset(j.fichier))}" style="object-view-box:${esc(j.crop || 'none')}" data-k="${k}" alt=""${loin ? ' loading="lazy" decoding="async"' : ''}>`;
  chercherJaquette(g, k);
  return `<img class="${cls} jaquette" data-k="${k}" alt="">`;
}
/** Jaquettes téléchargées une fois dans data\jaquettes. Une seule recherche par jeu. */
const recherches = new Map();
// Corrige une ancienne erreur, une seule fois.
if (!localStorage.jaquettesV2) {
  for (const [k, v] of Object.entries(jaquettes)) if (v?.aucune) delete jaquettes[k];
  try { localStorage.jaquettes = JSON.stringify(jaquettes); } catch {}
  localStorage.jaquettesV2 = 1;
}
function chercherJaquette(g, k) {
  // Pas encore d'adresse (fiche Switch pas chargée) : on attend.
  if (!covers(g).length) return;
  if (!recherches.has(g.path)) {
    const liste = covers(g);
    recherches.set(g.path, (liste.length ? invoke('jaquette', { urls: liste.map((c) => c.url) }) : Promise.resolve(null)).catch(() => null).then((r) => {
      recherches.delete(g.path);
      const c = r && liste[r[1]];
      const v = c ? { fichier: r[0], crop: cadreEshop(g, c.url) || c.crop || '', eshopVu: 1 } : { aucune: Date.now() };
      return (c && g.console === 'Switch' && !v.crop ? modeleEshop(r[0]).then((cr) => (v.crop = cr)) : Promise.resolve()).then(() => (retenir(g.path, v), c ? v : null));
    }));
  }
  recherches.get(g.path).then((v) => {
    for (const img of document.querySelectorAll(`img.jaquette[data-k="${k}"]`)) {
      if (!v) { img.remove(); continue; }
      img.style.objectViewBox = v.crop || 'none';
      img.classList.toggle('eshop', v.crop === CADRE_ESHOP);
      if (v.crop === CADRE_ESHOP) img.dataset.cadre = 'attente';
      img.src = asset(v.fichier);
    }
  });
}
// Image chargée : le nom du jeu s'efface. Le « load » d'une image ne remonte pas jusqu'à window.
document.addEventListener('load', (e) => e.target.dataset?.k && e.target.classList.contains('jaquette') && e.target.parentNode?.querySelector('.sans')?.classList.add('cache'), true);
document.addEventListener('load', (e) => e.target.dataset?.cadre === 'attente' && cadrerEshop(e.target), true);
/** Modèle eShop : l'icône est remplie par l'image ; la jaquette verticale montre l'image entière sur un fond flouté d'elle-même. */
const cadresEshop = new Map();
function cadrerEshop(img) {
  const forme = img.closest('.g') ? JAQUETTES.Switch.ratio : img.matches('.icone-img, .m-img') ? 1 : 0;
  if (!forme || !img.src.startsWith(asset(''))) return (img.dataset.cadre = 'fait');
  const cle = `${img.src}|${forme}`;
  if (!cadresEshop.has(cle)) {
    cadresEshop.set(cle, new Promise((ok) => {
      const im = new Image();
      im.crossOrigin = 'anonymous';
      im.onload = () => {
        try {
          const [sx, sy, sw, sh] = [im.width * 0.103, im.height * 0.302, im.width * 0.794, im.height * 0.27];
          // L'image seule d'abord, sinon le flou reprend le rouge du modèle.
          const seule = document.createElement('canvas');
          seule.width = Math.round(sw);
          seule.height = Math.round(sh);
          seule.getContext('2d').drawImage(im, sx, sy, sw, sh, 0, 0, seule.width, seule.height);
          const c = document.createElement('canvas');
          c.width = 512;
          c.height = Math.round(512 / forme);
          const ctx = c.getContext('2d');
          // Icône : l'image remplit le carré (recadrée au centre).
          if (forme === 1) {
            const cote = Math.min(seule.width, seule.height);
            ctx.drawImage(seule, (seule.width - cote) / 2, (seule.height - cote) / 2, cote, cote, 0, 0, c.width, c.height);
            return ok(c.toDataURL('image/jpeg', 0.9));
          }
          const k = Math.max(c.width / sw, c.height / sh) * 1.2;
          ctx.filter = 'blur(28px) brightness(.55) saturate(1.3)';
          ctx.drawImage(seule, (c.width - sw * k) / 2, (c.height - sh * k) / 2, sw * k, sh * k);
          ctx.filter = 'none';
          const h = (c.width * sh) / sw;
          ctx.drawImage(seule, 0, (c.height - h) / 2, c.width, h);
          ok(c.toDataURL('image/jpeg', 0.9));
        } catch {
          ok('');
        }
      };
      im.onerror = () => ok('');
      im.src = img.src;
    }));
  }
  cadresEshop.get(cle).then((url) => {
    img.dataset.cadre = 'fait';
    if (url) (img.style.objectViewBox = 'none'), (img.src = url);
  });
}
addEventListener('error', (e) => {
  const img = e.target;
  if (!img.dataset?.k || !img.classList.contains('jaquette') || !img.getAttribute('src')) return;
  const g = games.find((x) => jaquettes[x.path]?.fichier && img.src === asset(jaquettes[x.path].fichier));
  img.removeAttribute('src');
  if (g) (delete jaquettes[g.path], chercherJaquette(g, +img.dataset.k));
}, true);

function resumeSucces(g) {
  const x = raJeux[g.path];
  return x ? `<span>Succès <b>${x.total ? `${x.gagnes || 0}/${x.total}` : x.nb}</b></span>` : '';
}

/** « Aussi chez… », avec un avertissement si les mises à jour diffèrent. */
function aussiChez(g) {
  const qui = possesseurs(g);
  if (!qui.length) return '';
  const a = contenus[g.path]?.maj;
  const autres = qui.filter((x) => majsDifferentes(x.maj, a));
  return `<div class="aussi"><div class="stack">${qui.slice(0, 4).map((x) => `<img class="av" src="${esc(x.m.avatar)}" alt="">`).join('')}</div><span>Aussi chez <b>${esc(noms(qui.slice(0, 3).map((x) => x.m.name)))}${qui.length > 3 ? ` et ${qui.length - 3} autre${qui.length > 4 ? 's' : ''}` : ''}</b>${autres.length ? `<small>Mise à jour différente chez ${esc(noms(autres.map((x) => `${x.m.name} (MAJ ${x.maj})`)))} : prenez la même pour jouer ensemble.</small>` : ''}</span></div>`;
}

function quand(ms) {
  if (!ms) return '';
  const jours = Math.floor((new Date().setHours(0, 0, 0, 0) - new Date(ms).setHours(0, 0, 0, 0)) / 864e5);
  return jours <= 0 ? 'Joué aujourd\'hui' : jours === 1 ? 'Joué hier' : `Joué il y a ${jours} jours`;
}
const duree = (s) => (s >= 3600 ? `${Math.floor(s / 3600)} h de jeu` : `${Math.max(1, Math.round(s / 60))} min de jeu`);
const noms = (l) => (l.length > 1 ? `${l.slice(0, -1).join(', ')} et ${l.at(-1)}` : l[0] || '');
const autres = () => sessionsLocal.filter((s) => s.code && s.host?.id !== me?.id);
const ownGame = (s) => games.findIndex((g) => g.name === s.game || (g.console === s.console && s.game && g.name.toLowerCase() === s.game.toLowerCase()));

/* ---------- Choisir une session ---------- */

const ilYA = (ms) => {
  const min = Math.max(0, Math.round((Date.now() - (+ms || Date.now())) / 60000));
  return min < 1 ? 'à l\'instant' : min < 60 ? `il y a ${min} min` : `il y a ${Math.floor(min / 60)} h`;
};
const vignetteSession = (s, cls = 'micro') => {
  const i = ownGame(s);
  return i >= 0 ? `<div class="icone ${cls}">${iconeHtml(games[i])}</div>` : `<span class="icone ${cls} sans">${iconeConsole(s.console)}</span>`;
};
const joueursSession = (s) => (Array.isArray(s.joueurs) ? s.joueurs : []).filter((j) => j && typeof j.name === 'string');
const placesSession = (s) => `<span class="places">${Array.from({ length: Math.min(8, +s.slots || 0) }, (_, k) => `<i class="${k < (+s.players || 0) ? 'prise' : ''}"></i>`).join('')}</span>`;
const badgeSession = (s) => (s.chezHote ? '<span class="badge-s direct">Sur son PC</span>' : '<span class="badge-s">Serveur du Local</span>');

function carteSession(s) {
  const j = joueursSession(s);
  return `${vignetteSession(s, 'carte')}<span class="cs-t"><b>${esc(s.game)}</b><small>${esc(NOMS[s.console] || s.console)} · ${esc(s.host?.name || '')} · ${ilYA(s.createdAt)}</small>
    <span class="cs-bas"><span class="stack">${j.slice(0, 5).map((x) => `<img class="av" src="${esc(x.avatar || 'img/hang-coucou.png')}" alt="">`).join('')}</span>${placesSession(s)}<em>${+s.players || 0}/${+s.slots || 0}</em></span></span>${badgeSession(s)}`;
}

function choisirSession() {
  if (!me) return login();
  const sess = autres();
  if (!sess.length) {
    return sheet('Sessions du Local', 'Personne ne joue en ligne pour l\'instant.', [
      { label: 'Créer une session', fn: () => choisirJeuSession() },
      { label: 'Rejoindre avec un code', fn: () => ouvrirCode() },
      { label: 'Fermer', cancel: true },
    ]);
  }
  sheet('Sessions du Local', `${sess.length} session${sess.length > 1 ? 's' : ''} ouverte${sess.length > 1 ? 's' : ''}. Choisis celle à rejoindre.`, [
    ...sess.map((x) => ({ html: carteSession(x), cls: 'carte-session', fn: () => detailSession(x) })),
    { label: 'Fermer', cancel: true },
  ]);
}
function detailSession(s) {
  const i = ownGame(s);
  const j = joueursSession(s);
  const jaq = i >= 0 ? coverImg(games[i], 'ds-jaq') : '';
  const manque = i < 0 ? `<p class="ds-manque">Tu n'as pas ce jeu dans ta bibliothèque : il faut le même jeu pour jouer ensemble.</p>` : '';
  const corps = `<div class="detail-session">
    <div class="ds-image">${jaq || vignetteSession(s, 'grand')}</div>
    <div class="ds-infos">
      <div class="ds-ligne">${badgeSession(s)}<span class="badge-s">${esc(LONG[s.console] || s.console)}</span></div>
      <div class="ds-hote"><img class="av" src="${esc(s.host?.avatar || 'img/hang-coucou.png')}" alt=""><span><small>Lancée par</small><b>${esc(s.host?.name || '')}</b><small>${ilYA(s.createdAt)}</small></span></div>
      <div class="ds-joueurs">${j.map((x) => `<span><img class="av" src="${esc(x.avatar || 'img/hang-coucou.png')}" alt="">${esc(x.name)}</span>`).join('')}</div>
      <div class="ds-places">${placesSession(s)}<em>${+s.players || 0} sur ${+s.slots || 0} places</em></div>
      ${manque}
    </div></div>`;
  const plein = (+s.players || 0) >= (+s.slots || 0);
  sheet(s.game, '', [
    ...(plein ? [] : [{ label: 'Rejoindre la session', fn: () => join(s.code) }]),
    { label: 'Retour', cancel: true, fn: choisirSession },
  ], corps);
}


function drawHome() {
  if (!$('#board')) return;
  verifierDefis();
  const recents = games.map((g, i) => ({ g, i, st: stats[g.path] })).filter((x) => x.st?.last).sort((a, b) => b.st.last - a.st.last);
  const reprise = recents[0];
  const sess = autres();

  drawMembres();
  $('#moi').innerHTML = me
    ? `<img class="me" src="${esc(me.avatar || 'img/hang-coucou.png')}" alt="">`
    : '<button class="login" id="login">Se connecter</button>';
  if ($('#login')) $('#login').onclick = login;
  $('#cloche').onclick = ouvrirNotifs;
  drawCloche();
  horloge();


  const invit = sess.find((s) => ownGame(s) >= 0);
  bulleSession = invit || null;
  // Loc ne parle que s'il a quelque chose à dire.
  $('#bulle').innerHTML = invit
    ? `${esc(invit.host?.name || 'Quelqu\'un')} joue à <b>${esc(invit.game)}</b>. On y va ?<div class="row">${glyphs.x}Rejoindre la session</div>`
    : !games.length ? `Ajoute tes jeux, ils apparaîtront ici.<div class="row">${glyphs.a}Ouvrir le dossier</div>` : '';
  $('#bulle').classList.toggle('vide', !$('#bulle').innerHTML);

  $('#accueil').classList.toggle('mode-jeux', onglet === 'jeux' && games.length > 0);
  $('#accueil').classList.toggle('mode-section', onglet !== 'accueil' && !(onglet === 'jeux' && games.length));
  document.body.classList.toggle('jeux', onglet === 'jeux' && games.length > 0);
  drawDock();
  if (onglet === 'jeux' && games.length) return drawJeux();
  // Pendant une recherche, pas de redessin (le curseur serait perdu).
  if (onglet !== 'accueil') return (fond(null), document.activeElement?.id === 'cherche' || drawSection(), drawAide());

  // L'accueil se compose une fois la liste des jeux connue.
  if (!maisonPrete && jeuxCharges) (chargerMaison(), (maisonPrete = true));
  drawMaison();

  fond(reprise && shotOf(reprise.g));
}
let bulleSession = null;
let maisonPrete = false, jeuxCharges = false;

function fond(src, jaquette = false) {
  $('#fond-art').style.opacity = src ? '' : '0';
  $('#fond-art').classList.toggle('jaquette', jaquette);
  if (src && $('#fond-art').getAttribute('src') !== src) {
    $('#fond-art').src = src;
    entree($('#fond-art'), 'nouveau');
  }
}


/* ---------- Fiches des jeux (GameTDB) ---------- */
const fiches = JSON.parse(localStorage.fiches || '{}');
// Switch : pas de code produit, GameTDB est cherché par le nom.
const idFiche = (g) => (g.console === 'Switch' ? g.name : g.console === 'GC' || g.console === 'Wii' ? g.disc_id : g.product_code);
const fiche = (g) => fiches[`${g.console}:${idFiche(g)}`];
async function chargerFiches() {
  // Anciennes fiches sans eshop ou title_en : redemandées une fois.
  const manque = games.filter((g) => idFiche(g) && (!fiche(g) || fiche(g).title_en === undefined || (g.console === 'Switch' && fiche(g).eshop === undefined))).map((g) => [g.console, idFiche(g)]);
  if (!manque.length) return;
  const r = await invoke('game_infos', { wanted: manque }).catch(() => ({}));
  for (const [c, id] of manque) if (r[id]) fiches[`${c}:${id}`] = r[id];
  localStorage.fiches = JSON.stringify(fiches);
  // Sans description GameTDB : l'introduction de l'article Wikipédia.
  for (const g of games) {
    const cle = `wiki:${g.console}:${g.name}`;
    if (fiche(g)?.synopsis || cle in fiches) continue;
    fiches[cle] = await wikipedia(fiche(g)?.title || g.name);
    localStorage.fiches = JSON.stringify(fiches);
  }
  if (onglet === 'jeux' && view() === 'biblio') drawJeux();
  else drawHome();
}
const wikiDe = (g) => fiches[`wiki:${g.console}:${g.name}`];

/**
 * Introduction de l'article Wikipédia du jeu, ou null.
 * L'article doit porter le nom du jeu et parler d'un jeu vidéo.
 */
async function wikipedia(nom) {
  const essais = [nom, `${nom} (jeu vidéo)`];
  for (const titre of essais) {
    const r = await fetch(`https://fr.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(titre.replace(/ /g, '_'))}`).catch(() => null);
    if (!r?.ok) continue;
    const d = await r.json().catch(() => null);
    if (d?.type === 'standard' && /\b(jeux? vidéo|est un jeu|sont deux (éditions|jeux))\b/i.test(d.extract || '')) return { texte: d.extract, titre: d.title };
  }
  return null;
}
const GENRES = {
  action: 'Action', adventure: 'Aventure', 'role-playing': 'RPG', 'action rpg': 'RPG d\'action', fighting: 'Combat', '2d fighting': 'Combat', '3d fighting': 'Combat',
  racing: 'Course', 'kart racing': 'Course de karts', platformer: 'Plateforme', '2d platformer': 'Plateforme', '3d platformer': 'Plateforme', puzzle: 'Réflexion',
  party: 'Party game', sports: 'Sport', simulation: 'Simulation', 'life simulation': 'Simulation de vie', strategy: 'Stratégie', shooter: 'Tir',
  'first-person shooter': 'FPS', music: 'Musique', rhythm: 'Rythme', horror: 'Horreur', 'stealth action': 'Infiltration', 'board game': 'Jeu de société',
  educational: 'Éducatif', fitness: 'Fitness', soccer: 'Football', football: 'Football', golf: 'Golf', tennis: 'Tennis', fantasy: 'Fantasy', 'sci-fi': 'Science-fiction',
  arcade: 'Arcade', compilation: 'Compilation', 'turn-based strategy': 'Stratégie au tour par tour', roguelike: 'Roguelike', "beat 'em up": 'Beat \'em up', "shoot 'em up": 'Shoot \'em up',
};

// Consoles avec sessions en ligne (pas la Wii U).
const EN_LIGNE = ['3DS', 'DS', 'GC', 'Wii', 'Switch'];
/**
 * Jeu multijoueur d'après GameTDB. Pokémon compte comme multijoueur.
 * Sans information, on laisse créer une session.
 */
const sessionsForcees = JSON.parse(localStorage.sessionsForcees || '{}');
function seulJeu(g) {
  const f = fiche(g);
  return Boolean(f && f.players === 1 && !f.online && !/pok[eé]mon/i.test(f.title || g.name));
}
const enSession = (g) => EN_LIGNE.includes(g.console) && (!seulJeu(g) || Boolean(sessionsForcees[g.path]));
function basculerSessions(g) {
  if (sessionsForcees[g.path]) delete sessionsForcees[g.path];
  else sessionsForcees[g.path] = true;
  localStorage.sessionsForcees = JSON.stringify(sessionsForcees);
  toast(`${fiche(g)?.title || g.name} : sessions ${sessionsForcees[g.path] ? 'proposées' : 'masquées (un seul joueur)'}`);
  drawJeux();
}

/* ---------- Jeux : carrousel par console ---------- */
const ORDRE = ['Switch', '3DS', 'WiiU', 'Wii', 'GC', 'DS'];
const LONG = { DS: 'Nintendo DS', '3DS': 'Nintendo 3DS', GC: 'GameCube', Wii: 'Wii', WiiU: 'Wii U', Switch: 'Nintendo Switch' };
let conSel = null;
let zone = 'consoles'; // 'consoles' puis 'jeux'
const choix = {};
const REEL = { '-2': [150, -80, .2], '-1': [150, 80, .5], 0: [250, 236, 1], 1: [150, 510, .5], 2: [150, 680, .2] };

/* Choix du jeu d'une nouvelle session : seulement les jeux en ligne. */
let creation = null;
async function choisirJeuSession() {
  if (!me) return login();
  if (!games.some(enSession)) return oops('Aucun de tes jeux ne se joue à plusieurs en ligne (DS, 3DS, GameCube, Wii ou Switch).');
  creation = { retour: onglet };
  if (!consoles().includes(conSel)) conSel = null;
  $('#accueil').classList.add('mode-creation');
  if (onglet === 'jeux') (zone = 'jeux', drawJeux(), entree($('#carrousel'), 'apparait'));
  else (await allerA('jeux'), (zone = 'jeux'), drawJeux());
}
function finCreation() {
  const retour = creation?.retour;
  creation = null;
  $('#accueil').classList.remove('mode-creation');
  if (retour && retour !== 'jeux') allerA(retour);
  else drawJeux();
}

function consoles() {
  return ORDRE.filter((c) => games.some((g) => g.console === c && (!creation || enSession(g))));
}
function jeuxDe(c) {
  return games.map((g, i) => ({ g, i })).filter((x) => x.g.console === c && (!creation || enSession(x.g)));
}

function drawJeux() {
  const cons = consoles();
  if (!cons.includes(conSel)) {
    // Par défaut : la console du dernier jeu joué.
    const last = Object.entries(stats).sort((a, b) => b[1].last - a[1].last).map(([p]) => games.find((g) => g.path === p)).find(Boolean);
    conSel = last?.console || cons[0];
  }
  const liste = jeuxDe(conSel);
  choix[conSel] = Math.min(choix[conSel] ?? 0, liste.length - 1);
  const n = choix[conSel];
  const { g, i } = liste[n];
  const st = stats[g.path];

  $('#titre').textContent = creation ? 'Créer une session' : `${LONG[conSel]}, ${liste.length} jeu${liste.length > 1 ? 'x' : ''}`;
  $('#consoles').innerHTML = cons.map((k) => `<div class="con ${k === conSel ? 'on' : ''}" data-c="${k}">${iconeConsole(k)}${k === 'WiiU' ? 'Wii U' : k}</div>`).join('');
  $('#consoles').querySelectorAll('.con').forEach((el) => (el.onclick = () => { zone = 'consoles'; el.dataset.c === conSel ? drawJeux() : choisirConsole(el.dataset.c); }));
  $('#carrousel').classList.toggle('zone-consoles', zone === 'consoles');

  // Les éléments sont gardés d'un dessin à l'autre pour que le carrousel glisse.
  const reel = $('#reel');
  if (reel.dataset.c !== conSel) {
    reel.dataset.c = conSel;
    reel.innerHTML = liste.map((x) => `<div class="g" data-i="${x.i}"><div class="sans">${iconeConsole(conSel, 'filigrane')}<span class="tag">${NOMS[conSel]}</span><b>${esc(x.g.name)}</b></div>${coverImg(x.g, '')}</div>`).join('');
    reel.querySelectorAll('.g').forEach((el, k) => (el.onclick = () => {
      if (zone === 'jeux' && k === choix[conSel]) return play(+el.dataset.i);
      zone = 'jeux';
      k === choix[conSel] ? drawJeux() : choisirJeu(k);
    }));
  }
  reel.querySelectorAll('.g').forEach((el, k) => {
    const d = k - n;
    const [taille, haut, op] = REEL[d] || [150, d < 0 ? -240 : 840, 0];
    const ratio = Math.min(1, JAQUETTES[conSel]?.ratio || 1);
    Object.assign(el.style, { width: `${Math.round(taille * ratio)}px`, height: `${taille}px`, top: `${haut}px`, opacity: op });
    el.classList.toggle('sel', d === 0);
  });

  const joueurs = autres().filter((s) => s.game === g.name);
  const f = fiche(g);
  const faits = f ? [
    ['Joueurs', f.players ? (f.players > 1 ? `1 à ${f.players}` : '1') : ''],
    ['En ligne', f.online ? `Jusqu'à ${f.online}` : ''],
    ['Sortie', f.year],
    ['Genre', f.genres.map((x) => GENRES[x] || x).slice(0, 2).join(', ')],
    ['Développeur', f.developer],
    ['Éditeur', f.publisher !== f.developer ? f.publisher : ''],
  ].filter(([, v]) => v) : [];
  const nom = f?.title || g.name;
  $('#info').innerHTML = `<h1 class="${nom.length > 22 ? 'long' : ''}">${esc(nom)}</h1>
    <div class="meta"><span>${LONG[g.console]}</span>${majAffichee(g) ? `<span>MAJ <b>${esc(majAffichee(g))}</b></span>` : contenus[g.path]?.maj ? `<span>MAJ <b>${esc(contenus[g.path].maj === '?' ? 'oui' : contenus[g.path].maj)}</b></span>` : ''}${contenus[g.path]?.dlc ? `<span><b>${+contenus[g.path].dlc}</b> DLC</span>` : ''}${resumeSucces(g)}${st?.secs ? `<span>Temps de jeu <b>${duree(st.secs).replace(' de jeu', '')}</b></span>` : ''}${st?.last ? `<span>${quand(st.last).replace('Joué', 'Dernière partie')}</span>` : '<span>Jamais lancé</span>'}</div>
    ${f?.synopsis ? `<p>${esc(f.synopsis.split('\n')[0])}</p>` : wikiDe(g) ? `<p>${esc(wikiDe(g).texte)}</p><div class="source">Texte : Wikipédia, CC BY-SA</div>` : ''}
    ${faits.length ? `<div class="faits">${faits.map(([k, v]) => `<div>${k}<b>${esc(v)}</b></div>`).join('')}</div>` : ''}
    ${aussiChez(g)}
    ${joueurs.length ? `<div class="who glass"><div class="stack">${joueurs.slice(0, 4).map((s) => `<img class="av" src="${esc(s.host?.avatar || 'img/hang-coucou.png')}" alt="">`).join('')}</div><div class="t"><b>${esc(noms(joueurs.map((s) => s.host?.name)))} ${joueurs.length > 1 ? 'jouent' : 'joue'} en ce moment</b><br><span>Session ${esc(joueurs[0].code)}, ${+joueurs[0].players || 0} sur ${+joueurs[0].slots || 0}</span></div></div>` : ''}`;

  const shot = shotOf(g);
  $('#media').innerHTML = shot ? `<img class="loc" src="img/hang-blase.png" alt=""><div class="ph"><img src="${shot}" alt=""><span class="tag">Dernière partie</span></div>` : '';
  fond(null);

  const enLigne = me && enSession(g);
  const rej = joueurs[0];
  $('#actions').innerHTML = (shot ? '' : '<img class="loc" src="img/hang-pensif.png" alt="" style="width:190px;left:auto;right:28px;top:auto;bottom:calc(100% - 26px)">')
    + `<span class="act main" data-a="jouer">${glyphs.a}Jouer</span>`
    + (enLigne ? `<span class="act" data-a="session">${glyphs.x}Créer une session</span>` : '')
    + (rej ? `<span class="act" data-a="rejoindre">${glyphs.y}Rejoindre ${esc(rej.host?.name || '')} <small>${+rej.players || 0} sur ${+rej.slots || 0}</small></span>` : '');
  if (creation) {
    $('#actions').innerHTML = `<span class="act main" data-a="creer">${glyphs.a}Créer la session</span><span class="act" data-a="annuler">${glyphs.b}Annuler</span><span class="act-info">Les membres la verront dans le Local et sur Discord.</span>`;
  }
  $('#actions').querySelectorAll('.act').forEach((el) => (el.onclick = () => actionJeu(el.dataset.a)));
  $('#aide-g').innerHTML = zone === 'consoles'
    ? `<div>${glyphs.a}Voir les jeux</div><div>${glyphs.b}${creation ? 'Annuler' : 'Accueil'}</div>`
    : `<div>${glyphs.b}Consoles</div>`;
}

function choisirConsole(c) {
  if (c === conSel) return;
  conSel = c;
  drawJeux();
  ['#reel', '#info', '#media'].forEach((s, n) => ($(s).style.setProperty('--i', n), entree($(s), 'apparait-seul')));
}
function choisirJeu(k) {
  k = Math.max(0, Math.min(jeuxDe(conSel).length - 1, k));
  if (k === choix[conSel]) return;
  const sens = k > choix[conSel] ? 'monte' : 'descend';
  choix[conSel] = k;
  drawJeux();
  entree($('#info'), sens);
  entree($('#media'), sens);
}
function actionJeu(a) {
  const { i, g } = jeuxDe(conSel)[choix[conSel]];
  if (creation) {
    if (a === 'annuler') return finCreation();
    finCreation();
    return host(i);
  }
  const rej = autres().find((s) => s.game === g.name);
  if (a === 'jouer') play(i);
  if (a === 'session' && me && enSession(g)) host(i);
  if (a === 'rejoindre' && rej) join(rej.code);
}
/** Deux colonnes : consoles à gauche, jeux à droite. */
function navJeux(k) {
  const cons = consoles();
  if (zone === 'consoles') {
    if (k === 'up' || k === 'down') choisirConsole(cons[Math.max(0, Math.min(cons.length - 1, cons.indexOf(conSel) + (k === 'up' ? -1 : 1)))]);
    if (k === 'a' || k === 'right') { zone = 'jeux'; drawJeux(); }
    if (k === 'b') creation ? finCreation() : allerA('accueil');
    return;
  }
  if (k === 'up' || k === 'down') choisirJeu(choix[conSel] + (k === 'up' ? -1 : 1));
  if (k === 'a') actionJeu(creation ? 'creer' : 'jouer');
  if (creation) return k === 'b' || k === 'left' ? ((zone = 'consoles'), drawJeux()) : undefined;
  if (k === 'x') actionJeu('session');
  if (k === 'y') actionJeu('rejoindre');
  if (k === 'b' || k === 'left') { zone = 'consoles'; drawJeux(); }
}










/** Performances d'En Local, réappliquées au démarrage. */
const modePerf = () => (['economie', 'normal', 'maximum'].includes(localStorage.perf) ? localStorage.perf : 'normal');
function performances(mode) {
  localStorage.perf = mode;
  invoke('performances', { mode }).catch(() => {});
}
// WebView2 démarre après l'app : on réapplique un peu plus tard.
for (const ms of [0, 3000]) setTimeout(() => modePerf() !== 'normal' && performances(modePerf()), ms);
function animations(actives) {
  document.body.classList.toggle('reduit', !actives);
  localStorage.animations = actives ? 'oui' : 'non';
}
animations(localStorage.animations !== 'non');
/** Thème : sombre, oled (noir pur) ou clair. */
function theme(nom) {
  if (nom === true || nom === false) nom = nom ? 'clair' : 'sombre';
  document.body.classList.toggle('clair', nom === 'clair');
  document.body.classList.toggle('oled', nom === 'oled');
  localStorage.theme = nom;
}
theme(localStorage.theme || (matchMedia('(prefers-color-scheme: light)').matches ? 'clair' : 'sombre'));
async function logout() {
  await api('POST', '/logout').catch(() => {});
  delete localStorage.token;
  me = null;
  sessionsLocal = [];
  drawHome();
}

function horloge() {
  const d = new Date();
  $('#horloge').innerHTML = `${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}<i></i><small>${d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })}</small>`;
}
setInterval(horloge, 15000);

/** Sessions ouvertes, rafraîchies dans les menus. */
async function rafraichirSessions() {
  if (!me || current) return;
  sessionsLocal = await api('GET', '/sessions').catch(() => sessionsLocal);
  if (view() === 'biblio') drawHome();
}
setInterval(rafraichirSessions, 15000);

/**
 * Interface dessinée pour 1280×800, zoomée à la taille de la fenêtre.
 * S'adapte du 4:3 au 16:9 sans bandes noires.
 */
function echelle() {
  const s = Math.min(innerWidth / 1280, innerHeight / 800);
  const ecran = $('#accueil').style;
  ecran.setProperty('--s', s);
  ecran.setProperty('--w', `${Math.min(innerWidth / s, 1422)}px`);
  ecran.setProperty('--h', `${Math.min(innerHeight / s, 960)}px`);
}
addEventListener('resize', echelle);
echelle();

const menuBtns = () => [...document.querySelectorAll('#menu .btn')].filter((b) => b.style.display !== 'none');
function drawMenu() {
  // Jeux Pokémon : chasse aux chromatiques.
  const pk = estPokemon(current);
  const chasse = $('#menu [data-act="chasse"]');
  chasse.style.display = pk ? '' : 'none';
  chasse.textContent = chasseActive(current) ? `Chasse aux chromatiques : activée (${+localStorage[`resets:${current.path}`] || 0} resets)` : 'Chasse aux chromatiques';
  $('#menu [data-act="reset"]').style.display = chasseActive(current) ? '' : 'none';
  $('#menu [data-act="reset"]').textContent = 'Relancer le jeu (R1, F5)';
  $('#menu [data-act="zero"]').style.display = chasseActive(current) && +localStorage[`resets:${current.path}`] ? '' : 'none';
  menuBtns().forEach((b, i) => b.classList.toggle('focus', i === menuFocus));
  $('#menu-volume').innerHTML = `‹ ${jauge(vol('jeux'))} ›`;
}
function volumeMenu(k) {
  if (menuBtns()[menuFocus]?.dataset.act !== 'volume' || (k !== 'left' && k !== 'right')) return false;
  changerVolume('jeux', k === 'left' ? -1 : 1);
  drawMenu();
  return true;
}

const canvas = $('#ecran'), ctx = canvas.getContext('2d');
function paint(buf) {
  const v = new DataView(buf);
  const w = v.getUint16(0, true), h = v.getUint16(2, true);
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; if (current?.console === 'DS') envoyerHabillage(); }
  ctx.putImageData(new ImageData(new Uint8ClampedArray(buf, 4, w * h * 4), w, h), 0, 0);
}
function onFrame(buf) {
  paint(buf);
}

/** Mises à jour et DLC de chaque jeu : chemin -> { maj, dlc }. */
let contenus = {};
async function chargerContenus() {
  const id = (g) => (['Switch', '3DS', 'WiiU'].includes(g.console) && g.title_id) || '';
  contenus = await invoke('contenus_jeux', { jeux: games.filter((g) => id(g)).map((g) => [g.path, g.console, id(g)]) }).catch(() => ({}));
  if (onglet === 'jeux' && view() === 'biblio') drawJeux();
}

/* Mises à jour Switch : celle choisie dans les actions du jeu, sinon la plus récente. */
const majsDe = {};
async function chargerMajs() {
  for (const g of games.filter((x) => x.console === 'Switch' && x.title_id)) {
    majsDe[g.path] = ((await invoke('switch_updates', { titleId: g.title_id }).catch(() => [])) || []).sort((a, b) => (b.version || 0) - (a.version || 0));
  }
  if (onglet === 'jeux' && view() === 'biblio') drawJeux();
}
const nomMaj = (m, court) => (!m ? 'Sans mise à jour' : court && m.version ? `v${m.version}` : m.nom.replace(/\[[^\]]*\]/g, '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim() + (m.version ? ` · v${m.version}` : ''));
/** Chemin donné à Eden : "" pour aucune, null pour tout le dossier. */
function majDe(g) {
  const l = majsDe[g.path] || [];
  const choix = localStorage['maj:' + g.path];
  if (!l.length) return null;
  if (choix === '') return '';
  if (l.length === 1) return null;
  return (l.find((m) => m.path === choix) || l[0]).path;
}
function majAffichee(g) {
  const l = majsDe[g.path] || [];
  if (!l.length) return '';
  const p = majDe(g);
  return p === '' ? 'Sans mise à jour' : nomMaj(l.find((m) => m.path === p) || l[0], true);
}
function reglerMaj(i) {
  const g = games[i];
  const l = majsDe[g.path] || [];
  const actuelle = majDe(g) ?? l[0]?.path;
  const choisir = (p) => { localStorage['maj:' + g.path] = p; toast(`${fiche(g)?.title || g.name} : ${p ? nomMaj(l.find((m) => m.path === p)) : 'sans mise à jour'}`); drawJeux(); };
  sheet('Mise à jour', `Celle que ${esc(fiche(g)?.title || g.name)} utilise. Les DLC sont gardés dans tous les cas. Pour jouer en session, prenez la même.`, [
    ...l.map((m, k) => ({ label: `${m.path === actuelle ? '✓ ' : ''}${nomMaj(m)}${k === 0 ? ' (la plus récente)' : ''}`, fn: () => choisir(m.path) })),
    { label: `${actuelle === '' ? '✓ ' : ''}Sans mise à jour`, fn: () => choisir('') },
    { label: 'Fermer', cancel: true },
  ]);
}

/**
 * Chasse aux chromatiques : compteur de resets, R1 ou F5 pour relancer.
 * Ce qui n'est pas sauvegardé est perdu, comme avec le bouton Reset.
 */
const estPokemon = (g) => Boolean(g) && /pok[eé]mon/i.test(`${g.name} ${fiche(g)?.title || ''}`);
const chasseActive = (g) => estPokemon(g) && localStorage[`chasse:${g.path}`] === 'oui';
let dernierLancement = null;
let resetEnCours = false;
function basculerChasse() {
  const g = current;
  if (!estPokemon(g)) return;
  const cle = `chasse:${g.path}`;
  localStorage[cle] = chasseActive(g) ? 'non' : 'oui';
  envoyerHabillage();
  drawMenu();
  toast(chasseActive(g) ? 'Chasse aux chromatiques : R1 ou F5 pour relancer, le compteur est en haut à droite' : 'Chasse aux chromatiques arrêtée');
}
async function resetJeu() {
  if (!chasseActive(current) || resetEnCours) return;
  resetEnCours = true;
  const g = current;
  localStorage[`resets:${g.path}`] = (+localStorage[`resets:${g.path}`] || 0) + 1;
  son('lancer', true);
  try {
    // Depuis le menu : le jeu reprend d'abord, puis repart à zéro.
    if (shown('#menu')) await closeMenu();
    if (await invoke('reset_jeu').catch(() => false)) return envoyerHabillage();
    const { i, room } = dernierLancement || {};
    if (i === undefined) return;
    compterTemps();
    invoke('habillage_ds', { format: 0, visible: false }).catch(() => {});
    await invoke('quit_game');
    current = null;
    await play(i, room);
  } finally {
    resetEnCours = false;
  }
}

async function play(i, room = null) {
  const g = games[i];
  dernierLancement = { i, room };
  // Switch .nsz / .xcz : décompressé une fois, l'original supprimé.
  if (g.console === 'Switch') {
    if (/\.(nsz|xcz)$/i.test(g.path)) status(`Préparation de ${g.name} (une seule fois, quelques minutes au plus)…`);
    try {
      const chemin = await invoke('preparer_switch', { path: g.path });
      if (chemin !== g.path) {
        if (stats[g.path]) ((stats[chemin] = stats[g.path]), delete stats[g.path], saveStats());
        g.path = chemin;
      }
    } catch (e) {
      status('');
      return oops(e);
    }
    status('');
  }
  await pokedexAvantPartie(g);
  if (!musique.paused) musique.pause();
  son('lancer');
  const update = majDe(g);
  current = g;
  const frames = new Channel();
  frames.onmessage = onFrame;
  // Écran de chargement le temps que l'émulateur démarre.
  const ds = g.console === 'DS';
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  $('#chargement').textContent = ds ? '' : `Chargement de ${g.name}…`;
  $('#jeu').style.display = 'grid';
  status(`Lancement de ${g.name}…`);
  try {
    canvas.classList.toggle('lisse', lissageDs(g));
    await invoke('play', { path: g.path, console: g.console, room, update, opts: optsDe(g), frames });
    status('');
    for (const ms of [0, 2000, 6000, 15000, 40000]) setTimeout(() => current === g && volumeJeu(), ms);
    for (const ms of [0, 1500]) setTimeout(() => current === g && envoyerHabillage(), ms);
    (stats[g.path] ||= { secs: 0, last: 0 }).last = Date.now();
    saveStats();
    if (!ds) refreshShot();
    playStart = Math.floor(Date.now() / 1000);
    dernierCompte = Date.now();
    updatePresence();
  } catch (e) {
    leaveSession();
    current = null;
    updatePresence();
    $('#jeu').style.display = 'none';
    status(`Échec : ${e}`);
    if (g.console === 'Switch' && /clés de ta Switch|firmware de ta Switch/.test(String(e))) (status(''), demanderSwitch());
    if (g.console === '3DS' && /3DS est chiffré/.test(String(e))) (status(''), demanderTroisDs(true));
  }
}

let menuSeq = 0;
async function setMenu(open) {
  const seq = ++menuSeq;
  if (current?.console === 'DS' && open) ($('#jeu').classList.remove('habille'), invoke('habillage_ds', { format: 0, visible: false }).catch(() => {}));
  // 3DS, GameCube, Wii : on affiche la dernière image du jeu sous le menu.
  if (['3DS', 'GC', 'Wii', 'WiiU', 'Switch'].includes(current?.console)) {
    if (open) {
      const buf = await invoke('snapshot');
      // Menu refermé pendant l'attente : on n'affiche plus rien.
      if (seq !== menuSeq) return;
      if (buf.byteLength > 4) { paint(buf); canvas.classList.add('photo'); $('#jeu').style.display = 'grid'; }
    } else {
      $('#jeu').style.display = 'none';
      canvas.classList.remove('photo');
    }
  }
  if (open && seq === menuSeq) {
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    await invoke('menu_shown');
    await new Promise((r) => setTimeout(r, 40)); // le temps que Windows l'affiche
  }
  if (seq !== menuSeq) return;
  $('#menu').classList.remove('sortie');
  $('#menu').style.display = open ? 'grid' : 'none';
  $('#menu-titre').textContent = current ? current.name + (session ? ` · session ${session.code}` : '') : 'En pause';
  // DS : codes ami des joueurs de la session.
  const ds = open && session?.members && current?.console === 'DS';
  // Le code ami vient peut-être d'être créé : on le relit dans la sauvegarde.
  if (ds && (await syncFriendCode(current))) await heartbeatNow();
  $('#menu-joueurs').innerHTML = ds
    ? `<p class="fc-titre">Codes ami (Wi-Fi Club du jeu)</p>` + session.members.map((m) => `<div class="fc"><b>${esc(m.name)}</b><span>${m.friendCode ? esc(m.friendCode) : 'pas encore donné'}</span></div>`).join('')
    : '';
  document.querySelector('#menu [data-act="fc"]').style.display = ds ? '' : 'none';
  const attente = open && netplay?.hosting ? session?.waiting || [] : [];
  const relaunch = document.querySelector('#menu [data-act="relaunch"]');
  relaunch.style.display = attente.length ? '' : 'none';
  relaunch.textContent = `Relancer avec ${attente.map((w) => w.name).join(', ')}`;
  menuFocus = 0;
  drawMenu();
}

async function act(name) {
  if (name === 'volume') return;
  if (name === 'resume') await closeMenu();
  if (name === 'relaunch') { await relaunchWithWaiting(); }
  if (name === 'fc') {
    // Le jeu reste en pause pendant la saisie.
    $('#menu').style.display = 'none';
    await editFriendCode(current);
    if (session) heartbeatNow();
    setMenu(true);
  }
  // Pour les manettes sans bouton de partage.
  if (name === 'capturer') return menuCapture(true);
  if (name === 'session') return sessionEnJeu();
  if (name === 'chasse') return basculerChasse();
  if (name === 'reset') return resetJeu();
  if (name === 'zero') {
    // Chromatique trouvé : nouvelle chasse. On demande d'abord.
    const n = +localStorage[`resets:${current.path}`] || 0;
    $('#menu').style.display = 'none';
    return sheet('Remettre le compteur à zéro ?', `${n} reset${n > 1 ? 's' : ''} sur cette chasse. Le compteur repart de 0.`, [
      { label: 'Retour', cancel: true, fn: () => setMenu(true) },
      { label: 'Remettre à zéro', fn: () => ((compteurs.resetsPasses = (compteurs.resetsPasses || 0) + n), garderCompteurs(), (localStorage[`resets:${current.path}`] = 0), envoyerHabillage(), drawMenu(), setMenu(true), toast(`Compteur remis à zéro (${n} resets)`)) },
    ]);
  }
  if (name === 'quit') {
    // On demande d'abord. ○ / Échap ramène au menu.
    $('#menu').style.display = 'none';
    sheet('Quitter le jeu ?', 'N\'oublie pas de sauvegarder : tout ce qui n\'est pas sauvegardé sera perdu.', [
      { label: 'Retour', cancel: true, fn: () => setMenu(true) },
      { label: 'Quitter le jeu', fn: () => act('quitter') },
    ]);
  }
  if (name === 'quitter') {
    pokedexApresPartie(current);
    saveShot(current);
    compterTemps();
    await setMenu(false);
    son('quitter', true);
    invoke('habillage_ds', { format: 0, visible: false }).catch(() => {});
    $('#jeu').classList.remove('habille');
    await invoke('quit_game');
    leaveSession();
    current = null;
    updatePresence();
    $('#jeu').style.display = 'none';
    status('');
    await apresPartie();
    drawHome();
    rafraichirSessions();
    envoyerStats();
  }
}
document.querySelectorAll('#menu .btn').forEach((b) => (b.onclick = () => act(b.dataset.act)));

async function closeMenu() {
  if (!shown('#menu') || $('#menu').classList.contains('sortie')) return;
  son('reprise', true);
  compterTemps();
  $('#menu').classList.add('sortie');
  await new Promise((r) => setTimeout(r, 180));
  await backToGame();
}
/** Laisse l'image du jeu dans l'interface : Windows la remontre au prochain menu. */
async function backToGame() {
  ++menuSeq;
  await invoke('resume');
  $('#menu').style.display = 'none';
  $('#menu').classList.remove('sortie');
  if (current?.console === 'DS') envoyerHabillage();
  refreshShot();
}
async function refreshShot() {
  const seq = menuSeq;
  await new Promise((r) => setTimeout(r, 400));
  const buf = await invoke('game_shot');
  if (seq !== menuSeq || shown('#menu') || buf.byteLength <= 4) return;
  paint(buf);
  canvas.classList.add('photo');
  $('#chargement').textContent = '';
  $('#jeu').style.display = 'grid';
}
// Le temps de jeu s'arrête pendant le menu.
let menuOuvertA = 0;
listen('menu', (e) => (e.payload ? ((menuOuvertA = Date.now()), compterTemps(), son('pause', true), setMenu(true)) : closeMenu()));
// Croix ou Alt+F4 en jeu : ouvre le menu, puis demande.
listen('close-request', async () => {
  if (shown('#sheet')) return;
  for (let i = 0; i < 60 && !shown('#menu'); i++) await new Promise((r) => setTimeout(r, 30));
  $('#menu').style.display = 'none';
  sheet('Quitter En Local ?', 'Pense à sauvegarder ta partie : tout ce qui n\'est pas sauvegardé sera perdu.', [
    { label: 'Continuer à jouer', cancel: true, fn: backToGame },
    { label: 'Quitter', fn: () => { saveShot(current); invoke('quit_app'); } },
  ]);
});
/** L'aide des touches suit le dernier appareil utilisé : manette ou clavier. */
let typeManette = '';
function utiliser(kind, toujours) {
  const choisi = localStorage.glyphes;
  if (kind !== 'clavier' && GLYPHS[choisi]) kind = choisi;
  if (!GLYPHS[kind] || (glyphs === GLYPHS[kind] && !toujours)) return;
  glyphs = GLYPHS[kind];
  drawGlyphs();
}
listen('pad-connected', (e) => {
  typeManette = e.payload.kind;
  if (view() === 'biblio') toast(`Manette : ${e.payload.name}`);
  utiliser(typeManette);
});
invoke('pad_info').then((p) => p.kind && ((typeManette = p.kind), utiliser(p.kind))).catch(() => {});
addEventListener('keydown', () => utiliser('clavier'), true);
drawGlyphs();
listen('pad', async (e) => {
  const k = e.payload;
  if (captureTouche) return;
  if (!typeManette) typeManette = (await invoke('pad_info').catch(() => ({}))).kind || '';
  utiliser(typeManette);
  if (k === 'capture' && view() === 'jeu') return menuCapture();
  if (k === 'rb' && view() === 'jeu' && chasseActive(current)) return resetJeu();
  sonTouche(k);
  if (view() === 'menu') {
    const n = menuBtns().length;
    if (k === 'up' || k === 'down') { menuFocus = (menuFocus + (k === 'up' ? n - 1 : 1)) % n; drawMenu(); }
    volumeMenu(k);
    if (k === 'a') act(menuBtns()[menuFocus].dataset.act);
    if (k === 'b') act('resume');
  } else if (view() === 'sheet') {
    if (k === 'up' || k === 'down') { sheetFocus = (sheetFocus + (k === 'up' ? -1 : 1) + sheetBtns.length) % sheetBtns.length; drawSheet(); }
    if (k === 'a') pick(sheetFocus);
    if (k === 'b') cancelSheet();
  } else if (view() === 'saisie') {
    navSaisie(k);
  } else if (view() === 'vue') {
    navVue(k);
  } else if (view() === 'salle') {
    navSalle(k);
  } else if (view() === 'bienvenue') {
    navBienvenue(k);
  } else if (view() === 'biblio') {
    navigation(k);
  }
});

/** Menus : d'abord le menu d'actions ou le dock, puis les touches générales, puis l'écran. */
function navigation(k) {
  if (panneauOuvert) return navMembres(k);
  if (k === 'lt') return basculerMembres(true);
  if (k === 'rt') return ouvrirNotifs(); // R2 / ZR : les notifications
  if (contexte) return navContexte(k);
  if (dockOuvert) return navDock(k);
  if (k === 'lb' || k === 'rb') return sectionVoisine(k === 'lb' ? -1 : 1);
  if (k === 'plus' && !(onglet === 'accueil' && modif)) return ouvrirDock();
  if (onglet === 'jeux' && games.length) {
    if (k === 'minus') return ouvrirContexte($('#reel .g.sel'));
    return navJeux(k);
  }
  if (onglet !== 'accueil') return navSection(k);
  navAccueil(k);
}

// Écran tactile DS à la souris.
const touch = (e, down) => {
  const r = canvas.getBoundingClientRect();
  invoke('pointer', { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height, down });
};
let mouseDown = false;
canvas.onmousedown = (e) => { mouseDown = true; touch(e, true); };
canvas.onmousemove = (e) => mouseDown && touch(e, true);
window.onmouseup = (e) => { if (mouseDown) { mouseDown = false; touch(e, false); } };
window.onkeydown = (e) => {
  const kSon = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Enter: 'a', Escape: 'b' }[e.key];
  if (kSon && !(e.target.tagName === 'INPUT' && (kSon === 'left' || kSon === 'right'))) sonTouche(kSon);
  if (e.key === 'F12' && current) return (e.preventDefault(), capturer());
  if (e.key === 'F10' && current) return (e.preventDefault(), enregistrerClip());
  if (e.key === 'F5' && chasseActive(current)) return (e.preventDefault(), resetJeu());
  if (e.key === 'Escape' && current) invoke('home');
  if (e.key === 'Enter' && view() === 'menu') act(menuBtns()[menuFocus].dataset.act);
  if (view() === 'menu' && volumeMenu({ ArrowLeft: 'left', ArrowRight: 'right' }[e.key])) return;
  if (e.key === 'Enter' && view() === 'sheet') pick(sheetFocus);
  if (e.key === 'Escape' && view() === 'sheet') cancelSheet();
  if (view() === 'sheet' && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { sheetFocus = (sheetFocus + (e.key === 'ArrowUp' ? -1 : 1) + sheetBtns.length) % sheetBtns.length; drawSheet(); }
  if (captureTouche && e.key === 'Escape') return ($('#sheet').style.display = 'none'), (captureTouche = null), drawReglages();
  if (e.key === 'F11') return (e.preventDefault(), modeEcran(localStorage.ecran === 'plein' ? localStorage.ecranAvant || 'fenetre' : ((localStorage.ecranAvant = localStorage.ecran || 'fenetre'), 'plein')));
  if (view() === 'vue') {
    const k = { ArrowLeft: 'left', ArrowRight: 'right', Enter: 'a', ' ': 'a', Escape: 'b', Backspace: 'b' }[e.key];
    if (k) e.preventDefault(), navVue(k);
    return;
  }
  if (view() === 'saisie') {
    // Entrée valide, Échap annule, Tab passe au champ suivant.
    if (e.key === 'Enter') return (e.preventDefault(), validerSaisie());
    if (e.key === 'Escape') return (e.preventDefault(), fermerSaisie());
    if (e.key === 'Tab') return (e.preventDefault(), (saisie.champ = (saisie.champ + 1) % saisie.champs.length), champActif().focus(), focusSaisie());
    if (e.target.tagName === 'INPUT') return;
    if (e.key.length === 1 || e.key === 'Backspace') return champActif().focus();
    const k = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }[e.key];
    if (k) e.preventDefault(), navSaisie(k);
    return;
  }
  if (view() === 'bienvenue') {
    const k = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Enter: 'a', Escape: 'b', Tab: 'plus', ' ': 'minus' }[e.key];
    if (k) e.preventDefault(), navBienvenue(k);
    return;
  }
  if (view() === 'salle') {
    if (salle.mode === 'code' && (e.key === 'Backspace' || taperCode(e.key))) return e.preventDefault();
    const k = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Enter: 'a', Escape: 'b', r: 'x' }[e.key];
    if (k) e.preventDefault(), navSalle(k);
    return;
  }
  if (view() !== 'biblio') return;
  if (onglet === 'recherche' && e.target.tagName !== 'INPUT' && !contexte && !dockOuvert && !panneauOuvert && !e.ctrlKey && !e.altKey) {
    if (e.key.length === 1) return $('#cherche')?.focus();
    if (e.key === 'Backspace') return (e.preventDefault(), effacer());
  }
  if (e.target.tagName === 'INPUT' && !['Escape', 'ArrowUp', 'ArrowDown', 'Enter'].includes(e.key)) return;
  const touche = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  const k = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Enter: 'a', Escape: 'b', Backspace: 'b', r: 'x', t: 'y', q: 'lb', e: 'rb', f: 'lt', m: 'plus', Tab: 'plus', ' ': 'minus', ContextMenu: 'minus' }[touche];
  if (!k || (e.target.tagName === 'INPUT' && k === 'b' && e.key === 'Backspace')) return;
  e.preventDefault();
  navigation(k);
};

// Plein écran au premier lancement.
modeEcran(localStorage.ecran || 'plein');
suivreSouris();
initAccueil();
/** Nom sur le serveur, ou pseudo si ce nom est invisible. */
const nomVisible = (u) => (/[\p{L}\p{N}]/u.test(u?.name || '') ? u.name : u?.username || u?.name || '');
const startup = localStorage.token ? api('GET', '/me').then((u) => (me = { ...u, name: nomVisible(u) })).catch(() => {}).finally(() => { drawHome(); rafraichirSessions(); chargerMembres(); envoyerPresence(); envoyerBibliotheque(); }) : Promise.resolve(drawHome());
startup.then(() => invoke('lien_initial')).then(openLink);

invoke('list_games').then(async (g) => {
  games = g;
  await chargerStats();
  await recadrerAnciennes();
  maisonPrete = false;
  jeuxCharges = true;
  drawHome();
  rafraichirSessions();
  chargerFiches().then(() => (envoyerBibliotheque(), SUCCES && chargerRa()));
  updatePresence();
  // Renvoyé chaque minute, au cas où Discord est ouvert après En Local.
  setInterval(() => !current && updatePresence(), 60000);
  chargerMajs();
  chargerContenus().then(envoyerBibliotheque);
  startup.then(() => setTimeout(envoyerStats, 3000));
  chargerPokedex(false);
  majProfilRecommande();
  // Sans compte : l'assistant. On attend d'abord la réponse de Loc pour ne pas se croire déconnecté.
  startup.then(() => {
    if (!localStorage.token || !localStorage.bienvenue) ouvrirBienvenue();
    else {
      setTimeout(verifierMaj, 4000);
      // Demande le boot9.bin une seule fois, pour les jeux 3DS chiffrés.
      if (games.some((g) => g.console === '3DS')) setTimeout(() => !shown('#sheet') && demanderTroisDs(), 9000);
    }
  });
  const auto = await invoke('autoplay');
  const i = games.findIndex((x) => x.path === auto);
  if (i >= 0) play(i);
});
