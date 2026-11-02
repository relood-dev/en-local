/*
 * Figurines : amiibo (Switch, 3DS) et Skylanders (jeux Skylanders Wii, et Wii U avec notre Cemu). Une section du dock.
 * Sans jeu (ou avec un jeu qui n'en lit pas) : la collection, avec les amiibo qui manquent encore.
 * Pendant un jeu qui en lit : on les pose sur le lecteur (ou le portail), juste après l'accueil.
 * Les fichiers sont ceux du joueur (Médias, Amiibo et Skylanders) ; Loc dit quels amiibo chaque jeu
 * reconnaît. L'amiibo reste « sur le lecteur » jusqu'au suivant ; le portail Skylanders en prend plusieurs.
 */
let fig = null; // { jeu, sorte, sections: [{ titre, poster, items }], focus, dossier, total, possedes }
let figSorte = 'amiibo'; // collection affichée sans jeu (Y change)
let figFiltreSky = ''; // collection de Skylanders : jeu choisi (les figurines qu'il lit), '' pour toutes
let figFiltre = ''; // collection d'amiibo : chemin d'un jeu (les amiibo qu'il lit), « serie:<nom> », ou '' pour tous
let figPosees = { jeu: '', amiibo: [], skylanders: [] }; // vidé à chaque lancement (figurines.rs)
// Wii U : seulement avec notre Cemu, qui pilote le portail (sinon le jeu ne verrait rien).
let cemuPortail = false;
invoke('cemu_portail').then((x) => (cemuPortail = x)).catch(() => {});
const figurinesDe = (g) => (['Switch', '3DS'].includes(g?.console) && g.title_id ? 'amiibo' : (g?.console === 'Wii' || (g?.console === 'WiiU' && cemuPortail)) && /skylanders/i.test(g.name) ? 'skylanders' : '');

// Un jeu Skylanders lit les figurines de sa série et des précédentes.
const SKY_ORDRE = [/spyro/i, /giants/i, /swap/i, /trap/i, /super ?chargers/i, /imaginators/i];
const rangSky = (nom) => SKY_ORDRE.findIndex((r) => r.test(nom));
/** Jeu en cours qui lit des figurines : on pose. Sinon : la collection. */
const figEnJeu = () => Boolean(current && figurinesDe(current));
const sorteVue = () => (figEnJeu() ? figurinesDe(current) : figSorte);

/** La collection : tous les amiibo sortis (ceux du joueur d'abord dans chaque série), ou ses Skylanders. */
async function chargerCollection(sorte) {
  const [mes, cat] = await Promise.all([invoke('figurines', { sorte }), sorte === 'amiibo' ? invoke('amiibo_catalogue').catch(() => []) : []]);
  let sections, total, possedes = mes.figurines.length;
  if (sorte === 'amiibo') ({ sections, total, possedes } = collectionAmiibo(mes, cat));
  else ({ sections, total, possedes } = collectionSky(mes));
  if (figEnJeu() || figSorte !== sorte) return;
  fig = { jeu: '', sorte, sections, focus: fig?.jeu === '' && fig.sorte === sorte ? fig.focus : 0, dossier: mes.dossier, total, possedes, mes, cat };
  if (onglet === 'figurines') drawFigurines();
  if (sorte === 'skylanders') imagesSkylanders();
}

async function chargerFigurines(sorte) {
  const jeu = current;
  if (figPosees.jeu !== jeu.path) figPosees = { jeu: jeu.path, amiibo: [], skylanders: [] };
  const [mes, compat] = await Promise.all([
    invoke('figurines', { sorte }),
    sorte === 'amiibo' ? api('GET', `/amiibo/${jeu.title_id}`).catch(() => []) : [],
  ]);
  let sections;
  if (sorte === 'amiibo') {
    const fichier = new Map(mes.figurines.map((f) => [f.id, f]));
    const items = compat.map((a) => ({ ...a, chemin: fichier.get(a.id)?.chemin }));
    // Amiibo du joueur absents de la base : proposés quand même.
    const connus = new Set(compat.map((a) => a.id));
    // Le jeu a une liste d'amiibo connue : les autres, il ne les lira pas (rien ne se passera).
    const autres = mes.figurines.filter((f) => !connus.has(f.id)).map((f) => ({ ...f, image: imageAmiibo(f.id), usage: '', pasLu: compat.length > 0 }));
    items.sort((a, b) => !a.chemin - !b.chemin || a.nom.localeCompare(b.nom));
    sections = [
      { titre: compat.length ? `Reconnus par ${fiche(jeu)?.title || jeu.name}` : '', items },
      { titre: compat.length ? 'Tes autres amiibo' : 'Tes amiibo', items: autres },
    ].filter((s) => s.items.length);
  } else {
    const rang = rangSky(jeu.name);
    const parJeu = new Map();
    for (const f of mes.figurines) if (rang < 0 || rangSky(f.jeu) <= rang) parJeu.set(f.jeu, [...(parJeu.get(f.jeu) || []), f]);
    sections = [...parJeu].sort(([a], [b]) => rangSky(a) - rangSky(b)).map(([nom, items]) => ({ titre: nom || 'Skylanders', poster: mes.posters[nom], items }));
  }
  // Le jeu a pu changer pendant le chargement.
  if (current !== jeu) return;
  fig = { jeu: jeu.path, sorte, sections, focus: fig?.jeu === jeu.path ? fig.focus : 0, dossier: mes.dossier };
  if (onglet === 'figurines') drawFigurines();
  if (sorte === 'skylanders') imagesSkylanders();
}

const toutesFigurines = () => fig.sections.flatMap((s) => s.items);
// Image d'un amiibo sans fiche chez Loc : celle de la base AmiiboAPI, d'après son identifiant.
// Pack d'images des Skylanders : téléchargé une fois (12 Mo), puis la collection se relit avec.
let packSky = null;
function imagesSkylanders() {
  packSky ||= invoke('skylanders_images').then((arrive) => arrive && fig?.sorte === 'skylanders' && ((fig = null), onglet === 'figurines' && drawFigurines())).catch(() => {});
}
const imageAmiibo = (id) => (/^[0-9a-f]{16}$/.test(id || '') ? `https://raw.githubusercontent.com/N3evin/AmiiboAPI/master/images/icon_${id.slice(0, 8)}-${id.slice(8)}.png` : '');
/*
 * Coffres d'Imaginators et packs d'aventure : absents du pack d'images, dessinés ici.
 * Coffre : couleur de son métal (bronze, argent, or, bleu) ; pack d'aventure : une carte au trésor.
 */
const METAUX = { bronze: ['#e3a46b', '#9a5a2a'], silver: ['#eef1f5', '#8d96a3'], gold: ['#ffd85a', '#c08a12'], blue: ['#8fd3ff', '#2c6fcf'] };
function dessinSkylander(x) {
  const m = /\b(bronze|silver|gold|blue)\s+chest/i.exec(x.nom)?.[1]?.toLowerCase();
  const id = `c${Math.random().toString(36).slice(2, 7)}`;
  if (m) {
    const [clair, fonce] = METAUX[m];
    return `<svg class="fig-dessin" viewBox="0 0 96 96" aria-hidden="true">
      <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${clair}"/><stop offset="1" stop-color="${fonce}"/></linearGradient></defs>
      <ellipse cx="48" cy="84" rx="30" ry="5" fill="rgba(0,0,0,.18)"/>
      <path d="M18 44h60v32a6 6 0 0 1-6 6H24a6 6 0 0 1-6-6Z" fill="url(#${id})"/>
      <path d="M18 44a30 22 0 0 1 60 0Z" fill="url(#${id})"/>
      <path d="M18 44h60M18 58h60" stroke="${fonce}" stroke-width="3"/>
      <path d="M34 25v57M62 25v57" stroke="#5a3a1c" stroke-opacity=".35" stroke-width="5"/>
      <rect x="41" y="50" width="14" height="16" rx="3" fill="${fonce}"/><circle cx="48" cy="57" r="3" fill="${clair}"/>
      <path d="M26 32q10-8 22-9" stroke="#fff" stroke-opacity=".55" stroke-width="3" fill="none" stroke-linecap="round"/>
    </svg>`;
  }
  return `<svg class="fig-dessin" viewBox="0 0 96 96" aria-hidden="true">
    <ellipse cx="48" cy="84" rx="30" ry="5" fill="rgba(0,0,0,.18)"/>
    <path d="M14 26l22-8 24 8 22-8v54l-22 8-24-8-22 8Z" fill="#f3e2b8" stroke="#a8814a" stroke-width="3" stroke-linejoin="round"/>
    <path d="M36 18v54M60 26v54" stroke="#a8814a" stroke-width="2.5" stroke-opacity=".6"/>
    <path d="M22 60q10-14 22-6t26-16" stroke="#c2452f" stroke-width="3" stroke-dasharray="4 5" fill="none" stroke-linecap="round"/>
    <path d="M66 32l8 8m0-8l-8 8" stroke="#c2452f" stroke-width="3.5" stroke-linecap="round"/>
  </svg>`;
}
// Image en ligne (amiibo), fichier du joueur ou pack d'images (Skylanders), sinon un dessin (coffres, packs d'aventure).
const visuelFigurine = (x) => (x.image ? `<img src="${esc(/^https:/.test(x.image) ? x.image : asset(x.image))}" alt="" loading="lazy">` : /chest\b/i.test(x.nom) || /adventure packs/i.test(x.element || '') ? dessinSkylander(x) : x.symbole ? `<img src="${asset(x.symbole)}" alt="" class="fig-sym">` : `<span class="fig-vide">${esc(x.nom.slice(0, 1))}</span>`);

function drawFigurines() {
  const enJeu = figEnJeu(), sorte = sorteVue();
  if (!fig || fig.jeu !== (enJeu ? current.path : '') || fig.sorte !== sorte) {
    fig = null;
    $('#section').html = `<div class="fig"><div class="fig-cote"><h1>${enJeu ? (sorte === 'amiibo' ? 'Amiibo' : 'Skylanders') : 'Figurines'}</h1><p>Un instant…</p></div></div>`;
    enJeu ? chargerFigurines(sorte) : chargerCollection(sorte);
    return;
  }
  if (!enJeu) return drawCollection();
  const amiibo = sorte === 'amiibo';
  const posees = figPosees[sorte];
  const tout = toutesFigurines();
  let n = 0;
  const tuile = (x) => {
    const pose = x.chemin && posees.includes(x.chemin);
    return `<button class="fig-el${x.chemin ? '' : ' manquant'}${x.pasLu ? ' pas-lu' : ''}${pose ? ' pose' : ''}" data-n="${n++}">
      ${visuelFigurine(x)}<b>${esc(x.nom)}</b><small>${pose ? (amiibo ? 'Sur le lecteur' : 'Sur le portail') : x.pasLu ? 'Pas lu par ce jeu' : x.chemin ? esc(amiibo ? x.serie || '' : x.element || '') : 'Fichier manquant'}</small></button>`;
  };
  const grille = fig.sections.length
    ? fig.sections.map((s) => `<section class="fig-section">${s.poster ? `<img class="fig-poster" src="${asset(s.poster)}" alt="">` : ''}${s.titre ? `<h3>${esc(s.titre)}</h3>` : ''}<div class="fig-grille">${s.items.map(tuile).join('')}</div></section>`).join('')
    : `<div class="fig-rien"><img src="img/loc/loc_cherche.gif" alt=""><p>${amiibo ? 'Aucun amiibo pour ce jeu. Mets les copies .bin de tes figurines dans Médias, Amiibo.' : 'Aucun Skylander. Mets tes fichiers .sky dans Médias, Skylanders (un dossier par jeu, avec poster.jpg si tu veux).'}</p><span>${glyphs.x}Ouvrir le dossier</span></div>`;
  // Ce qui est sur le lecteur (ou le portail), en grand.
  const surLe = posees.map((c) => tout.find((x) => x.chemin === c)).filter(Boolean);
  const plateau = surLe.length
    ? `<div class="fig-plateau${surLe.length > 1 ? ' plusieurs' : ''}">${surLe.map((x) => `<div class="fig-pose">${visuelFigurine(x)}<b>${esc(x.nom)}</b></div>`).join('')}</div>`
    : `<div class="fig-plateau vide"><i></i><span>${amiibo ? 'Lecteur vide' : 'Portail vide'}</span></div>`;
  // La sélection ne reconstruit rien (voir focusFigurine) : la grille garde son défilement.
  const avant = $('#section .fig-corps')?.scrollTop || 0;
  $('#section').html = `<div class="fig">
    <div class="fig-cote">
      <h1>${amiibo ? 'Amiibo' : 'Skylanders'}</h1>
      <p>${esc(fiche(current)?.title || current.name)}</p>
      ${plateau}
      <p class="fig-aide">${amiibo ? 'Pose un amiibo, puis va dans le jeu là où il en demande un (Smash : Jeux et données, amiibo). Rien ne se passe avant : comme une vraie figurine posée sur le lecteur.' : `Pose et retire tes figurines, le jeu les voit tout de suite. Sur le portail : ${posees.length}.`}</p>
      <p class="fig-usage" hidden></p>
    </div>
    <div class="fig-corps">${grille}</div>
  </div>`;
  const corps = $('#section .fig-corps');
  if (corps.scrollTop !== avant && !corps._cible) corps.scrollTop = avant;
  $('#section').querySelectorAll('.fig-el').forEach((b) => (b.onclick = () => ((fig.focus = +b.dataset.n), choisirFigurine())));
  $('#titre').textContent = amiibo ? 'Amiibo' : 'Skylanders';
  focusFigurine();
}
/** Jeux de la bibliothèque qui lisent des amiibo, d'après le catalogue : [jeu, nombre d'amiibo]. */
function jeuxAmiibo(cat) {
  const ids = (g) => [g.title_id].filter(Boolean).map((t) => t.toUpperCase());
  return games.filter((g) => ['Switch', '3DS', 'WiiU'].includes(g.console))
    .map((g) => [g, cat.filter((a) => ids(g).some((t) => a.jeux?.[t] !== undefined)).length])
    .filter(([, n]) => n)
    .sort(([a], [b]) => (fiche(a)?.title || a.name).localeCompare(fiche(b)?.title || b.name));
}
/**
 * Skylanders par jeu ; avec un jeu choisi (figFiltreSky), ceux qu'il lit : les siens et ceux des jeux
 * d'avant (un jeu hors de la série connue : les siens seulement).
 */
function collectionSky(mes) {
  const rang = rangSky(figFiltreSky);
  const lit = (jeu) => !figFiltreSky || jeu === figFiltreSky || (rang >= 0 && rangSky(jeu) >= 0 && rangSky(jeu) <= rang);
  const parJeu = new Map();
  for (const f of mes.figurines) if (lit(f.jeu)) parJeu.set(f.jeu, [...(parJeu.get(f.jeu) || []), f]);
  const sections = [...parJeu].sort(([a], [b]) => rangSky(a) - rangSky(b)).map(([nom, items]) => ({ titre: `${nom || 'Skylanders'} · ${items.length}`, poster: mes.posters[nom], items }));
  const n = sections.reduce((t, s) => t + s.items.length, 0);
  return { sections, total: n, possedes: n };
}
/** Amiibo par série ; avec un jeu choisi (figFiltre), seulement ceux qu'il lit, avec ce qu'ils y font. */
function collectionAmiibo(mes, cat) {
  const g = figFiltre && games.find((x) => x.path === figFiltre);
  const tid = g?.title_id?.toUpperCase();
  const serieVoulue = figFiltre.startsWith('serie:') ? figFiltre.slice(6) : '';
  const fichier = new Map(mes.figurines.map((f) => [f.id, f]));
  const vus = new Set(), parSerie = new Map();
  for (const a of cat) {
    if (vus.has(a.id) || (tid && a.jeux?.[tid] === undefined) || (serieVoulue && (a.serie || 'Autres') !== serieVoulue)) continue;
    vus.add(a.id);
    const serie = a.serie || 'Autres';
    parSerie.set(serie, [...(parSerie.get(serie) || []), { ...a, chemin: fichier.get(a.id)?.chemin, usage: tid ? a.jeux[tid] : '' }]);
  }
  // Les siens absents du catalogue (hors ligne, amiibo récent) : dans « Autres », sans filtre seulement.
  if (!tid && (!serieVoulue || serieVoulue === 'Autres')) for (const f of mes.figurines) if (!vus.has(f.id)) (vus.add(f.id), parSerie.set('Autres', [...(parSerie.get('Autres') || []), { ...f, image: imageAmiibo(f.id) }]));
  const sections = [...parSerie].map(([titre, items]) => ({ titre, items: items.sort((a, b) => !a.chemin - !b.chemin || a.nom.localeCompare(b.nom)), possedes: items.filter((x) => x.chemin).length }))
    .sort((a, b) => b.possedes - a.possedes || a.titre.localeCompare(b.titre))
    .map((s) => ({ ...s, titre: `${s.titre} · ${s.possedes}/${s.items.length}` }));
  return { sections, total: vus.size, possedes: sections.reduce((n, s) => n + s.possedes, 0) };
}
/**
 * Filtre : tous les amiibo, ceux qu'un jeu de la bibliothèque lit (avec ce qu'ils y débloquent),
 * ou ceux d'une série (Pokémon, Zelda… comme les dossiers d'une collection).
 */
function choisirFiltre() {
  if (!fig) return;
  if (fig.sorte === 'skylanders') {
    // Les jeux de la collection, du premier au dernier ; chacun lit les figurines des précédents.
    const jeux = [...new Set(fig.mes.figurines.map((f) => f.jeu))].filter(Boolean).sort((a, b) => rangSky(a) - rangSky(b));
    const avant = figFiltreSky;
    const compte = (j) => ((figFiltreSky = j), collectionSky(fig.mes).total);
    const lignes = jeux.map((j) => ({ label: `${j} · ${compte(j)} figurines`, fn: () => filtrer(j) }));
    figFiltreSky = avant;
    return sheet('Skylanders de quel jeu ?', 'Ceux que ce jeu lit : les siens et ceux des jeux d\'avant.', [
      { label: 'Tous les Skylanders', fn: () => filtrer('') },
      ...lignes,
      { label: 'Annuler', cancel: true },
    ]);
  }
  if (!fig.cat?.length) return;
  const nom = (g) => titreDe(g);
  const possedes = new Set(fig.mes.figurines.map((f) => f.id));
  const series = new Map();
  for (const a of new Map(fig.cat.map((a) => [a.id, a])).values()) {
    const s = series.get(a.serie || 'Autres') || [0, 0];
    series.set(a.serie || 'Autres', [s[0] + possedes.has(a.id), s[1] + 1]);
  }
  sheet('Quels amiibo ?', 'Ceux qu\'un de tes jeux lit, avec ce qu\'ils y débloquent, ou ceux d\'une série.', [
    { label: 'Tous les amiibo', fn: () => filtrer('') },
    ...jeuxAmiibo(fig.cat).map(([g, n]) => ({ label: `${nom(g)} · ${n} amiibo`, fn: () => filtrer(g.path) })),
    ...[...series].sort(([a], [b]) => a.localeCompare(b)).map(([s, [n, t]]) => ({ label: `Série ${s} · ${n}/${t}`, fn: () => filtrer(`serie:${s}`) })),
    { label: 'Annuler', cancel: true },
  ]);
}
function filtrer(choix) {
  if (fig.sorte === 'skylanders') (figFiltreSky = choix), Object.assign(fig, collectionSky(fig.mes), { focus: 0 });
  else (figFiltre = choix), Object.assign(fig, collectionAmiibo(fig.mes, fig.cat), { focus: 0 });
  $('#section').html = ''; // la grille repart d'en haut
  drawFigurines();
}

/** Collection : ce qu'on a, ce qui manque (grisé), par série. */
function drawCollection() {
  const amiibo = fig.sorte === 'amiibo';
  let n = 0;
  const tuile = (x) => `<button class="fig-el${x.chemin ? '' : ' manquant'}" data-n="${n++}">${visuelFigurine(x)}<b>${esc(x.nom)}</b><small>${x.chemin ? esc(amiibo ? { Figure: 'Figurine', Card: 'Carte', Yarn: 'En laine', Band: 'Bracelet' }[x.sorte] || x.sorte || '' : x.element || '') : 'Pas encore'}</small></button>`;
  const grille = fig.sections.length
    ? fig.sections.map((s) => `<section class="fig-section">${s.poster ? `<img class="fig-poster" src="${asset(s.poster)}" alt="">` : ''}<h3>${esc(s.titre)}</h3><div class="fig-grille">${s.items.map(tuile).join('')}</div></section>`).join('')
    : `<div class="fig-rien"><img src="img/loc/loc_cherche.gif" alt=""><p>${amiibo ? 'La liste des amiibo n\'a pas pu être téléchargée. Mets les copies .bin de tes figurines dans Médias, Amiibo.' : 'Aucun Skylander. Mets tes fichiers .sky dans Médias, Skylanders (un dossier par jeu, avec poster.jpg si tu veux), ou dépose une archive sur En Local.'}</p><span>${glyphs.x}Ouvrir le dossier</span></div>`;
  const part = amiibo && fig.total ? Math.round((fig.possedes / fig.total) * 100) : 0;
  const filtre = figFiltre && games.find((x) => x.path === figFiltre);
  const choix = ['amiibo', 'skylanders'].map((s) => `<button class="fig-sorte${s === fig.sorte ? ' ici' : ''}" data-s="${s}">${s === 'amiibo' ? 'Amiibo' : 'Skylanders'}</button>`).join('');
  const avant = $('#section .fig-corps')?.scrollTop || 0;
  $('#section').html = `<div class="fig">
    <div class="fig-cote">
      <h1>Figurines</h1>
      <div class="fig-sortes">${choix}</div>
      ${amiibo && fig.cat.length ? `<button class="fig-filtre${figFiltre ? ' actif' : ''}">${glyphs.minus}<span>${filtre ? esc(fiche(filtre)?.title || filtre.name) : figFiltre ? esc(figFiltre.slice(6)) : 'Tous les amiibo'}</span></button>` : ''}
      ${!amiibo && fig.mes.figurines.length ? `<button class="fig-filtre${figFiltreSky ? ' actif' : ''}">${glyphs.minus}<span>${esc(figFiltreSky || 'Tous les Skylanders')}</span></button>` : ''}
      <div class="fig-compte"><b>${fig.possedes}</b><span>${amiibo ? `sur ${fig.total} amiibo` : `Skylander${fig.possedes > 1 ? 's' : ''}`}</span>${amiibo ? `<i style="--p:${part}%"></i>` : ''}</div>
      <p class="fig-aide">${amiibo ? 'Grisés : ceux qui te manquent. Pendant un jeu qui lit les amiibo, pose-les depuis le menu HOME (R1).' : 'Pendant un jeu Skylanders, pose-les sur le portail depuis le menu HOME (R1).'} Dépose une archive sur En Local pour en ajouter.</p>
      <p class="fig-usage" hidden></p>
    </div>
    <div class="fig-corps">${grille}</div>
  </div>`;
  const corps = $('#section .fig-corps');
  if (corps.scrollTop !== avant && !corps._cible) corps.scrollTop = avant;
  $('#section').querySelectorAll('.fig-el').forEach((b) => (b.onclick = () => ((fig.focus = +b.dataset.n), choisirFigurine())));
  $('#section').querySelectorAll('.fig-sorte').forEach((b) => (b.onclick = () => changerSorte(b.dataset.s)));
  $('#section .fig-filtre')?.addEventListener('click', choisirFiltre);
  $('#titre').textContent = 'Figurines';
  focusFigurine();
}
function changerSorte(s = figSorte === 'amiibo' ? 'skylanders' : 'amiibo') {
  if (s === figSorte) return;
  figSorte = s;
  drawFigurines();
}

/** Sélection : la tuile s'allume et la grille glisse jusqu'à elle, sans rien redessiner. */
function focusFigurine() {
  const els = [...$('#section').querySelectorAll('.fig-el')];
  fig.focus = Math.max(0, Math.min(fig.focus, els.length - 1));
  els.forEach((b) => b.classList.toggle('focus', +b.dataset.n === fig.focus));
  montrer($('#section .fig-corps'), els[fig.focus], 24);
  const x = toutesFigurines()[fig.focus], u = $('#section .fig-usage');
  const texte = x?.usage ? esc(x.usage) : x?.pasLu ? `${esc(fiche(current)?.title || current.name)} ne lit pas cet amiibo : rien ne se passera.` : !fig.jeu && x ? esc(x.serie || x.jeu || '') : '';
  if (u) (u.hidden = !texte), (u.innerHTML = texte ? `<b>${esc(x.nom)}</b> ${texte}` : '');
  aideFigurines();
}
function aideFigurines() {
  if (!fig) return;
  if (!fig.jeu) {
    $('#aide-g').innerHTML = `<div>${glyphs.b}Accueil</div><div>${glyphs.x}Ouvrir le dossier</div><div>${glyphs.y}${fig.sorte === 'amiibo' ? 'Skylanders' : 'Amiibo'}</div>${(fig.sorte === 'amiibo' ? fig.cat?.length : fig.mes?.figurines.length) ? `<div>${glyphs.minus}Filtrer</div>` : ''}`;
    $('#aide-d').innerHTML = '';
    return;
  }
  const posees = figPosees[fig.sorte].length;
  $('#aide-g').innerHTML = `<div>${glyphs.b}Accueil</div><div>${glyphs.x}Ouvrir le dossier</div>${posees ? `<div>${glyphs.y}Tout retirer</div>` : ''}`;
  $('#aide-d').innerHTML = toutesFigurines().length ? `<div>${glyphs.a}${fig.sorte === 'amiibo' ? 'Poser' : 'Poser ou retirer'}</div>` : '';
}

async function poserFigurines(liste) {
  try {
    await invoke('figurines_poser', { sorte: fig.sorte, chemins: liste });
  } catch (e) {
    toast(`Impossible : ${e}`);
    return false;
  }
  figPosees[fig.sorte] = liste;
  return true;
}
async function choisirFigurine() {
  const x = toutesFigurines()[fig.focus];
  if (!x) return;
  const amiibo = fig.sorte === 'amiibo';
  if (!fig.jeu) return toast(x.chemin ? 'Pose-le pendant un jeu qui le lit : menu HOME, puis R1.' : `Tu ne l'as pas encore : mets sa copie ${amiibo ? '.bin' : '.sky'} dans Médias, ${amiibo ? 'Amiibo' : 'Skylanders'}.`);
  if (!x.chemin) return toast(`Fichier manquant : mets la copie ${amiibo ? '.bin' : '.sky'} de ${x.nom} dans Médias, ${amiibo ? 'Amiibo' : 'Skylanders'}.`);
  const posees = figPosees[fig.sorte];
  const deja = posees.includes(x.chemin);
  if (!(await poserFigurines(amiibo ? (deja ? [] : [x.chemin]) : deja ? posees.filter((c) => c !== x.chemin) : [...posees, x.chemin]))) return;
  if (!deja) compter('figurines');
  son(deja ? 'fermer' : 'ok', true);
  drawFigurines();
  if (!amiibo) return;
  toast(deja ? `${x.nom} retiré du lecteur` : x.pasLu ? `${x.nom} posé, mais ce jeu ne le lit pas` : `${x.nom} posé : le jeu le lira dès qu'il demandera un amiibo`);
  if (!deja) closeMenu(); // retour au jeu, qui le lira
}

function navFigurines(k) {
  if (!fig) return k === 'b' && allerA('accueil');
  if (k === 'b') return allerA('accueil');
  if (k === 'x') return invoke('ouvrir_medias', { sorte: fig.sorte });
  if (k === 'y' && !fig.jeu) return changerSorte();
  if (k === 'minus' && !fig.jeu) return choisirFiltre();
  if (k === 'y' && figPosees[fig.sorte].length) return poserFigurines([]).then((ok) => ok && (son('fermer', true), toast('Tout est retiré'), drawFigurines()));
  if (k === 'a') return choisirFigurine();
  if (!['up', 'down', 'left', 'right'].includes(k)) return;
  const els = [...$('#section').querySelectorAll('.fig-el')];
  const i = voisin(els, els.findIndex((x) => +x.dataset.n === fig.focus), k);
  if (i >= 0) (fig.focus = +els[i].dataset.n), focusFigurine();
}
