/*
 * Succès RetroAchievements, avec un compte retroachievements.org.
 * Débloqués dans Dolphin (GameCube, Wii), affichés dans En Local.
 */

/* Par jeu : { s: sessions, j: jours de jeu, c: captures }. */
const parJeu = (g) => ((compteurs.jeux ||= {})[g.path] ||= { s: 0, j: [], c: 0 });
function compterJeu(g, cle) {
  if (!g) return;
  const p = parJeu(g);
  if (cle === 'jour') {
    const j = new Date().toLocaleDateString('sv');
    if (p.j.at(-1) === j) return;
    p.j.push(j);
  } else p[cle] = (p[cle] || 0) + 1;
  garderCompteurs();
}

/* ---------- RetroAchievements ---------- */

// Masqué pour l'instant.
const SUCCES = false;
// Le jeton sert aux émulateurs, la clé d'API web à l'affichage.
const ra = JSON.parse(localStorage.ra || 'null') || {};
const garderRa = () => (localStorage.ra = JSON.stringify(ra));
const RA_CONSOLES = { DS: 18, GC: 16, Wii: 19 };
const RA_API = 'https://retroachievements.org/API/';

async function raApi(nom, params) {
  if (!ra.user || !ra.cle) return null;
  const q = new URLSearchParams({ ...params, y: ra.cle });
  const r = await fetch(`${RA_API}${nom}.php?${q}`).catch(() => null);
  if (!r?.ok) return null;
  return r.json().catch(() => null);
}

/** Connexion : pseudo et mot de passe une fois, puis la clé d'API web. */
function connecterRa() {
  saisirTexte({
    titre: 'RetroAchievements',
    texte: 'Ton compte retroachievements.org (gratuit). Le mot de passe sert une fois à obtenir un jeton, comme dans les émulateurs ; il n\'est pas gardé.',
    champs: [{ id: 'user', label: 'Pseudo', valeur: ra.user || '' }, { id: 'mdp', label: 'Mot de passe', secret: true }],
    bouton: 'Se connecter',
    // Le compte se crée sur le site, puis on revient ici.
    liens: [{ label: 'Pas de compte ? En créer un (gratuit) sur retroachievements.org', fn: () => (invoke('ouvrir_ra', { page: 'inscription' }), toast('Crée ton compte dans le navigateur, puis reviens te connecter ici')) }],
    valider: async ({ user, mdp }) => {
      if (!user.trim() || !mdp) return 'Le pseudo et le mot de passe.';
      status('Connexion à RetroAchievements…');
      try {
        const r = await invoke('ra_connexion', { user: user.trim(), password: mdp });
        Object.assign(ra, { user: r.User || user.trim(), token: r.Token, avatar: r.AvatarUrl || '' });
        garderRa();
        status('');
        setTimeout(demanderCleRa, 0);
        if (bienvenue) drawBienvenue();
        else if (onglet === 'reglages' || onglet === 'profil') drawSection();
      } catch (e) {
        status('');
        return `RetroAchievements : ${/invalid/i.test(e) ? 'pseudo ou mot de passe incorrect.' : e}`;
      }
    },
  });
}
function demanderCleRa() {
  saisirTexte({
    titre: 'Clé d\'API web',
    texte: 'Pour voir tes succès dans En Local : sur retroachievements.org, Réglages (Settings), « Web API Key ». Copie-la, puis colle-la ici (Ctrl+V). Tu peux le faire plus tard dans les Réglages.',
    champs: [{ id: 'cle', label: 'Clé d\'API web', valeur: ra.cle || '' }],
    liens: [{ label: 'Ouvrir mes réglages sur retroachievements.org', fn: () => invoke('ouvrir_ra', { page: 'reglages' }) }],
    bouton: 'Valider',
    valider: async ({ cle }) => {
      if (!cle.trim()) return 'Colle ta clé, ou Annuler pour le faire plus tard.';
      const avant = ra.cle;
      ra.cle = cle.trim();
      const p = await raApi('API_GetUserProfile', { u: ra.user });
      if (!p) return ((ra.cle = avant), 'Clé refusée par RetroAchievements.');
      ra.avatar = p.UserPic ? `https://media.retroachievements.org${p.UserPic}` : ra.avatar;
      garderRa();
      toast(`RetroAchievements : connecté en tant que ${ra.user}`);
      chargerRa();
      if (bienvenue) drawBienvenue();
      else if (onglet === 'reglages' || onglet === 'profil') drawSection();
    },
  });
}
function deconnecterRa() {
  for (const k of Object.keys(ra)) delete ra[k];
  garderRa();
  raJeux = {};
  toast('RetroAchievements : déconnecté');
}

/* Liste des jeux RetroAchievements par console, gardée 7 jours. */
let raJeux = {};
// Nom simplifié pour comparer les titres.
const nomRa = (s) => plat(s || '').replace(/\s*[([].*?[)\]]/g, '').replace(/[^a-z0-9]+/g, ' ').replace(/\b(the|version|edition)\b/g, ' ').replace(/\s+/g, ' ').trim();
async function listeRa(c) {
  const cle = `ra-liste-${c}`;
  const garde = JSON.parse(localStorage[cle] || 'null');
  if (garde && Date.now() - garde.t < 7 * 864e5) return garde.l;
  const l = await raApi('API_GetGameList', { i: RA_CONSOLES[c], f: 1 }) || await raApi('API_GetGameList', { i: RA_CONSOLES[c], f: 1 }); // une seconde chance (site lent)
  if (!Array.isArray(l)) return garde?.l || [];
  const court = l.map((x) => ({ id: x.ID, titre: x.Title, nb: x.NumAchievements }));
  try { localStorage[cle] = JSON.stringify({ t: Date.now(), l: court }); } catch {}
  return court;
}
async function chargerRa() {
  if (!ra.cle) return;
  for (const c of Object.keys(RA_CONSOLES)) {
    const jeux = games.filter((g) => g.console === c);
    if (!jeux.length) continue;
    const liste = await listeRa(c);
    // Chaque variante d'un titre compte.
    const index = new Map();
    for (const x of liste) for (const t of x.titre.split('|')) if (!index.has(nomRa(t))) index.set(nomRa(t), x);
    for (const g of jeux) {
      const f = fiche(g);
      const x = [f?.title_en, f?.title, g.name, g.name.replace(/^.*? - /, '')].map(nomRa).filter(Boolean).map((n) => index.get(n)).find(Boolean);
      if (x) raJeux[g.path] = { ...x, ...(raJeux[g.path] || {}) };
    }
  }
  const p = await raApi('API_GetUserCompletionProgress', { u: ra.user, c: 500 });
  for (const r of p?.Results || []) {
    for (const [path, x] of Object.entries(raJeux)) if (x.id === r.GameID) Object.assign(x, { gagnes: r.NumAwarded, total: r.MaxPossible });
  }
  if (onglet === 'jeux' && view() === 'biblio') drawJeux();
}

/** Exemple : « 4 de tes jeux ont des succès · 1 commencé » */
function resumeRa() {
  if (!ra.cle) return 'clé d\'API manquante (Réglages)';
  const l = Object.values(raJeux);
  if (!l.length) return 'aucun de tes jeux n\'a de succès pour l\'instant';
  const commences = l.filter((x) => x.gagnes).length;
  return `${l.length} de tes jeux ${l.length > 1 ? 'ont' : 'a'} des succès${commences ? ` · ${commences} commencé${commences > 1 ? 's' : ''}` : ''}`;
}

/** Succès d'un jeu, débloqués en premier. */
async function voirSuccesRa(g) {
  const x = raJeux[g.path];
  if (!x) return;
  status('Succès RetroAchievements…');
  const r = await raApi('API_GetGameInfoAndUserProgress', { g: x.id, u: ra.user });
  status('');
  if (!r?.Achievements) return oops('RetroAchievements ne répond pas.');
  const l = Object.values(r.Achievements).sort((a, b) => Boolean(b.DateEarned) - Boolean(a.DateEarned) || a.DisplayOrder - b.DisplayOrder);
  sheet(`${r.Title} · RetroAchievements`, `${r.NumAwardedToUser || 0} sur ${r.NumAchievements} succès débloqués. Ils se débloquent en jeu${g.console === 'DS' ? ' (pas encore pour la DS dans En Local)' : ''}.`, [
    ...l.map((a) => ({ label: `${a.DateEarned ? '✓ ' : ''}${a.Title} (${a.Points} pts) : ${a.Description}` })),
    { label: 'Fermer', cancel: true },
  ]);
}
