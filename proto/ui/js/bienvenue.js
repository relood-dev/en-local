/*
 * Premier lancement : Loc guide la configuration en quelques étapes.
 * Tout se change ensuite dans les Réglages.
 */
const TOUTES = ['discord', 'son', 'pseudo', 'ecran', 'jeux', 'switch', '3ds', 'medias', 'manette', 'graphismes', ...(SUCCES ? ['succes'] : []), 'fin'];
// Déjà configuré mais déconnecté : seulement la connexion.
let ETAPES = TOUTES;
const NOMS_ETAPES = { son: 'Son', discord: 'Discord', pseudo: 'Pseudo', ecran: 'Écran', jeux: 'Jeux', switch: 'Switch', '3ds': '3DS', medias: 'Médias', manette: 'Manette', graphismes: 'Graphismes', succes: 'Succès' };
let bienvenue = null;
const bienvenueOuverte = () => Boolean(bienvenue);

const MODES_ECRAN = [['plein', 'Plein écran', 'Tout l\'écran, sans barre ni bordure. Comme une console.'], ['sans-bordure', 'Fenêtré sans bordure', 'Remplit l\'écran, la barre des tâches reste visible.'], ['fenetre', 'Fenêtré', 'Une fenêtre classique, à déplacer et redimensionner.']];
/** F11 bascule entre plein écran et fenêtre. */
function modeEcran(mode) {
  localStorage.ecran = mode;
  invoke('mode_ecran', { mode }).catch(() => {});
}

/** Niveaux de volume : [valeur, titre, texte, général, musique]. */
const NIVEAUX_SON = [
  ['doux', 'Doux', 'Un fond discret.', 35, 25],
  ['normal', 'Normal', 'Le réglage conseillé.', 60, 30],
  ['fort', 'Fort', 'Pour une télé ou des enceintes loin.', 90, 45],
  ['sans-musique', 'Sans musique', 'Juste les petits sons, pas de musique dans les menus.', 60, 0],
];
const niveauSon = () => NIVEAUX_SON.find(([, , , g, m]) => +localStorage['vol:general'] === g && +localStorage['vol:musique'] === m)?.[0] || (localStorage['vol:general'] === undefined ? 'normal' : '');
function ouvrirBienvenue() {
  const connecte = me || localStorage.token;
  ETAPES = localStorage.bienvenue && !connecte ? ['discord'] : connecte ? TOUTES.filter((e) => e !== 'discord') : TOUTES;
  if (localStorage.bienvenue) ETAPES = ETAPES.filter((e) => e !== 'son');
  bienvenue = { etape: 0, focus: 0, choix: { ecran: localStorage.ecran || 'plein', glyphes: localStorage.glyphes || 'auto', profil: 'recommande' }, appuyes: new Set() };
  $('#bienvenue').style.display = 'flex';
  drawBienvenue();
  entree($('#bienvenue .bv-carte'), 'pop-salle');
  invoke('pad_info').then((p) => ((manetteNom = p.name || ''), bienvenue && ETAPES[bienvenue.etape] === 'manette' && drawBienvenue())).catch(() => {});
  chargerDossier().then(() => bienvenue && ETAPES[bienvenue.etape] === 'jeux' && drawBienvenue());
  chargerSwitch().then(() => bienvenue && ETAPES[bienvenue.etape] === 'switch' && drawBienvenue());
  chargerTroisDs().then(() => bienvenue && ETAPES[bienvenue.etape] === '3ds' && drawBienvenue());
  chargerDossiersMedias().then(() => bienvenue && ETAPES[bienvenue.etape] === 'medias' && drawBienvenue());
  invoke('materiel').then((m) => {
    if (!bienvenue) return;
    bienvenue.materiel = m;
    if (ETAPES[bienvenue.etape] === 'graphismes') drawBienvenue();
  }).catch(() => {});
}
function connexionFaite() {
  if (ETAPES.length === 1) return fermerBienvenue();
  ETAPES = ETAPES.filter((e) => e !== 'discord');
  bienvenue.etape = 0;
  bienvenue.focus = 0;
  drawBienvenue();
  entree($('#bienvenue .bv-carte'), 'apparait-seul');
}
function fermerBienvenue() {
  bienvenue = null;
  localStorage.bienvenue = 'fait';
  $('#bienvenue').style.display = 'none';
  drawHome();
}

function choixEtape() {
  const e = ETAPES[bienvenue.etape];
  if (e === 'ecran') return MODES_ECRAN;
  if (e === 'jeux') return dossierInfo ? choixDossiers(dossierInfo) : [['', 'Recherche de tes disques…', '']];
  if (e === 'medias') return [['musique', 'Musique', dossiersMedias?.musique?.chemin || '…'], ['videos', 'Vidéos', dossiersMedias?.videos?.chemin || '…'], ['captures', 'Captures et photos', dossiersMedias?.captures?.chemin || '…']];
  if (e === 'son') return NIVEAUX_SON.map(([v, t, d]) => [v, t, d]);
  if (e === 'pseudo') return [['discord', `Le même que sur Discord${me?.name ? ` : ${me.name}` : ''}`, 'Ton pseudo Discord aussi sur les consoles.'], ['autre', `Un pseudo pour les consoles${localStorage.pseudo ? ` : ${localStorage.pseudo}` : ''}`, 'Avec le clavier à l\'écran, ou celui du PC.']];
  if (e === '3ds') return [['boot9', `boot9.bin : ${troisDsPret === null ? '…' : troisDsPret ? 'Installé' : 'À ajouter'}`, AIDE_BOOT9], ['plus-tard', troisDsPret ? 'C\'est bon' : 'Pas de 3DS, ou plus tard', 'Ça s\'ajoute aussi dans Réglages, Nintendo 3DS.']];
  if (e === 'switch') return [['cles', `Clés : ${switchEtat ? texteCles() : '…'}`, AIDE_CLES], ['titres', `Clés des jeux : ${switchEtat ? texteTitres() : '…'}`, AIDE_TITRES], ['firmware', `Firmware : ${switchEtat ? texteFirmware() : '…'}`, AIDE_FIRMWARE], ['plus-tard', switchPret() ? 'C\'est bon' : 'Pas de Switch, ou plus tard', 'Ça s\'ajoute aussi dans Réglages, Nintendo Switch.']];
  if (e === 'manette') return Object.entries(GLYPHES_NOMS).map(([v, t]) => [v, t, v === 'auto' ? 'Les symboles de la manette que tu tiens.' : `Toujours les symboles ${t}.`]);
  if (e === 'succes') return ra.token ? [['ok', `Connecté : ${ra.user}`, 'Tes succès se débloquent en jeu.']] : [['connecter', 'Connecter RetroAchievements', 'Les vrais succès des jeux GameCube et Wii, avec un compte gratuit.'], ['plus-tard', 'Plus tard', 'Dans les Réglages, partie Succès, quand tu veux.']];
  if (e === 'graphismes') {
    const r = bienvenue.materiel ? profilRecommande(bienvenue.materiel) : null;
    return [
      ['recommande', 'Recommandé', r ? `${r.base}, adapté à ton PC. ${r.detail}.` : 'Analyse de ton PC…'],
      ...Object.entries(PROFILS).map(([v, p]) => [v, p.nom, p.texte]),
      ['perso', 'Personnalisé', 'Je règle chaque console moi-même dans les Réglages.'],
    ];
  }
  return [];
}

function drawBienvenue() {
  const b = bienvenue;
  const e = ETAPES[b.etape];
  const choix = choixEtape();
  const actuel = { son: niveauSon(), pseudo: localStorage.pseudo ? 'autre' : 'discord', ecran: b.choix.ecran, jeux: dossierInfo?.chemin, manette: b.choix.glyphes, graphismes: b.choix.profil }[e];
  const titres = { son: 'Le son', discord: 'Bienvenue sur En Local', pseudo: 'Ton pseudo pour les consoles', switch: 'Ta Switch', '3ds': 'Ta 3DS', ecran: 'Comment afficher En Local ?', medias: 'Ta musique, tes vidéos, tes captures', jeux: 'Où ranger tes jeux ?', manette: 'Ta manette', graphismes: 'Les graphismes', succes: 'Les succès', fin: `C'est prêt${me ? `, ${esc(me.name)}` : ''} !` };
  const textes = {
    pseudo: 'Dans En Local, tu gardes ton pseudo Discord. Sur les consoles (DS, 3DS, Switch), c\'est ce pseudo que les autres voient en jeu. Il se change dans les Réglages.',
    son: 'Choisis le volume d\'En Local : tu entends la différence tout de suite. Chaque son se règle ensuite dans Réglages, Son (et le volume des jeux dans leur menu).',
    discord: 'L\'app du Local pour jouer ensemble. Pour commencer, connecte-toi avec ton compte Discord : tes sessions, les membres et ton profil en dépendent.',
    '3ds': 'Pour lire tes jeux 3DS chiffrés, il faut le fichier boot9.bin de ta propre 3DS (En Local n\'en fournit pas). Choisis-le sur ton PC, En Local le range au bon endroit.',
    switch: 'Pour les jeux Switch, il faut les clés et le firmware de ta propre console (En Local n\'en fournit pas). Choisis-les sur ton PC, En Local les range au bon endroit.',
    medias: 'Où En Local les trouve (et range tes captures en jeu). Choisis un dossier existant ou crées-en un ; ça se change dans les Réglages.',
    jeux: 'En Local y crée un dossier par console (Switch, 3DS, Wii U, Wii, GameCube, DS). Switch : un dossier par jeu, ses mises à jour et DLC dans un sous-dossier. Mets-y les copies de tes cartouches et disques ; un fichier posé au mauvais endroit, En Local le range pour toi (Réglages, Ranger mes jeux).',
    succes: 'Les trophées d\'En Local marchent sur toutes les consoles, sans compte. Pour les vrais succès des jeux : RetroAchievements.',
    ecran: 'Tu pourras changer ça quand tu veux dans les Réglages (ou avec F11).',
    manette: '',
    graphismes: '',
    fin: 'Tout se change dans les Réglages : chaque console, et chaque jeu dans ses actions (Share).',
  };
  let corps = '';
  if (e === 'manette') {
    const nom = manetteNom;
    corps = `<div class="bv-manette"><b>${nom ? esc(nom) : 'Aucune manette détectée'}</b><span>${nom ? 'Appuie sur ses boutons pour les tester.' : 'Branche-la, ou allume-la en Bluetooth. Le clavier marche aussi.'}</span>
      <div class="bv-boutons">${PHYS.map((p) => `<span class="bv-b${b.appuyes.has(p) ? ' ok' : ''}" data-p="${p}">${glyphePhys(p)}</span>`).join('')}</div></div>`;
  }
  if (e === 'discord') {
    corps = `<div class="bv-discord"><button class="bv-el bv-discord-btn" data-a="discord"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M20.32 4.37A19.8 19.8 0 0 0 15.4 2.85a13.8 13.8 0 0 0-.63 1.29 18.3 18.3 0 0 0-5.5 0 13 13 0 0 0-.64-1.29 19.7 19.7 0 0 0-4.92 1.52C.6 9.05-.24 13.6.18 18.1a19.9 19.9 0 0 0 6.03 3.05 14.7 14.7 0 0 0 1.29-2.1 12.9 12.9 0 0 1-2.03-.97l.5-.39a14.2 14.2 0 0 0 12.06 0l.5.39c-.65.38-1.33.71-2.04.97.37.74.8 1.44 1.29 2.1a19.8 19.8 0 0 0 6.04-3.05c.5-5.22-.84-9.73-3.55-13.73ZM8.02 15.33c-1.18 0-2.16-1.09-2.16-2.42 0-1.33.95-2.42 2.16-2.42s2.18 1.1 2.16 2.42c0 1.33-.95 2.42-2.16 2.42Zm7.97 0c-1.18 0-2.16-1.09-2.16-2.42 0-1.33.95-2.42 2.16-2.42s2.18 1.1 2.16 2.42c0 1.33-.94 2.42-2.16 2.42Z"/></svg>Se connecter avec Discord</button>
      <small>Ton navigateur s'ouvre : autorise En Local, puis reviens ici. Réservé aux membres vérifiés du Local.</small></div>`;
  }
  if (e === 'graphismes') {
    const m = b.materiel;
    const gpu = gpuPrincipal(m);
    corps = `<div class="bv-pc">${m ? [gpu && `${esc(gpu.nom)}${gpu.vram ? ` · ${Math.round(gpu.vram / 1024)} Go` : ''}`, m.cpu && `${esc(m.cpu.replace(/\s*\d+-Core Processor|\(R\)|\(TM\)|CPU|@.*$/gi, '').trim())} · ${m.threads} threads`, m.ram && `${m.ram} Go de mémoire`, gpu?.largeur && `Écran ${gpu.largeur}×${gpu.hauteur}`].filter(Boolean).map((x) => `<span>${x}</span>`).join('') : '<span>Analyse de ton PC…</span>'}</div>`;
  }
  const options = choix.map(([v, t, d], n) => `<button class="bv-el bv-choix${v === actuel ? ' choisi' : ''}" data-n="${n}"><b>${esc(t)}</b><small>${esc(d)}</small>${v === actuel ? '<i>✓</i>' : ''}</button>`).join('');
  const nb = choix.length;
  $('#bienvenue').innerHTML = `<div class="bv-carte">
    <div class="bv-etapes">${ETAPES.length > 1 ? ETAPES.filter((x) => x !== 'fin').map((x, k) => `<span class="${k < b.etape ? 'fait' : k === b.etape ? 'ici' : ''}">${k + 1}. ${NOMS_ETAPES[x]}</span>`).join('') : ''}</div>
    <img class="bv-loc" src="img/loc/loc_${{ son: 'musique', discord: 'coucou', pseudo: 'content', fin: 'fete', graphismes: 'reglages', succes: 'gg', jeux: 'dossier', switch: 'manette', '3ds': 'dossier', medias: 'photo', manette: 'manette' }[e] || 'coucou'}.gif" alt="">
    <h2>${titres[e]}</h2>${textes[e] ? `<p>${textes[e]}</p>` : ''}
    ${corps}
    ${options ? `<div class="bv-choix-liste n${nb}">${options}</div>` : ''}
    <div class="bv-actions">${b.etape > 0 ? `<button class="bv-el bv-btn" data-a="retour">${glyphs.minus}Retour</button>` : '<span></span>'}${e === 'discord' ? '' : `<button class="bv-el bv-btn main" data-a="suite">${glyphs.plus}${e === 'fin' ? 'C\'est parti' : 'Continuer'}</button>`}</div>
  </div>`;
  $('#bienvenue').querySelectorAll('.bv-el').forEach((el, k) => (el.onclick = () => ((b.focus = k), activerBienvenue())));
  focusBienvenue(Math.min(b.focus, $('#bienvenue').querySelectorAll('.bv-el').length - 1));
}
function focusBienvenue(n) {
  const els = [...$('#bienvenue').querySelectorAll('.bv-el')];
  bienvenue.focus = Math.max(0, Math.min(n, els.length - 1));
  els.forEach((el, k) => el.classList.toggle('focus', k === bienvenue.focus));
}

async function activerBienvenue() {
  const b = bienvenue;
  const el = $('#bienvenue').querySelectorAll('.bv-el')[b.focus];
  if (!el) return;
  if (el.dataset.a === 'retour') return etapeBienvenue(-1);
  if (el.dataset.a === 'discord') return login();
  if (el.dataset.a === 'suite') return etapeBienvenue(1);
  const [v] = choixEtape()[+el.dataset.n];
  const e = ETAPES[b.etape];
  if (e === 'son') {
    const [, , , g, m] = NIVEAUX_SON.find(([x]) => x === v);
    localStorage['vol:general'] = g;
    localStorage['vol:musique'] = m;
    appliquerVolumes();
    son('ok');
  }
  if (e === 'pseudo' && v === 'discord') delete localStorage.pseudo;
  if (e === 'pseudo' && v === 'autre') return changerPseudo(() => bienvenue && drawBienvenue());
  if (e === 'ecran') (b.choix.ecran = v), modeEcran(v);
  if (e === 'manette') (b.choix.glyphes = v), (localStorage.glyphes = v), utiliser(typeManette || 'clavier', true);
  if (e === 'graphismes') b.choix.profil = v;
  if (e === 'jeux' && v) {
    if (v === dossierInfo?.chemin) return etapeBienvenue(1);
    if (await definirDossier(v)) return etapeBienvenue(1);
    return drawBienvenue();
  }
  if (e === 'medias') return choisirDossierMedia(v);
  if (e === 'discord') return login();
  if (e === '3ds') return v === 'plus-tard' ? etapeBienvenue(1) : poserTroisDs().then(() => bienvenue && drawBienvenue());
  if (e === 'switch') return v === 'plus-tard' ? etapeBienvenue(1) : poserSwitch(v).then(() => bienvenue && drawBienvenue());
  if (e === 'succes' && v === 'connecter') return connecterRa();
  if (e === 'succes' && v === 'plus-tard') return etapeBienvenue(1);
  drawBienvenue();
}
async function etapeBienvenue(d) {
  const b = bienvenue;
  if (d > 0 && ETAPES[b.etape] === 'discord' && !me) return login(); // la connexion d'abord
  if (d > 0 && ETAPES[b.etape] === 'graphismes' && b.choix.profil !== 'perso') {
    await appliquerProfil(b.choix.profil, b.materiel);
    toast(`Graphismes : ${NOMS_PROFILS[b.choix.profil]}`);
  }
  if (d > 0 && ETAPES[b.etape] === 'fin') return fermerBienvenue();
  b.etape = Math.max(0, Math.min(ETAPES.length - 1, b.etape + d));
  const choix = choixEtape();
  const actuel = { son: niveauSon(), pseudo: localStorage.pseudo ? 'autre' : 'discord', ecran: b.choix.ecran, jeux: dossierInfo?.chemin, manette: b.choix.glyphes, graphismes: b.choix.profil }[ETAPES[b.etape]];
  b.focus = Math.max(0, choix.findIndex(([v]) => v === actuel));
  if (!choix.length) b.focus = b.etape > 0 ? 1 : 0;
  drawBienvenue();
  entree($('#bienvenue .bv-carte'), 'apparait-seul');
}

function navBienvenue(k) {
  const els = [...$('#bienvenue').querySelectorAll('.bv-el')];
  if (['up', 'down', 'left', 'right'].includes(k)) {
    const n = voisin(els, bienvenue.focus, k);
    if (n >= 0) focusBienvenue(n);
    return;
  }
  // ✕ choisit, Start continue, Share ou ○ reviennent en arrière.
  if (k === 'a') return activerBienvenue();
  if (k === 'plus') return etapeBienvenue(1);
  if ((k === 'minus' || k === 'b') && bienvenue.etape > 0) return etapeBienvenue(-1);
}
// Étape Manette : chaque bouton appuyé s'allume.
window.__TAURI__.event.listen('pad-brut', (e) => {
  if (!bienvenue || ETAPES[bienvenue.etape] !== 'manette') return;
  bienvenue.appuyes.add(e.payload);
  const el = $(`#bienvenue .bv-b[data-p="${e.payload}"]`);
  if (el) (el.classList.add('ok'), entree(el, 'pop-ctx'));
});
