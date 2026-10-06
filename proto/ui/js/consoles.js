/*
 * Réglages des consoles et des jeux, écrits dans la configuration de l'émulateur à chaque lancement.
 * Ordre de priorité : le jeu, puis la console, puis l'émulateur.
 */
const emu = JSON.parse(localStorage.emu || 'null') || { langue: 'fr', consoles: {}, jeux: {} };
const garderEmu = () => (localStorage.emu = JSON.stringify(emu));

const LANGUES = [['fr', 'Français'], ['en', 'English'], ['de', 'Deutsch'], ['es', 'Español'], ['it', 'Italiano'], ['nl', 'Nederlands'], ['ja', '日本語']];
const VOLUME = { id: 'volume', label: 'Volume', aide: 'Le volume du jeu, avant celui de Windows.', valeurs: [['100', '100 %'], ['80', '80 %'], ['60', '60 %'], ['40', '40 %'], ['20', '20 %'], ['0', 'Muet']] };
const OUI_NON = [['oui', 'Oui'], ['non', 'Non']];
const NON_OUI = [['non', 'Non'], ['oui', 'Oui']];
const LANGUE = { id: 'langue', label: 'Langue du jeu', aide: 'La langue de la console émulée : les jeux qui en ont plusieurs (Pokémon, Smash, Mario Kart…) s\'affichent dans celle-ci. Certains jeux ont leur propre réglage de langue, qui passe avant (Smash Ultimate : dans ses Options), ou la fixent à la création de la sauvegarde.', valeurs: LANGUES };

/** Réglages par console : { id, label, aide, valeurs: [[valeur, texte]] }. */
const REGLAGES_CONSOLE = {
  DS: [
    { ...LANGUE, valeurs: LANGUES.filter(([l]) => l !== 'nl') },
    { id: 'info_api', label: 'Pilote graphique', info: 'Logiciel', aide: 'La DS est dessinée par le processeur, dans En Local : pas de pilote graphique à choisir.' },
    { id: 'disposition', label: 'Les deux écrans', aide: 'Comment la DS montre ses deux écrans. Le tactile suit, à la souris ou au doigt.', valeurs: [['top-bottom', 'Haut / bas'], ['left-right', 'Côte à côte'], ['hybrid-top', 'Grand écran du haut'], ['hybrid-bottom', 'Grand écran du bas'], ['bottom-top', 'Bas / haut'], ['right-left', 'Côte à côte (inversé)'], ['top', 'Écran du haut seul'], ['bottom', 'Écran du bas seul']] },
    { id: 'ecart', label: 'Espace entre les écrans', aide: 'Comme la charnière de la console.', valeurs: [['0', 'Aucun'], ['8', 'Petit'], ['16', 'Moyen'], ['32', 'Grand'], ['64', 'Très grand']] },
    { id: 'lissage', label: 'Image', aide: 'La DS a une petite résolution : nette, chaque pixel reste carré ; lissée, l\'image est plus douce mais floue.', valeurs: [['net', 'Nette (pixels)'], ['lisse', 'Lissée']] },
    VOLUME,
  ],
  '3DS': [
    LANGUE,
    { id: 'api', label: 'Pilote graphique', parDefaut: 'OpenGL', aide: 'Comment Azahar parle à la carte graphique. Vulkan est souvent plus fluide ; OpenGL, le plus compatible. Logiciel : très lent, en dernier recours.', valeurs: [['1', 'OpenGL'], ['2', 'Vulkan'], ['0', 'Logiciel (lent)']] },
    { id: 'resolution', label: 'Résolution', aide: 'La 3DS affiche en 400×240 : plus haut, les jeux 3D sont bien plus nets. Demande plus à la carte graphique.', valeurs: [['1', '1× (400×240)'], ['2', '2× (800×480)'], ['3', '3× (1200×720)'], ['4', '4× (1600×960)'], ['5', '5× (2000×1200)'], ['6', '6× (2400×1440)'], ['8', '8×'], ['10', '10×']] },
    { id: 'filtre', label: 'Filtre des textures', aide: 'Agrandit les textures des jeux. Anime4K et xBRZ conviennent aux jeux en 2D et aux dessins.', valeurs: [['0', 'Aucun'], ['1', 'Anime4K'], ['2', 'Bicubique'], ['3', 'ScaleForce'], ['4', 'xBRZ'], ['5', 'MMPX']] },
    { id: 'disposition', label: 'Les deux écrans', aide: 'Comment la 3DS montre ses deux écrans.', valeurs: [['0', 'Haut / bas'], ['2', 'Grand écran du haut'], ['3', 'Côte à côte'], ['5', 'Hybride'], ['1', 'Un seul écran']] },
    { id: 'inverser', label: 'Inverser les écrans', aide: 'L\'écran du bas passe en haut (ou en grand).', valeurs: NON_OUI },
    { id: 'proportion', label: 'Taille du grand écran', aide: 'Avec « Grand écran du haut » : combien de fois plus grand que l\'autre.', valeurs: [['4', '4×'], ['2', '2×'], ['3', '3×'], ['5', '5×']] },
    { id: 'shaders_async', label: 'Shaders en arrière-plan', aide: 'Moins de saccades quand le jeu affiche quelque chose de nouveau ; un effet peut manquer un instant.', valeurs: NON_OUI },
    { id: 'vsync', label: 'Synchro verticale', aide: 'Évite les déchirures de l\'image.', valeurs: OUI_NON },
    { id: 'vitesse', label: 'Vitesse du jeu', aide: 'Normale, sauf pour accélérer un passage lent.', valeurs: [['100', 'Normale'], ['200', '2×'], ['0', 'Illimitée'], ['50', 'Ralentie']] },
    { id: 'cpu', label: 'Processeur de la 3DS', aide: 'Plus rapide que l\'original : certains jeux tournent plus fluide (d\'autres pas).', valeurs: [['100', 'Normal'], ['125', '125 %'], ['150', '150 %'], ['200', '200 %']] },
    VOLUME,
  ],
  GC: [], Wii: [], // remplis plus bas
  WiiU: [
    LANGUE,
    { id: 'api', label: 'Pilote graphique', parDefaut: 'Vulkan', aide: 'Vulkan : le plus fluide, avec moins de saccades. OpenGL : si un jeu s\'affiche mal en Vulkan.', valeurs: [['1', 'Vulkan'], ['0', 'OpenGL']] },
    { id: 'info', label: 'Résolution et 60 FPS', aide: 'Sur Wii U, la résolution, les FPS et les améliorations sont dans les packs graphiques de chaque jeu : actions du jeu (Share), « Réglages de ce jeu ».', info: 'Par jeu' },
    { id: 'vsync', label: 'Synchro verticale', aide: 'Évite les déchirures de l\'image. Triple : plus fluide, un peu plus de latence.', valeurs: [['1', 'Oui'], ['0', 'Non'], ['2', 'Triple']] },
    { id: 'filtre_haut', label: 'Agrandissement', aide: 'Le filtre quand l\'image du jeu est plus petite que la fenêtre.', valeurs: [['1', 'Bicubique'], ['2', 'Bicubique Hermite'], ['0', 'Bilinéaire'], ['3', 'Plus proche voisin']] },
    { id: 'filtre_bas', label: 'Réduction', aide: 'Le filtre quand l\'image du jeu est plus grande que la fenêtre (résolution haute).', valeurs: [['0', 'Bilinéaire'], ['1', 'Bicubique'], ['2', 'Bicubique Hermite'], ['3', 'Plus proche voisin']] },
    { id: 'etirer', label: 'Étirer l\'image', aide: 'Remplir tout l\'écran au lieu de garder les proportions.', valeurs: NON_OUI },
    { id: 'shaders_async', label: 'Shaders en arrière-plan', aide: 'Moins de saccades quand le jeu affiche quelque chose de nouveau.', valeurs: OUI_NON },
    VOLUME,
  ],
  Switch: [
    { ...LANGUE, valeurs: [...LANGUES, ['pt', 'Português'], ['ru', 'Русский']] },
    { id: 'api', label: 'Pilote graphique', parDefaut: 'Vulkan', aide: 'Vulkan : le plus rapide et le mieux suivi. OpenGL : si un jeu s\'affiche mal en Vulkan (GLASM : cartes NVIDIA seulement).', valeurs: [['1', 'Vulkan'], ['0', 'OpenGL (GLSL)'], ['3', 'OpenGL (GLASM, NVIDIA)'], ['4', 'OpenGL (SPIR-V)']] },
    { id: 'mode', label: 'Mode de la console', aide: 'Salon : comme sur la TV (meilleure image). Portable : plus léger pour le PC.', valeurs: [['1', 'Salon (TV)'], ['0', 'Portable']] },
    { id: 'resolution', label: 'Résolution', aide: 'Multiplie la résolution du jeu (720p en portable, 1080p en salon pour la plupart). Plus haut : plus net, plus lourd.', valeurs: [['3', '1× (d\'origine)'], ['5', '1,5×'], ['6', '2×'], ['7', '3×'], ['8', '4×'], ['2', '0,75×'], ['1', '0,5×']] },
    { id: 'filtre', label: 'Filtre de l\'image', aide: 'Pour agrandir l\'image à la taille de l\'écran. FSR (AMD) garde le plus de netteté.', valeurs: [['1', 'Bilinéaire'], ['2', 'Bicubique'], ['4', 'Lanczos'], ['5', 'ScaleForce'], ['6', 'AMD FSR'], ['7', 'Area'], ['12', 'MMPX'], ['0', 'Plus proche voisin']] },
    { id: 'aa', label: 'Anticrénelage', aide: 'Lisse les bords en escalier.', valeurs: [['0', 'Aucun'], ['1', 'FXAA'], ['2', 'SMAA']] },
    { id: 'format', label: 'Format d\'image', aide: '16:9 comme la console. Les autres déforment ou ajoutent des bandes.', valeurs: [['0', '16:9'], ['1', '4:3'], ['2', '21:9'], ['3', '16:10'], ['4', 'Étiré']] },
    { id: 'aniso', label: 'Filtrage anisotrope', aide: 'Textures plus nettes au loin (sols, routes).', valeurs: [['0', 'Auto'], ['1', 'Selon le jeu'], ['2', '2×'], ['3', '4×'], ['4', '8×'], ['5', '16×']] },
    { id: 'precision', label: 'Précision du GPU', aide: 'Moyenne : le bon réglage pour presque tous les jeux. Basse : plus rapide, mais des personnages ou des effets peuvent s\'afficher mal (Mario Kart). Haute : plus fidèle, plus lourde.', valeurs: [['1', 'Moyenne'], ['0', 'Basse (défauts possibles)'], ['2', 'Haute (fidèle)']] },
    { id: 'shaders_async', label: 'Shaders en arrière-plan', aide: 'Moins de saccades quand le jeu affiche quelque chose de nouveau ; un effet peut manquer un instant.', valeurs: NON_OUI },
    { id: 'vsync', label: 'Synchro verticale', aide: 'Évite les déchirures de l\'image.', valeurs: [['2', 'Oui'], ['0', 'Non'], ['1', 'Mailbox'], ['3', 'Adaptative']] },
    VOLUME,
  ],
};
const DOLPHIN = (wii) => [
  wii ? LANGUE : { ...LANGUE, valeurs: LANGUES.filter(([l]) => l !== 'ja'), aide: 'Pour les jeux GameCube européens, qui ont plusieurs langues. Les jeux américains et japonais restent dans la leur.' },
  { id: 'api', label: 'Pilote graphique', parDefaut: 'Direct3D 11', aide: 'Direct3D 11 : le plus sûr sur Windows. Vulkan : souvent plus fluide, moins de saccades. Direct3D 12 et OpenGL : si un jeu s\'affiche mal.', valeurs: [['D3D', 'Direct3D 11'], ['Vulkan', 'Vulkan'], ['D3D12', 'Direct3D 12'], ['OGL', 'OpenGL']] },
  { id: 'resolution', label: 'Résolution', aide: 'Les jeux s\'affichaient en 480p : plus haut, ils sont bien plus nets. Demande plus à la carte graphique.', valeurs: [['1', 'D\'origine (480p)'], ['2', '2× (720p)'], ['3', '3× (1080p)'], ['4', '4× (1440p)'], ['5', '5× (1800p)'], ['6', '6× (4K)'], ['8', '8× (5K)']] },
  { id: 'aa', label: 'Anticrénelage', aide: 'Lisse les bords en escalier.', valeurs: [['1', 'Aucun'], ['2', 'MSAA 2×'], ['4', 'MSAA 4×'], ['8', 'MSAA 8×']] },
  { id: 'aniso', label: 'Filtrage anisotrope', aide: 'Textures plus nettes au loin.', valeurs: [['-1', 'Selon le jeu'], ['0', '1×'], ['1', '2×'], ['2', '4×'], ['3', '8×'], ['4', '16×']] },
  { id: 'format', label: 'Format d\'image', aide: 'Auto : celui que le jeu demande.', valeurs: [['0', 'Auto'], ['1', '16:9'], ['2', '4:3'], ['3', 'Étiré']] },
  ...(wii ? [{ id: 'wii_16_9', label: 'Wii en 16:9', aide: 'La Wii est réglée en écran large : les jeux qui le gèrent s\'affichent en 16:9.', valeurs: OUI_NON }] : []),
  { id: 'ecran_large', label: 'Forcer l\'écran large', aide: 'Élargit la vue des jeux en 4:3. Peut couper ou déformer certains éléments. GameCube : seulement avec « Autour du jeu » sur Noir (le décor garde le vrai 4:3).', valeurs: NON_OUI },
  { id: 'shaders', label: 'Compilation des shaders', aide: 'Ubershaders : plus de saccades à la première apparition d\'un effet, demande un PC plus solide.', valeurs: [['0', 'Normale'], ['1', 'Ubershaders'], ['2', 'Ubershaders en arrière-plan'], ['3', 'En arrière-plan (saute des images)']] },
  { id: 'textures_hd', label: 'Textures HD', aide: 'Charge les packs de textures HD du jeu, si tu en as mis dans son dossier (Réglages de ce jeu).', valeurs: NON_OUI },
  { id: 'vsync', label: 'Synchro verticale', aide: 'Évite les déchirures de l\'image.', valeurs: NON_OUI },
  { id: 'vitesse', label: 'Vitesse du jeu', aide: 'Normale, sauf pour accélérer un passage lent.', valeurs: [['100', 'Normale'], ['150', '150 %'], ['200', '2×'], ['0', 'Illimitée'], ['50', 'Ralentie']] },
  VOLUME,
];
REGLAGES_CONSOLE.GC = DOLPHIN(false);
REGLAGES_CONSOLE.Wii = DOLPHIN(true);

/**
 * Réglages envoyés à l'émulateur pour un jeu.
 * Nom de joueur : celui des Réglages, sinon le pseudo Discord.
 */
const pseudoConsoles = () => localStorage.pseudo || me?.name || '';

function optsDe(g) {
  const c = emu.consoles[g.console] || {};
  const j = emu.jeux[g.path] || {};
  const o = { langue: emu.langue, ...c, ...j };
  for (const k of Object.keys(o)) if (o[k] === '' || typeof o[k] === 'object') delete o[k];
  if (j.packs) o.packs = JSON.stringify(Object.entries(j.packs).map(([f, p]) => (p === false ? { f, off: true } : { f, p })));
  if (j.mods) o.mods = j.mods.length ? j.mods.join('|') : 'aucun';
  if (j.mods_off) o.mods_off = JSON.stringify(j.mods_off);
  if (pseudoConsoles()) o.pseudo = pseudoConsoles();
  if (dureeClips()) o.clips = String(dureeClips()); // durée du tampon des clips, en secondes
  if (dureeClips()) o.clips_qualite = localStorage.clipsQualite || 'haute';
  if (SUCCES && (g.console === 'GC' || g.console === 'Wii') && ra.token) Object.assign(o, { ra_user: ra.user, ra_token: ra.token, ra_hardcore: ra.hardcore ? 'oui' : 'non' });
  const f = formatJeu(g, o);
  if (f) o.format_jeu = String(f);
  // GameCube / Wii : Dolphin dessine au format exact, sinon il ajoute ses propres bandes noires.
  if (f && (g.console === 'GC' || g.console === 'Wii')) o.format = '3';
  // Beaucoup de jeux ont une marge noire dans l'image : elle passe sous le décor.
  if (f && (g.console === 'GC' || g.console === 'Wii')) o.zoom_jeu = '1.12x1.05';
  if (f && g.console === 'GC') o.ecran_large = 'non';
  return o;
}
/**
 * Format de l'image du jeu (largeur / hauteur). 0 : toute la fenêtre.
 * Les écrans dans l'image, en fractions [x, y, l, h]. Rien : un seul écran.
 */
function ecransJeu(g, o) {
  if (g.console !== '3DS' || (o.disposition ?? '0') !== '0') return null;
  const haut = [0, 0, 1, 0.5], bas = [0.1, 0.5, 0.8, 0.5];
  return o.inverser === 'oui' ? [[0.1, 0, 0.8, 0.5], [0, 0.5, 1, 0.5]] : [haut, bas];
}
function formatJeu(g, o) {
  if (localStorage.habillage === 'noir') return 0;
  const c = g.console;
  if (c === 'Switch') return { 0: 16 / 9, 1: 4 / 3, 2: 21 / 9, 3: 16 / 10 }[o.format ?? '0'] || 0;
  if (c === 'WiiU') return 16 / 9;
  // GameCube : 4:3. Wii : 16:9, sauf format choisi.
  if (c === 'GC') return o.format === '3' ? 0 : 4 / 3;
  if (c === 'Wii') return o.format === '2' ? 4 / 3 : o.format === '3' ? 0 : 16 / 9;
  if (c === '3DS') {
    // Écran du haut 400×240, du bas 320×240.
    const k = Number(o.proportion) || 4;
    return { 0: 400 / 480, 1: o.inverser === 'oui' ? 320 / 240 : 400 / 240, 2: (400 * k + 320) / (240 * k), 3: 720 / 240 }[o.disposition ?? '0'] || 0;
  }
  return 0;
}
/** Image de la DS, nette ou lissée. */
const lissageDs = (g) => (optsDe(g).lissage === 'lisse');

/* ---------- Manette ---------- */

// [bouton de la console, nom, bouton de la manette par défaut]
const AB = [['a', 'A', 'east'], ['b', 'B', 'south'], ['x', 'X', 'north'], ['y', 'Y', 'west']];
const TOUCHES_CONSOLE = {
  DS: [...AB, ['l', 'L', 'lb'], ['r', 'R', 'rb'], ['start', 'Start', 'start'], ['select', 'Select', 'back']],
  '3DS': [...AB, ['l', 'L', 'lb'], ['r', 'R', 'rb'], ['zl', 'ZL', 'lt'], ['zr', 'ZR', 'rt'], ['start', 'Start', 'start'], ['select', 'Select', 'back']],
  GC: [['a', 'A', 'south'], ['b', 'B', 'west'], ['x', 'X', 'east'], ['y', 'Y', 'north'], ['z', 'Z', 'rb'], ['l', 'L', 'lt'], ['r', 'R', 'rt'], ['start', 'Start', 'start']],
  Wii: [['a', 'A', 'south'], ['b', 'B', 'rt'], ['un', '1', 'west'], ['deux', '2', 'north'], ['moins', '−', 'back'], ['plus', '+', 'start'], ['c', 'C (Nunchuk)', 'lb'], ['nz', 'Z (Nunchuk)', 'lt'], ['secouer', 'Secouer', 'r3']],
  WiiU: [...AB, ['l', 'L', 'lb'], ['r', 'R', 'rb'], ['zl', 'ZL', 'lt'], ['zr', 'ZR', 'rt'], ['plus', '+', 'start'], ['moins', '−', 'back'], ['l3', 'Stick gauche (clic)', 'l3'], ['r3', 'Stick droit (clic)', 'r3']],
  Switch: [...AB, ['l', 'L', 'lb'], ['r', 'R', 'rb'], ['zl', 'ZL', 'lt'], ['zr', 'ZR', 'rt'], ['plus', '+', 'start'], ['moins', '−', 'back'], ['l3', 'Stick gauche (clic)', 'l3'], ['r3', 'Stick droit (clic)', 'r3']],
};
const PHYS = ['south', 'east', 'west', 'north', 'lb', 'rb', 'lt', 'rt', 'start', 'back', 'l3', 'r3', 'up', 'down', 'left', 'right'];
function glyphePhys(p) {
  const kind = GLYPHS[typeManette] && typeManette !== 'clavier' ? typeManette : 'xbox';
  const g = GLYPHS[kind];
  const n = kind === 'nintendo';
  const cle = { south: n ? 'b' : 'a', east: n ? 'a' : 'b', north: 'x', west: 'y', lb: 'lb', rb: 'rb', lt: 'lt', rt: 'rt', start: 'plus', back: 'minus' }[p];
  if (cle && g[cle]) return g[cle];
  const ps = kind === 'playstation';
  const texte = { rt: ps ? 'R2' : n ? 'ZR' : 'RT', lt: ps ? 'L2' : n ? 'ZL' : 'LT', l3: ps ? 'L3' : 'LS', r3: ps ? 'R3' : 'RS', up: '↑', down: '↓', left: '←', right: '→' }[p];
  return `<span class="k sq">${texte || p}</span>`;
}
function lignesTouches(c, ou, defaut, parent) {
  const lignes = TOUCHES_CONSOLE[c].map(([id, nom, d]) => {
    const cle = `touche_${id}`;
    const actuelle = ou[cle] || '';
    const herite = parent?.[cle] || d;
    const choisir = () => capturerTouche(nom, glyphePhys(actuelle || herite), (p) => {
      if (p) ou[cle] = p;
      else delete ou[cle];
      garderEmu();
    }, Boolean(actuelle));
    return {
      bouton: id,
      label: `Bouton ${nom}`,
      aide: `Le bouton de ta manette qui fait ${nom} sur la ${LONG[c]}. Appuie (ou clique), puis presse la touche voulue sur ta manette. Tu peux aussi cliquer sur le bouton dans le schéma.`,
      valeurHtml: actuelle ? glyphePhys(actuelle) : `<small>${defaut}</small> ${glyphePhys(herite)}`,
      fn: choisir,
      capture: choisir,
    };
  });
  lignes.push({ label: 'Remettre les touches par défaut', aide: `Les boutons de la ${LONG[c]} reviennent ${parent ? 'comme ceux de la console' : 'à la disposition d\'En Local'}.`, fn: () => {
    for (const [id] of TOUCHES_CONSOLE[c]) delete ou[`touche_${id}`];
    garderEmu();
    toast('Touches remises par défaut');
  } });
  return lignes;
}

/** Attend l'appui d'une touche pour un bouton de la console (10 s au plus). */
let captureTouche = null;
function capturerTouche(nom, actuelle, fn, perso) {
  let minuterie = null;
  const fin = () => {
    captureTouche = null;
    clearTimeout(minuterie);
    $('#sheet').style.display = 'none';
    drawReglages();
  };
  captureTouche = (p) => (fn(p), fin(), toast(`Bouton ${nom} : réglé`));
  minuterie = setTimeout(fin, 10000);
  sheet(`Bouton ${nom}`, `Appuie sur la touche de ta manette à utiliser.<span class="capture-actuelle">Actuellement ${actuelle}</span>`, [
    ...(perso ? [{ label: 'Remettre par défaut', fn: () => (fn(''), fin()) }] : []),
    { label: 'Annuler', cancel: true, fn: () => ((captureTouche = null), clearTimeout(minuterie)) },
  ], '<div class="capture-attente"><span></span><span></span><span></span></div>');
  $('#sheet').classList.add('capture');
}
window.__TAURI__.event.listen('pad-brut', (e) => captureTouche?.(e.payload));

/* ---------- Pages des Réglages ---------- */

const texteDe = (r, v) => r.valeurs?.find(([x]) => x === v)?.[1];
function lignesReglage(r, ou, parent, defaut) {
  if (r.info) return { label: r.label, valeur: r.info, aide: r.aide };
  const valeurs = [['', defaut], ...r.valeurs];
  const actuelle = ou[r.id] ?? '';
  return {
    label: r.label,
    aide: r.aide,
    valeur: texteDe({ valeurs }, actuelle) || defaut,
    fleches: true,
    fn: (d = 1) => {
      const k = valeurs.findIndex(([x]) => x === actuelle);
      const v = valeurs[(k + d + valeurs.length) % valeurs.length][0];
      if (v === '') delete ou[r.id];
      else ou[r.id] = v;
      garderEmu();
    },
  };
}

/**
 * Page d'une console.
 * Switch : prod.keys et firmware viennent de la Switch du joueur. En Local ne les fournit jamais.
 */
let switchEtat = null;
const chargerSwitch = () => invoke('switch_etat').then((e) => (switchEtat = e)).catch(() => null);
const switchPret = () => switchEtat?.cles && switchEtat.firmware > 0;
const texteCles = () => (switchEtat?.cles ? 'Installées' : 'À ajouter');
const texteTitres = () => (switchEtat?.titres ? 'Installées' : 'À ajouter');
const AIDE_TITRES = 'Le fichier title.keys de ta Switch, sorti avec Lockpick_RCM à côté du prod.keys : les clés de tes jeux et mises à jour. Certains jeux ne se lancent pas sans.';
const texteFirmware = () => (switchEtat?.firmware ? `Installé (${switchEtat.firmware} fichiers)` : 'À ajouter');
const AIDE_CLES = 'Le fichier prod.keys de ta Switch, sorti avec Lockpick_RCM. Choisis-le : En Local le copie au bon endroit.';
const AIDE_FIRMWARE = 'Le dossier de fichiers .nca sorti de ta Switch avec TegraExplorer. Choisis le dossier : En Local remplace l\'ancien firmware.';
/* 3DS : boot9.bin vient de la 3DS du joueur, pour lire ses jeux chiffrés. Jamais fourni. */
let troisDsPret = null;
const chargerTroisDs = () => invoke('trois_ds_etat').then((b) => (troisDsPret = b)).catch(() => null);
const AIDE_BOOT9 = 'Le fichier boot9.bin de ta 3DS : dans GodMode9 (Start au démarrage), lecteur [M:] MEMORY VIRTUAL, boot9.bin, A, « Copy to 0:/gm9/out ». Il sert à lire tes jeux 3DS chiffrés. Garde-le pour toi.';
async function poserTroisDs() {
  try {
    const r = await invoke('trois_ds_poser');
    if (r) toast(r), son('ok');
  } catch (e) {
    son('erreur');
    sheet('Pas le bon fichier', esc(e), [{ label: 'OK', cancel: true }]);
  }
  await chargerTroisDs();
}
/** Demande le boot9.bin une seule fois. */
async function demanderTroisDs(force = false) {
  await chargerTroisDs();
  if (troisDsPret || (!force && localStorage.boot9Demande)) return;
  localStorage.boot9Demande = '1';
  sheet('Ta 3DS : le fichier boot9.bin', `Pour lire tes jeux 3DS chiffrés, En Local a besoin du fichier boot9.bin de ta propre 3DS (En Local n'en fournit pas).<br><br>${esc(AIDE_BOOT9)}`, [
    { label: 'Choisir mon boot9.bin', fn: () => poserTroisDs() },
    { label: 'Plus tard (Réglages, Nintendo 3DS)', cancel: true },
  ]);
}

async function poserSwitch(quoi) {
  if (quoi === 'firmware') toast('Copie du firmware… (quelques secondes)');
  try {
    const r = await invoke('switch_poser', { quoi });
    if (r) toast(r), son('ok');
  } catch (e) {
    son('erreur');
    sheet('Pas le bon fichier', esc(e), [{ label: 'OK', cancel: true }]);
  }
  await chargerSwitch();
}
/** Jeu Switch sans clés ou sans firmware : explique quoi ajouter. */
async function demanderSwitch() {
  await chargerSwitch();
  const manque = [!switchEtat?.cles && 'les clés (prod.keys)', !switchEtat?.firmware && 'le firmware'].filter(Boolean).join(' et ');
  sheet('Il manque ta Switch', `Pour jouer aux jeux Switch, En Local a besoin de ${manque || 'tes fichiers'}, sortis de ta propre console. En Local n'en fournit pas.`, [
    ...(!switchEtat?.cles ? [{ label: 'Choisir mon prod.keys', fn: () => poserSwitch('cles').then(() => !switchPret() && demanderSwitch()) }] : []),
    ...(!switchEtat?.firmware ? [{ label: 'Choisir le dossier du firmware', fn: () => poserSwitch('firmware').then(() => !switchPret() && demanderSwitch()) }] : []),
    { label: 'Plus tard', cancel: true },
  ]);
}

function pageConsole(c) {
  const ou = (emu.consoles[c] ||= {});
  if (c === 'Switch' && !switchEtat) chargerSwitch().then(() => onglet === 'reglages' && regPage?.console === 'Switch' && drawReglages());
  const global = LANGUES.find(([l]) => l === emu.langue)?.[1] || 'Français';
  // Modifier un réglage graphique passe le profil en « Personnalisé ».
  const perso = (r, l) => (CLES_GRAPHIQUES.includes(r.id) && l.fn ? { ...l, fn: (d) => (l.fn(d), (emu.profil = 'perso'), garderEmu()) } : l);
  if (c === '3DS' && troisDsPret === null) chargerTroisDs().then(() => onglet === 'reglages' && regPage?.console === '3DS' && drawReglages());
  const tienne3ds = c === '3DS' ? [['Ta console', [
    { label: 'boot9.bin (jeux chiffrés)', valeur: troisDsPret === null ? '…' : troisDsPret ? 'Installé' : 'À ajouter', aide: AIDE_BOOT9, loc: 'dossier', fn: () => poserTroisDs().then(drawReglages) },
  ]]] : [];
  const tienne = c === 'Switch' ? [['Ta console', [
    { label: 'Clés (prod.keys)', valeur: switchEtat ? texteCles() : '…', aide: AIDE_CLES, loc: 'dossier', fn: () => poserSwitch('cles').then(drawReglages) },
    { label: 'Clés des jeux (title.keys)', valeur: switchEtat ? texteTitres() : '…', aide: AIDE_TITRES, loc: 'dossier', fn: () => poserSwitch('titres').then(drawReglages) },
    { label: 'Firmware', valeur: switchEtat ? texteFirmware() : '…', aide: AIDE_FIRMWARE, loc: 'dossier', fn: () => poserSwitch('firmware').then(drawReglages) },
  ]]] : [];
  return [...tienne, ...tienne3ds, [LONG[c], REGLAGES_CONSOLE[c].map((r) => perso(r, lignesReglage(r, ou, null, r.id === 'langue' ? `Comme En Local (${global})` : r.parDefaut ? `Par défaut (${r.parDefaut})` : 'Par défaut')))],
    ['Manette', lignesTouches(c, ou, 'Par défaut')],
    ['Pour un seul jeu', [{ label: 'Réglages d\'un jeu', aide: 'Chaque jeu peut avoir ses propres réglages (et ses mods) : dans ses actions (Share), « Réglages de ce jeu ».', valeur: 'Actions du jeu' }]]];
}

/** Mods d'un jeu, lus une fois par visite. */
const modsJeu = {};
async function chargerModsJeu(g) {
  const m = { chargement: true };
  modsJeu[g.path] = m;
  if (g.console === 'WiiU') m.packs = await invoke('cemu_packs', { path: g.path }).catch(() => []);
  if (g.console === 'Switch' && g.title_id) m.mods = await invoke('eden_mods', { titleId: g.title_id }).catch(() => []);
  if (g.console === 'GC' || g.console === 'Wii') m.dolphin = await invoke('dolphin_mods', { path: g.path }).catch(() => []);
  m.chargement = false;
  if (onglet === 'reglages' && regPage?.jeu === g.path) drawReglages();
}

function pageJeu(g) {
  const ou = (emu.jeux[g.path] ||= {});
  const c = emu.consoles[g.console] || {};
  if (!modsJeu[g.path]) chargerModsJeu(g);
  const m = modsJeu[g.path] || {};
  const comme = (r) => `Comme la console (${texteDe(r, c[r.id]) || (r.id === 'langue' ? LANGUES.find(([l]) => l === emu.langue)?.[1] : r.parDefaut || 'par défaut')})`;
  const groupes = [[titreDe(g), REGLAGES_CONSOLE[g.console].filter((r) => !r.info).map((r) => lignesReglage(r, ou, c, comme(r)))],
    ['Manette', lignesTouches(g.console, ou, 'Comme la console', c)]];
  const bascule = (label, aide, actif, fn) => ({ label, aide, valeur: actif ? 'Activé' : 'Désactivé', fleches: true, fn: () => (fn(), garderEmu()) });

  if (g.console === 'WiiU') {
    const packs = m.packs || [];
    const choix = (ou.packs ||= {});
    // Pack : false (désactivé), { catégorie: préréglage }, ou rien.
    const parType = new Map();
    for (const p of packs) {
      const [, type = 'Packs', ...reste] = p.nom.split('/');
      const nom = reste.join(' / ') || type;
      const etat = choix[p.f];
      const actif = etat === undefined ? p.actif : etat !== false;
      const defauts = () => Object.fromEntries(p.categories.map(([c2, , d2]) => [c2, d2]));
      const regler = (v) => { choix[p.f] = v; garderEmu(); };
      const lignes = parType.get(type) || [];
      const aide = p.description || 'Un pack graphique de la communauté Cemu.';
      const seul = p.categories.length === 1 && p.categories[0][0] === '' && p.categories[0][1].length > 1;
      if (seul) {
        const [, presets, defaut] = p.categories[0];
        const valeurs = ['', ...presets];
        const actuel = actif ? (etat && etat['']) || defaut : '';
        lignes.push({ label: nom, aide, valeur: actuel || 'Désactivé', fleches: true, fn: (d = 1) => {
          const v = valeurs[(valeurs.indexOf(actuel) + d + valeurs.length) % valeurs.length];
          regler(v === '' ? false : { '': v });
        } });
      } else {
        lignes.push({ label: nom, aide, valeur: actif ? 'Activé' : 'Désactivé', fleches: true, fn: () => regler(actif ? false : defauts()) });
        if (actif) {
          for (const [cat, presets, defaut] of p.categories.filter(([, pr]) => pr.length > 1)) {
            const actuel = (etat && etat[cat]) || defaut;
            lignes.push({ label: `${nom} · ${cat || 'Préréglage'}`, aide, valeur: actuel, fleches: true, sous: true, fn: (d = 1) => {
              const v = presets[(presets.indexOf(actuel) + d + presets.length) % presets.length];
              regler({ ...(etat || defauts()), [cat]: v });
            } });
          }
        }
      }
      parType.set(type, lignes);
    }
    const NOMS_TYPES = { Graphics: 'Graphismes', Enhancements: 'Améliorations', Mods: 'Mods', Cheats: 'Triches', Workarounds: 'Correctifs', '!Override': 'Correctifs (cartes graphiques)' };
    const ordre = ['Graphics', 'Enhancements', 'Mods', 'Cheats', 'Workarounds', '!Override'];
    const types = [...parType.keys()].sort((a, b) => (ordre.indexOf(a) + 1 || 99) - (ordre.indexOf(b) + 1 || 99));
    if (m.chargement) groupes.push(['Packs graphiques', [{ label: 'Lecture des packs…', valeur: '' }]]);
    else if (!packs.length) groupes.push(['Packs graphiques', [{ label: 'Aucun pack pour ce jeu', aide: 'Télécharge les packs de la communauté Cemu : résolution, 60 FPS, améliorations… pour la plupart des jeux.', valeur: '' }]]);
    for (const t of types) groupes.push([`Packs · ${NOMS_TYPES[t] || t}`, parType.get(t)]);
    groupes.push(['Packs graphiques', [
      { label: packs.length ? 'Mettre à jour les packs de la communauté' : 'Télécharger les packs de la communauté', aide: 'Les packs graphiques de la communauté Cemu (github.com/cemu-project/cemu_graphic_packs) : résolution, FPS, améliorations, pour des centaines de jeux. Quelques Mo.', fn: () => telechargerPacks(g) },
      { label: 'Ouvrir le dossier des packs', aide: 'Pour ajouter tes propres packs (un dossier avec un rules.txt).', fn: () => invoke('open_folder', { quoi: 'packs-cemu', path: g.path }) },
    ]]);
  }
  if (g.console === 'Switch') {
    const off = (ou.mods_off ||= []);
    groupes.push(['Mods', [
      ...(m.mods || []).map((nom) => bascule(nom, 'Un mod de ce jeu (un dossier dans ses mods). Désactivé, Eden ne le charge pas.', !off.includes(nom), () => (off.includes(nom) ? off.splice(off.indexOf(nom), 1) : off.push(nom)))),
      ...(m.mods?.length ? [] : [{ label: 'Aucun mod pour ce jeu', aide: 'Un mod = un dossier (avec dedans romfs, exefs ou cheats) dans le dossier des mods du jeu.', valeur: '' }]),
      { label: 'Ouvrir le dossier des mods', aide: 'Mets-y un dossier par mod (avec dedans romfs, exefs ou cheats). Il apparaît ici au prochain passage.', fn: () => invoke('open_folder', { quoi: 'mods-switch', path: g.path }) },
    ]]);
  }
  if (g.console === 'GC' || g.console === 'Wii') {
    const mods = m.dolphin || [];
    groupes.push(['Mods graphiques', [
      ...mods.map((x) => bascule(x.nom, 'Un mod graphique livré avec Dolphin (retire un effet, ou l\'affiche mieux en haute résolution).', (ou.mods || []).includes(x.path), () => {
        const l = (ou.mods ||= []);
        l.includes(x.path) ? l.splice(l.indexOf(x.path), 1) : l.push(x.path);
      })),
      ...(mods.length ? [] : [{ label: 'Aucun mod graphique pour ce jeu', valeur: '' }]),
      { label: 'Ouvrir le dossier des textures HD', aide: 'Les packs de textures HD de ce jeu (à télécharger sur les sites de la communauté) : active « Textures HD » au-dessus.', fn: () => invoke('open_folder', { quoi: 'textures-dolphin', path: g.path }) },
    ]]);
  }
  if (g.console === '3DS') {
    groupes.push(['Mods', [{ label: 'Ouvrir le dossier des mods', aide: 'Les mods de ce jeu (romfs, exefs) : Azahar les charge à chaque lancement.', fn: () => invoke('open_folder', { quoi: 'mods-3ds', path: g.path }) }]]);
  }
  groupes.push(['', [{ label: 'Remettre comme la console', aide: 'Oublie les réglages de ce jeu (ses mods et packs aussi).', fn: () => sheet('Remettre comme la console ?', '', [
    { label: 'Annuler', cancel: true },
    { label: 'Remettre', fn: () => { delete emu.jeux[g.path]; garderEmu(); drawReglages(); } },
  ]) }]]);
  return groupes;
}

async function telechargerPacks(g) {
  toast('Téléchargement des packs graphiques…');
  try {
    await invoke('cemu_packs_maj');
    toast('Packs graphiques à jour');
  } catch (e) {
    oops(e);
  }
  delete modsJeu[g.path];
  if (onglet === 'reglages') drawReglages();
}

async function reglerJeu(i) {
  const retour = onglet;
  regPage = { jeu: games[i].path, retour };
  regFocus = 0;
  if (onglet === 'reglages') drawReglages();
  else await allerA('reglages');
}

/* ---------- Profils graphiques ---------- */

// Réglages modifiés par un profil.
const CLES_GRAPHIQUES = ['api', 'resolution', 'filtre', 'aa', 'aniso', 'shaders', 'shaders_async', 'precision', 'mode', 'format'];
const PROFILS = {
  performance: { nom: 'Performance', texte: 'Le plus fluide, même sur un petit PC : résolution d\'origine, effets légers.', wiiu: [1280, 720],
    consoles: { '3DS': { resolution: '1', shaders_async: 'oui' }, GC: { resolution: '1', aa: '1', aniso: '-1', shaders: '2' }, Wii: { resolution: '1', aa: '1', aniso: '-1', shaders: '2' }, WiiU: { shaders_async: 'oui' }, Switch: { resolution: '3', mode: '0', precision: '1', aa: '0', filtre: '1', aniso: '1', shaders_async: 'oui' } } },
  equilibre: { nom: 'Équilibré', texte: 'Net et fluide sur la plupart des PC : environ 1080p, anticrénelage léger.', wiiu: [1920, 1080],
    consoles: { '3DS': { resolution: '3', shaders_async: 'oui' }, GC: { resolution: '2', aa: '2', aniso: '3', shaders: '2' }, Wii: { resolution: '2', aa: '2', aniso: '3', shaders: '2' }, WiiU: { shaders_async: 'oui' }, Switch: { resolution: '3', mode: '1', precision: '1', aa: '1', filtre: '6', aniso: '0', shaders_async: 'oui' } } },
  qualite: { nom: 'Qualité', texte: 'La plus belle image : haute résolution, anticrénelage fort. Pour une bonne carte graphique.', wiiu: [2560, 1440],
    consoles: { '3DS': { resolution: '5', shaders_async: 'oui' }, GC: { resolution: '6', aa: '4', aniso: '4', shaders: '1' }, Wii: { resolution: '6', aa: '4', aniso: '4', shaders: '1' }, WiiU: { shaders_async: 'oui' }, Switch: { resolution: '6', mode: '1', precision: '1', aa: '2', filtre: '6', aniso: '5', shaders_async: 'oui' } } },
};

/** Niveau de la carte graphique, de 0 (intégrée) à 3 (très bonne). */
function niveauGpu(gpu) {
  const n = (gpu?.nom || '').toLowerCase();
  const vram = gpu?.vram || 0;
  let niveau = 1;
  if (/intel(?!.*arc)|uhd|iris|radeon\(tm\) graphics|radeon graphics|vega \d+ graphics/.test(n)) niveau = 0;
  else if (/rtx\s*(40|50)\d0|rx\s*(79|78)\d0/.test(n)) niveau = 3;
  else if (/rtx\s*(30[6-9]0|20[7-8]0)|rx\s*(6[7-9]\d0|7[6-7]\d0)/.test(n)) niveau = 2;
  else if (/rtx\s*(2060|3050)|gtx\s*(16\d0|10[7-8]0)|rx\s*(5[6-7]\d0|6[56]\d0)|arc/.test(n)) niveau = 1;
  else if (/gtx|rx\s*[45]\d0|radeon/.test(n)) niveau = 0;
  if (vram && vram < 4000) niveau = Math.min(niveau, 0);
  return niveau;
}
/** Niveau du processeur, de 0 à 3. C'est lui qui limite la Switch et la Wii U. */
function niveauCpu(m) {
  const n = (m?.cpu || '').toLowerCase();
  let niveau = 1;
  const ryzen = n.match(/ryzen\s*(?:\d|ai)\s*(?:pro\s*)?(\d)\d{2,3}/);
  const intel = n.match(/i[3579]-(\d{4,5})/);
  if (ryzen) niveau = { 1: 0, 2: 0, 3: 1, 4: 1, 5: 2, 6: 2, 7: 3, 8: 3, 9: 3 }[ryzen[1]] ?? 1;
  else if (intel) {
    const gen = intel[1].length === 5 ? +intel[1].slice(0, 2) : +intel[1][0];
    niveau = gen >= 13 ? 3 : gen >= 12 ? 2 : gen >= 10 ? 1 : 0;
  } else if (/core\s*ultra/.test(n)) niveau = 2;
  else if (/celeron|pentium|athlon|atom/.test(n)) niveau = 0;
  if ((m?.threads || 8) < 8) niveau = Math.min(niveau, 0);
  if (/x3d/.test(n)) niveau = Math.min(3, niveau + 1);
  return niveau;
}
const NIVEAUX = ['modeste', 'correct', 'bon', 'très bon'];

/** Carte graphique principale (celle qui a le plus de mémoire). */
const gpuPrincipal = (m) => (m?.gpus || []).slice().sort((a, b) => (b.vram || 0) - (a.vram || 0))[0];

/** Réglages recommandés pour ce PC. */
function profilRecommande(m) {
  const gpu = gpuPrincipal(m);
  const niveau = niveauGpu(gpu);
  const base = PROFILS[['performance', 'equilibre', 'qualite', 'qualite'][niveau]];
  const c = JSON.parse(JSON.stringify(base.consoles));
  const h = gpu?.hauteur || screen.height * devicePixelRatio || 1080;
  const nom = (gpu?.nom || '').toLowerCase();
  const intel = /intel/.test(nom) && !/arc/.test(nom);
  // Résolution utile : celle de l'écran, un cran de plus pour les très bonnes cartes.
  if (niveau >= 2) {
    const dolphin = String(Math.min(6, Math.ceil(h / 528) + (niveau >= 3 ? 1 : 0)));
    c.GC.resolution = c.Wii.resolution = dolphin;
    c['3DS'].resolution = String(Math.min(8, Math.ceil(h / 2 / 240) + (niveau >= 3 ? 1 : 0)));
  }
  // Switch : précision Moyenne pour tous, la Basse fait mal afficher certains jeux.
  const cpu = niveauCpu(m);
  c.Switch.resolution = niveau === 0 ? '3' : h >= 2160 && niveau >= 3 ? '7' : h >= 1440 && niveau >= 2 ? '6' : niveau >= 2 ? '5' : '3';
  c.Switch.precision = '1';
  c.Switch.shaders_async = 'oui';
  if (cpu === 0) c.Switch.mode = '0'; // mode portable : moins de travail pour un petit processeur
  // Vulkan pour NVIDIA et AMD, Direct3D/OpenGL pour Intel.
  c.GC.api = c.Wii.api = intel ? 'D3D' : 'Vulkan';
  c['3DS'].api = intel ? '1' : '2';
  const largeur = gpu?.largeur || 1920;
  const wiiu = niveau === 0 ? [1280, 720] : niveau === 1 ? [Math.min(1920, largeur), Math.min(1080, h)] : [largeur, h];
  return { nom: 'Recommandé', texte: `${base.nom}, adapté à ton PC`, consoles: c, wiiu, base: base.nom, detail: `Carte graphique ${NIVEAUX[niveau]}, processeur ${NIVEAUX[cpu]}` };
}

/** Quand le profil Recommandé change, ceux qui l'avaient le reçoivent. */
const VERSION_PROFILS = 3;
async function majProfilRecommande() {
  // Ancienne précision Basse : passée en Moyenne une fois.
  if (!emu.precisionMoyenne) {
    if (emu.consoles.Switch?.precision === '0') emu.consoles.Switch.precision = '1';
    emu.precisionMoyenne = true;
    garderEmu();
  }
  if (emu.profil !== 'recommande' || (emu.versionProfil || 1) >= VERSION_PROFILS) return;
  const m = await invoke('materiel').catch(() => null);
  if (m) await appliquerProfil('recommande', m);
}

/** Applique un profil à toutes les consoles. */
async function appliquerProfil(id, m) {
  const p = id === 'recommande' ? profilRecommande(m) : PROFILS[id];
  if (!p) return;
  for (const c of ORDRE) {
    const o = (emu.consoles[c] ||= {});
    for (const k of CLES_GRAPHIQUES) delete o[k];
    Object.assign(o, p.consoles[c] || {});
  }
  emu.profil = id;
  emu.versionProfil = VERSION_PROFILS;
  garderEmu();
  await resolutionWiiU(p.wiiu);
}
/** Wii U : préréglage de résolution le plus proche, dans le pack Graphics du jeu. */
async function resolutionWiiU([w, h]) {
  for (const g of games.filter((x) => x.console === 'WiiU')) {
    const packs = await invoke('cemu_packs', { path: g.path }).catch(() => []);
    for (const p of packs.filter((x) => /\/Graphics$/i.test(x.nom))) {
      const cat = p.categories.find(([nom]) => /resolution/i.test(nom));
      if (!cat) continue;
      const taille = (s) => (s.match(/(\d{3,4})\s*x\s*(\d{3,4})/) || []).slice(1).map(Number);
      const choix = cat[1].filter((s) => taille(s).length).sort((a, b) => Math.abs(taille(a)[1] - h) - Math.abs(taille(b)[1] - h) || Math.abs(taille(a)[0] - w) - Math.abs(taille(b)[0] - w))[0];
      if (!choix) continue;
      const j = (emu.jeux[g.path] ||= {});
      const packsJeu = (j.packs ||= {});
      const actuel = packsJeu[p.f] && packsJeu[p.f] !== false ? packsJeu[p.f] : Object.fromEntries(p.categories.map(([c2, , d2]) => [c2, d2]));
      packsJeu[p.f] = { ...actuel, [cat[0]]: choix };
    }
  }
  garderEmu();
}
const NOMS_PROFILS = { recommande: 'Recommandé', performance: 'Performance', equilibre: 'Équilibré', qualite: 'Qualité', perso: 'Personnalisé' };
