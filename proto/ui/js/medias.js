/*
 * Médias : captures, vidéos et musique.
 * La musique continue pendant la navigation et s'arrête au lancement d'un jeu.
 */
const CATEGORIES = [
  ['captures', 'Captures', DOCK.captures],
  ['videos', 'Vidéos', '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 5v14M17 5v14M3 9.5h4M3 14.5h4M17 9.5h4M17 14.5h4"/>'],
  ['musique', 'Musique', DOCK.medias],
];
let mediasLu = null;
let medCat = 2, medZone = 'reel';
const medChoix = { captures: 0, videos: 0, musique: 0 };

async function chargerMedias() {
  mediasLu = await invoke('medias_liste').catch(() => ({ albums: [], videos: [] }));
  if (onglet === 'medias') drawMedias();
}
/** Dossiers des médias : { musique, videos, captures }. */
let dossiersMedias = null;
const chargerDossiersMedias = async () => (dossiersMedias = await invoke('dossiers_medias').catch(() => null));
const NOMS_SORTES = { musique: 'de la musique', videos: 'des vidéos', captures: 'des captures et photos' };
async function choisirDossierMedia(sorte) {
  const d = (await chargerDossiersMedias())?.[sorte];
  // Seul un dossier choisi dans la fenêtre de Windows est accepté.
  const appliquer = async (defaut, nom) => {
    let c;
    try {
      c = nom ? await invoke('creer_dossier_media', { sorte, nom }) : await invoke('choisir_dossier_media', { sorte, defaut });
    } catch (e) {
      return oops(e);
    }
    if (!c) return;
    toast(`Dossier ${NOMS_SORTES[sorte]} : ${c}`);
    await chargerDossiersMedias();
    if (sorte === 'captures') capturesListe = await invoke('list_captures').catch(() => capturesListe);
    else await chargerMedias();
    if (onglet === 'reglages') drawReglages();
    if (onglet === 'medias') drawMedias();
    if (bienvenue) drawBienvenue();
  };
  sheet(`Dossier ${NOMS_SORTES[sorte]}`, d ? esc(d.chemin) : '', [
    { label: 'Choisir un dossier existant…', fn: () => appliquer(false) },
    { label: 'Créer un nouveau dossier…', fn: () => saisirTexte({
      titre: 'Nom du dossier',
      texte: 'Tu choisis ensuite où le créer.',
      champs: [{ id: 'nom', label: 'Nom', valeur: { musique: 'Musique En Local', videos: 'Vidéos En Local', captures: 'Captures En Local' }[sorte] }],
      bouton: 'Choisir où le créer',
      valider: ({ nom }) => (nom.trim() ? void setTimeout(() => appliquer(false, nom.trim()), 0) : 'Donne-lui un nom.'),
    }) },
    ...(d?.choisi ? [{ label: 'Revenir au dossier par défaut', fn: () => appliquer(true) }] : []),
    { label: 'Ouvrir dans l\'Explorateur', fn: () => invoke('ouvrir_medias', { sorte }) },
    { label: 'Annuler', cancel: true },
  ]);
}
const elementsMedias = (cat) => (cat === 'captures' ? capturesListe : cat === 'videos' ? mediasLu?.videos || [] : mediasLu?.albums || []);

/* ---------- Écran ---------- */

function drawMedias() {
  if (!mediasLu) chargerMedias();
  const [cat, nomCat] = CATEGORIES[medCat];
  const l = elementsMedias(cat);
  const k = (medChoix[cat] = Math.max(0, Math.min(medChoix[cat], l.length - 1)));
  const rail = CATEGORIES.map(([id, nom, ic], n) => `<button class="med-cat${n === medCat ? ' ici' : ''}${n === medCat && medZone === 'rail' ? ' focus' : ''}" data-n="${n}">${icone(ic)}<span>${nom}</span></button>`).join('');
  // L'élément choisi au centre, deux de chaque côté.
  const tuiles = l.map((x, n) => {
    const d = n - k;
    if (Math.abs(d) > 2) return '';
    return `<button class="med-tuile d${d}${d === 0 && medZone === 'reel' ? ' focus' : ''}" data-n="${n}" style="--d:${d}">${visuelMedia(cat, x)}</button>`;
  }).join('');
  const x = l[k];
  const vide = {
    captures: ['Pas encore de captures', 'En jeu, appuie sur Share (ou F12) : la capture arrive ici. Tu peux aussi choisir un dossier de photos (Create).', null],
    videos: ['Pas encore de vidéos', 'Mets tes vidéos (MP4, WebM, MKV) dans ton dossier des vidéos, ou choisis-en un autre (Create).', 'videos'],
    musique: ['Pas encore de musique', 'Mets ta musique dans ton dossier de musique, un dossier par album (avec cover.jpg pour la pochette), ou choisis-en un autre (Create).', 'musique'],
  }[cat];
  const detail = x ? detailMedia(cat, x) : `<h1>${vide[0]}</h1><p>${esc(vide[1])}</p>${vide[2] ? `<div class="med-actions"><span>${glyphs.a}Ouvrir le dossier</span></div>` : ''}`;
  $('#section').innerHTML = `<div class="med">
    <div class="med-rail">${rail}</div>
    <div class="med-reel">${tuiles || `<div class="med-tuile d0 vide${medZone === 'reel' ? ' focus' : ''}"><img src="img/loc/loc_${{ musique: 'musique', videos: 'popcorn' }[cat] || 'photo'}.gif" alt=""></div>`}</div>
    <div class="med-detail">${detail}</div>
  </div>`;
  $('#section').querySelectorAll('.med-cat').forEach((b) => (b.onclick = () => ((medCat = +b.dataset.n), (medZone = 'reel'), drawMedias())));
  $('#section').querySelectorAll('.med-tuile[data-n]').forEach((b) => (b.onclick = () => (+b.dataset.n === k ? activerMedia() : ((medChoix[cat] = +b.dataset.n), (medZone = 'reel'), drawMedias()))));
  $('#titre').textContent = `Médias · ${nomCat}`;
  // Miniatures des vidéos, faites une seule fois.
  for (const img of $('#section').querySelectorAll('img.miniature[data-video]')) {
    const v = img.dataset.video;
    if (miniatures[v]) img.src = asset(miniatures[v]);
    else invoke('miniature', { path: v }).then((f) => f && ((miniatures[v] = f), img.isConnected && (img.src = asset(f)))).catch(() => {});
  }
  aideMedias();
}
const miniatures = {}; // vidéo -> miniature

function visuelMedia(cat, x) {
  if (cat === 'captures') return `<img src="${asset(x.path)}" alt="" loading="lazy">`;
  if (cat === 'videos') return `<img class="miniature" data-video="${esc(x.path)}" alt="" decoding="async"><span class="med-film">${icone(CATEGORIES[1][2])}</span>`;
  return x.pochette ? `<img src="${asset(x.pochette)}" alt="" loading="lazy">` : `<span class="med-sans">${icone(DOCK.medias)}<b>${esc(x.nom)}</b></span>`;
}
function detailMedia(cat, x) {
  if (cat === 'captures') {
    const date = new Date(x.t).toLocaleString('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
    return `<h1>${esc(x.jeu)}</h1><p>${date}</p><div class="med-actions"><span>${glyphs.a}Voir</span></div>`;
  }
  if (cat === 'videos') return `<h1>${esc(x.titre)}</h1><p>${esc(x.dossier)}</p><div class="med-actions"><span>${glyphs.a}Regarder</span></div>`;
  const enCours = file.album === x;
  return `<h1>${esc(x.nom)}</h1><p>${x.pistes.length} titre${x.pistes.length > 1 ? 's' : ''}${enCours ? ` · en lecture : ${esc(x.pistes[file.i].titre)}` : ''}</p>
    <div class="med-actions"><span>${glyphs.a}${enCours ? (musique.paused ? 'Reprendre' : 'Pause') : 'Écouter'}</span>${file.album ? `<span>${glyphs.x}File d'attente</span>` : ''}</div>`;
}
function aideMedias() {
  $('#aide-g').innerHTML = `<div>${glyphs.b}${medZone === 'reel' ? 'Catégories' : 'Accueil'}</div><div>${glyphs.minus}Dossier</div>${file.album ? `<div>${glyphs.x}File d'attente</div>` : ''}`;
  $('#aide-d').innerHTML = `<div>${glyphs.a}${medZone === 'rail' ? 'Ouvrir' : 'Choisir'}</div>`;
}

function activerMedia() {
  const [cat] = CATEGORIES[medCat];
  const l = elementsMedias(cat);
  const x = l[medChoix[cat]];
  if (!x) return cat === 'captures' ? undefined : invoke('ouvrir_medias', { sorte: cat });
  if (cat === 'captures') return visionneuse(medChoix[cat]);
  if (cat === 'videos') return regarder(x);
  if (file.album === x) return (musique.paused ? musique.play() : musique.pause()), drawMedias();
  ecouter(x, 0);
}

function navMedias(k) {
  const [cat] = CATEGORIES[medCat];
  const n = elementsMedias(cat).length;
  if (medZone === 'rail') {
    if (k === 'up' || k === 'down') medCat = (medCat + (k === 'up' ? -1 : 1) + CATEGORIES.length) % CATEGORIES.length;
    if (k === 'right' || k === 'a') medZone = 'reel';
    if (k === 'b') return allerA('accueil');
  } else {
    if (k === 'up' || k === 'down') {
      const avant = medChoix[cat];
      medChoix[cat] = Math.max(0, Math.min(n - 1, avant + (k === 'up' ? -1 : 1)));
      if (medChoix[cat] === avant) return;
    }
    if (k === 'left' || k === 'b') medZone = 'rail';
    if (k === 'a') return activerMedia();
  }
  if (k === 'x' && file.album) return fileAttente();
  if (k === 'minus') return choisirDossierMedia(cat);
  drawMedias();
}

/* ---------- Musique ---------- */

const musique = new Audio();
musique.volume = vol('general') * vol('perso');
const file = { album: null, i: 0 };
function ecouter(album, i) {
  file.album = album;
  file.i = i;
  musique.src = asset(album.pistes[i].path);
  musique.play().catch(() => {});
  drawLecteur();
  if (onglet === 'medias') drawMedias();
}
const suivante = (d = 1) => file.album && (file.i + d >= 0 && file.i + d < file.album.pistes.length ? ecouter(file.album, file.i + d) : d > 0 && arreterMusique());
musique.onended = () => suivante(1);
musique.onplay = musique.onpause = () => (drawLecteur(), onglet === 'medias' && view() === 'biblio' && drawMedias());
function arreterMusique() {
  musique.pause();
  musique.removeAttribute('src');
  file.album = null;
  drawLecteur();
  if (onglet === 'medias') drawMedias();
}
/** « En lecture » en haut à droite. △ ouvre la file d'attente. */
function drawLecteur() {
  const el = $('#lecteur');
  if (!file.album) return (el.style.display = 'none');
  const a = file.album;
  el.style.display = 'flex';
  el.classList.toggle('pause', musique.paused);
  el.innerHTML = `${a.pochette ? `<img src="${asset(a.pochette)}" alt="">` : `<span class="lect-ic">${icone(DOCK.medias)}</span>`}
    <span class="lect-t"><small>${musique.paused ? 'En pause' : 'En lecture'}</small><b>${esc(a.pistes[file.i].titre)}</b><small>${glyphs.x}File d'attente</small></span><span class="barres"><i></i><i></i><i></i><i></i></span>`;
  el.onclick = fileAttente;
}
function fileAttente() {
  const a = file.album;
  if (!a) return;
  sheet(a.nom, `${musique.paused ? 'En pause' : 'En lecture'} : ${esc(a.pistes[file.i].titre)} (${file.i + 1}/${a.pistes.length})`, [
    { label: musique.paused ? '▶ Reprendre' : '⏸ Pause', fn: () => ((musique.paused ? musique.play() : musique.pause()), setTimeout(fileAttente, 50)) },
    { label: '⏭ Titre suivant', fn: () => (suivante(1), setTimeout(fileAttente, 50)) },
    { label: '⏮ Titre précédent', fn: () => (suivante(-1), setTimeout(fileAttente, 50)) },
    ...a.pistes.map((p, n) => ({ label: `${n === file.i ? '♪ ' : ''}${n + 1}. ${p.titre}`, fn: () => ecouter(a, n) })),
    { label: 'Arrêter la musique', fn: arreterMusique },
    { label: 'Fermer', cancel: true },
  ]);
}

/* ---------- Visionneuse ---------- */

let vue = null;
/** Ouvre une capture en grand depuis l'accueil. */
async function ouvrirCapture(n) {
  medCat = CATEGORIES.findIndex(([id]) => id === 'captures');
  medZone = 'reel';
  await allerA('medias');
  if (n >= 0 && capturesListe[n]) visionneuse(n);
}
function visionneuse(i) {
  vue = { sorte: 'image', i };
  drawVue();
}
function regarder(v) {
  if (!musique.paused) musique.pause();
  vue = { sorte: 'video', v };
  drawVue();
}
function drawVue() {
  const el = $('#vue');
  if (!vue) return (el.style.display = 'none', (el.innerHTML = ''));
  el.style.display = 'flex';
  if (vue.sorte === 'image') {
    const c = capturesListe[vue.i];
    el.innerHTML = `<img src="${asset(c.path)}" alt=""><div class="vue-bas"><b>${esc(c.jeu)}</b><span>${vue.i + 1} / ${capturesListe.length}</span><span>${glyphs.b}Fermer</span></div>`;
  } else {
    el.innerHTML = `<video src="${asset(vue.v.path)}" autoplay controls></video><div class="vue-bas"><b>${esc(vue.v.titre)}</b><span>${glyphs.a}Pause</span><span>‹ › 10 s</span><span>${glyphs.b}Fermer</span></div>`;
  }
  el.onclick = (e) => e.target === el && fermerVue();
}
function fermerVue() {
  vue = null;
  drawVue();
  if (onglet === 'medias') drawMedias();
}
const vueOuverte = () => Boolean(vue);
function navVue(k) {
  if (k === 'b') return fermerVue();
  if (vue.sorte === 'image') {
    if (k === 'left' || k === 'right') vue.i = Math.max(0, Math.min(capturesListe.length - 1, vue.i + (k === 'left' ? -1 : 1)));
    return drawVue();
  }
  const v = $('#vue video');
  if (!v) return;
  if (k === 'a') v.paused ? v.play() : v.pause();
  if (k === 'left' || k === 'right') v.currentTime = Math.max(0, v.currentTime + (k === 'left' ? -10 : 10));
}
