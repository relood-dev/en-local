/*
 * Figurines, depuis le menu HOME : amiibo (Switch, 3DS) et Skylanders (jeux Skylanders Wii).
 * Les fichiers sont ceux du joueur (Médias, Amiibo et Skylanders) ; Loc dit quels amiibo chaque jeu
 * reconnaît. L'amiibo reste « sur le lecteur » jusqu'au suivant ; le portail Skylanders en prend plusieurs.
 */
let fig = null; // { sorte, sections: [{ titre, poster, items }], focus }
let figPosees = { jeu: '', amiibo: [], skylanders: [] }; // vidé à chaque lancement (figurines.rs)
const figurinesOuvertes = () => Boolean(fig);
const figurinesDe = (g) => (['Switch', '3DS'].includes(g?.console) && g.title_id ? 'amiibo' : g?.console === 'Wii' && /skylanders/i.test(g.name) ? 'skylanders' : '');

// Un jeu Skylanders lit les figurines de sa série et des précédentes.
const SKY_ORDRE = [/spyro/i, /giants/i, /swap/i, /trap/i, /super ?chargers/i, /imaginators/i];
const rangSky = (nom) => SKY_ORDRE.findIndex((r) => r.test(nom));

async function ouvrirFigurines(sorte) {
  if (figPosees.jeu !== current.path) figPosees = { jeu: current.path, amiibo: [], skylanders: [] };
  const [mes, compat] = await Promise.all([
    invoke('figurines', { sorte }),
    sorte === 'amiibo' ? api('GET', `/amiibo/${current.title_id}`).catch(() => []) : [],
  ]);
  let sections;
  if (sorte === 'amiibo') {
    const fichier = new Map(mes.figurines.map((f) => [f.id, f]));
    const items = compat.map((a) => ({ ...a, chemin: fichier.get(a.id)?.chemin }));
    // Amiibo du joueur absents de la base : proposés quand même.
    const connus = new Set(compat.map((a) => a.id));
    const autres = mes.figurines.filter((f) => !connus.has(f.id)).map((f) => ({ ...f, usage: '' }));
    items.sort((a, b) => !a.chemin - !b.chemin || a.nom.localeCompare(b.nom));
    sections = [
      { titre: compat.length ? `Reconnus par ${current.name}` : '', items },
      { titre: compat.length ? 'Tes autres amiibo' : 'Tes amiibo', items: autres },
    ].filter((s) => s.items.length);
  } else {
    const rang = rangSky(current.name);
    const parJeu = new Map();
    for (const f of mes.figurines) if (rang < 0 || rangSky(f.jeu) <= rang) parJeu.set(f.jeu, [...(parJeu.get(f.jeu) || []), f]);
    sections = [...parJeu].sort(([a], [b]) => rangSky(a) - rangSky(b)).map(([jeu, items]) => ({ titre: jeu || 'Skylanders', poster: mes.posters[jeu], items }));
  }
  fig = { sorte, sections, focus: 0, dossier: mes.dossier };
  $('#figurines').style.display = 'flex';
  drawFigurines();
  entree($('#figurines .salle-carte'), 'pop-salle');
}

function drawFigurines() {
  const f = fig, amiibo = f.sorte === 'amiibo';
  const posees = figPosees[f.sorte];
  let n = 0;
  const tuile = (x) => {
    const pose = x.chemin && posees.includes(x.chemin);
    const visuel = x.image ? `<img src="${esc(x.image)}" alt="" loading="lazy">` : x.symbole ? `<img src="${asset(x.symbole)}" alt="" class="fig-sym">` : `<span class="fig-vide">${esc(x.nom.slice(0, 1))}</span>`;
    return `<button class="fig-el${x.chemin ? '' : ' manquant'}${pose ? ' pose' : ''}" data-n="${n++}" title="${esc(x.usage || '')}">
      ${visuel}<b>${esc(x.nom)}</b><small>${pose ? (amiibo ? 'Sur le lecteur' : 'Sur le portail') : x.chemin ? esc(amiibo ? x.serie || '' : x.element || '') : 'Fichier manquant'}</small></button>`;
  };
  const corps = f.sections.length
    ? f.sections.map((s) => `<section class="fig-section">${s.poster ? `<img class="fig-poster" src="${asset(s.poster)}" alt="">` : ''}${s.titre ? `<h3>${esc(s.titre)}</h3>` : ''}<div class="fig-grille">${s.items.map(tuile).join('')}</div></section>`).join('')
    : `<p class="fig-rien">${amiibo ? 'Aucun amiibo pour ce jeu. Mets les copies .bin de tes figurines dans Médias, Amiibo.' : 'Aucun Skylander. Mets tes fichiers .sky dans Médias, Skylanders (un dossier par jeu, avec poster.jpg si tu veux).'}</p>`;
  const texte = amiibo
    ? 'Choisis un amiibo : le jeu le lit dès qu\'il en cherche un. Il reste sur le lecteur jusqu\'au suivant.'
    : `Pose tes figurines sur le portail, retire-les de la même façon. Sur le portail : ${posees.length}.`;
  $('#figurines').innerHTML = `<div class="salle-carte fig-carte">
    <h2>${amiibo ? 'Amiibo' : 'Skylanders'}</h2><p class="fig-texte">${texte}</p>
    <div class="fig-corps">${corps}</div></div>`;
  $('#figurines').querySelectorAll('[data-n]').forEach((x) => (x.onclick = () => ((f.focus = +x.dataset.n), choisirFigurine())));
  $('#figurines').onclick = (e) => e.target.id === 'figurines' && fermerFigurines();
  focusFigurines();
}
function focusFigurines() {
  const els = [...$('#figurines').querySelectorAll('[data-n]')];
  fig.focus = Math.max(0, Math.min(fig.focus, els.length - 1));
  els.forEach((x) => x.classList.toggle('focus', +x.dataset.n === fig.focus));
  els[fig.focus]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  $('#aide-g').innerHTML = `<div>${glyphs.b}Retour</div><div>${glyphs.x}Ouvrir le dossier</div>`;
  $('#aide-d').innerHTML = `<div>${glyphs.a}${fig.sorte === 'amiibo' ? 'Poser' : 'Poser ou retirer'}</div>`;
}
const figurineFocus = () => fig.sections.flatMap((s) => s.items)[fig.focus];

async function choisirFigurine() {
  const x = figurineFocus();
  if (!x) return;
  const amiibo = fig.sorte === 'amiibo';
  if (!x.chemin) return toast(`Fichier manquant : mets la copie .bin de ${x.nom} dans Médias, Amiibo.`);
  const posees = figPosees[fig.sorte];
  const deja = posees.includes(x.chemin);
  const liste = amiibo ? (deja ? [] : [x.chemin]) : deja ? posees.filter((c) => c !== x.chemin) : [...posees, x.chemin];
  try {
    await invoke('figurines_poser', { sorte: fig.sorte, chemins: liste });
    if (!deja) compter('figurines');
  } catch (e) {
    return toast(`Impossible : ${e}`);
  }
  figPosees[fig.sorte] = liste;
  son(deja ? 'fermer' : 'ok', true);
  if (!amiibo) return drawFigurines();
  toast(deja ? `${x.nom} retiré du lecteur` : `${x.nom} posé sur le lecteur`);
  fermerFigurines();
  if (!deja) closeMenu(); // retour au jeu, qui le lira
}

function fermerFigurines() {
  fig = null;
  $('#figurines').style.display = 'none';
  $('#figurines').innerHTML = '';
  drawAide();
}

function navFigurines(k) {
  if (k === 'b') return fermerFigurines();
  if (k === 'x') return invoke('ouvrir_medias', { sorte: fig.sorte });
  if (k === 'a') return choisirFigurine();
  if (!['up', 'down', 'left', 'right'].includes(k)) return;
  const els = [...$('#figurines').querySelectorAll('[data-n]')];
  const i = voisin(els, els.findIndex((x) => +x.dataset.n === fig.focus), k);
  if (i >= 0) (fig.focus = +els[i].dataset.n), focusFigurines();
}
