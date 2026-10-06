/*
 * Accueil : 4 pages de cases où le joueur range jeux, widgets et images.
 * Les images sont copiées dans data\home. Retirer un élément ne supprime aucun fichier.
 * Taille des icônes : plus de cases donne des icônes plus petites.
 */
const DENSITES = { grandes: [8, 3], moyennes: [10, 4], petites: [12, 5] };
const densite = () => (DENSITES[localStorage.densite] ? localStorage.densite : 'grandes');
let [COLS, ROWS] = DENSITES[densite()];
const PAGES = 4;
document.documentElement.style.setProperty('--cols', COLS);
document.documentElement.style.setProperty('--rows', ROWS);
/** Change la taille des icônes et range de nouveau l'accueil dans l'ordre. */
function changerDensite(d) {
  if (!DENSITES[d] || d === densite()) return;
  localStorage.densite = d;
  [COLS, ROWS] = DENSITES[d];
  document.documentElement.style.setProperty('--cols', COLS);
  document.documentElement.style.setProperty('--rows', ROWS);
  const ordre = [...maison].sort((a, b) => a.page - b.page || a.y - b.y || a.x - b.x);
  maison = [];
  for (const x of ordre) {
    x.w = Math.min(x.w, COLS);
    x.h = Math.min(x.h, ROWS);
    if (placer(x)) maison.push(x);
  }
  page = 0;
  garderMaison();
  maisonPrete = true;
  if (onglet === 'accueil') drawMaison(true);
}
const TAILLES = {
  jeu: [[1, 1], [2, 2]],
  reprendre: [[4, 2], [3, 3], [6, 3], [2, 2]],
  sessions: [[4, 2], [3, 3], [4, 3], [2, 2]],
  profil: [[4, 2], [3, 2], [2, 2]],
  captures: [[4, 3], [3, 2], [6, 3], [2, 2]],
  loc: [[2, 2], [3, 3], [1, 1]],
  image: [[2, 2], [3, 2], [4, 3], [3, 3], [6, 3], [8, 3], [1, 1]],
};
const tailles = (x) => TAILLES[x.t === 'capture' ? 'image' : x.t] || [[1, 1]];
const LOCS = ['coucou', 'content', 'fete', 'gg', 'cafe', 'dodo', 'love', 'nerd', 'idee', 'musique', 'manette', 'popcorn', 'photo', 'enligne', 'attente', 'reglages', 'cherche', 'dossier', 'maj', 'question'];
const WIDGETS = [['reprendre', 'Reprendre'], ['sessions', 'Sessions du Local'], ['profil', 'Profil'], ['captures', 'Captures'], ['loc', 'Loc']];

let maison = [];
let page = 0;
let modif = false;
let prise = -1; // élément pris en mode Personnaliser, -1 sinon
let capturesListe = [];
const nouvelId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const surPage = () => maison.filter((x) => x.page === page);
const nbPages = () => PAGES;
const asset = (p) => window.__TAURI__.core.convertFileSrc(p);

/* ---------- Disposition ---------- */

function occupees(p, sauf) {
  const o = new Set();
  for (const x of maison) {
    if (x.page !== p || x === sauf) continue;
    for (let dx = 0; dx < x.w; dx++) for (let dy = 0; dy < x.h; dy++) o.add(`${x.x + dx},${x.y + dy}`);
  }
  return o;
}
function libre(p, x, y, w, h, sauf) {
  if (x < 0 || y < 0 || x + w > COLS || y + h > ROWS) return false;
  const o = occupees(p, sauf);
  for (let dx = 0; dx < w; dx++) for (let dy = 0; dy < h; dy++) if (o.has(`${x + dx},${y + dy}`)) return false;
  return true;
}
/** Première place libre à partir de la page p, null si tout est plein. */
function placer(item, p = 0) {
  for (let q = 0; q < PAGES; q++) {
    const page = (p + q) % PAGES;
    for (let y = 0; y + item.h <= ROWS; y++) {
      for (let x = 0; x + item.w <= COLS; x++) {
        if (libre(page, x, y, item.w, item.h, item)) return Object.assign(item, { page, x, y });
      }
    }
  }
  return null;
}
const ajouterSiPlace = (item) => placer(item) && maison.push(item);

/** Accueil par défaut. */
function maisonParDefaut() {
  maison = [
    { t: 'reprendre', page: 0, x: 0, y: 0, w: 4, h: 2 },
    { t: 'sessions', page: 0, x: 4, y: 0, w: 4, h: 2 },
    { t: 'profil', page: 1, x: 0, y: 0, w: 4, h: 2 },
    { t: 'loc', loc: 'coucou', page: 1, x: 6, y: 1, w: 2, h: 2 },
  ].map((x) => ({ id: nouvelId(), ...x }));
  const recents = [...games].sort((a, b) => (stats[b.path]?.last || 0) - (stats[a.path]?.last || 0));
  for (const g of recents) ajouterSiPlace({ id: nouvelId(), t: 'jeu', path: g.path, w: 1, h: 1 });
  ajouterSiPlace({ id: nouvelId(), t: 'captures', w: 4, h: 2 });
  return maison;
}

/** Charge l'accueil gardé. Les jeux disparus s'en vont, les nouveaux s'ajoutent. */
function chargerMaison() {
  try { maison = JSON.parse(localStorage.maison || '[]'); } catch { maison = []; }
  if (localStorage.maison === undefined) return (maisonParDefaut(), garderMaison(), (localStorage.jeuxVus = JSON.stringify(games.map((g) => g.path))));
  const chemins = new Set(games.map((g) => g.path));
  // Une ancienne disposition plus grande est replacée.
  const anciens = maison.filter((x) => x.t !== 'jeu' || chemins.has(x.path));
  maison = [];
  const replacer = [];
  for (const x of anciens) {
    const ok = x.page >= 0 && x.page < PAGES && tailles(x).some(([w, h]) => w === x.w && h === x.h) && libre(x.page, x.x, x.y, x.w, x.h);
    ok ? maison.push(x) : replacer.push(x);
  }
  for (const x of replacer) {
    if (!tailles(x).some(([w, h]) => w === x.w && h === x.h)) [x.w, x.h] = tailles(x)[0];
    ajouterSiPlace(x);
  }
  // Seuls les nouveaux jeux arrivent sur l'accueil : un jeu retiré reste retiré.
  const presents = new Set(maison.filter((x) => x.t === 'jeu').map((x) => x.path));
  const vus = new Set(JSON.parse(localStorage.jeuxVus || 'null') || games.map((g) => g.path));
  for (const g of games) if (!presents.has(g.path) && !vus.has(g.path)) ajouterSiPlace({ id: nouvelId(), t: 'jeu', path: g.path, w: 1, h: 1 });
  localStorage.jeuxVus = JSON.stringify(games.map((g) => g.path));
  page = Math.min(page, nbPages() - 1);
  garderMaison();
}
const garderMaison = () => (localStorage.maison = JSON.stringify(maison));

/* ---------- Icônes des jeux ---------- */

const iconesPerso = JSON.parse(localStorage.iconesPerso || '{}');
const garderIcones = () => (localStorage.iconesPerso = JSON.stringify(iconesPerso));

/**
 * Icône choisie par le joueur, sinon celle du jeu (DS, 3DS, Wii U), sinon le haut de sa jaquette.
 * loin : l'image se charge seulement en arrivant à l'écran.
 */
function iconeHtml(g, loin = false) {
  const plus = loin ? ' loading="lazy" decoding="async"' : '';
  if (iconesPerso[g.path]) return `<img class="icone-img" src="${asset(iconesPerso[g.path])}" alt=""${plus}>`;
  const lue = localStorage['icone2:' + g.path];
  if (lue && lue !== 'aucune') return `<img class="icone-img" src="${lue}" alt=""${plus}>`;
  if (lue === undefined) lireIcone(g);
  const jaquette = coverImg(g, 'icone-img jaquette', loin);
  return jaquette || `<div class="icone-sans">${iconeConsole(g.console, 'filigrane')}<b>${esc(g.name)}</b></div>`;
}
/** Scale2x : agrandit sans flou. */
function scale2x(src, w, h) {
  const out = new Uint32Array(w * h * 4);
  const at = (x, y) => src[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = at(x, y), a = at(x, y - 1), b = at(x + 1, y), c = at(x - 1, y), d = at(x, y + 1);
      const o = (y * 2) * w * 2 + x * 2;
      out[o] = c === a && c !== d && a !== b ? a : p;
      out[o + 1] = a === b && a !== c && b !== d ? b : p;
      out[o + w * 2] = d === c && d !== b && c !== a ? c : p;
      out[o + w * 2 + 1] = b === d && b !== a && d !== c ? d : p;
    }
  }
  return [out, w * 2, h * 2];
}
const enLecture = new Set();
async function lireIcone(g) {
  if (enLecture.has(g.path)) return;
  enLecture.add(g.path);
  const buf = await invoke('game_icon', { path: g.path, console: g.console }).catch(() => new ArrayBuffer(0));
  if (buf.byteLength <= 4) return (localStorage['icone2:' + g.path] = 'aucune');
  const v = new DataView(buf);
  let w = v.getUint16(0, true), h = v.getUint16(2, true);
  let px = new Uint32Array(buf.slice(4));
  // Petites icônes (DS, 3DS) agrandies ×4 avec Scale2x.
  while (w < 128) [px, w, h] = scale2x(px, w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(px.buffer), w, h), 0, 0);
  localStorage['icone2:' + g.path] = c.toDataURL('image/png');
  for (const k of Object.keys(localStorage)) if (k.startsWith('icone:')) delete localStorage[k]; // ancienne version, floue
  if (onglet === 'accueil') drawMaison(true);
}

/* ---------- Dessin ---------- */

function itemHtml(x, n) {
  const pos = `grid-column:${x.x + 1}/span ${x.w};grid-row:${x.y + 1}/span ${x.h};--i:${n}`;
  const cls = `tile item t-${x.t} w${x.w} h${x.h}${modif && n === prise ? ' prise' : ''}`;
  const base = (act, titre, extra = '') => `class="${cls}" style="${pos}" data-n="${n}" data-act="${act}" data-titre="${esc(titre)}" ${extra}`;
  const poignee = modif ? '<span class="poignee" title="Taille"></span>' : '';
  if (x.t === 'jeu') {
    const i = games.findIndex((g) => g.path === x.path);
    const g = games[i];
    const titre = fiche(g)?.title || g.name;
    return `<div ${base('jeu', titre, `data-i="${i}"`)}><div class="icone">${iconeHtml(g)}</div>${poignee}</div>`;
  }
  if (x.t === 'image' || x.t === 'capture') {
    return `<div ${base(x.t === 'capture' ? 'capture' : 'image', x.t === 'capture' ? 'Capture' : 'Image', `data-src="${esc(x.src)}"`)}><img class="bg media" src="${asset(x.src)}" alt="">${poignee}</div>`;
  }
  if (x.t === 'loc') {
    return `<div ${base('loc', 'Loc')}><img class="loc-gif" src="img/loc/loc_${LOCS.includes(x.loc) ? x.loc : 'coucou'}.gif" alt="Loc">${poignee}</div>`;
  }
  if (x.t === 'reprendre') {
    const r = dernier();
    if (!r) return `<div ${base('dossier', 'Ajouter des jeux')}><img class="w-loc" src="img/loc/loc_dossier.gif" alt=""><div class="in plat"><span class="tag">Reprendre</span><h3>Ajoute tes jeux pour commencer</h3></div>${poignee}</div>`;
    const titre = fiche(r.g)?.title || r.g.name;
    const st = stats[r.g.path];
    const fond = derniereImage(r.g);
    return `<div ${base('jouer', titre, `data-i="${r.i}"`)}>${fond ? `<img class="bg" src="${fond}" alt="">` : coverImg(r.g, 'bg flou')}<div class="shade"></div>
      <div class="in"><span class="tag">Reprendre</span><div class="repr"><div class="icone mini">${iconeHtml(r.g)}</div><div><h3>${esc(titre)}</h3><span class="s">${st?.secs ? duree(st.secs) : NOMS[r.g.console]}</span></div></div></div>${poignee}</div>`;
  }
  if (x.t === 'sessions') {
    // On choisit toujours la session, même s'il n'y en a qu'une.
    const sess = autres();
    const s0 = sess[0];
    const i0 = s0 ? ownGame(s0) : -1;
    const n = x.h > 2 ? 3 : x.w > 2 ? 2 : 1;
    const lignes = sess.slice(0, n).map((s) => `<div class="w-sess">${vignetteSession(s)}<img class="av hote" src="${esc(s.host?.avatar || 'img/hang-coucou.png')}" alt="">
      <span class="t"><b>${esc(s.game)}</b><small>${esc(s.host?.name || '')} · ${esc(NOMS[s.console] || s.console)}</small></span>${x.w > 2 ? placesSession(s) : ''}<em>${+s.players || 0}/${+s.slots || 0}</em></div>`).join('');
    return `<div ${base(me ? 'sessions-choix' : 'login', 'Sessions du Local')}>${i0 >= 0 ? coverImg(games[i0], 'bg') : ''}<div class="shade${i0 >= 0 ? '' : ' leger'}"></div><div class="in plat"><div class="ligne-haut"><span class="tag">Sessions</span>${sess.length ? `<span class="tag live">${sess.length} en cours</span>` : ''}</div>
      ${lignes || `<span class="s">${me ? 'Personne ne joue en ligne. Lance un jeu en session !' : 'Connecte-toi pour jouer avec les membres.'}</span>`}${sess.length > n ? `<span class="s plus">+${sess.length - n} autre${sess.length - n > 1 ? 's' : ''}</span>` : ''}</div>${lignes ? '' : `<img class="w-loc" src="img/loc/loc_${me ? 'attente' : 'enligne'}.gif" alt="">`}${poignee}</div>`;
  }
  if (x.t === 'profil') {
    const total = Object.values(stats).reduce((t, s) => t + (s.secs || 0), 0);
    const top = games.filter((g) => stats[g.path]?.secs).sort((a, b) => stats[b.path].secs - stats[a.path].secs)[0];
    return `<div ${base(me ? 'profil' : 'login', me ? me.name : 'Se connecter')}><div class="in plat profil-w">
      <div class="hote">${me ? `<img class="av" src="${esc(me.avatar || 'img/hang-coucou.png')}" alt="">` : `<span class="av vide">${icone(DOCK.profil)}</span>`}<div><h3>${esc(me ? me.name : 'Invité')}</h3><span class="s">${me ? 'Sur le Local' : 'Connecte-toi avec Discord'}</span></div></div>
      ${x.w > 2 ? `<div class="chiffres"><span><b>${games.length}</b> jeux</span><span><b>${total ? duree(total).replace(' de jeu', '') : '0 min'}</b> de jeu</span>${top && x.w > 3 ? `<span class="fav"><span class="icone micro">${iconeHtml(top)}</span>${esc(fiche(top)?.title || top.name)}</span>` : ''}</div>` : ''}</div>${poignee}</div>`;
  }
  if (x.t === 'captures') {
    const im = toutesImages()[0];
    return `<div ${base('captures', 'Captures', im?.capture >= 0 ? `data-c="${im.capture}"` : '')}>${im ? `<img class="bg defile" src="${im.src}" alt="">` : '<img class="w-loc" src="img/loc/loc_photo.gif" alt="">'}<div class="shade"></div>
      <div class="in"><span class="tag">Captures</span><span class="defile-titre">${im ? esc(im.titre) : `En jeu, ${glyphs.capture || 'le bouton de partage'} prend une capture`}</span></div>${poignee}</div>`;
  }
  return '';
}

function dernier() {
  const r = games.map((g, i) => ({ g, i })).filter((x) => stats[x.g.path]?.last).sort((a, b) => stats[b.g.path].last - stats[a.g.path].last)[0];
  return r || (games[0] ? { g: games[0], i: 0 } : null);
}
/** Dernière image d'un jeu : celle prise en quittant, sinon sa dernière capture. */
function derniereImage(g) {
  const nom = g.name.toLowerCase();
  const c = capturesListe.find((x) => x.jeu.toLowerCase() === nom || x.jeu.toLowerCase() === (fiche(g)?.title || '').toLowerCase());
  return shotOf(g) || (c ? asset(c.path) : '');
}
function toutesImages() {
  const parJeu = (nom) => games.findIndex((g) => g.name.toLowerCase() === nom.toLowerCase() || (fiche(g)?.title || '').toLowerCase() === nom.toLowerCase());
  const caps = capturesListe.map((c, n) => ({ src: asset(c.path), titre: c.jeu, i: parJeu(c.jeu), capture: n }));
  const shots = games.map((g, i) => ({ g, i })).filter((x) => shotOf(x.g)).map((x) => ({ src: shotOf(x.g), titre: fiche(x.g)?.title || x.g.name, i: x.i }));
  return [...caps, ...shots];
}

function drawMaison(force = false) {
  const board = $('#board');
  const items = surPage();
  const guides = modif ? Array.from({ length: COLS * ROWS }, (_, k) => `<i class="case" style="grid-column:${(k % COLS) + 1};grid-row:${Math.floor(k / COLS) + 1}" data-c="${k}"></i>`).join('') : '';
  const vide = !items.length && !modif ? `<div class="page-vide"><img src="img/loc/loc_idee.gif" alt=""><p>Page ${page + 1} vide</p><span>${glyphs.y} Personnaliser pour y poser des jeux, des images ou des widgets</span></div>` : '';
  const html = `<div class="grille">${guides}${items.map(itemHtml).join('')}${vide}</div>`;
  // Rien n'a changé ou une page glisse : pas de redessin, sinon les images clignotent.
  if (!force && board.classList.contains('defile')) return;
  if (force || board.dataset.html !== html) {
    board.dataset.html = html;
    board.innerHTML = html;
    lierItems();
  }
  board.classList.toggle('modif', modif);
  const n = nbPages();
  $('#pages').innerHTML = Array.from({ length: n }, (_, k) => `<i class="${k === page ? 'on' : ''}" data-p="${k}"></i>`).join('');
  $('#pages').querySelectorAll('i').forEach((el) => (el.onclick = () => changerPage(+el.dataset.p)));
  focusTile(Math.min(tileFocus, Math.max(0, items.length - 1)));
}

/* ---------- Souris ---------- */

function lierItems() {
  const board = $('#board');
  board.querySelectorAll('.item').forEach((el) => {
    const n = +el.dataset.n;
    el.onclick = (e) => {
      if (e.target.classList.contains('poignee')) return (focusTile(n), tailleSuivante());
      if (modif) return (focusTile(n), prendre());
      focusTile(n);
      activer(el);
    };
    el.oncontextmenu = (e) => { e.preventDefault(); focusTile(n); modif ? menuModif() : ouvrirContexte(el); };
    el.onpointerdown = (e) => {
      if (!modif || e.button !== 0 || e.target.classList.contains('poignee')) return;
      const depart = { x: e.clientX, y: e.clientY };
      let bouge = false;
      const suit = (m) => {
        const dx = m.clientX - depart.x, dy = m.clientY - depart.y;
        if (!bouge && Math.hypot(dx, dy) < 6) return;
        bouge = true;
        const z = parseFloat($('#accueil').style.getPropertyValue('--s')) || 1;
        el.style.transform = `translate(${dx / z}px, ${dy / z}px) scale(1.06)`;
        el.classList.add('traine');
      };
      const pose = (m) => {
        removeEventListener('pointermove', suit);
        removeEventListener('pointerup', pose);
        el.classList.remove('traine');
        el.style.transform = '';
        if (!bouge) return;
        const c = caseSous(m.clientX, m.clientY);
        if (c) deplacerVers(surPage()[n], c.x, c.y);
      };
      addEventListener('pointermove', suit);
      addEventListener('pointerup', pose);
    };
  });
}
/** Molette : une page par cran. */
let moletteAttente = 0;
function suivreMolette() {
  $('#board').addEventListener('wheel', (e) => {
    if (onglet !== 'accueil' || Date.now() < moletteAttente) return;
    const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (Math.abs(d) < 10) return;
    moletteAttente = Date.now() + 350;
    changerPage(page + (d > 0 ? 1 : -1));
  }, { passive: true });
}

function caseSous(cx, cy) {
  const g = $('#board .grille')?.getBoundingClientRect();
  if (!g) return null;
  const x = Math.floor(((cx - g.left) / g.width) * COLS), y = Math.floor(((cy - g.top) / g.height) * ROWS);
  return x >= 0 && y >= 0 && x < COLS && y < ROWS ? { x, y } : null;
}

/* ---------- Focus et pages ---------- */

function focusTile(n) {
  const els = $('#board').querySelectorAll('.item');
  tileFocus = Math.max(0, n);
  els.forEach((el, k) => el.classList.toggle('focus', k === tileFocus));
  $('#titre').textContent = els[tileFocus]?.dataset.titre || 'En Local';
  drawAide();
}

/** Flèches : élément voisin, page d'à côté au bord, dock en bas. */
function moveTile(dir) {
  const items = surPage();
  if (prise >= 0) {
    const x = items[prise];
    const d = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] }[dir];
    if (x.x + d[0] < 0 && page > 0) return changerPage(page - 1);
    if (x.x + x.w + d[0] > COLS && dir === 'right') return changerPage(page + 1);
    return deplacerVers(x, x.x + d[0], x.y + d[1]);
  }
  const best = voisin([...$('#board').querySelectorAll('.item')], tileFocus, dir);
  if (best >= 0) return focusTile(best);
  if (dir === 'right' && page < PAGES - 1) return changerPage(page + 1);
  if (dir === 'left' && page > 0) return changerPage(page - 1);
  if (dir === 'down' && !modif) ouvrirDock();
}

async function changerPage(p) {
  if (p === page || p < 0 || p >= PAGES) return;
  const sens = p > page ? 'gauche' : 'droite';
  if (prise >= 0) {
    // L'élément pris suit vers l'autre page.
    const x = surPage()[prise];
    const ancienne = x.page;
    x.page = -1;
    const place = trouverPlace(p, x.w, x.h, sens === 'gauche' ? 0 : COLS - x.w, x.y);
    if (!place) return ((x.page = ancienne), refus());
    Object.assign(x, { page: p }, place);
    page = p;
    prise = tileFocus = surPage().indexOf(x);
    garderMaison();
  } else {
    page = p;
    tileFocus = sens === 'gauche' ? 0 : surPage().length - 1;
  }
  const board = $('#board');
  const ancienne = board.querySelector('.grille')?.cloneNode(true);
  board.querySelectorAll('.grille.part').forEach((g) => g.remove());
  drawMaison(true);
  const nouvelle = board.querySelector('.grille');
  // Animations réduites : la nouvelle page s'affiche directement.
  const anime = parseFloat(getComputedStyle(board).getPropertyValue('--d-3')) > 50;
  if (!ancienne || !anime) return;
  // Pages tournées vite : la copie repart visible, sans rejouer son entrée.
  ancienne.classList.remove('arrive-gauche', 'arrive-droite');
  ancienne.style.visibility = '';
  ancienne.classList.add('part');
  ancienne.querySelectorAll('.focus').forEach((el) => el.classList.remove('focus'));
  board.appendChild(ancienne);
  board.classList.add('defile');
  // La nouvelle page attend ses images (0,15 s au plus), puis les deux pages glissent ensemble.
  nouvelle.style.visibility = 'hidden';
  const pretes = Promise.all([...nouvelle.querySelectorAll('img')].map((im) => im.decode().catch(() => {})));
  await Promise.race([pretes, new Promise((r) => setTimeout(r, 150))]);
  nouvelle.style.visibility = '';
  entree(nouvelle, `arrive-${sens}`);
  ancienne.classList.add(`part-${sens}`);
  const fin = () => (ancienne.remove(), board.querySelector('.grille.part') || board.classList.remove('defile'));
  // Seule la fin du glissement de la page compte, pas celle des animations de ses widgets.
  ancienne.addEventListener('animationend', (e) => e.target === ancienne && fin());
  setTimeout(fin, 1000);
}
function trouverPlace(p, w, h, x0, y0) {
  let best = null, dist = Infinity;
  for (let y = 0; y + h <= ROWS; y++) for (let x = 0; x + w <= COLS; x++) {
    const d = Math.abs(x - x0) + Math.abs(y - y0);
    if (d < dist && libre(p, x, y, w, h)) (best = { x, y }), (dist = d);
  }
  return best;
}

function activer(el) {
  if (!el) return;
  const a = el.dataset.act;
  if (a === 'jeu' && el.dataset.i !== undefined && el.dataset.i !== '' && +el.dataset.i >= 0) choose(+el.dataset.i);
  if (a === 'jouer') play(+el.dataset.i);
  if (a === 'sessions-choix') choisirSession();
  if (a === 'sessions') allerA('sessions');
  if (a === 'profil') allerA('profil');
  if (a === 'captures') ouvrirCapture(el.dataset.c === undefined ? -1 : +el.dataset.c);
  if (a === 'capture') ouvrirCapture(capturesListe.findIndex((c) => el.dataset.src === c.path));
  if (a === 'image' || a === 'loc') { /* décoratifs : rien à lancer */ }
  if (a === 'dossier') invoke('open_games_folder');
  if (a === 'code') ouvrirCode();
  if (a === 'login') login();
}

/* ---------- Mode Personnaliser ---------- */

function basculerModif() {
  modif = !modif;
  prise = -1;
  if (!modif) {
    garderMaison();
    page = Math.min(page, nbPages() - 1);
  }
  drawMaison(true);
  toast(modif ? 'Personnaliser l\'accueil' : 'Accueil enregistré');
}
function prendre() {
  if (!surPage().length) return;
  prise = prise >= 0 ? -1 : tileFocus;
  if (prise < 0) garderMaison();
  drawMaison(true);
}
/** Déplace un élément, ou l'échange avec un élément de même taille. */
function deplacerVers(x, nx, ny) {
  if (!x) return;
  if (libre(page, nx, ny, x.w, x.h, x)) {
    Object.assign(x, { x: nx, y: ny });
  } else {
    const autre = surPage().find((o) => o !== x && o.x === nx && o.y === ny && o.w === x.w && o.h === x.h);
    if (!autre) return refus();
    Object.assign(autre, { x: x.x, y: x.y });
    Object.assign(x, { x: nx, y: ny });
  }
  garderMaison();
  const k = surPage().indexOf(x);
  if (prise >= 0) prise = k;
  tileFocus = k;
  drawMaison(true);
}
function refus() {
  const el = $('#board').querySelectorAll('.item')[tileFocus];
  entree(el, 'non');
}
function tailleSuivante() {
  const x = surPage()[tileFocus];
  if (!x) return;
  const liste = tailles(x);
  const k = liste.findIndex(([w, h]) => w === x.w && h === x.h);
  for (let d = 1; d <= liste.length; d++) {
    const [w, h] = liste[(k + d) % liste.length];
    const px = Math.min(x.x, COLS - w), py = Math.min(x.y, ROWS - h);
    if (libre(page, px, py, w, h, x)) {
      Object.assign(x, { w, h, x: px, y: py });
      garderMaison();
      return drawMaison(true);
    }
  }
  refus();
  toast('Pas la place ici : déplace l\'élément ou libère des cases.');
}
function retirer() {
  const x = surPage()[tileFocus];
  if (!x) return;
  maison = maison.filter((o) => o !== x);
  prise = -1;
  garderMaison();
  drawMaison(true);
  toast(x.t === 'jeu' ? 'Retiré de l\'accueil (le jeu reste dans ta bibliothèque).' : 'Retiré de l\'accueil.');
}

function menuModif() {
  const x = surPage()[tileFocus];
  const propres = !x ? []
    : x.t === 'jeu' ? [{ label: 'Changer l\'icône du jeu', fn: () => choisirFichier((src) => ((iconesPerso[x.path] = src), garderIcones(), drawMaison(true))) },
      ...(iconesPerso[x.path] ? [{ label: 'Remettre l\'icône d\'origine', fn: () => (delete iconesPerso[x.path], garderIcones(), drawMaison(true)) }] : [])]
    : x.t === 'image' ? [{ label: 'Remplacer l\'image', fn: () => choisirFichier((src) => ((x.src = src), garderMaison(), drawMaison(true))) }]
    : x.t === 'loc' ? [{ label: 'Changer l\'humeur de Loc', fn: () => ((x.loc = LOCS[(LOCS.indexOf(x.loc) + 1) % LOCS.length]), garderMaison(), drawMaison(true)) }]
    : [];
  sheet('Personnaliser', 'Ajoute des éléments, ou règle celui qui est choisi.', [
    { label: 'Ajouter un élément', fn: ajouter },
    ...propres,
    { label: 'Terminer', fn: basculerModif },
    { label: 'Fermer', cancel: true },
  ]);
}
function ajouter() {
  const present = new Set(maison.map((x) => (x.t === 'jeu' ? x.path : x.t)));
  const jeux = games.filter((g) => !present.has(g.path));
  sheet('Ajouter', 'Il se pose à la première place libre de cette page (ou de la suivante).', [
    { label: 'Une image ou un GIF de ton PC', fn: () => choisirFichier((src) => poser({ t: 'image', src, w: 2, h: 2 })) },
    { label: 'Une de tes captures', fn: ajouterCapture },
    { label: 'Un widget', fn: () => sheet('Un widget', '', [...WIDGETS.map(([t, label]) => ({ label, fn: () => poser({ t, w: TAILLES[t][0][0], h: TAILLES[t][0][1], ...(t === 'loc' ? { loc: 'coucou' } : {}) }) })), { label: 'Annuler', cancel: true }]) },
    ...(jeux.length ? [{ label: `Un jeu (${jeux.length} pas encore sur l'accueil)`, fn: () => sheet('Un jeu', '', [...jeux.map((g) => ({ label: fiche(g)?.title || g.name, fn: () => poser({ t: 'jeu', path: g.path, w: 1, h: 1 }) })), { label: 'Annuler', cancel: true }]) }] : []),
    { label: 'Annuler', cancel: true },
  ]);
}
async function ajouterCapture() {
  capturesListe = await invoke('list_captures').catch(() => []);
  if (!capturesListe.length) return oops('Pas encore de capture. En jeu, appuie sur le bouton de partage de ta manette (ou F12).');
  sheet('Une capture', '', [...capturesListe.slice(0, 30).map((c) => ({ label: `${c.jeu} · ${new Date(c.t).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`, fn: () => poser({ t: 'capture', src: c.path, w: 3, h: 2 }) })), { label: 'Annuler', cancel: true }]);
}
function poser(x) {
  const item = { id: nouvelId(), ...x };
  item.page = -1;
  const place = trouverPlace(page, item.w, item.h, 0, 0);
  if (place) Object.assign(item, { page }, place);
  else if (!placer(item, page)) return oops('Les 4 pages sont pleines : retire ou réduis un élément pour faire de la place.');
  maison.push(item);
  page = item.page;
  garderMaison();
  drawMaison(true);
  focusTile(surPage().indexOf(item));
}

/** Image choisie sur le PC, copiée dans data\home. */
function choisirFichier(fait) {
  const input = Object.assign(document.createElement('input'), { type: 'file', accept: '.png,.jpg,.jpeg,.webp,.gif' });
  input.onchange = async () => {
    const f = input.files[0];
    if (!f) return;
    try {
      const ext = f.name.split('.').pop().toLowerCase();
      fait(await invoke('save_image', new Uint8Array(await f.arrayBuffer()), { headers: { ext } }));
    } catch (e) {
      oops(e);
    }
  };
  input.click();
}

function navAccueil(k) {
  const sel = $('#board').querySelectorAll('.item')[tileFocus];
  if (['up', 'down', 'left', 'right'].includes(k)) return moveTile(k);
  if (k === 'y') return basculerModif();
  if (modif) {
    if (k === 'a') prendre();
    if (k === 'x') tailleSuivante();
    if (k === 'minus') retirer();
    if (k === 'plus') menuModif();
    if (k === 'b') prise >= 0 ? prendre() : basculerModif();
    return;
  }
  if (k === 'a') activer(sel);
  if (k === 'minus') ouvrirContexte(sel);
  if (k === 'x' && bulleSession) join(bulleSession.code);
  if (k === 'plus') ouvrirDock();
}

/* ---------- Captures en jeu ---------- */

let capturesPartie = 0;
/** Menu de capture : photo ou clip des dernières secondes. */
async function menuCapture(depuisMenu = false) {
  if (!current) return;
  const appui = depuisMenu ? menuOuvertA || Date.now() : Date.now();
  // DS : l'image reste figée sous le menu.
  if (current.console !== 'DS') await invoke('garder_photo', { menu: depuisMenu }).catch(() => {});
  if (!depuisMenu) {
    await invoke('home');
    for (let k = 0; k < 60 && !shown('#menu'); k++) await new Promise((r) => setTimeout(r, 25));
  }
  // Le menu du jeu se cache derrière le choix, sinon la manette le pilote en dessous.
  $('#menu').style.display = 'none';
  const fin = () => (($('#menu').style.display = 'grid'), closeMenu());
  const retour = () => (depuisMenu ? (($('#menu').style.display = 'grid'), drawMenu()) : fin());
  sheet('Capturer', 'Ce qui était à l\'écran quand tu as appuyé.', [
    { label: 'Capture d\'écran', fn: () => capturer().then(fin) },
    ...(dureeClips() ? [{ label: `Clip vidéo · les ${dureeClips()} dernières secondes`, fn: () => (enregistrerClip((Date.now() - appui) / 1000), fin()) }] : []),
    { label: dureeClips() ? (depuisMenu ? 'Retour' : 'Annuler') : 'Annuler (clips désactivés dans les Réglages)', cancel: true, fn: retour },
  ]);
}
/** Capture d'écran dans data\captures\<jeu>. */
async function capturer() {
  if (!current) return;
  son('photo', true);
  try {
    const opts = { headers: { jeu: encodeURIComponent(fiche(current)?.title || current.name) } };
    if (current.console === 'DS') {
      const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
      await invoke('capture', new Uint8Array(await blob.arrayBuffer()), opts);
    } else {
      await invoke('capture', new Uint8Array(0), opts);
    }
    capturesPartie++;
    compterJeu(current, 'c');
  } catch {}
}
/** Bulle en jeu, affichée par l'habillage. */
const bulleJeu = (texte, loc = 'photo') => window.__TAURI__.event.emitTo('habillage', 'notif', { texte, image: `img/loc/loc_${loc}.gif` }).catch(() => {});
/** Durée des clips. 0 : désactivés. */
const dureeClips = () => (localStorage.clips === undefined ? 30 : +localStorage.clips || 0);
let clipsPartie = 0;
/** avant : secondes écoulées depuis l'appui. */
async function enregistrerClip(avant = 0) {
  if (!current) return;
  if (!dureeClips()) return bulleJeu('Clips désactivés : Réglages, En jeu.', 'pensif');
  son('photo', true);
  bulleJeu(`Clip des ${dureeClips()} dernières secondes…`);
  try {
    const fichier = await invoke('clip', { jeu: fiche(current)?.title || current.name, avant });
    clipsPartie++;
    compter('clips');
    mediasLu = null;
    invoke('miniature', { path: fichier }).catch(() => {}); // sa miniature, prête avant d'ouvrir Médias
    bulleJeu('Clip enregistré : Médias, Vidéos.', 'fete');
  } catch (e) {
    bulleJeu(`Clip impossible : ${e}`, 'pensif');
  }
}
async function apresPartie() {
  capturesListe = await invoke('list_captures').catch(() => capturesListe);
  const quoi = [capturesPartie && `${capturesPartie} capture${capturesPartie > 1 ? 's' : ''}`, clipsPartie && `${clipsPartie} clip${clipsPartie > 1 ? 's' : ''}`].filter(Boolean);
  if (quoi.length) toast(`${noms(quoi)} enregistré${capturesPartie + clipsPartie > 1 ? 's' : ''}`);
  capturesPartie = 0;
  clipsPartie = 0;
}
/** Appelé une fois par app.js au démarrage. */
function initAccueil() {
  suivreMolette();
  invoke('list_captures').then((l) => (capturesListe = l)).catch(() => {});
}

/* Widget Captures : une image toutes les 6 s. */
let defile = 0;
setInterval(() => {
  const img = $('#board .t-captures img.defile');
  const liste = toutesImages();
  if (!img || liste.length < 2 || modif) return;
  defile = (defile + 1) % liste.length;
  const x = liste[defile];
  img.classList.add('cache');
  setTimeout(() => {
    img.src = x.src;
    img.classList.remove('cache');
    img.closest('.item').dataset.i = x.i;
    const t = img.closest('.item').querySelector('.defile-titre');
    if (t) t.textContent = x.titre;
  }, 300);
}, 6000);
