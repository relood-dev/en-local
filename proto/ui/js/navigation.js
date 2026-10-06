/* Navigation : dock, changement de section, menu d'actions et aide des touches. */

/** Sections, des plus utilisées aux moins utilisées. */
const SECTIONS = [
  { id: 'accueil', nom: 'Accueil', rang: 1 },
  { id: 'jeux', nom: 'Bibliothèque', rang: 1 },
  { id: 'collections', nom: 'Collections', rang: 3 },
  { id: 'tournois', nom: 'Tournois', rang: 3 },
  { id: 'medias', nom: 'Médias', rang: 3 },
  { id: 'recherche', nom: 'Recherche', rang: 4, apres: true },
  { id: 'reglages', nom: 'Réglages', rang: 4 },
  { id: 'profil', nom: 'Profil', rang: 4 },
  // Quitter En Local (utile en plein écran).
  { id: 'quitter', nom: 'Quitter', rang: 4, apres: true, action: true },
];
const section = (id) => SECTIONS.find((s) => s.id === id);

let dockOuvert = false;
let dockFocus = 0;
let dockApercu = null;

function drawDock() {
  const ici = SECTIONS.findIndex((s) => s.id === onglet);
  const vise = dockOuvert ? dockFocus : ici;
  const items = SECTIONS.map((s, n) => {
    const contenu = s.id === 'profil'
      ? (me ? `<img class="av" src="${esc(me.avatar || 'img/hang-coucou.png')}" alt="">` : icone(DOCK.profil))
      : icone(DOCK[s.id]);
    return `${s.apres ? '<span class="sep"></span>' : ''}<button class="ic r${s.rang} ${n === ici ? 'ici' : ''} ${n === vise ? 'vise' : ''}" data-n="${n}" aria-label="${esc(s.id === 'profil' && me ? me.name : s.nom)}">${contenu}</button>`;
  }).join('');
  const s = SECTIONS[vise];
  const d = $('#dock');
  d.innerHTML = `<div class="dock-nom">${esc(s.id === 'profil' && me ? me.name : s.nom)}</div><div class="dock-barre">${glyphs.lb}${items}${glyphs.rb}</div>`;
  d.querySelectorAll('.ic').forEach((el) => {
    el.onclick = () => { fermerDock(); allerA(SECTIONS[+el.dataset.n].id); };
    el.onmouseenter = () => { dockFocus = +el.dataset.n; d.querySelector('.dock-nom').textContent = el.getAttribute('aria-label'); d.querySelectorAll('.ic').forEach((b) => b.classList.toggle('vise', b === el)); };
  });
  montrerDock(dockOuvert || dockApercu !== null || sourisEnBas);
}
function montrerDock(oui) {
  $('#dock').classList.toggle('ouvert', oui);
  $('#accueil').classList.toggle('dock-ouvert', oui);
}

/** Le dock monte quand la souris approche du bas. */
let sourisEnBas = false;
function suivreSouris() {
  document.addEventListener('mousemove', (e) => {
    const bas = e.clientY > innerHeight - 90 * (parseFloat($('#accueil').style.getPropertyValue('--s')) || 1);
    if (bas === sourisEnBas || view() !== 'biblio') return;
    sourisEnBas = bas;
    if (!bas) dockFocus = Math.max(0, SECTIONS.findIndex((s) => s.id === onglet));
    drawDock();
  });
}

function ouvrirDock() {
  dockOuvert = true;
  dockFocus = Math.max(0, SECTIONS.findIndex((s) => s.id === onglet));
  drawDock();
  drawAide();
}
function fermerDock() {
  dockOuvert = false;
  drawDock();
  drawAide();
}
/** Après L1/R1, le dock s'affiche un instant. */
function apercuDock() {
  clearTimeout(dockApercu);
  dockApercu = setTimeout(() => ((dockApercu = null), drawDock()), 1400);
  drawDock();
}

function navDock(k) {
  if (k === 'left' || k === 'right') dockFocus = (dockFocus + (k === 'left' ? -1 : 1) + SECTIONS.length) % SECTIONS.length;
  if (k === 'a') {
    const id = SECTIONS[dockFocus].id;
    fermerDock();
    return allerA(id);
  }
  if (k === 'b' || k === 'plus' || k === 'up') return fermerDock();
  drawDock();
}

function sectionVoisine(d) {
  const vraies = SECTIONS.filter((s) => !s.action);
  const n = vraies.findIndex((s) => s.id === onglet);
  allerA(vraies[(n + d + vraies.length) % vraies.length].id);
  apercuDock();
}

/** Change de section avec son animation. */
let enTransition = false;
/** Quitte En Local après confirmation. Le jeu en cours s'arrête proprement. */
function quitterApp() {
  sheet('Quitter En Local ?', current ? 'Ton jeu s\'arrête : pense à sauvegarder avant.' : 'À bientôt sur le Local !', [
    { label: 'Quitter', fn: () => { if (current) saveShot(current); invoke('quit_app'); } },
    { label: 'Annuler', cancel: true },
  ]);
}
/** vu : le profil d'un autre membre (Profil seulement). */
async function allerA(id, vu = null) {
  if (id === 'quitter') return quitterApp();
  if (id === 'profil') {
    profilVu = vu;
    pokedexOuvert = false;
    profFocus = 0;
    if (onglet === 'profil') return drawProfil();
  }
  if (creation && id !== 'jeux') (creation = null), $('#accueil').classList.remove('mode-creation');
  // Membres et Sessions ouvrent le panneau du Local.
  if (id === 'membres' || id === 'sessions') return basculerMembres(true);
  if (!section(id) || id === onglet || enTransition) return;
  enTransition = true;
  const part = onglet === 'jeux' ? [$('#carrousel')] : onglet === 'accueil' ? [$('#board'), $('#bulle')] : [$('#section')];
  part.forEach((el) => entree(el, 'sort'));
  const s = $('#splash');
  const av = id === 'profil' && (vu ? vu.m.avatar : me?.avatar);
  s.innerHTML = `<div class="splash-ic">${id === 'profil' && (vu || me) ? `<img class="av" src="${esc(av || 'img/hang-coucou.png')}" alt="">` : icone(DOCK[id])}</div><span>${esc(vu ? vu.m.name : section(id).nom)}</span>`;
  entree(s, 'pop');
  await new Promise((r) => setTimeout(r, duree2()));
  part.forEach((el) => el.classList.remove('sort'));
  enTransition = false;
  if (onglet === 'recherche') recherche = '', chercheFocus = 0, rechercheChargee = false; // la prochaine recherche repart de zéro
  if (onglet === 'reglages') regPage = null, regFocus = 0, regEdition = -1;
  onglet = id;
  zone = 'consoles';
  tileFocus = 0;
  sectionFocus = 0;
  drawHome();
  entree(id === 'jeux' ? $('#carrousel') : id === 'accueil' ? $('#board') : $('#section'), 'apparait');
  if (id === 'accueil') entree($('#bulle'));
}
const duree2 = () => parseFloat(getComputedStyle(document.body).getPropertyValue('--d-2')) || 0;

/* ---------- Menu d'actions ---------- */

let contexte = null;

function ouvrirContexte(el) {
  const actions = actionsDe(el);
  if (!el || !actions.length) return;
  contexte = { actions, focus: 0 };
  const c = $('#contexte');
  c.innerHTML = `<div class="ctx-titre">${esc(el.dataset.titre || '')}</div>`
    + actions.map((a, n) => `<button class="ctx-act" data-n="${n}">${esc(a.label)}</button>`).join('');
  c.querySelectorAll('.ctx-act').forEach((b) => (b.onclick = () => choisirContexte(+b.dataset.n)));
  // À droite de l'élément, ou à gauche s'il manque de place.
  const ecran = $('#accueil').getBoundingClientRect();
  const z = parseFloat($('#accueil').style.getPropertyValue('--s')) || 1;
  const r = el.getBoundingClientRect();
  c.style.display = 'flex';
  const w = c.offsetWidth, h = c.offsetHeight;
  const L = (r.left - ecran.left) / z, T = (r.top - ecran.top) / z, W = r.width / z;
  const largeur = ecran.width / z, hauteur = ecran.height / z;
  const x = L + W + 12 + w < largeur ? L + W + 12 : Math.max(12, L - w - 12);
  c.style.left = `${x}px`;
  c.style.top = `${Math.max(80, Math.min(T, hauteur - h - 100))}px`;
  entree(c, 'pop-ctx');
  drawContexte();
}
function drawContexte() {
  $('#contexte').querySelectorAll('.ctx-act').forEach((b, n) => b.classList.toggle('focus', n === contexte.focus));
  drawAide();
}
function fermerContexte() {
  contexte = null;
  $('#contexte').style.display = 'none';
  drawAide();
}
function choisirContexte(n) {
  const a = contexte?.actions[n];
  fermerContexte();
  a?.fn?.();
}
function navContexte(k) {
  const n = contexte.actions.length;
  if (k === 'up' || k === 'down') contexte.focus = (contexte.focus + (k === 'up' ? -1 : 1) + n) % n;
  if (k === 'a') return choisirContexte(contexte.focus);
  if (k === 'b' || k === 'minus') return fermerContexte();
  drawContexte();
}

function actionsDe(el) {
  if (!el) return [];
  const i = +el.dataset.i;
  const g = games[i];
  if (g && (el.dataset.act === 'jeu' || el.dataset.act === 'jouer' || el.classList.contains('g'))) {
    return [
      { label: 'Jouer', fn: () => play(i) },
      ...(me && enSession(g) ? [{ label: 'Créer une session', fn: () => host(i) }] : []),
      ...(onglet !== 'jeux' ? [{ label: 'Voir dans la bibliothèque', fn: () => voirJeu(i) }] : []),
      { label: 'Ajouter à une collection', fn: () => collectionsDuJeu(i) },
      { label: 'Réglages de ce jeu', fn: () => reglerJeu(i) },
      ...(raJeux[g.path] ? [{ label: 'Succès RetroAchievements', fn: () => voirSuccesRa(g) }] : []),
      ...(majsDe[g.path]?.length ? [{ label: `Mise à jour : ${majAffichee(g)}`, fn: () => reglerMaj(i) }] : []),
      ...(EN_LIGNE.includes(g.console) && seulJeu(g) ? [{ label: sessionsForcees[g.path] ? 'Masquer les sessions (un seul joueur)' : 'Proposer les sessions (il se joue à plusieurs)', fn: () => basculerSessions(g) }] : []),
      { label: 'Ouvrir le dossier des jeux', fn: () => invoke('open_games_folder') },
    ];
  }
  if (el.dataset.act === 'session') {
    const s = sessionsLocal.find((x) => x.code === el.dataset.code);
    const gi = s ? ownGame(s) : -1;
    return [
      { label: 'Rejoindre', fn: () => join(el.dataset.code) },
      ...(gi >= 0 ? [{ label: 'Voir le jeu', fn: () => voirJeu(gi) }] : []),
    ];
  }
  return [];
}

async function voirJeu(i) {
  const g = games[i];
  conSel = g.console;
  choix[g.console] = jeuxDe(g.console).findIndex((x) => x.i === i);
  await allerA('jeux');
  zone = 'jeux';
  drawJeux();
}

/* ---------- Écrans de section ---------- */

let sectionFocus = 0;

function drawSection() {
  if (onglet === 'collections') return drawCollections();
  if (onglet === 'tournois') return (chargerTournois(), drawTournois());
  if (onglet === 'recherche') return drawRecherche();
  if (onglet === 'reglages') return drawReglages();
  if (onglet === 'medias') return drawMedias();
  if (onglet === 'profil') return drawProfil();
  const lignes = lignesDe(onglet);
  const s = section(onglet);
  const info = {
  }[onglet] || [s.nom, '', 'hang-pensif'];
  sectionFocus = Math.max(0, Math.min(sectionFocus, lignes.length - 1));
  const tete = `<h1>${esc(info[0])}</h1>`;
  $('#section').innerHTML = `<div class="sec-texte">${tete}<p>${esc(info[1])}</p>
      <div class="sec-lignes">${lignes.map((l, n) => `<button class="sec-ligne ${n === sectionFocus ? 'focus' : ''}" data-n="${n}">${l.html || esc(l.label)}</button>`).join('')}</div></div>
    <img class="sec-loc" src="img/${info[2]}.png" alt="">`;
  $('#section').querySelectorAll('.sec-ligne').forEach((b) => (b.onclick = () => lignes[+b.dataset.n].fn()));
  $('#titre').textContent = s.nom;
}

function lignesDe() {
  return [{ label: 'Retour à l\'accueil', fn: () => allerA('accueil') }];
}

function navSection(k) {
  if (onglet === 'collections') return navCollections(k);
  if (onglet === 'tournois') return navTournois(k);
  if (onglet === 'recherche') return navRecherche(k);
  if (onglet === 'reglages') return navReglages(k);
  if (onglet === 'medias') return navMedias(k);
  if (onglet === 'profil') return navProfil(k);
  const lignes = lignesDe(onglet);
  if (k === 'up' || k === 'down') {
    sectionFocus = Math.max(0, Math.min(lignes.length - 1, sectionFocus + (k === 'up' ? -1 : 1)));
    $('#section').querySelectorAll('.sec-ligne').forEach((b, n) => b.classList.toggle('focus', n === sectionFocus));
  }
  if (k === 'a') lignes[sectionFocus]?.fn();
  if (k === 'b') allerA('accueil');
}

/* ---------- Aide des touches ---------- */

function drawAide() {
  if (contexte) {
    $('#aide-g').innerHTML = `<div>${glyphs.b}Fermer</div>`;
    $('#aide-d').innerHTML = `<div>${glyphs.a}Valider</div>`;
    return;
  }
  if (dockOuvert) {
    $('#aide-g').innerHTML = `<div>${glyphs.b}Fermer</div>`;
    $('#aide-d').innerHTML = `<div>${glyphs.a}Aller</div>`;
    return;
  }
  if (onglet === 'accueil') {
    const el = $('#board').querySelectorAll('.item')[tileFocus];
    if (modif) {
      $('#aide-g').innerHTML = `<div>${glyphs.y}Terminer</div><div>${glyphs.minus}Retirer</div>`;
      $('#aide-d').innerHTML = `<div>${glyphs.a}${prise >= 0 ? 'Poser' : 'Déplacer'}</div><div>${glyphs.x}Taille</div><div>${glyphs.plus}Ajouter, options</div>`;
      return;
    }
    const act = el?.dataset.act;
    $('#aide-g').innerHTML = `<div>${glyphs.y}Personnaliser</div>${actionsDe(el).length ? `<div>${glyphs.minus}Actions</div>` : ''}`;
    $('#aide-d').innerHTML = `${['jeu', 'jouer', 'session', 'sessions', 'profil', 'login', 'dossier', 'code'].includes(act) ? `<div>${glyphs.a}${act === 'jouer' ? 'Jouer' : act === 'session' ? 'Rejoindre' : act === 'jeu' ? 'Jouer' : 'Ouvrir'}</div>` : ''}<div>${glyphs.plus}Menu</div>`;
    return;
  }
  if (onglet === 'collections') return aideCollections();
  if (onglet === 'tournois') return focusTournoi(trnFocus);
  if (onglet === 'recherche') return focusRecherche(chercheFocus);
  if (onglet === 'reglages') return focusReglage(regFocus);
  if (onglet === 'medias') return aideMedias();
  if (onglet === 'profil') return focusProfil(profFocus);
  if (onglet === 'jeux') return; // l'écran Jeux a sa barre d'actions et sa propre aide
  $('#aide-g').innerHTML = `<div>${glyphs.b}Accueil</div><div>${glyphs.plus}Menu</div>`;
  $('#aide-d').innerHTML = `<div>${glyphs.a}Valider</div>`;
}
