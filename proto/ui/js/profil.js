/*
 * Profil : temps de jeu, défis, jeux les plus joués et temps par console.
 * Tout est compté sur ce PC (data\stats.json).
 */
const compteurs = JSON.parse(localStorage.compteurs || '{}'); // sessionsCreees, sessionsRejointes, clips, nuit, matin, jours: ['2026-10-04', …]
const garderCompteurs = () => (localStorage.compteurs = JSON.stringify(compteurs));
function compter(cle) {
  compteurs[cle] = (compteurs[cle] || 0) + 1;
  garderCompteurs();
  verifierDefis();
}
/** Note le jour de jeu et le moment (nuit, petit matin). Appelé chaque minute de jeu. */
function jourDeJeu() {
  const heure = new Date().getHours();
  const moment = heure < 5 ? 'nuit' : heure < 8 ? 'matin' : '';
  if (moment && !compteurs[moment]) compter(moment);
  const j = new Date().toLocaleDateString('sv'); // AAAA-MM-JJ
  const jours = (compteurs.jours ||= []);
  if (jours.at(-1) === j) return;
  jours.push(j);
  garderCompteurs();
  verifierDefis();
}

// Jeux lancés au moins une fois.
const joues = () => games.filter((g) => stats[g.path]?.secs || stats[g.path]?.last);
const tempsTotal = () => Object.values(stats).reduce((t, s) => t + (s.secs || 0), 0);
/** Exemple : « 12 h 05 », « 40 min » */
const heures = (s) => (s >= 3600 ? `${Math.floor(s / 3600)} h${s % 3600 >= 60 ? ` ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}` : ''}` : `${Math.round(s / 60)} min`);
/** Plus longue suite de jours de jeu consécutifs. */
function serie() {
  let best = 0, n = 0, avant = null;
  for (const j of [...new Set(compteurs.jours || [])].sort()) {
    const t = Date.parse(j);
    n = avant !== null && t - avant <= 864e5 * 1.5 ? n + 1 : 1;
    best = Math.max(best, n);
    avant = t;
  }
  return best;
}

/** Défis : [id, titre, texte, objectif, valeur, gif de Loc]. */
function defis() {
  const h = (s) => Math.floor(s / 3600);
  const consoles = new Set(joues().map((g) => g.console)).size;
  const plusLong = Math.max(0, ...Object.values(stats).map((s) => s.secs || 0));
  const uneHeure = Object.values(stats).filter((s) => s.secs >= 3600).length;
  const parConsole = Math.max(0, ...ORDRE.map((c) => games.filter((g) => g.console === c).reduce((t, g) => t + (stats[g.path]?.secs || 0), 0)));
  const sessions = (compteurs.sessionsCreees || 0) + (compteurs.sessionsRejointes || 0);
  const resets = Object.keys(localStorage).filter((k) => k.startsWith('resets:')).reduce((t, k) => t + (+localStorage[k] || 0), compteurs.resetsPasses || 0);
  // Pokédex : seulement ce qui compte dans le Pokédex d'En Local (voir pokedex.js).
  const pk = Object.entries(pokedexCredit || {});
  const especes = new Set(pk.map(([k]) => k.split(':')[0])).size;
  const chromas = pk.filter(([, x]) => x.c).length;
  const unBit = (b) => (b > 0 ? b.toString(2).replace(/0/g, '').length : 0);
  const badges = Math.max(0, ...(pokedexDonnees?.jeux || []).map((j) => unBit(j.badges)));
  return [
    ['premier', 'Première partie', 'Lancer un jeu', 1, joues().length, 'coucou'],
    ['curieux', 'Curieux', 'Jouer à 5 jeux différents', 5, joues().length, 'nerd'],
    ['consoles', 'Tour des consoles', 'Jouer sur 3 consoles différentes', 3, consoles, 'idee'],
    ['toutes', 'Collection complète', 'Jouer sur les 6 consoles', 6, consoles, 'fete'],
    ['fidele', 'Fidèle', 'Jouer 5 h au même jeu', 5, h(plusLong), 'love'],
    ['marathon', 'Marathon', 'Jouer 10 h en tout', 10, h(tempsTotal()), 'cafe'],
    ['veteran', 'Vétéran', 'Jouer 50 h en tout', 50, h(tempsTotal()), 'gg'],
    ['habitue', 'Habitué', 'Jouer 7 jours différents', 7, (compteurs.jours || []).length, 'content'],
    ['serie', 'Sans relâche', 'Jouer 3 jours de suite', 3, serie(), 'dodo'],
    ['hote', 'Hôte', 'Créer une session', 1, compteurs.sessionsCreees || 0, 'fete'],
    ['invite', 'Invité', 'Rejoindre la session d\'un membre', 1, compteurs.sessionsRejointes || 0, 'coucou'],
    ['soirees', 'Pilier du Local', 'Jouer 10 sessions', 10, (compteurs.sessionsCreees || 0) + (compteurs.sessionsRejointes || 0), 'musique'],
    ['photo', 'Photographe', 'Prendre 10 captures en jeu', 10, capturesListe.length, 'idee'],
    ['deco', 'Décorateur', 'Mettre une image ou un GIF sur l\'accueil', 1, maison.filter((x) => ['image', 'capture', 'loc'].includes(x.t)).length, 'content'],
    ['range', 'Bien rangé', 'Créer une collection', 1, collections.filter((c) => c.id !== 'favoris').length, 'nerd'],
    // Jouer
    ['explorateur', 'Explorateur', 'Jouer à 10 jeux différents', 10, joues().length, 'cherche'],
    ['touche', 'Touche-à-tout', 'Jouer à 25 jeux différents', 25, joues().length, 'manette'],
    ['ludotheque', 'Ludothèque vivante', 'Jouer à 50 jeux différents', 50, joues().length, 'gg'],
    ['gouteur', 'Goûteur', 'Jouer 1 h à 10 jeux différents', 10, uneHeure, 'popcorn'],
    ['passionne', 'Passionné', 'Jouer 20 h au même jeu', 20, h(plusLong), 'love'],
    ['obsession', 'Obsession', 'Jouer 50 h au même jeu', 50, h(plusLong), 'nerd'],
    ['specialiste', 'Spécialiste', 'Jouer 25 h sur une même console', 25, h(parConsole), 'manette'],
    ['echauffe', 'Échauffement', 'Jouer 1 h en tout', 1, h(tempsTotal()), 'content'],
    ['centurion', 'Centurion', 'Jouer 100 h en tout', 100, h(tempsTotal()), 'fete'],
    ['legende', 'Légende du Local', 'Jouer 250 h en tout', 250, h(tempsTotal()), 'gg'],
    ['assidu', 'Assidu', 'Jouer 30 jours différents', 30, (compteurs.jours || []).length, 'cafe'],
    ['pilier', 'Meuble du Local', 'Jouer 100 jours différents', 100, (compteurs.jours || []).length, 'love'],
    ['semaine', 'Semaine parfaite', 'Jouer 7 jours de suite', 7, serie(), 'fete'],
    ['acharne', 'Acharné', 'Jouer 30 jours de suite', 30, serie(), 'gg'],
    ['nocturne', 'Oiseau de nuit', 'Jouer entre minuit et 5 h', 1, compteurs.nuit || 0, 'dodo'],
    ['matinal', 'Lève-tôt', 'Jouer entre 5 h et 8 h du matin', 1, compteurs.matin || 0, 'cafe'],
    // Ensemble
    ['organisateur', 'Organisateur', 'Créer 10 sessions', 10, compteurs.sessionsCreees || 0, 'fete'],
    ['globe', 'Toujours partant', 'Rejoindre 10 sessions de membres', 10, compteurs.sessionsRejointes || 0, 'enligne'],
    ['soiree', 'Roi de la soirée', 'Jouer 50 sessions', 50, sessions, 'musique'],
    // Bibliothèque et souvenirs
    ['collection', 'Collectionneur', 'Avoir 25 jeux dans sa bibliothèque', 25, games.length, 'dossier'],
    ['archiviste', 'Archiviste', 'Avoir 100 jeux dans sa bibliothèque', 100, games.length, 'dossier'],
    ['cliche', 'Premier cliché', 'Prendre une capture en jeu', 1, capturesListe.length, 'photo'],
    ['reporter', 'Reporter', 'Prendre 50 captures en jeu', 50, capturesListe.length, 'photo'],
    ['clip', 'Moment fort', 'Enregistrer un clip vidéo', 1, compteurs.clips || 0, 'popcorn'],
    ['realisateur', 'Réalisateur', 'Enregistrer 10 clips vidéo', 10, compteurs.clips || 0, 'popcorn'],
    ['curateur', 'Bibliothécaire', 'Créer 5 collections', 5, collections.filter((c) => c.id !== 'favoris').length, 'nerd'],
    // Pokémon
    ['dresseur', 'Dresseur', 'Attraper un Pokémon', 1, especes, 'coucou'],
    ['pokedex', 'Chercheur', 'Attraper 100 espèces de Pokémon', 100, especes, 'cherche'],
    ['professeur', 'Professeur', 'Attraper 400 espèces de Pokémon', 400, especes, 'nerd'],
    ['maitre', 'Maître Pokémon', 'Compléter le Pokédex national (1025)', 1025, especes, 'gg'],
    ['champion', 'Champion', 'Gagner 8 badges dans un jeu Pokémon', 8, badges, 'fete'],
    ['chromatique', 'Éclat', 'Avoir un Pokémon chromatique', 1, chromas, 'idee'],
    ['brillant', 'Collection brillante', 'Avoir 10 Pokémon chromatiques', 10, chromas, 'love'],
    ['patient', 'Patience de moine', 'Faire 500 resets en chasse aux chromatiques', 500, resets, 'attente'],
  ].map(([id, titre, texte, but, v, loc]) => ({ id, titre, texte, but, v: Math.min(v, but), fait: v >= but, loc }));
}

/** Annonce les nouveaux défis réussis, une seule fois. */
function verifierDefis() {
  if (!jeuxCharges) return;
  const faits = new Set(JSON.parse(localStorage.defisFaits || '[]'));
  const premiere = !localStorage.defisFaits; // au premier passage, rien n'est annoncé
  const nouveaux = defis().filter((d) => d.fait && !faits.has(d.id));
  if (!nouveaux.length && !premiere) return;
  nouveaux.forEach((d) => faits.add(d.id));
  localStorage.defisFaits = JSON.stringify([...faits]);
  if (!premiere && nouveaux.length) annoncerDefi(nouveaux[0], nouveaux.length - 1);
}
function annoncerDefi(d, autres) {
  son('succes', true);
  notifier({ type: 'defi', texte: `${d.titre} : ${d.texte}`, image: `img/loc/loc_${d.loc}.gif` }, { bulle: false });
  // En jeu, la notification passe par l'habillage.
  if (current) window.__TAURI__.event.emitTo('habillage', 'notif', { texte: `Défi réussi : ${d.titre}${autres ? ` (+${autres})` : ''}`, image: `img/loc/loc_${d.loc}.gif` }).catch(() => {});
  const n = $('#defi-notif');
  n.innerHTML = `<img src="img/loc/loc_${d.loc}.gif" alt=""><span><small>Défi réussi${autres ? ` (+${autres})` : ''}</small><b>${esc(d.titre)}</b></span>`;
  n.classList.remove('montre');
  void n.offsetWidth;
  n.classList.add('montre');
  clearTimeout(n._fin);
  n._fin = setTimeout(() => n.classList.remove('montre'), 4500);
}

/* ---------- Écran ---------- */

let profFocus = 0;
let profActions = [];
let profilVu = null; // null : mon profil, sinon celui d'un membre

/** Mon jeu qui correspond au jeu d'un membre, s'il existe. */
const monJeu = (c, t) => games.find((g) => g.console === c && plat(titreDe(g)) === plat(t));

/** Mon profil, ou celui d'un membre (ses chiffres viennent de Loc). */
function modeleProfil() {
  const ds = defis();
  if (!profilVu) {
    const top = joues().sort((a, b) => stats[b.path].secs - stats[a.path].secs).slice(0, 5);
    return {
      moi: true,
      avatar: me?.avatar, nom: me ? (me.username ? `@${me.username}` : me.name) : 'Profil',
      lignes: me ? [`Pseudo consoles : ${pseudoConsoles()}`] : ['Connecte-toi avec Discord pour ton nom et ton avatar.'],
      total: tempsTotal(), joues: joues().length, consoles: new Set(joues().map((g) => g.console)).size, captures: capturesListe.length,
      defis: ds, faits: ds.filter((d) => d.fait).length,
      top: top.map((g) => ({ titre: titreDe(g), c: g.console, secs: stats[g.path].secs, g })),
      parConsole: ORDRE.map((c) => [c, games.filter((g) => g.console === c).reduce((t, g) => t + (stats[g.path]?.secs || 0), 0)]).filter(([, x]) => x > 0),
      jeux: games.map((g) => ({ titre: titreDe(g), c: g.console, plus: [texteContenus(contenus[g.path]), stats[g.path]?.secs ? heures(stats[g.path].secs) : ''].filter(Boolean).join(' · ') || 'Jamais lancé', g })),
    };
  }
  const { m, s } = profilVu;
  const idDe = (c, t) => jeuxDuMembre(m.id).find((j) => j.c === c && plat(j.t) === plat(t))?.id;
  const n = (v) => Math.max(0, Number(v) || 0);
  // Défis du membre, avec ses valeurs.
  const v = s?.defisV && typeof s.defisV === 'object' ? s.defisV : null;
  const sesDefis = v ? ds.map((d) => ({ ...d, v: Math.min(n(v[d.id]), d.but), fait: n(v[d.id]) >= d.but })) : null;
  const consoles = s?.consoles && typeof s.consoles === 'object' ? s.consoles : {};
  return {
    moi: false,
    avatar: m.avatar, nom: m.username ? `@${m.username}` : m.name,
    lignes: [s?.pseudo ? `Pseudo consoles : ${s.pseudo}` : '', activiteDe(m).long].filter(Boolean),
    total: n(s?.secs), joues: n(s?.joues), consoles: Object.keys(consoles).length, captures: n(s?.captures),
    defis: sesDefis, faits: sesDefis ? sesDefis.filter((d) => d.fait).length : n(s?.defis), defisTotal: n(s?.defisTotal) || ds.length,
    top: (Array.isArray(s?.top) ? s.top : []).map((j) => ({ titre: String(j.t || ''), c: String(j.c || ''), secs: n(j.s), g: monJeu(j.c, j.t), id: idDe(j.c, j.t) })),
    parConsole: ORDRE.map((c) => [c, n(consoles[c])]).filter(([, x]) => x > 0),
    jeux: jeuxDuMembre(m.id).map((j) => ({ titre: j.t, c: j.c, id: j.id, plus: texteContenus(j) || (monJeu(j.c, j.t) ? 'Tu l\'as aussi' : ''), g: monJeu(j.c, j.t) })),
    vide: !s,
  };
}

function drawProfil() {
  if (pokedexOuvert && !profilVu) {
    profActions = [];
    const actionPd = (fn) => (profActions.push(fn), profActions.length - 1);
    $('#section').innerHTML = vuePokedex(actionPd);
    $('#section').querySelectorAll('.prof-el').forEach((b) => (b.onclick = () => ((profFocus = +b.dataset.n), profActions[profFocus]())));
    $('#titre').textContent = 'Pokédex';
    spritesPokedex();
    return focusProfil(profFocus);
  }
  const p = modeleProfil();
  const max = Math.max(1, ...p.parConsole.map(([, x]) => x));
  profActions = [];
  const action = (fn) => (profActions.push(fn), profActions.length - 1);
  const ouvrir = (it) => () => (it.g ? voirJeu(games.indexOf(it.g)) : toast(`${it.titre} : tu n'as pas ce jeu.`));
  // Jeu que je n'ai pas : sa jaquette, sinon l'icône de la console.
  const vignette = (it) => (it.g ? iconeHtml(it.g, true) : it.id ? coverImg(jeuDeMembre(it.c, it.titre, it.id), 'icone-img', true) || `<span class="r-ic">${iconeConsole(it.c)}</span>` : `<span class="r-ic">${iconeConsole(it.c)}</span>`);
  const totalDefis = p.defis ? p.defis.length : p.defisTotal;
  const chiffres = [[heures(p.total), 'de jeu'], [p.joues, `jeu${p.joues > 1 ? 'x' : ''} lancé${p.joues > 1 ? 's' : ''}`], [p.consoles, 'consoles'], [p.captures, 'captures'], [`${p.faits}/${totalDefis}`, 'défis']];
  const bouton = p.moi
    ? `<button class="prof-el prof-bouton" data-n="${action(me ? () => allerA('reglages') : login)}">${me ? 'Réglages du compte' : 'Se connecter'}</button>`
    : `<button class="prof-el prof-bouton" data-n="${action(() => invoke('open_discord_user', { id: profilVu.m.id }))}">Lui écrire sur Discord</button>`;
  const qui = p.moi ? 'Mes' : 'Ses';
  $('#section').innerHTML = `<div class="prof">
    <div class="prof-tete">
      <img class="av" src="${esc(p.avatar || 'img/hang-coucou.png')}" alt="">
      <div><h1>${esc(p.nom)}</h1>${p.lignes.map((l) => `<p>${esc(l)}</p>`).join('')}</div>
      ${bouton}
    </div>
    ${p.vide ? '<p class="prof-vide">Pas encore de chiffres : ils arrivent quand ce membre ouvre En Local, si « Partager ma liste de jeux » est sur Oui.</p>' : `<div class="prof-chiffres">${chiffres.map(([v, l]) => `<div><b>${esc(v)}</b><span>${l}</span></div>`).join('')}</div>`}
    ${SUCCES && p.moi ? `<div class="prof-trophees">
      <button class="prof-el prof-ra" data-n="${action(ra.token ? () => allerA('reglages') : connecterRa)}">${ra.token ? `${ra.avatar ? `<img class="av" src="${esc(ra.avatar)}" alt="">` : ''}<span><b>RetroAchievements</b><small>${esc(ra.user)} · ${resumeRa()}</small></span>` : '<span><b>Connecter RetroAchievements</b><small>Les vrais succès des jeux GameCube et Wii</small></span>'}</button></div>` : ''}
    ${p.vide ? '' : `<div class="titre-groupe">Défis <span>${p.faits} sur ${totalDefis}</span></div>
    ${p.defis ? `<div class="defis">${[...p.defis.filter((d) => !d.fait).sort((a, b) => b.v / b.but - a.v / a.but), ...p.defis.filter((d) => d.fait)].map((d) => `<button class="prof-el defi${d.fait ? ' fait' : ''}" data-n="${action(() => toast(`${d.titre} : ${d.texte}${d.fait ? ' (réussi)' : ` (${d.v}/${d.but})`}`))}">
      <div class="defi-ic">${d.fait ? `<img src="img/loc/loc_${d.loc}.gif" alt="">` : `<span>${Math.round((d.v / d.but) * 100)}%</span>`}</div>
      <div class="defi-t"><b>${esc(d.titre)}</b><small>${esc(d.texte)}</small>${d.fait ? '<small class="ok">Réussi</small>' : `<div class="barre"><i style="width:${(d.v / d.but) * 100}%"></i></div>`}</div></button>`).join('')}</div>` : '<p class="prof-vide">Le détail de ses défis arrive quand il aura la dernière version d\'En Local.</p>'}
    ${p.moi ? blocPokedex(action) : ''}
    <div class="prof-bas">
      <div><div class="titre-groupe">Les plus joués</div>${p.top.map((it, k) => `<button class="prof-el prof-jeu" data-n="${action(ouvrir(it))}"><span class="rang">${k + 1}</span><div class="icone micro">${vignette(it)}</div><span class="t"><b>${esc(it.titre)}</b><small>${LONG[it.c] || ''}</small></span><span class="temps">${heures(it.secs)}</span></button>`).join('') || `<p class="prof-vide">${p.moi ? 'Lance un jeu : ton temps de jeu s\'affichera ici.' : 'Pas encore de partie.'}</p>`}</div>
      <div><div class="titre-groupe">Par console</div>${p.parConsole.map(([c, x]) => `<div class="prof-console"><span class="r-ic">${iconeConsole(c)}</span><span class="t"><b>${LONG[c]}</b><div class="barre"><i style="width:${(x / max) * 100}%"></i></div></span><span class="temps">${heures(x)}</span></div>`).join('') || '<p class="prof-vide">Rien encore.</p>'}</div>
    </div>`}
    <div class="titre-groupe">${qui} jeux <span>${p.jeux.length}</span></div>
    ${ORDRE.filter((c) => p.jeux.some((it) => it.c === c)).map((c) => `<div class="prof-console-jeux"><small>${LONG[c]}</small><div class="mes-jeux">${p.jeux.filter((it) => it.c === c).sort((a, b) => a.titre.localeCompare(b.titre, 'fr')).map((it) => `<button class="prof-el mon-jeu" data-n="${action(ouvrir(it))}"><div class="icone">${vignette(it)}</div><b>${esc(it.titre)}</b><small>${esc(it.plus)}</small></button>`).join('')}</div></div>`).join('') || `<p class="prof-vide">${p.moi ? 'Ajoute tes jeux dans le dossier des jeux (Réglages).' : 'Sa liste de jeux n\'est pas partagée.'}</p>`}
  </div>`;
  $('#section').querySelectorAll('.prof-el').forEach((b) => (b.onclick = () => ((profFocus = +b.dataset.n), profActions[profFocus]())));
  $('#titre').textContent = p.nom;
  focusProfil(profFocus);
}
function focusProfil(n) {
  const els = [...$('#section').querySelectorAll('.prof-el')];
  profFocus = Math.max(0, Math.min(n, els.length - 1));
  els.forEach((el, k) => el.classList.toggle('focus', k === profFocus));
  montrer($('#section .prof'), els[profFocus], 30);
  $('#aide-g').innerHTML = `<div>${glyphs.b}Accueil</div>`;
  $('#aide-d').innerHTML = `<div>${glyphs.a}${els[profFocus]?.matches('.prof-jeu, .mon-jeu') ? 'Voir le jeu' : els[profFocus]?.classList.contains('defi') ? 'Détails' : 'Ouvrir'}</div>`;
}
function navProfil(k) {
  const els = [...$('#section').querySelectorAll('.prof-el')];
  if (['up', 'down', 'left', 'right'].includes(k)) {
    const n = voisin(els, profFocus, k);
    if (n >= 0) focusProfil(n);
    return;
  }
  if (k === 'a') return profActions[profFocus]?.();
  if (k === 'b' && pokedexOuvert) return ((pokedexOuvert = false), (profFocus = 0), drawProfil());
  if (k === 'b') {
    // Profil d'un membre : retour au panneau Social.
    if (profilVu) return allerA('accueil').then(() => basculerMembres(true));
    allerA('accueil');
  }
}
