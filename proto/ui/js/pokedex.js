/*
 * Pokédex d'En Local : les Pokémon de toutes les sauvegardes Pokémon, lus par l'outil pokedex (PKHeX).
 * Relu après chaque partie Pokémon, gardé dans data\pokedex.json.
 */
let pokedexDonnees = null;
let pokedexOuvert = false;
let pokedexFiltre = 'tous'; // tous | pris | manquants | chroma
let pokedexGen = 0; // 0 : toutes
let pokedexJeu = -1; // -1 : tous les jeux, sinon le jeu choisi

/* Cartes de dresseur. Images des badges : PokéAPI. */
const BADGES = {
  kanto: [1, 2, 3, 4, 5, 6, 7, 8], johto: [9, 10, 11, 12, 13, 14, 15, 16], hoenn: [17, 18, 19, 20, 21, 22, 23, 24],
  sinnoh: [25, 26, 27, 28, 29, 30, 31, 32], kalos: [43, 44, 45, 46, 47, 48, 49, 50], galar: [70, 71, 72, 73, 74, 75, 76, 77],
  // Unys : Noir/Blanc et Noir 2/Blanc 2 n'ont pas les mêmes badges.
  unys: [33, 34, 36, 37, 38, 39, 40, 41], unys2: [34, 35, 36, 37, 38, 39, 41, 42],
};
const VERSIONS = {
  R: ['hoenn', '#c8323c'], S: ['hoenn', '#2c5ec4'], E: ['hoenn', '#2f9a62'], FR: ['kanto', '#e2552f'], LG: ['kanto', '#58a34a'],
  D: ['sinnoh', '#4a74c9'], P: ['sinnoh', '#c1679a'], Pt: ['sinnoh', '#8a8d93'], HG: ['johto+kanto', '#c79a2c'], SS: ['johto+kanto', '#9aa3ad'],
  B: ['unys', '#2f2f33'], W: ['unys', '#8a8a92'], B2: ['unys2', '#2f3a4f'], W2: ['unys2', '#a07a7a'], X: ['kalos', '#2d64b8'], Y: ['kalos', '#c53a3a'],
  OR: ['hoenn', '#c53a3a'], AS: ['hoenn', '#2d64b8'], SN: [null, '#e18a2e'], MN: [null, '#5a4fb3'], US: [null, '#e2702c'], UM: [null, '#4b3fa8'],
  GP: [null, '#e8c52f'], GE: [null, '#b88a4a'], SW: ['galar', '#2fa8d6'], SH: ['galar', '#d6336c'], BD: ['sinnoh', '#3b7bd6'], SP: ['sinnoh', '#d65fa0'],
  PLA: [null, '#4f6f8f'], SL: [null, '#d64535'], VL: [null, '#7a3fbf'],
};
const badgesDe = (j) => {
  const [region] = VERSIONS[j.version] || [];
  return region ? region.split('+').flatMap((r) => BADGES[r]) : [];
};
/** Pokédex d'un jeu : [numéro, espèce], régional si connu. */
const ordreJeu = (j) => (j.regional?.length ? j.regional.map(([n, r]) => [r, n]) : Array.from({ length: j.max || 0 }, (_, k) => [k + 1, k + 1]));

function carteDresseur(j, k, action) {
  const couleur = (VERSIONS[j.version] || [])[1] || '#3a3a44';
  const ids = badgesDe(j);
  const total = j.regional?.length || j.max || 0;
  const pris = new Set(j.pris || []);
  const prisDuDex = j.regional?.length ? j.regional.filter(([n]) => pris.has(n)).length : pris.size;
  const vus = prisDuDex + (j.regional?.length ? j.regional.filter(([n]) => (j.vus || []).includes(n)).length : (j.vus || []).length);
  const badges = j.badges >= 0 && ids.length ? `<div class="cd-badges">${ids.map((b, i) => `<span class="cd-badge${j.badges & (1 << i) ? ' obtenu' : ''}"><img data-badge="${b}" alt=""></span>`).join('')}</div>` : '';
  return `<button class="prof-el carte-dresseur${pokedexJeu === k ? ' choisie' : ''}" style="--cd:${couleur}" data-n="${action(() => ((pokedexJeu = pokedexJeu === k ? -1 : k), (pokedexFiltre = 'tous'), drawProfil()))}">
    <div class="cd-tete"><small>Carte de dresseur</small><b>${esc(j.jeu)}</b></div>
    <div class="cd-corps">
      <div class="cd-nom"><small>Nom</small><b>${esc(j.dresseur || '—')}</b></div>
      <div><small>N° ID</small><b>${String(j.id ?? 0).padStart(j.generation >= 7 ? 6 : 5, '0')}</b></div>
      <div><small>Argent</small><b>${Number(j.argent || 0).toLocaleString('fr-FR')} ₽</b></div>
      <div><small>Temps de jeu</small><b>${j.heures || 0} h ${String(j.minutes || 0).padStart(2, '0')}</b></div>
      <div><small>${esc(j.dex || 'Pokédex')}</small><b>${prisDuDex} / ${total}</b><i>${vus} vus</i></div>
    </div>
    ${badges}
  </button>`;
}
const GENS = [[1, 151], [152, 251], [252, 386], [387, 493], [494, 649], [650, 721], [722, 809], [810, 905], [906, 1025]];

/*
 * Anti-triche : le Pokédex d'En Local compte seulement ce qui est attrapé en jouant dans En Local.
 * Les sauvegardes sont lues avant et après chaque partie Pokémon : seule la différence compte,
 * à un rythme possible. Une sauvegarde remplacée ou modifiée hors d'une partie n'apporte rien,
 * et les Pokémon refusés par le contrôle de légalité de PKHeX ne comptent jamais.
 */
let pokedexCredit = JSON.parse(localStorage.pokedexCredit || 'null'); // { 'n:f': { c: chromatique, j: [versions] } }
let pokedexAvant = null; // sauvegardes lues au lancement de la partie
const garderCredit = () => (localStorage.pokedexCredit = JSON.stringify(pokedexCredit));
const RYTHME_MAX = (minutes) => 10 + Math.ceil(minutes * 3); // nouvelles espèces par partie, au plus

/** Contenu de chaque sauvegarde : cle -> { version, pris: Set, poss: Set('n:f:c') }. */
const etatSaves = (d) => new Map((d?.jeux || []).filter((j) => j.cle).map((j) => [j.cle, { version: j.version, jeu: j.jeu, pris: new Set(j.pris || []), poss: new Set((j.poss || []).map((x) => x.join(':'))) }]));

function crediter(n, f, c, version) {
  const e = (pokedexCredit[`${n}:${f}`] ||= { c: 0, j: [] });
  if (c) e.c = 1;
  if (!e.j.includes(version)) e.j.push(version);
}
/** Espèces nouvelles d'une sauvegarde entre avant et après. */
function nouveautes(avant, apres) {
  const especes = new Set([...apres.pris].filter((n) => !avant?.pris.has(n)));
  const poss = [...apres.poss].filter((x) => !avant?.poss.has(x)).map((x) => x.split(':').map(Number));
  for (const [n] of poss) especes.add(n);
  return { especes, poss };
}

/** Première fois : le contenu actuel compte s'il tient dans le temps joué aux jeux Pokémon dans En Local. */
function creditInitial() {
  pokedexCredit = {};
  const minutes = games.filter(estPokemon).reduce((t, g) => t + (stats[g.path]?.secs || 0), 0) / 60;
  const saves = [...etatSaves(pokedexDonnees).values()];
  const total = new Set(saves.flatMap((s) => [...nouveautes(null, s).especes])).size;
  if (total <= minutes) {
    for (const s of saves) {
      for (const n of s.pris) crediter(n, 0, 0, s.version);
      for (const x of s.poss) { const [n, f, c] = x.split(':').map(Number); crediter(n, f, c, s.version); }
    }
  } else if (total) {
    notifier({ type: 'defi', texte: `Pokédex : ${total} Pokémon déjà dans tes sauvegardes pour ${Math.round(minutes)} min de jeu dans En Local. Ils compteront en les attrapant ici.`, image: 'img/loc/loc_question.gif' });
  }
  garderCredit();
}

/** Avant une partie Pokémon : les sauvegardes telles qu'elles sont. */
async function pokedexAvantPartie(g) {
  // Relance (chasse aux chromatiques) : la lecture du début de partie reste la bonne.
  if (pokedexAvant || !estPokemon(g)) return;
  try {
    const d = JSON.parse(await invoke('pokedex', { relire: true }));
    pokedexAvant = { t: Date.now(), saves: etatSaves(d) };
  } catch {}
}
/** Après la partie : seule la progression faite pendant la partie compte, à un rythme possible. */
function crediterPartie() {
  if (!pokedexAvant || !pokedexCredit) return;
  const minutes = (Date.now() - pokedexAvant.t) / 60000;
  for (const [cle, apres] of etatSaves(pokedexDonnees)) {
    const { especes, poss } = nouveautes(pokedexAvant.saves.get(cle), apres);
    if (!especes.size) continue;
    if (especes.size > RYTHME_MAX(minutes)) {
      notifier({ type: 'defi', texte: `Pokédex : ${especes.size} nouveaux Pokémon en ${Math.max(1, Math.round(minutes))} min dans ${apres.jeu}, c'est trop rapide. Ils ne comptent pas.`, image: 'img/loc/loc_question.gif' });
      continue;
    }
    for (const n of apres.pris) if (especes.has(n)) crediter(n, 0, 0, apres.version);
    for (const [n, f, c] of poss) crediter(n, f, c, apres.version);
  }
  // Jeu relancé entre-temps : la suite se compte à partir d'ici.
  pokedexAvant = current && estPokemon(current) ? { t: Date.now(), saves: etatSaves(pokedexDonnees) } : null;
  garderCredit();
}

/** Pokédex d'En Local : les espèces comptées, avec ce que montrent les sauvegardes (vus, noms des formes). */
function pokedexEspeces() {
  const m = new Map();
  const espece = (n) => m.get(n) || m.set(n, { n, vu: false, pris: false, chroma: false, formes: [], jeux: new Set() }).get(n);
  for (const p of pokedexDonnees?.pokemon || []) if (p.vu) espece(p.n).vu = true;
  for (const [cle, x] of Object.entries(pokedexCredit || {})) {
    const [n, f] = cle.split(':').map(Number);
    const e = espece(n);
    e.vu = e.pris = true;
    if (x.c) e.chroma = true;
    if (f) e.formes.push(pokedexDonnees?.pokemon?.find((p) => p.n === n && p.f === f)?.forme || `forme ${f}`);
    for (const j of x.j) e.jeux.add(j);
  }
  return m;
}
function pokedexChiffres() {
  const m = pokedexEspeces();
  const l = [...m.values()];
  return { pris: l.filter((e) => e.pris).length, vus: l.filter((e) => e.vu).length, chroma: l.filter((e) => e.chroma).length, formes: l.reduce((t, e) => t + e.formes.length, 0), jeux: pokedexDonnees?.jeux?.length || 0 };
}

/** Lit le Pokédex gardé, et relit les sauvegardes si besoin. */
async function chargerPokedex(relire = false) {
  const avant = pokedexDonnees ? pokedexChiffres().pris : null;
  try {
    pokedexDonnees = JSON.parse(await invoke('pokedex', { relire }));
  } catch {
    if (!relire) return chargerPokedex(true);
    return;
  }
  // Pokédex gardé par une version d'avant : relu pour avoir l'identité des sauvegardes.
  if (!relire && pokedexDonnees.jeux?.some((j) => !j.cle)) return chargerPokedex(true);
  if (!pokedexCredit) creditInitial();
  crediterPartie();
  const apres = pokedexChiffres().pris;
  if (avant !== null && apres > avant) notifier({ type: 'defi', texte: `Pokédex : +${apres - avant} Pokémon attrapé${apres - avant > 1 ? 's' : ''} (${apres} sur 1025)`, image: 'img/loc/loc_fete.gif' });
  if (onglet === 'profil' && !profilVu) drawProfil();
}
function pokedexApresPartie(g) {
  if (g && estPokemon(g)) setTimeout(() => chargerPokedex(true), 1500);
}

function blocPokedex(action) {
  if (!pokedexDonnees) return '';
  const c = pokedexChiffres();
  return `<div class="titre-groupe">Pokédex <span>${c.pris} sur 1025</span></div>
    <button class="prof-el pokedex-bloc" data-n="${action(() => ((pokedexOuvert = true), (pokedexJeu = -1), (profFocus = 0), drawProfil()))}">
      <div class="pd-barre"><i style="width:${(c.pris / 1025) * 100}%"></i></div>
      <span><b>${c.pris}</b> attrapés · <b>${c.vus}</b> vus · <b>${c.chroma}</b> chromatiques · <b>${c.formes}</b> formes</span>
      <small>${c.jeux ? `D'après ${c.jeux} sauvegarde${c.jeux > 1 ? 's' : ''} Pokémon` : 'Joue à un jeu Pokémon : chaque Pokémon attrapé arrive ici'} · Ouvrir le Pokédex</small>
    </button>`;
}

const spritesVus = new IntersectionObserver((entrees) => {
  for (const e of entrees) {
    if (!e.isIntersecting) continue;
    spritesVus.unobserve(e.target);
    const img = e.target;
    invoke('sprite', { n: +img.dataset.n, chroma: img.dataset.chroma === '1' }).then((f) => f && (img.src = asset(f))).catch(() => {});
  }
}, { rootMargin: '300px' });

function vuePokedex(action) {
  const especes = pokedexEspeces();
  const noms = pokedexDonnees?.noms || [];
  const c = pokedexChiffres();
  const jeux = pokedexDonnees?.jeux || [];
  const jeu = jeux[pokedexJeu];
  const dansJeu = jeu && { pris: new Set(jeu.pris || []), vus: new Set(jeu.vus || []) };
  const [de, a] = pokedexGen && !jeu ? GENS[pokedexGen - 1] : [1, 1025];
  const ordre = jeu ? ordreJeu(jeu) : Array.from({ length: a - de + 1 }, (_, k) => [de + k, de + k]);
  const filtres = { tous: 'Tous', pris: 'Attrapés', manquants: 'Manquants', chroma: 'Chromatiques' };
  // Les actions suivent l'ordre de l'écran, pour la navigation à la manette.
  const haut = `<div class="prof pokedex">
    <div class="prof-tete">
      <img class="av" src="img/loc/loc_nerd.gif" alt="">
      <div><h1>Pokédex</h1><p>${c.pris} attrapés sur 1025 · ${c.vus} vus · ${c.chroma} chromatiques · ${c.formes} formes</p><p>${c.jeux ? `D'après ${pokedexDonnees.jeux.map((j) => esc(j.jeu)).join(', ')}` : 'Aucune sauvegarde Pokémon lue pour l\'instant'}</p></div>
      <button class="prof-el prof-bouton" data-n="${action(() => (toast('Lecture des sauvegardes…'), chargerPokedex(true).then(() => toast('Pokédex à jour'))))}">Relire les sauvegardes</button>
    </div>
    ${jeux.length ? `<div class="titre-groupe">Tes cartes de dresseur <span>${jeux.length}</span></div><div class="cd-liste">${jeux.map((j, k) => carteDresseur(j, k, action)).join('')}</div>` : ''}
    <div class="titre-groupe">${jeu ? `${esc(jeu.dex)} · ${esc(jeu.jeu)}` : 'Pokédex d\'En Local · tous tes jeux'}</div>
    <div class="pd-filtres">
      ${Object.entries(filtres).map(([k, l]) => `<button class="prof-el pd-filtre${pokedexFiltre === k ? ' on' : ''}" data-n="${action(() => ((pokedexFiltre = k), drawProfil()))}">${l}</button>`).join('')}
      ${jeu ? `<button class="prof-el pd-filtre on" data-n="${action(() => ((pokedexJeu = -1), drawProfil()))}">Revenir au Pokédex d'En Local</button>` : `<button class="prof-el pd-filtre on" data-n="${action(() => ((pokedexGen = (pokedexGen + 1) % 10), drawProfil()))}">${pokedexGen ? `Génération ${pokedexGen}` : 'Toutes les générations'}</button>`}
    </div>`;
  const cases = [];
  for (const [num, n] of ordre) {
    const tout = especes.get(n);
    const e = dansJeu ? (dansJeu.pris.has(n) || dansJeu.vus.has(n) ? { ...tout, pris: dansJeu.pris.has(n), vu: true } : null) : tout;
    if (pokedexFiltre === 'pris' && !e?.pris) continue;
    if (pokedexFiltre === 'manquants' && e?.pris) continue;
    if (pokedexFiltre === 'chroma' && !e?.chroma) continue;
    const etat = e?.pris ? 'pris' : e?.vu ? 'vu' : 'inconnu';
    const nom = e?.vu ? noms[n] || `#${n}` : '???';
    const nomsJeux = (e?.jeux ? [...e.jeux] : []).map((v) => jeux.find((j) => j.version === v)?.jeu || v);
    const detail = e ? `${noms[n] || `#${n}`} : ${e.pris ? 'attrapé' : 'vu'}${e.chroma ? ', chromatique' : ''}${e.formes.length ? ` · formes : ${e.formes.join(', ')}` : ''}${nomsJeux.length ? ` dans ${nomsJeux.length > 1 ? `${nomsJeux.slice(0, -1).join(', ')} et ${nomsJeux.at(-1)}` : nomsJeux[0]}` : ''}` : `#${n} : pas encore vu`;
    cases.push(`<button class="prof-el pd-case ${etat}" data-n="${action(() => toast(detail))}">
      <img data-n="${n}" data-chroma="${e?.chroma ? 1 : 0}" alt="" decoding="async">
      <small>${String(num).padStart(jeu?.regional?.length ? 3 : 4, '0')}</small><b>${esc(nom)}</b>${e?.chroma ? '<i class="pd-chroma">✦</i>' : ''}${e?.formes.length ? `<em>+${e.formes.length}</em>` : ''}
    </button>`);
  }
  return `${haut}
    <div class="pd-grille">${cases.join('') || '<p class="prof-vide">Aucun Pokémon ici pour l\'instant.</p>'}</div>
  </div>`;
}
/** Les sprites se chargent en arrivant à l'écran. */
function spritesPokedex() {
  for (const img of $('#section').querySelectorAll('.pd-case:not(.inconnu) img[data-n]')) spritesVus.observe(img);
  for (const img of $('#section').querySelectorAll('img[data-badge]')) {
    invoke('sprite', { n: +img.dataset.badge, chroma: false, badge: true }).then((f) => f && (img.src = asset(f))).catch(() => {});
  }
}
