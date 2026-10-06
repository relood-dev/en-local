/* Collections : listes de jeux personnelles, gardées sur ce PC. */
let collections = JSON.parse(localStorage.collections || 'null') || [{ id: 'favoris', nom: 'Favoris', jeux: [] }];
const garderCollections = () => (localStorage.collections = JSON.stringify(collections));
let colOuverte = null; // null : toutes les collections
let colAjout = false;
let colFocus = 0;
let colElements = []; // action de ✕ pour chaque élément
const IDEES = ['Favoris', 'À terminer', 'Jeux coop', 'Jeux du week-end', 'RPG', 'Soirées Smash', 'Pokémon', 'Mario'];

const indicesDe = (c) => c.jeux.map((p) => games.findIndex((g) => g.path === p)).filter((i) => i >= 0);
const titreDe = (g) => fiche(g)?.title || g.name;
const colActuelle = () => collections.find((c) => c.id === colOuverte);

function drawCollections() {
  const c = colActuelle();
  if (!c) colOuverte = null, colAjout = false;
  let tete, corps;
  if (!c) {
    colElements = [...collections.map((x) => () => ouvrirCollection(x.id)), nouvelleCollection];
    tete = `<h1>Collections</h1><p>${collections.length ? `${collections.length} collection${collections.length > 1 ? 's' : ''}. Range tes jeux comme tu veux.` : 'Range tes jeux comme tu veux : favoris, à terminer, jeux coop…'}</p>`;
    corps = `<div class="col-grille cartes">${collections.map((x, n) => {
      const ix = indicesDe(x);
      const mosaique = ix.slice(0, 4).map((i) => `<div class="m">${coverImg(games[i], 'm-img', true) || iconeHtml(games[i], true)}</div>`).join('');
      return `<button class="col-el carte-col" data-n="${n}"><div class="mosaique n${Math.min(4, ix.length)}">${mosaique || `<img class="m-loc" src="img/loc/loc_${x.id === 'favoris' ? 'love' : 'idee'}.gif" alt="">`}</div>
        <span class="col-nom"><b>${esc(x.nom)}</b><small>${ix.length ? `${ix.length} jeu${ix.length > 1 ? 'x' : ''}` : 'Vide'}</small></span></button>`;
    }).join('')}<button class="col-el carte-col nouvelle" data-n="${collections.length}"><div class="mosaique">${icone('<path d="M12 5v14M5 12h14"/>')}</div><span class="col-nom"><b>Nouvelle collection</b><small>Favoris, à terminer…</small></span></button></div>`;
  } else {
    const ix = colAjout ? games.map((_, i) => i) : indicesDe(c);
    colElements = ix.map((i) => () => (colAjout ? cocher(c, games[i]) : play(i)));
    if (!colAjout) colElements.push(() => basculerAjout(true));
    tete = `<h1>${esc(c.nom)}</h1><p>${colAjout ? 'Coche les jeux à mettre dans cette collection.' : ix.length ? `${ix.length} jeu${ix.length > 1 ? 'x' : ''}` : 'Cette collection est vide.'}</p>`;
    corps = `<div class="col-grille icones">${ix.map((i, n) => {
      const dedans = c.jeux.includes(games[i].path);
      return `<button class="col-el jeu-col${colAjout && dedans ? ' coche' : ''}" data-n="${n}" data-i="${i}" data-titre="${esc(titreDe(games[i]))}"><div class="icone">${iconeHtml(games[i], true)}</div>${colAjout ? `<span class="case">${dedans ? '✓' : ''}</span>` : ''}<small>${esc(titreDe(games[i]))}</small></button>`;
    }).join('')}${colAjout ? '' : `<button class="col-el jeu-col ajouter" data-n="${ix.length}"><div class="icone">${icone('<path d="M12 5v14M5 12h14"/>')}</div><small>Ajouter des jeux</small></button>`}</div>
      ${!ix.length && !colAjout ? '<div class="col-vide"><img src="img/loc/loc_dossier.gif" alt=""><p>Ajoute des jeux depuis la bibliothèque, ou avec le menu d\'actions d\'un jeu.</p></div>' : ''}`;
  }
  $('#section').innerHTML = `<div class="col">${tete}${corps}</div>`;
  $('#section').querySelectorAll('.col-el').forEach((b) => {
    b.onclick = () => ((colFocus = +b.dataset.n), colElements[colFocus]());
    b.oncontextmenu = (e) => (e.preventDefault(), (colFocus = +b.dataset.n), optionsCollection());
  });
  $('#titre').textContent = c ? c.nom : 'Collections';
  focusCollection(colFocus);
}

function focusCollection(n) {
  const els = [...$('#section').querySelectorAll('.col-el')];
  colFocus = Math.max(0, Math.min(n, els.length - 1));
  els.forEach((el, k) => el.classList.toggle('focus', k === colFocus));
  montrer($('#section .col'), els[colFocus]);
  aideCollections();
}

function aideCollections() {
  const c = colActuelle();
  const el = $('#section').querySelectorAll('.col-el')[colFocus];
  const jeu = el?.dataset.i !== undefined;
  $('#aide-g').innerHTML = `<div>${glyphs.b}${colAjout ? 'Terminer' : c ? 'Collections' : 'Accueil'}</div>${c && !colAjout ? `<div>${glyphs.x}Ajouter des jeux</div>` : ''}`;
  $('#aide-d').innerHTML = `<div>${glyphs.a}${colAjout ? (el?.classList.contains('coche') ? 'Retirer' : 'Ajouter') : jeu ? 'Jouer' : 'Ouvrir'}</div>${!colAjout && (jeu || (!c && el && !el.classList.contains('nouvelle'))) ? `<div>${glyphs.minus}Options</div>` : ''}`;
}

function ouvrirCollection(id) {
  colOuverte = id;
  colAjout = false;
  colFocus = 0;
  drawCollections();
  entree($('#section .col'), 'apparait-seul');
}
function basculerAjout(oui) {
  colAjout = oui;
  colFocus = 0;
  drawCollections();
  entree($('#section .col-grille'), 'apparait-seul');
}
/** Ajoute ou retire un jeu sans tout redessiner. */
function cocher(c, g) {
  const k = c.jeux.indexOf(g.path);
  if (k >= 0) c.jeux.splice(k, 1);
  else c.jeux.push(g.path);
  garderCollections();
  const el = $('#section').querySelectorAll('.col-el')[colFocus];
  el.classList.toggle('coche', k < 0);
  el.querySelector('.case').textContent = k < 0 ? '✓' : '';
  entree(el.querySelector('.case'), 'pop-ctx');
  aideCollections();
}

/* ---------- Créer, renommer, supprimer ---------- */

function nouvelleCollection(apres) {
  const pris = new Set(collections.map((c) => c.nom.toLowerCase()));
  sheet('Nouvelle collection', 'Choisis un nom, ou tape le tien au clavier.', [
    ...IDEES.filter((n) => !pris.has(n.toLowerCase())).map((nom) => ({ label: nom, fn: () => creerCollection(nom, apres) })),
    { label: 'Autre nom…', fn: () => nommer('', (nom) => creerCollection(nom, apres)) },
    { label: 'Annuler', cancel: true },
  ]);
}
function creerCollection(nom, apres) {
  const c = { id: `c${Date.now().toString(36)}`, nom, jeux: [] };
  collections.push(c);
  garderCollections();
  if (apres) return apres(c);
  toast(`Collection « ${nom} » créée`);
  ouvrirCollection(c.id);
  basculerAjout(true);
}
function nommer(actuel, fn) {
  sheet(actuel ? 'Renommer' : 'Nom de la collection', '', [
    { label: 'Valider', fn: () => { const v = $('#nom-col').value.trim().slice(0, 40); if (v) fn(v); } },
    { label: 'Annuler', cancel: true },
  ], '<input id="nom-col" maxlength="40" placeholder="Jeux du dimanche" spellcheck="false" autocomplete="off">');
  $('#nom-col').value = actuel;
  $('#nom-col').focus();
}

/** − : options de l'élément choisi. */
function optionsCollection() {
  const c = colActuelle();
  const el = $('#section').querySelectorAll('.col-el')[colFocus];
  if (!el || colAjout) return;
  if (c && el.dataset.i !== undefined) {
    const i = +el.dataset.i;
    return sheet(titreDe(games[i]), '', [
      { label: 'Jouer', fn: () => play(i) },
      { label: 'Voir dans la bibliothèque', fn: () => voirJeu(i) },
      { label: `Retirer de « ${c.nom} »`, fn: () => { c.jeux = c.jeux.filter((p) => p !== games[i].path); garderCollections(); drawCollections(); } },
      { label: 'Annuler', cancel: true },
    ]);
  }
  const x = c || collections[+el.dataset.n];
  if (!x) return;
  sheet(x.nom, '', [
    ...(c ? [{ label: 'Ajouter des jeux', fn: () => basculerAjout(true) }] : [{ label: 'Ouvrir', fn: () => ouvrirCollection(x.id) }]),
    { label: 'Renommer', fn: () => nommer(x.nom, (nom) => { x.nom = nom; garderCollections(); drawCollections(); }) },
    { label: 'Supprimer la collection', fn: () => sheet(`Supprimer « ${x.nom} » ?`, 'Les jeux restent dans la bibliothèque.', [
      { label: 'Garder', cancel: true },
      { label: 'Supprimer', fn: () => { collections = collections.filter((y) => y !== x); garderCollections(); colOuverte = null; colFocus = 0; drawCollections(); } },
    ]) },
    { label: 'Annuler', cancel: true },
  ]);
}

/** Collections d'un jeu, depuis son menu d'actions. */
function collectionsDuJeu(i) {
  const g = games[i];
  sheet(titreDe(g), 'Dans quelles collections ?', [
    ...collections.map((c) => {
      const dedans = c.jeux.includes(g.path);
      return { label: `${dedans ? '✓ ' : ''}${c.nom}`, fn: () => {
        if (dedans) c.jeux = c.jeux.filter((p) => p !== g.path);
        else c.jeux.push(g.path);
        garderCollections();
        toast(`${titreDe(g)} ${dedans ? 'retiré de' : 'ajouté à'} « ${c.nom} »`);
        if (onglet === 'collections') drawCollections();
      } };
    }),
    { label: 'Nouvelle collection…', fn: () => nouvelleCollection((c) => { c.jeux.push(g.path); garderCollections(); toast(`${titreDe(g)} ajouté à « ${c.nom} »`); }) },
    { label: 'Fermer', cancel: true },
  ]);
}

/* ---------- Touches ---------- */

function navCollections(k) {
  const els = [...$('#section').querySelectorAll('.col-el')];
  if (['up', 'down', 'left', 'right'].includes(k)) {
    const n = voisin(els, colFocus, k);
    if (n >= 0) focusCollection(n);
    return;
  }
  if (k === 'a') return colElements[colFocus]?.();
  if (k === 'minus') return optionsCollection();
  if (k === 'x' && colActuelle() && !colAjout) return basculerAjout(true);
  if (k === 'b') {
    if (colAjout) return basculerAjout(false);
    if (colOuverte) {
      const n = collections.findIndex((c) => c.id === colOuverte);
      colOuverte = null;
      colFocus = n;
      drawCollections();
      return entree($('#section .col'), 'apparait-seul');
    }
    allerA('accueil');
  }
}
