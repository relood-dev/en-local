/*
 * Recherche globale : jeux, collections, sessions, membres et consoles.
 * Les accents ne comptent pas.
 */
let recherche = '';
let chercheFocus = 0;
let rechercheChargee = false;
let chercheEls = []; // action de ✕ pour chaque élément
const TOUCHES = ['1234567890', 'azertyuiop', 'qsdfghjklm', 'wxcvbn\'-.'];

const plat = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
/** 0 : commence par, 1 : un mot commence par, 2 : contient, -1 : absent. */
function rang(texte, q) {
  const t = plat(texte);
  if (t.startsWith(q)) return 0;
  if (t.split(/[\s:'-]+/).some((m) => m.startsWith(q))) return 1;
  return t.includes(q) ? 2 : -1;
}
function trouver(liste, nom, q, n) {
  return liste.map((x) => ({ x, r: Math.min(...[].concat(nom(x)).map((t) => { const r = rang(t, q); return r < 0 ? 9 : r; })) }))
    .filter((y) => y.r < 9).sort((a, b) => a.r - b.r).slice(0, n).map((y) => y.x);
}

/** Résultats groupés : [titre, [{ html, fn }]]. */
function resultats() {
  const q = plat(recherche.trim());
  const ligneJeu = ({ g, i }) => ({ html: `<div class="icone micro">${iconeHtml(g, true)}</div><span><b>${esc(titreDe(g))}</b><small>${LONG[g.console]}</small></span>`, fn: () => voirJeu(i) });
  const tous = games.map((g, i) => ({ g, i }));
  if (!q) {
    const recents = tous.filter((x) => stats[x.g.path]?.last).sort((a, b) => stats[b.g.path].last - stats[a.g.path].last).slice(0, 6);
    return recents.length ? [['Joués récemment', recents.map(ligneJeu)]] : [];
  }
  const groupes = [
    ['Jeux', trouver(tous, (x) => [titreDe(x.g), x.g.name], q, 8).map(ligneJeu)],
    ['Chez les membres', chezLesMembres(q)],
    ['Collections', trouver(collections, (c) => c.nom, q, 4).map((c) => ({ html: `<span class="r-ic">${icone(DOCK.collections)}</span><span><b>${esc(c.nom)}</b><small>${indicesDe(c).length} jeu${indicesDe(c).length > 1 ? 'x' : ''}</small></span>`, fn: () => allerA('collections').then(() => ouvrirCollection(c.id)) }))],
    ['Sessions', trouver(autres(), (s) => [s.game, s.host?.name, s.code], q, 4).map((s) => ({ html: `<img class="av" src="${esc(s.host?.avatar || 'img/hang-coucou.png')}" alt=""><span><b>${esc(s.game)}</b><small>${esc(s.host?.name || '')} · ${+s.players || 0}/${+s.slots || 0} · ${esc(s.code)}</small></span><span class="tag live">Rejoindre</span>`, fn: () => join(s.code) }))],
    ['Membres', trouver(membres.filter((m) => !m.me), (m) => m.name, q, 4).map((m) => ({ html: `${avatar(m)}<span><b>${esc(m.name)}</b><small>${esc(ligneDe(m))}</small></span>`, fn: () => activerPanneau({ dataset: { m: m.id } }) }))],
    ['Consoles', trouver(ORDRE.filter((c) => games.some((g) => g.console === c)), (c) => [LONG[c], NOMS[c]], q, 3).map((c) => ({ html: `<span class="r-ic">${iconeConsole(c)}</span><span><b>${LONG[c]}</b><small>${jeuxDe(c).length} jeu${jeuxDe(c).length > 1 ? 'x' : ''}</small></span>`, fn: () => voirConsole(c) }))],
  ];
  return groupes.filter(([, l]) => l.length);
}

/** Jeux des autres membres, un par titre et console. */
function chezLesMembres(q) {
  const parJeu = new Map();
  for (const id of Object.keys(biblios)) {
    const m = membres.find((x) => x.id === id);
    if (!m) continue;
    for (const j of jeuxDuMembre(id)) {
      const cle = `${plat(j.t)}|${j.c}`;
      if (!parJeu.has(cle)) parJeu.set(cle, { t: j.t, c: j.c, qui: [] });
      if (!parJeu.get(cle).qui.some((x) => x.m === m)) parJeu.get(cle).qui.push({ m, j });
    }
  }
  return trouver([...parJeu.values()], (j) => j.t, q, 6).map((j) => ({
    html: `<div class="stack">${j.qui.slice(0, 3).map(({ m }) => `<img class="av" src="${esc(m.avatar)}" alt="">`).join('')}</div><span><b>${esc(j.t)}</b><small>${esc(LONG[j.c] || j.c)} · ${esc(j.qui.map(({ m }) => m.name).join(', '))}</small></span>`,
    fn: () => {
      const mien = games.findIndex((g) => g.console === j.c && plat(titreDe(g)) === plat(j.t));
      sheet(j.t, `${j.qui.length > 1 ? 'Ces membres l\'ont' : 'Ce membre l\'a'} dans En Local.`, [
        ...j.qui.map(({ m, j: x }) => ({ label: `${m.name}${texteContenus(x) ? ` · ${texteContenus(x)}` : ''}${m.app === 'en-ligne' ? ' · sur En Local' : ''}`, fn: () => activerPanneau({ dataset: { m: m.id } }) })),
        ...(mien >= 0 ? [{ label: 'Voir dans ma bibliothèque', fn: () => voirJeu(mien) }] : []),
        { label: 'Fermer', cancel: true },
      ]);
    },
  }));
}

async function voirConsole(c) {
  conSel = c;
  await allerA('jeux');
  zone = 'jeux';
  drawJeux();
}

function drawRecherche() {
  if (!rechercheChargee && me) {
    rechercheChargee = true;
    chargerBiblios().then(() => onglet === 'recherche' && recherche.trim() && drawRecherche());
  }
  const groupes = resultats();
  const touches = TOUCHES.map((r) => [...r]);
  chercheEls = [...touches.flat().map((t) => () => taper(t)), () => taper(' '), effacer, () => ((recherche = ''), drawRecherche())];
  let n = 0;
  const cle = (html, cls = '') => `<button class="r-el touche ${cls}" data-n="${n++}">${html}</button>`;
  const clavier = touches.map((r) => `<div class="rang">${r.map((t) => cle(esc(t))).join('')}</div>`).join('')
    + `<div class="rang">${cle('Espace', 'large')}${cle(`${icone('<path d="M20 6H9l-6 6 6 6h11zM12 9l6 6M18 9l-6 6"/>')}`, 'moyen')}${cle('Tout effacer', 'moyen')}</div>`;
  const droite = groupes.map(([titre, lignes]) => `<div class="r-groupe"><div class="titre-groupe">${titre}</div>${lignes.map((l) => {
    chercheEls.push(l.fn);
    return `<button class="r-el r-ligne" data-n="${n++}">${l.html}</button>`;
  }).join('')}</div>`).join('');
  const vide = recherche.trim()
    ? `<div class="r-vide"><img src="img/loc/loc_question.gif" alt=""><p>Rien pour « ${esc(recherche.trim())} ».<br>Essaie un autre nom, ou une partie seulement.</p></div>`
    : '<div class="r-vide"><img src="img/loc/loc_cherche.gif" alt=""><p>Un jeu (les tiens et ceux des membres), une collection, un membre, une session, une console : tape quelques lettres.</p></div>';
  $('#section').innerHTML = `<div class="r">
    <div class="r-gauche"><h1>Recherche</h1>
      <label class="r-champ">${icone(DOCK.recherche)}<input id="cherche" placeholder="Jeux, membres, sessions…" spellcheck="false" autocomplete="off" value="${esc(recherche)}"></label>
      <div class="clavier">${clavier}</div></div>
    <div class="r-droite">${droite || vide}</div></div>`;
  $('#section').querySelectorAll('.r-el').forEach((b) => (b.onclick = () => ((chercheFocus = +b.dataset.n), chercheEls[chercheFocus]())));
  const input = $('#cherche');
  input.oninput = () => {
    recherche = input.value;
    chercheFocus = TOUCHES.join('').length + 3; // au clavier, Entrée ouvre le premier résultat
    drawRecherche();
    const i = $('#cherche');
    i.focus();
    i.setSelectionRange(recherche.length, recherche.length);
  };
  $('#titre').textContent = 'Recherche';
  focusRecherche(chercheFocus);
}

function focusRecherche(n) {
  const els = [...$('#section').querySelectorAll('.r-el')];
  chercheFocus = Math.max(0, Math.min(n, els.length - 1));
  els.forEach((el, k) => el.classList.toggle('focus', k === chercheFocus));
  if (els[chercheFocus]?.classList.contains('r-ligne')) montrer($('#section .r-droite'), els[chercheFocus]);
  const ligne = els[chercheFocus]?.classList.contains('r-ligne');
  $('#aide-g').innerHTML = `<div>${glyphs.b}Accueil</div><div>${glyphs.y}Effacer</div>`;
  $('#aide-d').innerHTML = `<div>${glyphs.a}${ligne ? 'Ouvrir' : 'Taper'}</div>`;
}

function taper(t) {
  recherche = (recherche + t).slice(0, 40);
  drawRecherche();
}
function effacer() {
  recherche = recherche.slice(0, -1);
  drawRecherche();
}

function navRecherche(k) {
  const els = [...$('#section').querySelectorAll('.r-el')];
  if (['up', 'down', 'left', 'right'].includes(k)) {
    if (document.activeElement?.id === 'cherche') document.activeElement.blur();
    const n = voisin(els, chercheFocus, k);
    if (n >= 0) focusRecherche(n);
    return;
  }
  // Entrée ouvre un résultat au lieu d'écrire une touche.
  if (k === 'a' && document.activeElement?.id === 'cherche' && !els[chercheFocus]?.classList.contains('r-ligne')) return;
  if (k === 'a') return chercheEls[chercheFocus]?.();
  if (k === 'y') return effacer();
  if (k === 'b') allerA('accueil');
}
