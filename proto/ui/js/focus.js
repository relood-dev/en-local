/*
 * Navigation au focus, pour la manette, le clavier et la souris.
 * voisin() choisit la rangée la plus proche, puis l'élément le mieux aligné.
 * Sur un même axe, l'alignement de départ est gardé : descendre puis remonter revient au même élément.
 */
let memoireAxe = null;
function voisin(elements, actuel, dir) {
  const depuis = elements[actuel];
  const from = depuis?.getBoundingClientRect();
  if (!from) return -1;
  const vertical = dir === 'up' || dir === 'down';
  const centre = (r) => (vertical ? r.left + r.width / 2 : r.top + r.height / 2);
  const pos = memoireAxe && memoireAxe.el === depuis && memoireAxe.axe === vertical ? memoireAxe.pos : centre(from);
  // Distance entre les bords (négative : mauvaise direction).
  const ecart = (r) => ({ down: r.top - from.bottom, up: from.top - r.bottom, right: r.left - from.right, left: from.left - r.right }[dir]);
  const candidats = [];
  elements.forEach((el, k) => {
    if (k === actuel) return;
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) return;
    const e = ecart(r);
    const dedans = vertical ? (dir === 'down' ? r.top > from.top + from.height / 2 : r.bottom < from.bottom - from.height / 2) : (dir === 'right' ? r.left > from.left + from.width / 2 : r.right < from.right - from.width / 2);
    if (!dedans) return;
    // Un élément juste en face passe avant un élément en biais.
    const a0 = vertical ? r.left : r.top, a1 = vertical ? r.right : r.bottom;
    const distance = pos < a0 ? a0 - pos : pos > a1 ? pos - a1 : 0;
    candidats.push({ k, e: Math.max(0, e), distance, c: Math.abs(centre(r) - pos) });
  });
  if (!candidats.length) return -1;
  // Rangée la plus proche (à 12 px près), puis le mieux aligné.
  const proche = Math.min(...candidats.map((x) => x.e));
  const rangee = candidats.filter((x) => x.e <= proche + 12);
  rangee.sort((a, b) => a.distance - b.distance || a.c - b.c);
  // Un élément bien en face un peu plus loin est préféré à un élément en biais.
  let choix = rangee[0];
  if (choix.distance > 0) {
    const enFace = candidats.filter((x) => x.distance === 0).sort((a, b) => a.e - b.e)[0];
    if (enFace && enFace.e <= proche + 80) choix = enFace;
  }
  memoireAxe = { el: elements[choix.k], axe: vertical, pos };
  return choix.k;
}

/** Rejoue l'animation d'entrée d'un élément. */
function entree(el, nom = 'entree') {
  if (!el) return;
  el.classList.remove(nom);
  void el.offsetWidth;
  el.classList.add(nom);
  clearTimeout(el._entree);
  el._entree = setTimeout(() => el.classList.remove(nom), 1500);
}

/**
 * Fait défiler boite pour que el soit visible.
 * Calculé avec offsetTop pour ne pas dépendre du zoom ni des animations.
 */
function montrer(boite, el, marge = 16) {
  if (!boite || !el) return;
  const absolu = (n) => { let t = 0; for (; n; n = n.offsetParent) t += n.offsetTop; return t; };
  const haut = absolu(el) - absolu(boite);
  const bas = haut + el.offsetHeight;
  const vue = boite._cible ?? boite.scrollTop; // position d'arrivée du défilement en cours
  let cible = vue;
  if (haut - marge < vue) cible = haut - marge;
  else if (bas + marge > vue + boite.clientHeight) cible = bas + marge - boite.clientHeight;
  // Le premier élément remonte tout en haut, titres compris.
  if (el === boite.querySelector('.pf, .btn') || (el.classList[0] && el === boite.querySelector('.' + el.classList[0]))) cible = 0;
  cible = Math.max(0, Math.min(cible, boite.scrollHeight - boite.clientHeight));
  if (Math.abs(cible - vue) < 1) return;
  boite._cible = cible;
  boite.scrollTo({ top: cible, behavior: 'smooth' });
  clearTimeout(boite._fin);
  boite._fin = setTimeout(() => (boite._cible = undefined), 450);
}
