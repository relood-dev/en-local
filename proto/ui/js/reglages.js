/* Réglages : la liste par thèmes. Les pages console et jeu sont dans consoles.js. */
let regFocus = 0;
let regLignes = [];
let regPage = null; // null : la liste, { console } ou { jeu, retour }
let regFocusListe = 0;
const GLYPHES_NOMS = { auto: 'Selon la manette', playstation: 'PlayStation', xbox: 'Xbox', nintendo: 'Nintendo' };
// Partage avec le Local, activé par défaut.
const partage = (cle) => localStorage[cle] !== 'non';
/** Pseudo sur les consoles. Vide : le pseudo Discord. */
function changerPseudo(fin) {
  saisirTexte({
    titre: 'Pseudo sur les consoles',
    texte: 'Vide : ton pseudo Discord.',
    champs: [{ id: 'nom', label: 'Pseudo', valeur: localStorage.pseudo || '' }],
    bouton: 'Valider',
    valider: ({ nom }) => {
      const n = nom.trim();
      if (n && !/^[\p{L}\p{N} ._\-!?'&+]{1,10}$/u.test(n)) return '10 caractères au plus : lettres, chiffres, espaces et . _ - ! ? \' & +';
      if (n) localStorage.pseudo = n;
      else delete localStorage.pseudo;
      fin?.();
    },
  });
}

const jauge = (v) => `<span class="jauge"><i style="width:${Math.round(v * 100)}%"></i></span>${v ? `${Math.round(v * 100)} %` : 'Muet'}`;
const curseur = (cle, label, aide, apres) => ({ label, aide, loc: cle === 'musique' || cle === 'perso' ? 'musique' : null, jauge: vol(cle), fleches: true, fn: (d = 1) => (changerVolume(cle, Math.sign(d)), apres?.()) });
// Micros de Windows, relus à chaque ouverture des Réglages (un micro branché entre-temps apparaît).
let micros = [];
function lireMicros() {
  invoke('micros').then((l) => {
    const avant = JSON.stringify(micros);
    micros = Array.isArray(l) ? l : [];
    if (onglet === 'reglages' && !regPage && JSON.stringify(micros) !== avant) drawReglages();
  }).catch(() => {});
}
/* Catégories des Réglages : [titre, résumé, lignes]. Une ligne `avance` reste repliée sous « Réglages avancés ». */
let versionApp = '';
window.__TAURI__.app?.getVersion?.().then((v) => (versionApp = v)).catch(() => {});
function lignesReglages() {
  if (regPage?.console) return pageConsole(regPage.console);
  if (regPage?.dossier) return pageDossier();
  if (regPage?.jeu) {
    const g = games.find((x) => x.path === regPage.jeu);
    if (g) return pageJeu(g);
    regPage = null;
  }
  const clair = document.body.classList.contains('clair');
  const reduit = document.body.classList.contains('reduit');
  const g = localStorage.glyphes || 'auto';
  // Réglage à plusieurs valeurs : ‹ › changent, X remet `defaut`.
  const choix = (cle, valeurs, actuelle, fn, defaut) => ({ valeur: valeurs[actuelle], options: Object.entries(valeurs), actuel: actuelle, fleches: true, change: defaut !== undefined && actuelle !== defaut, reset: defaut !== undefined ? () => fn(defaut) : null, fn: (d = 1) => {
    const k = Object.keys(valeurs);
    fn(k[(k.indexOf(actuelle) + d + k.length) % k.length]);
  } });
  // Réglages d'une console montrés ailleurs (Wi-Fi DS, shaders partagés).
  const deConsole = (c, id, label) => {
    const r = REGLAGES_CONSOLE[c].find((x) => x.id === id);
    return r && { ...lignesReglage(r, (emu.consoles[c] ||= {}), null, r.parDefaut ? `Par défaut (${r.parDefaut})` : 'Par défaut'), label };
  };
  if (switchEtat === null) chargerSwitch().then(() => onglet === 'reglages' && !regPage && drawReglages());
  if (troisDsPret === null) chargerTroisDs().then(() => onglet === 'reglages' && !regPage && drawReglages());
  if (ps3Pret === null) chargerPs3().then(() => onglet === 'reglages' && !regPage && drawReglages());
  if (ps2Pret === null) chargerPs2().then(() => onglet === 'reglages' && !regPage && drawReglages());
  const etatConsole = (c) => (c === 'Switch' && switchEtat ? (switchPret() ? 'Prête' : 'Clés ou firmware à ajouter') : c === '3DS' && troisDsPret === false ? 'boot9.bin à ajouter' : c === 'PS3' && ps3Pret === false ? 'Firmware à ajouter' : c === 'PS2' && ps2Pret === false ? 'BIOS à ajouter' : 'Configurer');
  return [
    ['Général', 'Affichage, thème, langue, pseudo', [
      { label: 'Affichage', aide: 'Plein écran (comme une console), fenêtré sans bordure, ou fenêtré. F11 bascule aussi le plein écran.', ...choix('ecran', Object.fromEntries(MODES_ECRAN.map(([v, x]) => [v, x])), localStorage.ecran || 'plein', modeEcran, 'plein') },
      { label: 'Thème', aide: 'Sombre, OLED (noir pur : les pixels s\'éteignent sur un écran OLED) ou clair. Les jeux, les avatars et Loc gardent leurs couleurs.', ...choix('theme', { sombre: 'Sombre', oled: 'OLED', clair: 'Clair' }, localStorage.theme || (clair ? 'clair' : 'sombre'), theme, 'sombre') },
      { label: 'Langue des jeux', aide: 'La langue des consoles émulées, pour toutes. Chaque console (et chaque jeu) peut avoir la sienne.', ...choix('langue', Object.fromEntries(LANGUES), emu.langue, (v) => ((emu.langue = v), garderEmu()), 'fr') },
      { label: 'Pseudo sur les consoles', valeur: pseudoConsoles() || '…', aide: 'Ton nom de joueur sur DS, 3DS et Switch, celui que les autres voient en local sans fil. Ton pseudo Discord par défaut. 10 caractères au plus, sans emoji.', change: Boolean(localStorage.pseudo), reset: () => delete localStorage.pseudo, fn: () => changerPseudo(() => setTimeout(drawSection, 0)) },
      { label: 'Animations', aide: 'Réduites : moins de mouvements, des fondus courts.', ...choix('anim', { normales: 'Normales', reduites: 'Réduites' }, reduit ? 'reduites' : 'normales', (v) => animations(v === 'normales'), 'normales') },
      { label: 'Priorité d\'En Local', avance: true, aide: 'Maximum : Windows donne la priorité à En Local et ne le ralentit jamais (images et menus plus rapides, un peu plus de batterie sur portable). Économie : En Local passe après le reste. Les jeux ne sont pas touchés.', ...choix('perf', { economie: 'Économie', normal: 'Normal', maximum: 'Maximum' }, modePerf(), performances, 'normal') },
    ]],
    ['Manettes', 'Ta manette, vibrations, touches', [
      { label: 'Manette', valeur: manetteNom || 'Aucune', loc: 'manette', aide: 'La première manette branchée pilote En Local et devient le joueur 1 dans les jeux. Une manette inconnue se configure toute seule : En Local te le propose dès que tu appuies sur un de ses boutons.' },
      { label: 'Vibrations', aide: 'Les vibrations de la manette dans les jeux (Switch et Wii U). Compte à la prochaine partie.', ...choix('vibrations', { oui: 'Oui', non: 'Non' }, localStorage.vibrations === 'non' ? 'non' : 'oui', (v) => (localStorage.vibrations = v), 'oui') },
      { label: 'Touches d\'une console', valeur: 'Choisir', aide: 'Change le bouton de ta manette qui fait A, B, L, ZR… sur une console. Chaque jeu peut aussi avoir les siennes (Réglages de ce jeu).', fn: () => sheet('Touches de quelle console ?', '', [
        ...ORDRE.map((c) => ({ label: LONG[c], fn: () => ouvrirPage({ console: c, touches: true }) })),
        { label: 'Annuler', cancel: true },
      ]) },
      { label: 'Menu En Local', valeur: 'PS · Home · Xbox · Échap', aide: 'En jeu, ce bouton ouvre tout En Local, le jeu en pause derrière. Le même bouton (ou la tuile Reprendre) te ramène dans la partie ; Start (+) quitte le jeu.' },
      { label: 'Capture et clip', valeur: 'Partage · F12', aide: 'En jeu, le bouton de partage (micro sur DualSense, Partage sur Xbox, Capture sur Switch) : capture d\'écran ou clip des dernières secondes. Aucun jeu ne s\'en sert.' },
      { label: 'Actions du jeu en cours', valeur: 'Menu En Local, puis −', aide: 'Session en ligne, chasse aux chromatiques, quitter… : dans le menu En Local, − (ou « Actions » en haut).' },
      { label: 'Clip au clavier', valeur: 'F10', aide: 'F10 : clip des dernières secondes.' },
      { label: 'Icônes des touches', avance: true, aide: 'Les boutons affichés en bas de l\'écran. « Selon la manette » suit celle que tu tiens ; le clavier montre toujours ses touches.', ...choix('glyphes', GLYPHES_NOMS, g, (v) => ((localStorage.glyphes = v), utiliser(typeManette || 'clavier', true)), 'auto') },
    ]],
    ['Son', 'Volumes, musique, micro', [
      curseur('general', 'Volume général', 'Tout En Local et les jeux. Le volume de Windows reste au-dessus.'),
      curseur('jeux', 'Volume des jeux', 'Toutes les consoles. Chaque console garde en plus son propre volume.'),
      curseur('musique', 'Musique du menu', 'Composée par En Local, en direct. Elle se tait pendant un jeu, une vidéo ou ta propre musique.'),
      { label: 'Ambiance de la musique', aide: 'Salon (lo-fi), Boutique (bossa, façon boutique de console), Nuit (calme).', ...choix('musiqueMenu', { salon: 'Salon', boutique: 'Boutique', nuit: 'Nuit' }, MORCEAUX[localStorage.musiqueMenu] ? localStorage.musiqueMenu : 'salon', (v) => (localStorage.musiqueMenu = v), 'salon') },
      curseur('effets', 'Effets sonores', 'Les petits sons de l\'interface, comme sur une console : déplacement, validation, retour, lancement, menu du jeu.', () => son('ok')),
      { ...curseur('perso', 'Ta musique', 'Les albums de Médias.'), avance: true },
      { label: 'Micro des consoles', avance: true, aide: 'Le micro des jeux qui en ont besoin (Nintendogs, Zelda Spirit Tracks, Animal Crossing…) : DS, 3DS, Wii (Wii Speak) et Wii U (GamePad). La Switch n\'a pas de micro dans son émulateur. Compte à la prochaine partie.', ...choix('micro', Object.fromEntries([['', 'Celui de Windows'], ...micros.map((m) => [m.id, m.nom]), ['aucun', 'Aucun']]), localStorage.micro || '', (v) => (v ? (localStorage.micro = v) : delete localStorage.micro), '') },
    ]],
    ['Consoles', 'Graphismes, fichiers de tes consoles', [
      { label: 'Graphismes', valeur: NOMS_PROFILS[emu.profil] || 'Par défaut', aide: 'Recommandé : adapté à ton PC (carte graphique, processeur, écran). Performance, Équilibré, Qualité : pour toutes les consoles d\'un coup. Personnalisé : ce que tu règles toi-même dans chaque console.', fn: choisirProfil },
      ...ORDRE.map((c) => ({ label: LONG[c], valeur: etatConsole(c), loc: 'manette', aide: `Langue, image, performances${['DS', '3DS'].includes(c) ? ', écrans' : ''}, son et touches de la ${LONG[c]}${c === 'Switch' ? ', et tes clés et firmware' : c === '3DS' ? ', et ton boot9.bin' : c === 'PS3' ? ', et son firmware' : c === 'PS2' ? ', et ton BIOS' : ''}. En Local les donne à l'émulateur à chaque lancement.`, fn: () => ouvrirPage({ console: c }) })),
    ]],
    ['En jeu', 'Captures, clips, autour du jeu', [
      { label: 'Clips vidéo', aide: 'En jeu, le bouton de partage, puis « Clip vidéo ». Au clavier : F10. Les clips vont dans Médias, Vidéos. La carte graphique enregistre en continu pendant la partie (rien n\'est gardé sans ton appui). Désactivés : rien n\'est enregistré.', ...choix('clips', { 0: 'Désactivés', 15: '15 s', 30: '30 s', 60: '1 min', 120: '2 min' }, String(dureeClips()), (v) => (localStorage.clips = v), '30') },
      { label: 'Autour du jeu', aide: 'Quand le jeu ne remplit pas l\'écran (4:3, les deux écrans de la DS et de la 3DS…) : une trame de points, comme une console posée sur un tapis, ou un fond noir.', ...choix('habillage', { decor: 'Décor', noir: 'Noir' }, localStorage.habillage === 'noir' ? 'noir' : 'decor', (v) => (localStorage.habillage = v), 'decor') },
      { label: 'Qualité des clips', avance: true, aide: 'Haute : la meilleure image (environ 350 Mo pour 2 minutes). Moyenne : environ 2 fois plus léger. Légère : environ 4 fois plus léger, pour les envoyer sur Discord. Compte à la prochaine partie.', ...choix('clipsQualite', { haute: 'Haute', moyenne: 'Moyenne', legere: 'Légère' }, localStorage.clipsQualite || 'haute', (v) => (localStorage.clipsQualite = v), 'haute') },
      { label: 'Ta voix dans les clips', avance: true, aide: 'Le son de ton micro est ajouté à celui du jeu dans les clips (le micro choisi dans Son, sinon celui de Windows). Rien n\'est gardé sans ton appui sur « Clip ». Compte à la prochaine partie.', ...choix('clipsVoix', { oui: 'Oui', non: 'Non' }, localStorage.clipsVoix === 'non' ? 'non' : 'oui', (v) => (localStorage.clipsVoix = v), 'oui') },
      { label: 'Widgets en jeu', avance: true, aide: 'Autour du jeu : ton avatar, et en session en ligne les joueurs. Les bulles d\'arrivée et de départ s\'affichent dans tous les cas.', ...choix('widgetsJeu', { oui: 'Oui', non: 'Non' }, localStorage.widgetsJeu === 'non' ? 'non' : 'oui', (v) => (localStorage.widgetsJeu = v), 'oui') },
    ]],
    ['En ligne', 'Compte, ce que voient les autres', me ? [
      { label: 'Compte Discord', valeur: me.name, loc: 'enligne', aide: 'Les membres vérifiés du Local se connectent avec Discord.', fn: () => allerA('profil') },
      { label: 'Montrer à quoi je joue', aide: 'Aux membres du Local et sur ton statut Discord. Non : « Dans En Local », sans le nom du jeu. Pendant une session, elle reste visible pour qu\'on puisse te rejoindre.', ...choix('discret', { oui: 'Oui', non: 'Non' }, partage('montrerJeu') ? 'oui' : 'non', (v) => ((localStorage.montrerJeu = v), updatePresence()), 'oui') },
      { label: 'Partager ma liste de jeux', aide: 'Les autres membres voient tes jeux (titre, console, mise à jour et nombre de DLC ; jamais les fichiers) : dans leur recherche, sur ta fiche et sur celle de chaque jeu, pour savoir qui a quoi et jouer avec la même version. Tes chiffres (temps de jeu, défis…) se voient aussi avec /enlocal sur Discord.', ...choix('liste', { oui: 'Oui', non: 'Non' }, partage('partageJeux') ? 'oui' : 'non', (v) => ((localStorage.partageJeux = v), envoyerBibliotheque(), envoyerStats()), 'oui') },
      { label: 'Synchroniser mes sauvegardes', aide: 'Les sauvegardes de tous tes jeux sont les mêmes sur tes PC et Mac (gardées par Loc avec ton compte). Si un jeu a changé sur les deux, tu choisis laquelle garder : l\'autre est copiée de côté.', ...choix('synchroSaves', { oui: 'Oui', non: 'Non' }, synchroSavesActive() ? 'oui' : 'non', (v) => ((localStorage.synchroSaves = v), v === 'oui' && synchroSaves()), 'oui') },
      { label: 'Rejoindre avec un code', aide: 'Le code d\'une session, donné par l\'hôte ou sur sa carte dans Discord.', fn: () => ouvrirCode() },
      { ...deConsole('DS', 'wfc', 'Wi-Fi des jeux DS'), avance: true },
      { ...deConsole('Switch', 'shaders_partage', 'Shaders partagés (Switch)'), avance: true },
      { label: 'Se déconnecter', avance: true, aide: 'Tes jeux, collections et ton accueil restent sur ce PC.', fn: () => logout().then(drawSection) },
    ] : [
      { label: 'Se connecter avec Discord', loc: 'enligne', aide: 'Pour les sessions, les membres, les tournois et ton profil. Réservé aux membres vérifiés du Local.', fn: login },
    ]],
    ['Jeux et médias', 'Dossiers, jaquettes, sauvegardes', [
      { label: 'Dossier des jeux', valeur: dossierInfo?.chemin || '…', aide: 'Où sont tes jeux : choisir un dossier existant, en créer un nouveau, ou le ranger.', fn: () => ouvrirPage({ dossier: true }) },
      { label: 'Ajouter des jeux', aide: 'Un jeu, ses mises à jour et DLC, ou une archive (.zip, .7z, .rar) : tout se range tout seul. Tu peux aussi les déposer n\'importe où sur En Local.', fn: () => menuAjouterJeux() },
      { label: 'Chercher de nouveaux jeux', loc: 'cherche', aide: 'Relit le dossier des jeux, sans redémarrer En Local.', fn: rechargerJeux },
      { label: 'Ouvrir la copie des sauvegardes', loc: 'dossier', aide: 'Tes sauvegardes de toutes les consoles sont recopiées après chaque partie dans Parties enregistrées\\En Local (ton dossier Windows). Elles restent même si tu désinstalles En Local, et reviennent toutes seules à la réinstallation.', fn: () => invoke('ouvrir_saves') },
      { label: 'Ouvrir le dossier des jeux Switch', avance: true, aide: 'Un dossier par jeu, ses mises à jour et DLC dans un sous-dossier (« MAJ », « MAJ et DLC »…). Choisis la mise à jour d\'un jeu dans ses actions (Share).', fn: () => invoke('open_games_folder', { quoi: 'maj' }) },
      { label: 'Refaire les jaquettes et icônes', avance: true, loc: 'maj', aide: 'Oublie les images gardées et les retélécharge. Utile si une jaquette est mauvaise ou a changé.', fn: () => sheet('Refaire les images ?', 'Les jaquettes et icônes reviennent en quelques secondes.', [
        { label: 'Annuler', cancel: true },
        { label: 'Refaire', fn: async () => { await invoke('oublier_jaquettes').catch(() => {}); delete localStorage.jaquettes; Object.keys(localStorage).filter((k) => k.startsWith('icone2:')).forEach((k) => delete localStorage[k]); location.reload(); } },
      ]) },
      ...['captures', 'musique', 'videos'].map((sorte) => ({
        label: { musique: 'Dossier de la musique', videos: 'Dossier des vidéos', captures: 'Dossier des captures et photos' }[sorte],
        valeur: dossiersMedias?.[sorte]?.chemin || '…',
        avance: true,
        loc: 'photo',
        aide: { musique: 'Ta musique, un dossier par album. Par défaut : Médias\\Musique d\'En Local et ton dossier Musique de Windows.', videos: 'Tes vidéos. Par défaut : Médias\\Vidéos d\'En Local et ton dossier Vidéos de Windows.', captures: 'Où vont tes captures en jeu ; les photos que tu y mets s\'affichent aussi dans Médias.' }[sorte],
        fn: () => choisirDossierMedia(sorte),
      })),
    ]],
    ['Accueil', 'Icônes, widgets, disposition', [
      { label: 'Taille des icônes', aide: 'Comme sur 3DS : plus petites, il en tient davantage sur chaque page (8, 10 ou 12 par ligne). L\'accueil se range de nouveau, dans le même ordre.', ...choix('densite', { grandes: 'Grandes', moyennes: 'Moyennes', petites: 'Petites' }, densite(), changerDensite, 'grandes') },
      { label: 'Personnaliser l\'accueil', aide: 'Déplace, agrandis, ajoute des images, des GIF de Loc et des widgets. Aussi avec △ sur l\'accueil.', fn: () => allerA('accueil').then(() => modif || basculerModif()) },
      { label: 'Remettre l\'accueil par défaut', avance: true, aide: 'Tes jeux et widgets reviennent à leur place de départ. Tes images restent sur le PC.', fn: () => sheet('Remettre l\'accueil par défaut ?', 'Ta disposition actuelle sera perdue.', [
        { label: 'Annuler', cancel: true },
        { label: 'Remettre par défaut', fn: () => { delete localStorage.maison; delete localStorage.jeuxVus; maisonPrete = false; toast('Accueil remis par défaut'); drawSection(); } },
      ]) },
    ]],
    ...(SUCCES ? [
    ['Succès', 'RetroAchievements', ra.token ? [
      { label: 'RetroAchievements', valeur: ra.user, aide: 'Connecté : les succès se débloquent en jeu sur GameCube et Wii (Dolphin) et s\'affichent dans les fiches des jeux et ton profil.' },
      { label: 'Mode hardcore', aide: 'Les succès comptent double sur RetroAchievements, mais sans sauvegardes d\'état ni ralenti. Pris en compte au prochain lancement.', ...choix('hardcore', { non: 'Non', oui: 'Oui' }, ra.hardcore ? 'oui' : 'non', (v) => ((ra.hardcore = v === 'oui'), garderRa()), 'non') },
      { label: 'Clé d\'API web', valeur: ra.cle ? 'Enregistrée' : 'Manquante', aide: 'Pour afficher tes succès dans En Local (retroachievements.org, Réglages, « Clé d\'API web »).', fn: demanderCleRa },
      { label: 'Se déconnecter de RetroAchievements', aide: 'Les trophées d\'En Local restent.', fn: () => (deconnecterRa(), drawReglages()) },
    ] : [
      { label: 'Créer un compte RetroAchievements', aide: 'Gratuit, sur retroachievements.org (dans ton navigateur) : pseudo, e-mail, mot de passe, puis le lien de confirmation reçu par e-mail. Reviens ensuite te connecter ici.', fn: () => invoke('ouvrir_ra', { page: 'inscription' }) },
      { label: 'Connecter RetroAchievements', aide: 'Les vrais succès des jeux, avec un compte gratuit retroachievements.org : GameCube et Wii pour l\'instant. Les trophées d\'En Local, eux, marchent sur toutes les consoles sans compte.', fn: connecterRa },
    ]],
    ] : []),
    ['À propos', 'Version, configuration, quitter', [
      { label: 'En Local', valeur: versionApp ? `Version ${versionApp}` : 'Prototype', loc: 'coucou', aide: 'L\'app du Local pour jouer ensemble à nos jeux Nintendo, sur PC. Les mises à jour s\'installent depuis l\'app.' },
      { label: 'Refaire la configuration de départ', aide: 'Loc te guide de nouveau : affichage, manette, graphismes.', fn: ouvrirBienvenue },
      { label: 'Tes jeux', valeur: 'Tes consoles', aide: 'En Local ne fournit aucun jeu, clé ou firmware : ils viennent de tes cartouches, disques et consoles.' },
      { label: 'Fiches et images', valeur: 'GameTDB, Wikipédia', aide: 'Fiches et jaquettes : GameTDB. Résumés : Wikipédia en français (CC BY-SA).' },
      { label: 'Quitter En Local', aide: 'Ferme l\'app (aussi dans le dock, en bas à droite, et avec Alt+F4).', fn: quitterApp },
    ]],
  ].map(([titre, resume, lignes]) => [titre, lignes.filter((l) => l.label).map((l) => ((l.groupe ||= titre), l)), resume]);
}

/*
 * Écran des Réglages, comme sur une console : d'abord une grille de grandes tuiles (une par
 * catégorie, avec ce qui est réglé), puis la liste de ses réglages. Oui/Non s'affichent en
 * interrupteur, les petits choix tous visibles, les volumes en jauge : ‹ › changent directement.
 */
let manetteNom = '';
let regGroupe = 0; // catégorie (tuile) choisie
let regVue = 'tuiles'; // 'tuiles' ou 'liste'
let regRecherche = '';
const regAvance = new Set(); // listes dont les réglages avancés sont dépliés
let regRetour = null; // { groupe, focus } pour revenir d'une page console, jeu ou dossier
let regGroupes = [];
const ICONES_REG = {
  'Général': DOCK.reglages,
  Manettes: DOCK.jeux,
  Son: '<path d="M4 9.5h3.5L12 5v14l-4.5-4.5H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
  Consoles: DOCK.emulateurs,
  'En jeu': DOCK.captures,
  'En ligne': DOCK.sessions,
  'Jeux et médias': DOCK.collections,
  Accueil: DOCK.accueil,
  'Succès': DOCK.succes,
  'À propos': '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.01"/>',
};
const sansAccents = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
/** Ce que montre une tuile : les premières valeurs réglées de la catégorie. */
const resumeTuile = (lignes) => lignes.filter((l) => !l.avance && (l.valeur || l.options)).slice(0, 2).map((l) => (l.options ? l.options.find(([v]) => v === l.actuel)?.[1] : l.valeur)).filter(Boolean).join(' · ');

/** La liste affichée : [titre, chemin, groupes [[titre, lignes]]]. */
function listeReglages() {
  if (regPage) {
    const jeu = regPage.jeu && games.find((x) => x.path === regPage.jeu);
    const fusion = [];
    for (const [titre, lignes] of lignesReglages()) {
      const deja = fusion.find((x) => x[0] === titre);
      if (deja) deja[1].push(...lignes);
      else fusion.push([titre, [...lignes]]);
    }
    return [regPage.console ? LONG[regPage.console] : jeu ? titreDe(jeu) : 'Dossier des jeux', jeu ? `Réglages · ${LONG[jeu.console] || ''}` : 'Réglages · Consoles', fusion];
  }
  if (regRecherche) {
    const mots = sansAccents(regRecherche).split(/\s+/).filter(Boolean);
    const trouve = (l) => mots.every((m) => sansAccents(`${l.label} ${l.aide || ''}`).includes(m));
    const toutes = [
      ...regGroupes.flatMap(([titre, lignes]) => lignes.map((l) => ({ ...l, avance: false, ou: titre }))),
      ...ORDRE.flatMap((c) => pageConsole(c).flatMap(([, lignes]) => lignes.map((l) => ({ ...l, avance: false, ou: LONG[c] })))),
    ];
    return [`« ${regRecherche} »`, 'Réglages · Recherche', [['', toutes.filter(trouve).slice(0, 40)]]];
  }
  const [titre, lignes] = regGroupes[regGroupe] || ['', []];
  return [titre, 'Réglages', [['', lignes]]];
}

function drawReglages() {
  if (!dossiersMedias) chargerDossiersMedias().then(() => onglet === 'reglages' && drawReglages());
  if (!dossierInfo) chargerDossier().then(() => onglet === 'reglages' && drawReglages());
  if (!regPage) regGroupes = lignesReglages();
  if (regPage || regRecherche) regVue = 'liste';
  regGroupe = Math.max(0, Math.min(regGroupe, regGroupes.length - 1));
  invoke('pad_info').then((p) => { if ((p.name || '') !== manetteNom) (manetteNom = p.name || ''), onglet === 'reglages' && drawReglages(); }).catch(() => {});
  if (regVue === 'tuiles') return drawTuilesReglages();
  if (regPage?.touches) return drawTouches();

  const [titre, chemin, groupes] = listeReglages();
  const cle = regPage ? JSON.stringify(regPage) : titre;
  const deplie = Boolean(regRecherche) || regAvance.has(cle);
  const toutes = groupes.flatMap(([, l]) => l);
  const nbAvance = toutes.filter((l) => l.avance).length;
  regLignes = [];
  let html = '';
  for (const [t, lignes] of groupes) {
    const visibles = lignes.filter((l) => deplie || !l.avance);
    if (!visibles.length) continue;
    if (t && groupes.length > 1) html += `<div class="titre-groupe">${esc(t)}</div>`;
    for (const l of visibles) html += ligneReglage(l, regLignes.push(l) - 1);
  }
  const fin = [];
  if (nbAvance) fin.push({ label: deplie ? 'Masquer les réglages avancés' : `Réglages avancés (${nbAvance})`, plier: true, aide: 'Pour aller plus loin. Les réglages du dessus suffisent à la plupart des joueurs.', fn: () => (deplie ? regAvance.delete(cle) : regAvance.add(cle)) });
  const aRemettre = toutes.filter((l) => l.change && l.reset);
  if (aRemettre.length && !regRecherche) fin.push({ label: 'Tout remettre par défaut', remettre: true, aide: `${aRemettre.length} réglage${aRemettre.length > 1 ? 's' : ''} modifié${aRemettre.length > 1 ? 's' : ''} (le point à côté du nom) : ${aRemettre.map((l) => l.label).join(', ')}.`, fn: () => sheet('Tout remettre par défaut ?', aRemettre.map((l) => esc(l.label)).join(', '), [
    { label: 'Annuler', cancel: true },
    { label: 'Remettre par défaut', fn: () => { aRemettre.forEach((l) => l.reset()); garderEmu(); toast(`${titre} : par défaut`); drawReglages(); } },
  ]) });
  if (!regLignes.length && !fin.length) fin.push({ label: regRecherche ? 'Aucun réglage trouvé' : 'Rien ici pour l\'instant', aide: regRecherche ? 'Essaie un autre mot : « manette », « résolution », « clips »…' : '' });
  if (fin.length) html += `<div class="reg-fin">${fin.map((l) => ligneReglage(l, regLignes.push(l) - 1)).join('')}</div>`;
  regFocus = Math.max(0, Math.min(regFocus, regLignes.length - 1));

  const jeu = regPage?.jeu && games.find((x) => x.path === regPage.jeu);
  $('#section').innerHTML = `<div class="reg regl">
    <div class="regl-tete"><small class="reg-chemin">${esc(chemin)}</small><h1${titre.length > 24 ? ' class="long"' : ''}>${!regPage && !regRecherche && ICONES_REG[titre] ? `<span class="regl-ic">${icone(ICONES_REG[titre])}</span>` : ''}${esc(titre)}</h1></div>
    <div class="reg-droite">${html}</div>
    <aside class="reg-panneau"><b id="reg-nom"></b><p id="reg-aide"></p><img class="reg-loc" src="img/loc/loc_reglages.gif" alt=""></aside></div>`;
  const s = $('#section');
  s.querySelectorAll('.reg-ligne').forEach((b) => (b.onclick = (e) => {
    regFocus = +b.dataset.n;
    const seg = e.target.closest('[data-v]');
    const d = e.target.closest('.fleche')?.dataset.d;
    const l = regLignes[regFocus];
    if (seg && l.options) return changerReglage(l.options.findIndex(([v]) => v === seg.dataset.v) - l.options.findIndex(([v]) => v === l.actuel));
    if (d) return changerReglage(+d);
    activerReglage();
  }));
  $('#titre').textContent = jeu ? `Réglages · ${titreDe(jeu)}` : regPage?.console ? `Réglages · ${LONG[regPage.console]}` : 'Réglages';
  focusReglage(regFocus);
}

/*
 * Touches d'une console (ou d'un jeu) : le grand schéma de la manette, chaque bouton relié à la
 * touche de ta manette. Les flèches passent d'un bouton à l'autre, ✕ en choisit la touche.
 */
function contexteTouches() {
  const jeu = regPage.jeu && games.find((x) => x.path === regPage.jeu);
  const c = regPage.console || jeu.console;
  return { jeu, c, ou: jeu ? (emu.jeux[jeu.path] ||= {}) : (emu.consoles[c] ||= {}), parent: jeu ? emu.consoles[c] || {} : null };
}
function drawTouches() {
  const { jeu, c, ou, parent } = contexteTouches();
  regLignes = lignesTouches(c, ou, parent ? 'Comme la console' : 'Par défaut', parent).filter((l) => l.bouton);
  const n = regLignes.filter((l) => l.change).length;
  $('#section').innerHTML = `<div class="reg regk">
    <div class="regl-tete"><small class="reg-chemin">Réglages · ${esc(jeu ? titreDe(jeu) : LONG[c])}</small><h1><span class="regl-ic">${icone(DOCK.jeux)}</span>Touches de la manette</h1></div>
    <div class="regk-schema">${schemaManette(c)}</div>
    <div class="regk-info"><b id="reg-nom"></b><p id="reg-aide"></p><span class="regk-etat">${n ? `${n} touche${n > 1 ? 's' : ''} modifiée${n > 1 ? 's' : ''}` : parent ? 'Comme la console' : 'Disposition d\'En Local'}</span></div></div>`;
  etiqueterSchema(c, ou, parent);
  $('#section .schema-cadre').querySelectorAll('.bt[data-b], .appel').forEach((el) => (el.onclick = () => {
    const k = regLignes.findIndex((l) => l.bouton === el.dataset.b);
    if (k >= 0) (focusReglage(k), regLignes[k].capture());
  }));
  $('#titre').textContent = `Réglages · ${jeu ? titreDe(jeu) : LONG[c]} · Touches`;
  focusReglage(regFocus);
}
const appelsTouches = () => regLignes.map((l) => $(`#section .appel[data-b="${l.bouton}"]`));
function focusTouches(n) {
  regFocus = Math.max(0, Math.min(n, regLignes.length - 1));
  const l = regLignes[regFocus];
  appelsTouches().forEach((el, k) => el?.classList.toggle('focus', k === regFocus));
  viserSchema(l?.bouton);
  const { c, ou, parent } = contexteTouches();
  const [, , d] = TOUCHES_CONSOLE[c].find(([id]) => id === l?.bouton) || [];
  $('#reg-nom').innerHTML = l ? `${esc(l.label)} <span class="regk-fleche">→</span> ${glyphePhys(ou[`touche_${l.bouton}`] || parent?.[`touche_${l.bouton}`] || d)}` : '';
  $('#reg-aide').textContent = 'Appuie sur ✕ (ou clique sur le bouton), puis sur la touche de ta manette à utiliser. Tes appuis s\'allument sur le schéma.';
  $('#aide-g').innerHTML = `<div>${glyphs.b}Retour</div>`;
  $('#aide-d').innerHTML = `${l?.change ? `<div>${glyphs.x}Par défaut</div>` : ''}${regLignes.some((x) => x.change) ? `<div>${glyphs.y}Tout par défaut</div>` : ''}<div>${glyphs.a}Choisir la touche</div>`;
}
function navTouches(k) {
  if (['up', 'down', 'left', 'right'].includes(k)) {
    const v = voisin(appelsTouches(), regFocus, k);
    return v >= 0 && (son('deplace'), focusTouches(v));
  }
  const l = regLignes[regFocus];
  if (k === 'a') return l?.capture();
  if (k === 'x' && l?.change) return (l.reset(), garderEmu(), drawReglages());
  if (k === 'y' && regLignes.some((x) => x.change)) return sheet('Toutes les touches par défaut ?', '', [
    { label: 'Annuler', cancel: true },
    { label: 'Remettre par défaut', fn: () => { regLignes.forEach((x) => x.change && x.reset()); garderEmu(); toast('Touches remises par défaut'); drawReglages(); } },
  ]);
  if (k !== 'b') return;
  const { parent, parentFocus } = regPage;
  if (parent) {
    regPage = parent;
    regFocus = parentFocus || 0;
    drawReglages();
    return entree($('#section .reg'), 'apparait-seul');
  }
  navReglagesRetour();
}

/** Une ligne : interrupteur (Oui/Non), choix tous visibles (4 au plus), jauge, ou valeur ‹ ›. */
const OUI = ['Oui', 'Activé', 'Activées', 'Activés'];
const NON = ['Non', 'Désactivé', 'Désactivées', 'Désactivés', 'Aucun'];
function genreReglage(l) {
  if (l.jauge !== undefined) return 'jauge';
  if (!l.options) return l.fleches ? 'valeur' : '';
  const noms = l.options.map(([, n]) => n);
  if (noms.length === 2 && noms.some((n) => OUI.includes(n)) && noms.some((n) => NON.includes(n))) return 'interrupteur';
  if (noms.length <= 4 && noms.join('').length <= 30) return 'segments';
  return 'valeur';
}
function ligneReglage(l, k) {
  const genre = genreReglage(l);
  let val = '';
  if (genre === 'interrupteur') {
    const on = OUI.includes(l.options.find(([v]) => v === l.actuel)?.[1]);
    val = `<span class="interrupteur${on ? ' on' : ''}"><i></i></span>`;
  } else if (genre === 'segments') {
    val = `<span class="segments">${l.options.map(([v, n]) => `<i data-v="${esc(v)}"${v === l.actuel ? ' class="ici"' : ''}>${esc(n)}</i>`).join('')}</span>`;
  } else if (genre === 'jauge') {
    val = `<span class="reg-val"><i class="fleche" data-d="-1">‹</i><span class="jauge-reg"><i style="width:${Math.round(l.jauge * 100)}%"></i></span><b>${l.jauge ? `${Math.round(l.jauge * 100)} %` : 'Muet'}</b><i class="fleche" data-d="1">›</i></span>`;
  } else {
    const contenu = l.valeurHtml ?? (l.valeur ? esc(l.valeur) : '');
    val = contenu ? `<span class="reg-val">${genre ? '<i class="fleche" data-d="-1">‹</i>' : ''}${contenu}${genre ? '<i class="fleche" data-d="1">›</i>' : ''}</span>` : l.fn ? '<span class="chev">›</span>' : '';
  }
  return `<button class="reg-ligne g-${genre || 'action'}${l.fn ? '' : ' info'}${l.sous ? ' sous' : ''}${l.plier ? ' plier' : ''}${l.remettre ? ' remettre' : ''}" data-n="${k}"><span class="reg-nom">${l.change ? '<i class="modif"></i>' : ''}${esc(l.label)}${l.ou ? `<small class="reg-ou">${esc(l.ou)}</small>` : ''}</span>${val}</button>`;
}

function drawTuilesReglages() {
  regLignes = [];
  $('#section').innerHTML = `<div class="reg regt">
    <div class="regt-tete"><h1>Réglages</h1><button class="reg-chercher">${glyphs.y}<span>Rechercher un réglage</span></button></div>
    <div class="regt-grille">${regGroupes.map(([titre, lignes, resume], k) => `<button class="regt-tuile" data-g="${k}">
      <span class="regt-ic">${icone(ICONES_REG[titre] || DOCK.reglages)}</span>
      <b>${lignes.some((l) => l.change) ? '<i class="modif"></i>' : ''}${esc(titre)}</b>
      <small>${esc(resumeTuile(lignes) || resume)}</small></button>`).join('')}</div></div>`;
  $('#section').querySelectorAll('.regt-tuile').forEach((b) => (b.onclick = () => ouvrirCategorie(+b.dataset.g)));
  $('#section .reg-chercher').onclick = chercherReglage;
  $('#titre').textContent = 'Réglages';
  focusReglage(regGroupe);
}

const LOC_GROUPES = { 'Général': 'reglages', Manettes: 'manette', Son: 'musique', Consoles: 'manette', 'En jeu': 'photo', 'En ligne': 'enligne', 'Jeux et médias': 'dossier', Accueil: 'idee', 'À propos': 'coucou', Manette: 'manette', 'Dossier des jeux': 'dossier', 'Changer de dossier': 'dossier', 'Ta console': 'dossier' };
const locReglage = (l) => l?.loc || LOC_GROUPES[l?.groupe] || LOC_GROUPES[regGroupes[regGroupe]?.[0]] || 'reglages';
function focusReglage(n) {
  if (regPage?.touches) return focusTouches(n);
  if (regVue === 'tuiles') {
    const tuiles = [...$('#section').querySelectorAll('.regt-tuile')];
    regGroupe = Math.max(0, Math.min(n, tuiles.length - 1));
    tuiles.forEach((el, k) => el.classList.toggle('focus', k === regGroupe));
    $('#aide-g').innerHTML = `<div>${glyphs.b}Accueil</div><div>${glyphs.y}Rechercher</div>`;
    $('#aide-d').innerHTML = `<div>${glyphs.a}Ouvrir</div>`;
    return;
  }
  const els = [...$('#section').querySelectorAll('.reg-ligne')];
  regFocus = Math.max(0, Math.min(n, els.length - 1));
  els.forEach((el, k) => el.classList.toggle('focus', k === regFocus));
  montrer($('#section .reg-droite'), els[regFocus], 40);
  const l = regLignes[regFocus];
  $('#reg-nom').textContent = l?.label || '';
  $('#reg-aide').textContent = l?.aide || '';
  const loc = $('#section .reg-loc');
  if (loc && !loc.src.endsWith(`loc_${locReglage(l)}.gif`)) loc.src = `img/loc/loc_${locReglage(l)}.gif`;
  const genre = l && genreReglage(l);
  const action = !l?.fn ? '' : l.capture ? 'Choisir le bouton' : genre === 'interrupteur' ? (OUI.includes(l.options.find(([v]) => v === l.actuel)?.[1]) ? 'Désactiver' : 'Activer') : genre ? '' : 'Ouvrir';
  $('#aide-g').innerHTML = `<div>${glyphs.b}${regPage || regRecherche ? 'Retour' : 'Réglages'}</div>${!regPage && !regRecherche ? `<div>${glyphs.lb}${glyphs.rb}Catégorie</div>` : ''}`;
  $('#aide-d').innerHTML = `${l?.change && l.reset ? `<div>${glyphs.x}Par défaut</div>` : ''}${genre && genre !== 'interrupteur' && l?.fn ? '<div><span class="k sq">‹ ›</span>Changer</div>' : ''}${action ? `<div>${glyphs.a}${action}</div>` : ''}`;
}
/** ‹ › : la valeur d'à côté (d = écart, peut être plus grand que 1 pour un clic sur un choix). */
function changerReglage(d) {
  const l = regLignes[regFocus];
  if (!l?.fn || !genreReglage(l) || !d) return;
  l.fn(d);
  son('deplace');
  drawReglages();
}
function activerReglage() {
  const l = regLignes[regFocus];
  if (l?.capture) return l.capture();
  if (!l?.fn) return;
  const genre = genreReglage(l);
  l.fn(1);
  if (genre || l.plier) drawReglages();
}
function ouvrirCategorie(k) {
  regGroupe = k;
  regVue = 'liste';
  regFocus = 0;
  drawReglages();
  entree($('#section .reg'), 'apparait-seul');
}
function chercherReglage() {
  saisirTexte({
    titre: 'Rechercher un réglage',
    texte: 'Un mot : « vibrations », « résolution », « clips », « pseudo »…',
    champs: [{ id: 'q', label: 'Réglage', valeur: regRecherche }],
    bouton: 'Chercher',
    valider: ({ q }) => {
      fermerSaisie();
      regRecherche = q.trim();
      regFocus = 0;
      regVue = regRecherche ? 'liste' : 'tuiles';
      drawReglages();
    },
  });
}
function navReglages(k) {
  if (regPage?.touches) return navTouches(k);
  if (regVue === 'tuiles') {
    const cols = 3;
    const n = regGroupes.length;
    if (k === 'left' || k === 'right') return focusReglage((regGroupe + (k === 'left' ? -1 : 1) + n) % n);
    if (k === 'up' && regGroupe >= cols) return focusReglage(regGroupe - cols);
    if (k === 'down' && regGroupe + cols < n) return focusReglage(regGroupe + cols);
    if (k === 'a') return ouvrirCategorie(regGroupe);
    if (k === 'y') return chercherReglage();
    if (k === 'b') return allerA('accueil');
    if (k === 'lb' || k === 'rb') return sectionVoisine(k === 'lb' ? -1 : 1);
    return;
  }
  const l = regLignes[regFocus];
  if (k === 'up' || k === 'down') return focusReglage(regFocus + (k === 'up' ? -1 : 1));
  if ((k === 'left' || k === 'right') && l && genreReglage(l)) return changerReglage(k === 'left' ? -1 : 1);
  if (k === 'a') return activerReglage();
  if (k === 'x' && l?.change && l.reset) return (l.reset(), garderEmu(), toast(`${l.label} : par défaut`), drawReglages());
  if ((k === 'lb' || k === 'rb') && !regPage && !regRecherche) return ouvrirCategorie((regGroupe + (k === 'lb' ? -1 : 1) + regGroupes.length) % regGroupes.length);
  if (k === 'y' && !regPage) return chercherReglage();
  if (k !== 'b') return;
  navReglagesRetour();
}
/** Retour d'une page (console, jeu, dossier, touches) ou d'une catégorie. */
function navReglagesRetour() {
  if (regPage) {
    const retour = regPage.retour;
    regPage = null;
    if (retour && retour !== 'reglages') return allerA(retour);
    ({ groupe: regGroupe, focus: regFocus } = regRetour || { groupe: 0, focus: 0 });
    drawReglages();
    return entree($('#section .reg'), 'apparait-seul');
  }
  regRecherche = '';
  regVue = 'tuiles';
  drawReglages();
  entree($('#section .reg'), 'apparait-seul');
}
function ouvrirPage(p) {
  if (!p.parent) regRetour = { groupe: regGroupe, focus: regFocus };
  regPage = p;
  regFocus = 0;
  regVue = 'liste';
  drawReglages();
  entree($('#section .reg'), 'apparait-seul');
}
async function choisirProfil() {
  const m = await invoke('materiel').catch(() => null);
  const r = m ? profilRecommande(m) : null;
  sheet('Profil graphique', 'Pour toutes les consoles. La langue, le son, les écrans et les touches ne changent pas.', [
    { label: `Recommandé${r ? ` (${r.base} · ${r.detail.toLowerCase()})` : ''}`, fn: () => appliquerProfil('recommande', m).then(() => (toast('Graphismes : Recommandé'), drawReglages())) },
    ...Object.entries(PROFILS).map(([id, p]) => ({ label: p.nom, fn: () => appliquerProfil(id).then(() => (toast(`Graphismes : ${p.nom}`), drawReglages())) })),
    { label: 'Annuler', cancel: true },
  ]);
}

function pageDossier() {
  const i = dossierInfo;
  const choix = choixDossiers(i).filter(([v]) => v !== i?.chemin);
  return [
    ['Dossier des jeux', [
      { label: 'Emplacement', valeur: i?.chemin || '…', aide: i ? `${nbJeuxDossier(i)} jeu${nbJeuxDossier(i) > 1 ? 'x' : ''}${resumeDossier(i) ? ` : ${resumeDossier(i)}` : ''}. Un dossier par console ; Switch : un dossier par jeu, avec ses MAJ et DLC.` : '' },
      { label: 'Ajouter des jeux', aide: 'Un jeu, ses mises à jour et DLC, ou une archive (.zip, .7z, .rar) : tout se range tout seul. Tu peux aussi les déposer n\'importe où sur En Local.', fn: () => menuAjouterJeux() },
      { label: 'Ouvrir dans l\'Explorateur', aide: 'Pour y copier tes jeux.', fn: () => invoke('open_games_folder') },
      { label: 'Ranger mes jeux', aide: 'Met chaque jeu dans le dossier de sa console (Switch : un dossier par jeu) et chaque mise à jour ou DLC avec son jeu (même posés en vrac). Tu vois la liste avant ; rien n\'est supprimé.', fn: rangerDossier },
    ]],
    ['Changer de dossier', choix.map(([v, t, d]) => ({ label: t, valeur: v === 'choisir' || v === 'creer' ? '' : d.split(' · ')[1] || '', aide: `${d} Les jeux déjà dans l'ancien dossier n'y bougent pas : copie-les dans le nouveau.`, fn: () => definirDossier(v).then((ok) => ok && onglet === 'reglages' && drawReglages()) }))],
  ];
}

/** Relit le dossier des jeux sans redémarrer. */
async function rechargerJeux() {
  const avant = games.length;
  games = await invoke('list_games');
  maisonPrete = false;
  await chargerFiches();
  chargerMajs();
  envoyerBibliotheque();
  drawHome();
  const n = games.length - avant;
  toast(n > 0 ? `${n} nouveau${n > 1 ? 'x' : ''} jeu${n > 1 ? 'x' : ''}` : n < 0 ? `${-n} jeu${n < -1 ? 'x' : ''} en moins` : 'Pas de nouveau jeu');
}
