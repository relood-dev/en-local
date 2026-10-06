/* Réglages : la liste par thèmes. Les pages console et jeu sont dans consoles.js. */
let regFocus = 0;
let regLignes = [];
let regPage = null; // null : la liste, { console } ou { jeu, retour }
let regFocusListe = 0;
// Ligne en cours de modification, -1 sinon.
let regEdition = -1;
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
const curseur = (cle, label, aide, apres) => ({ label, aide, loc: cle === 'musique' || cle === 'perso' ? 'musique' : null, valeurHtml: jauge(vol(cle)), fleches: true, fn: (d = 1) => (changerVolume(cle, d), apres?.()) });
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
  const choix = (cle, valeurs, actuelle, fn) => ({ valeur: valeurs[actuelle], fleches: true, fn: (d = 1) => {
    const k = Object.keys(valeurs);
    fn(k[(k.indexOf(actuelle) + d + k.length) % k.length]);
  } });
  return [
    ['Apparence', [
      { label: 'Affichage', aide: 'Plein écran (comme une console), fenêtré sans bordure, ou fenêtré. F11 bascule aussi le plein écran.', ...choix('ecran', Object.fromEntries(MODES_ECRAN.map(([v, t]) => [v, t])), localStorage.ecran || 'plein', modeEcran) },
      { label: 'Thème', aide: 'Sombre, OLED (noir pur : les pixels s\'éteignent sur un écran OLED) ou clair. Les jeux, les avatars et Loc gardent leurs couleurs.', ...choix('theme', { sombre: 'Sombre', oled: 'OLED', clair: 'Clair' }, localStorage.theme || (clair ? 'clair' : 'sombre'), theme) },
      { label: 'Performances', aide: 'Maximum : Windows donne la priorité à En Local et ne le ralentit jamais (images et menus plus rapides, un peu plus de batterie sur portable). Économie : En Local passe après le reste. Les jeux ne sont pas touchés.', ...choix('perf', { economie: 'Économie', normal: 'Normal', maximum: 'Maximum' }, modePerf(), performances) },
      { label: 'Animations', aide: 'Réduites : moins de mouvements, des fondus courts.', ...choix('anim', { normales: 'Normales', reduites: 'Réduites' }, reduit ? 'reduites' : 'normales', (v) => animations(v === 'normales')) },
      { label: 'Icônes des touches', aide: 'Les boutons affichés en bas de l\'écran. « Selon la manette » suit celle que tu tiens ; le clavier montre toujours ses touches.', ...choix('glyphes', GLYPHES_NOMS, g, (v) => ((localStorage.glyphes = v), utiliser(typeManette || 'clavier', true))) },
    ]],
    ['En jeu', [
      { label: 'Clips vidéo', aide: 'En jeu, le bouton de partage de ta manette (Share, Capture, micro…) ouvre le menu de capture : capture d\'écran, ou clip des dernières secondes. Sans ce bouton : menu du jeu (Home), « Capturer » ; au clavier, F12 et F10. Les clips vont dans Médias, Vidéos, « Clips En Local ». La carte graphique enregistre en continu pendant la partie (rien n\'est gardé sans ton appui). Désactivés : rien n\'est enregistré.', ...choix('clips', { 0: 'Désactivés', 15: '15 s', 30: '30 s', 60: '1 min', 120: '2 min' }, String(dureeClips()), (v) => (localStorage.clips = v)) },
      { label: 'Qualité des clips', aide: 'Haute : la meilleure image (environ 350 Mo pour 2 minutes). Moyenne : environ 2 fois plus léger. Légère : environ 4 fois plus léger, pour les envoyer sur Discord. Compte à la prochaine partie.', ...choix('clipsQualite', { haute: 'Haute', moyenne: 'Moyenne', legere: 'Légère' }, localStorage.clipsQualite || 'haute', (v) => (localStorage.clipsQualite = v)) },
      { label: 'Autour du jeu', aide: 'Quand le jeu ne remplit pas l\'écran (4:3, les deux écrans de la DS et de la 3DS…) : une trame de points, comme une console posée sur un tapis, ou un fond noir.', ...choix('habillage', { decor: 'Décor', noir: 'Noir' }, localStorage.habillage === 'noir' ? 'noir' : 'decor', (v) => (localStorage.habillage = v)) },
      { label: 'Widgets en jeu', aide: 'Autour du jeu : ton avatar, et en session en ligne les joueurs. Les bulles d\'arrivée et de départ s\'affichent dans tous les cas.', ...choix('widgetsJeu', { oui: 'Oui', non: 'Non' }, localStorage.widgetsJeu === 'non' ? 'non' : 'oui', (v) => (localStorage.widgetsJeu = v)) },
    ]],
    ['Son', [
      curseur('general', 'Volume général', 'Tout En Local et les jeux. Le volume de Windows reste au-dessus.'),
      curseur('effets', 'Effets sonores', 'Les petits sons de l\'interface, comme sur une console : déplacement, validation, retour, lancement, menu du jeu.', () => son('ok')),
      curseur('musique', 'Musique du menu', 'Composée par En Local, en direct. Elle se tait pendant un jeu, une vidéo ou ta propre musique.'),
      { label: 'Ambiance de la musique', aide: 'Salon (lo-fi), Boutique (bossa, façon boutique de console), Nuit (calme).', ...choix('musiqueMenu', { salon: 'Salon', boutique: 'Boutique', nuit: 'Nuit' }, MORCEAUX[localStorage.musiqueMenu] ? localStorage.musiqueMenu : 'salon', (v) => (localStorage.musiqueMenu = v)) },
      curseur('perso', 'Ta musique', 'Les albums de Médias.'),
      curseur('jeux', 'Volume des jeux', 'Toutes les consoles. Aussi réglable en jeu, dans le menu (touche PS / Accueil). Chaque console garde en plus son propre volume.'),
    ]],
    ['Consoles', [
      { label: 'Profil graphique', valeur: NOMS_PROFILS[emu.profil] || 'Par défaut', aide: 'Recommandé : adapté à ton PC (carte graphique, processeur, écran). Performance, Équilibré, Qualité : pour toutes les consoles d\'un coup. Personnalisé : ce que tu règles toi-même.', fn: choisirProfil },
      { label: 'Pseudo sur les consoles', valeur: pseudoConsoles() || '…', aide: 'Ton nom de joueur sur DS, 3DS et Switch, celui que les autres voient en local sans fil. Ton pseudo Discord par défaut. 10 caractères au plus, sans emoji.', fn: () => changerPseudo(() => setTimeout(drawSection, 0)) },
      { label: 'Langue des jeux', aide: 'La langue des consoles émulées, pour toutes. Chaque console (et chaque jeu) peut avoir la sienne.', ...choix('langue', Object.fromEntries(LANGUES), emu.langue, (v) => ((emu.langue = v), garderEmu())) },
      ...ORDRE.map((c) => ({ label: LONG[c], valeur: 'Configurer', aide: `Langue, graphismes${['DS', '3DS'].includes(c) ? ', écrans' : ''}, son et performances de la ${LONG[c]}. En Local les donne à l'émulateur à chaque lancement.`, fn: () => ouvrirPage({ console: c }) })),
    ]],
    ['Jeux', [
      { label: 'Dossier des jeux', valeur: dossierInfo?.chemin || '…', aide: 'Où sont tes jeux : choisir un dossier existant, en créer un nouveau, ou le ranger.', fn: () => ouvrirPage({ dossier: true }) },
      { label: 'Ouvrir le dossier des jeux Switch', aide: 'Un dossier par jeu, ses mises à jour et DLC dans un sous-dossier (« MAJ », « MAJ et DLC »…). Choisis la mise à jour d\'un jeu dans ses actions (Share).', fn: () => invoke('open_games_folder', { quoi: 'maj' }) },
      { label: 'Chercher de nouveaux jeux', loc: 'cherche', aide: 'Relit le dossier des jeux, sans redémarrer En Local.', fn: rechargerJeux },
      { label: 'Ouvrir la copie des sauvegardes', loc: 'dossier', aide: 'Tes sauvegardes de toutes les consoles sont recopiées après chaque partie dans Parties enregistrées\\En Local (ton dossier Windows). Elles restent même si tu désinstalles En Local, et reviennent toutes seules à la réinstallation.', fn: () => invoke('ouvrir_saves') },
      { label: 'Refaire les jaquettes et icônes', loc: 'maj', aide: 'Oublie les images gardées et les retélécharge. Utile si une jaquette est mauvaise ou a changé.', fn: () => sheet('Refaire les images ?', 'Les jaquettes et icônes reviennent en quelques secondes.', [
        { label: 'Annuler', cancel: true },
        { label: 'Refaire', fn: async () => { await invoke('oublier_jaquettes').catch(() => {}); delete localStorage.jaquettes; Object.keys(localStorage).filter((k) => k.startsWith('icone2:')).forEach((k) => delete localStorage[k]); location.reload(); } },
      ]) },
    ]],
    ['Médias', [
      ...['musique', 'videos', 'captures'].map((sorte) => ({
        label: { musique: 'Dossier de la musique', videos: 'Dossier des vidéos', captures: 'Dossier des captures et photos' }[sorte],
        valeur: dossiersMedias?.[sorte]?.chemin || '…',
        aide: { musique: 'Ta musique, un dossier par album. Par défaut : Médias\\Musique d\'En Local et ton dossier Musique de Windows.', videos: 'Tes vidéos. Par défaut : Médias\\Vidéos d\'En Local et ton dossier Vidéos de Windows.', captures: 'Où vont tes captures en jeu (Share, F12) ; les photos que tu y mets s\'affichent aussi dans Médias.' }[sorte],
        fn: () => choisirDossierMedia(sorte),
      })),
    ]],
    ['Accueil', [
      { label: 'Taille des icônes', aide: 'Comme sur 3DS : plus petites, il en tient davantage sur chaque page (8, 10 ou 12 par ligne). L\'accueil se range de nouveau, dans le même ordre.', ...choix('densite', { grandes: 'Grandes', moyennes: 'Moyennes', petites: 'Petites' }, densite(), changerDensite) },
      { label: 'Personnaliser l\'accueil', aide: 'Déplace, agrandis, ajoute des images, des GIF de Loc et des widgets. Aussi avec △ sur l\'accueil.', fn: () => allerA('accueil').then(() => modif || basculerModif()) },
      { label: 'Remettre l\'accueil par défaut', aide: 'Tes jeux et widgets reviennent à leur place de départ. Tes images restent sur le PC.', fn: () => sheet('Remettre l\'accueil par défaut ?', 'Ta disposition actuelle sera perdue.', [
        { label: 'Annuler', cancel: true },
        { label: 'Remettre par défaut', fn: () => { delete localStorage.maison; delete localStorage.jeuxVus; maisonPrete = false; toast('Accueil remis par défaut'); drawSection(); } },
      ]) },
    ]],
    ['Le Local', me ? [
      { label: 'Compte Discord', valeur: me.name, aide: 'Les membres vérifiés du Local se connectent avec Discord.', fn: () => allerA('profil') },
      { label: 'Montrer à quoi je joue', aide: 'Aux membres du Local et sur ton statut Discord. Non : « Dans En Local », sans le nom du jeu. Pendant une session, elle reste visible pour qu\'on puisse te rejoindre.', ...choix('discret', { oui: 'Oui', non: 'Non' }, partage('montrerJeu') ? 'oui' : 'non', (v) => ((localStorage.montrerJeu = v), updatePresence())) },
      { label: 'Partager ma liste de jeux', aide: 'Oui par défaut. Les autres membres voient tes jeux (titre, console, mise à jour et nombre de DLC ; jamais les fichiers) : dans leur recherche, sur ta fiche et sur celle de chaque jeu, pour savoir qui a quoi et jouer avec la même version. Tes chiffres (temps de jeu, défis…) se voient aussi avec /enlocal sur Discord.', ...choix('liste', { oui: 'Oui', non: 'Non' }, partage('partageJeux') ? 'oui' : 'non', (v) => ((localStorage.partageJeux = v), envoyerBibliotheque(), envoyerStats())) },
      { label: 'Rejoindre avec un code', aide: 'Le code d\'une session, donné par l\'hôte ou sur sa carte dans Discord.', fn: () => ouvrirCode() },
      { label: 'Se déconnecter', aide: 'Tes jeux, collections et ton accueil restent sur ce PC.', fn: () => logout().then(drawSection) },
    ] : [
      { label: 'Se connecter avec Discord', aide: 'Pour les sessions, les membres et ton profil. Réservé aux membres vérifiés du Local.', fn: login },
    ]],
    ...(SUCCES ? [
    ['Succès', [
        ...(ra.token ? [
          { label: 'RetroAchievements', valeur: ra.user, aide: 'Connecté : les succès se débloquent en jeu sur GameCube et Wii (Dolphin) et s\'affichent dans les fiches des jeux et ton profil.' },
          { label: 'Mode hardcore', aide: 'Les succès comptent double sur RetroAchievements, mais sans sauvegardes d\'état ni ralenti. Pris en compte au prochain lancement.', ...choix('hardcore', { non: 'Non', oui: 'Oui' }, ra.hardcore ? 'oui' : 'non', (v) => ((ra.hardcore = v === 'oui'), garderRa())) },
          { label: 'Clé d\'API web', valeur: ra.cle ? 'Enregistrée' : 'Manquante', aide: 'Pour afficher tes succès dans En Local (retroachievements.org, Réglages, « Clé d\'API web »).', fn: demanderCleRa },
          { label: 'Se déconnecter de RetroAchievements', aide: 'Les trophées d\'En Local restent.', fn: () => (deconnecterRa(), drawReglages()) },
        ] : [
          { label: 'Créer un compte RetroAchievements', aide: 'Gratuit, sur retroachievements.org (dans ton navigateur) : pseudo, e-mail, mot de passe, puis le lien de confirmation reçu par e-mail. Reviens ensuite te connecter ici.', fn: () => invoke('ouvrir_ra', { page: 'inscription' }) },
          { label: 'Connecter RetroAchievements', aide: 'Les vrais succès des jeux, avec un compte gratuit retroachievements.org : GameCube et Wii pour l\'instant (la 3DS, la Wii U et la Switch n\'en ont pas sur RetroAchievements). Les trophées d\'En Local, eux, marchent sur toutes les consoles sans compte.', fn: connecterRa },
        ]),
      ]],
    ] : []),
    ['Manette', [
      { label: 'Manette', valeur: manetteNom || 'Aucune', aide: 'La première manette branchée pilote En Local et devient le joueur 1 dans les jeux. Le bouton Accueil (PS, Guide, Home) ouvre le menu en jeu.' },
      { label: 'Capture d\'écran', valeur: 'Share / F12', aide: 'En jeu : le bouton Share (micro sur DualSense, Capture sur Switch) ou F12. Les captures vont sur l\'accueil et dans ton profil.' },
    ]],
    ['À propos', [
      { label: 'Quitter En Local', aide: 'Ferme l\'app (aussi dans le dock, en bas à droite, et avec Alt+F4).', fn: quitterApp },
      { label: 'Refaire la configuration de départ', aide: 'Loc te guide de nouveau : affichage, manette, graphismes.', fn: ouvrirBienvenue },
      { label: 'En Local', valeur: 'Prototype', aide: 'L\'app du Local pour jouer ensemble à nos jeux Nintendo, sur PC.' },
      { label: 'Tes jeux', valeur: 'Tes consoles', aide: 'En Local ne fournit aucun jeu, clé ou firmware : ils viennent de tes cartouches, disques et consoles.' },
      { label: 'Fiches et images', valeur: 'GameTDB, Wikipédia', aide: 'Fiches et jaquettes : GameTDB. Résumés : Wikipédia en français (CC BY-SA).' },
    ]],
  ];
}

let manetteNom = '';
function drawReglages() {
  if (!dossiersMedias) chargerDossiersMedias().then(() => onglet === 'reglages' && drawReglages());
  if (!dossierInfo) chargerDossier().then(() => onglet === 'reglages' && drawReglages());
  const groupes = lignesReglages();
  groupes.forEach(([titre, l]) => l.forEach((x) => (x.groupe = titre)));
  regLignes = groupes.flatMap(([, l]) => l);
  regFocus = Math.max(0, Math.min(regFocus, regLignes.length - 1));
  let n = 0;
  const droite = groupes.map(([titre, lignes]) => `<div class="titre-groupe">${esc(titre)}</div>${lignes.map((l) => {
    const k = n++;
    const contenu = l.valeurHtml ?? (l.valeur ? esc(l.valeur) : '');
    const edite = k === regEdition;
    const val = contenu ? `<span class="reg-val">${edite ? '<i class="fleche" data-d="-1">‹</i>' : ''}${contenu}${edite ? '<i class="fleche" data-d="1">›</i>' : ''}</span>` : l.fn ? '<span class="chev">›</span>' : '';
    return `<button class="reg-ligne${l.fn ? '' : ' info'}${l.sous ? ' sous' : ''}${edite ? ' edition' : ''}" data-n="${k}"><span>${esc(l.label)}</span>${val}</button>`;
  }).join('')}`).join('');
  const jeu = regPage?.jeu && games.find((x) => x.path === regPage.jeu);
  const consolePage = regPage?.console || jeu?.console;
  const titre = regPage?.console ? LONG[regPage.console] : jeu ? titreDe(jeu) : regPage?.dossier ? 'Dossier des jeux' : 'Réglages';
  $('#section').innerHTML = `<div class="reg${consolePage ? ' avec-schema' : ''}">
    <div class="reg-gauche">${regPage ? `<small class="reg-chemin">Réglages${regPage.jeu ? ` · ${esc(LONG[games.find((x) => x.path === regPage.jeu)?.console] || '')}` : ''}</small>` : ''}<h1${titre.length > 22 ? ' class="long"' : ''}>${esc(titre)}</h1><p id="reg-aide"></p>${consolePage ? `<div class="schema">${schemaManette(consolePage)}<small class="schema-aide">Appuie sur ta manette pour voir le bouton. Clique sur un bouton pour changer sa touche.</small></div>` : `<img class="reg-loc" src="img/loc/loc_${locReglage(regLignes[regFocus])}.gif" alt="">`}</div>
    <div class="reg-droite">${droite}</div></div>`;
  $('#section').querySelectorAll('.reg-ligne').forEach((b) => (b.onclick = (e) => {
    const d = e.target.closest('.fleche')?.dataset.d;
    if (d && regEdition === +b.dataset.n) return activerReglage(+d);
    regFocus = +b.dataset.n;
    activerReglage(1, true);
  }));
  $('#titre').textContent = regPage?.jeu ? `Réglages · ${titreDe(games.find((x) => x.path === regPage.jeu))}` : regPage?.console ? `Réglages · ${LONG[regPage.console]}` : 'Réglages';
  if (consolePage) etiqueterSchema(consolePage, jeu ? emu.jeux[jeu.path] || {} : emu.consoles[consolePage] || {}, jeu ? emu.consoles[consolePage] : null);
  $('#section .schema-cadre')?.querySelectorAll('.bt[data-b], .appel').forEach((el) => (el.onclick = () => {
    const n = regLignes.findIndex((l) => l.bouton === el.dataset.b);
    if (n >= 0) (focusReglage(n), regLignes[n].capture());
  }));
  focusReglage(regFocus);
  invoke('pad_info').then((p) => { if ((p.name || '') !== manetteNom) (manetteNom = p.name || ''), onglet === 'reglages' && drawReglages(); }).catch(() => {});
}
const LOC_GROUPES = { 'En jeu': 'manette', Son: 'musique', Apparence: 'reglages', Consoles: 'manette', Jeux: 'dossier', 'Médias': 'photo', Accueil: 'idee', 'Le Local': 'enligne', Manette: 'manette', 'À propos': 'coucou', 'Dossier des jeux': 'dossier', 'Changer de dossier': 'dossier' };
const locReglage = (l) => l?.loc || LOC_GROUPES[l?.groupe] || 'reglages';
function focusReglage(n) {
  const els = [...$('#section').querySelectorAll('.reg-ligne')];
  regFocus = Math.max(0, Math.min(n, els.length - 1));
  els.forEach((el, k) => el.classList.toggle('focus', k === regFocus));
  montrer($('#section .reg-droite'), els[regFocus], 40);
  const l = regLignes[regFocus];
  $('#reg-aide').textContent = l?.aide || '';
  const loc = $('#section .reg-loc');
  if (loc && !loc.src.endsWith(`loc_${locReglage(l)}.gif`)) loc.src = `img/loc/loc_${locReglage(l)}.gif`;
  viserSchema(l?.bouton);
  if (regEdition >= 0) {
    $('#aide-g').innerHTML = `<div>${glyphs.b}Valider</div>`;
    $('#aide-d').innerHTML = `<div><span class="k sq">‹ ›</span>Changer</div><div>${glyphs.a}Valider</div>`;
    return;
  }
  $('#aide-g').innerHTML = `<div>${glyphs.b}${regPage ? 'Retour' : 'Accueil'}</div>`;
  $('#aide-d').innerHTML = l?.fn ? `<div>${glyphs.a}${l.capture ? 'Choisir le bouton' : l.fleches ? 'Modifier' : 'Ouvrir'}</div>` : '';
}
function activerReglage(d, valider) {
  const l = regLignes[regFocus];
  if (valider && l?.capture) return l.capture();
  if (!l?.fn) return;
  // Réglage à plusieurs valeurs : ✕ entre dedans, gauche/droite changent la valeur.
  if (valider && l.fleches) {
    regEdition = regEdition === regFocus ? -1 : regFocus;
    return drawReglages();
  }
  l.fn(d);
  if (l.fleches && onglet === 'reglages') drawReglages();
}
function navReglages(k) {
  if (regEdition >= 0) {
    if (k === 'left' || k === 'right') return activerReglage(k === 'left' ? -1 : 1);
    if (k === 'a' || k === 'b') return ((regEdition = -1), drawReglages());
    if (k === 'up' || k === 'down') (regEdition = -1), drawReglages();
    else return;
  }
  if (k === 'up' || k === 'down') return focusReglage(regFocus + (k === 'up' ? -1 : 1));
  if (k === 'a') return activerReglage(1, true);
  if (k === 'b') {
    regEdition = -1;
    if (!regPage) return allerA('accueil');
    const retour = regPage.retour;
    regPage = null;
    if (retour && retour !== 'reglages') return allerA(retour);
    regFocus = regFocusListe;
    drawReglages();
    entree($('#section .reg'), 'apparait-seul');
  }
}
function ouvrirPage(p) {
  regEdition = -1;
  regFocusListe = regFocus;
  regPage = p;
  regFocus = 0;
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
