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
  // À la souris, l'élément est déjà sous le pointeur : rien ne défile.
  if (!boite || !el || parSouris) return;
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

/*
 * Section : el.html = … ne reconstruit que si le contenu change. Les écrans se redessinent souvent
 * (sessions toutes les 15 s, manette branchée, synchro) : reconstruire relancerait l'animation d'entrée
 * et rechargerait les images. Un vrai changement pendant l'entrée s'affiche sans la rejouer.
 */
Object.defineProperty(document.querySelector('#section'), 'html', {
  set(v) {
    if (v === this._html && this.childElementCount) return;
    if (this._html !== undefined && this.classList.contains('apparait')) this.classList.remove('apparait');
    this._html = v;
    this.innerHTML = v;
  },
});

/* ---------- Souris ---------- */
/*
 * Une seule sélection pour la souris, le clavier et la manette, comme sur une console :
 * l'élément survolé devient l'élément choisi, et la manette repart de là.
 * Au clavier ou à la manette, le pointeur se cache (et ses survols avec), jusqu'au prochain mouvement.
 */
let parSouris = false;
const dans = (s) => [...document.querySelectorAll(s)];
const enBiblio = () => view() === 'biblio' && !dockOuvert && !panneauOuvert && !contexte;
/** [éléments, écran actif, sélectionner le n-ième]. Tout est appelé plus tard : les écrans sont chargés après ce fichier. */
const SURVOLS = [
  [() => dans('#sheet-btns .btn'), () => view() === 'sheet', (n) => ((sheetFocus = n), drawSheet())],
  [() => menuBtns(), () => view() === 'menu', (n) => ((menuFocus = n), drawMenu())],
  [() => dans('#bienvenue .bv-el'), () => view() === 'bienvenue', (n) => focusBienvenue(n)],
  [() => dans('#contexte .ctx-act'), () => view() === 'biblio' && contexte, (n) => ((contexte.focus = n), drawContexte())],
  [() => dans('#membres .pf'), () => view() === 'biblio' && panneauOuvert, (n) => focusPanneau(n)],
  [() => dans('#board .item'), () => enBiblio() && onglet === 'accueil' && !modif, (n) => focusTile(n)],
  [() => dans('#section .sec-ligne'), enBiblio, (n) => ((sectionFocus = n), dans('#section .sec-ligne').forEach((b, k) => b.classList.toggle('focus', k === n)))],
  [() => dans('#section .col-el'), () => enBiblio() && onglet === 'collections', (n) => focusCollection(n)],
  [() => dans('#section .prof-el'), () => enBiblio() && onglet === 'profil' && !miiEdition, (n) => focusProfil(n)],
  [() => dans('#section .trn-el'), () => enBiblio() && onglet === 'tournois', (n) => focusTournoi(n)],
  [() => dans('#section .r-el'), () => enBiblio() && onglet === 'recherche', (n) => focusRecherche(n)],
  [() => dans('#section .regt-tuile'), () => enBiblio() && onglet === 'reglages' && regVue === 'tuiles' && !regPage?.touches, (n) => focusReglage(n)],
  [() => dans('#section .reg-ligne'), () => enBiblio() && onglet === 'reglages' && regVue !== 'tuiles' && !regPage?.touches, (n) => focusReglage(n)],
];
function survol(cible) {
  // Pendant un glisser-déposer, la sélection reste sur l'élément tenu.
  if (!cible || document.body.classList.contains('glisse')) return;
  for (const [liste, actif, choisir] of SURVOLS) {
    if (!actif()) continue;
    const els = liste();
    const n = els.findIndex((el) => el.contains(cible));
    if (n < 0) continue;
    if (!els[n].classList.contains('focus')) {
      parSouris = true;
      try { choisir(n); } finally { parSouris = false; }
    }
    return;
  }
}
function sansSouris(oui) {
  if (document.body.classList.contains('sans-souris') !== oui) document.body.classList.toggle('sans-souris', oui);
}
let dernierPoint = '';
document.addEventListener('mousemove', (e) => {
  // Le contenu qui bouge sous un pointeur immobile ne compte pas.
  const p = `${e.screenX},${e.screenY}`;
  if (p === dernierPoint) return;
  dernierPoint = p;
  sansSouris(false);
  survol(e.target);
});

/*
 * Molette et pavé tactile, en crans : une molette donne un cran par clic,
 * un pavé tactile un cran par distance parcourue. parGeste : un seul cran par geste (pages).
 */
const molette = { somme: 0, verrou: false, t: 0 };
function cran(e, parGeste) {
  const d = (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) * (e.deltaMode ? 40 : 1);
  clearTimeout(molette.t);
  molette.t = setTimeout(() => ((molette.somme = 0), (molette.verrou = false)), 200);
  if (molette.verrou) return 0;
  molette.somme += d;
  if (Math.abs(molette.somme) < 50) return 0;
  const s = Math.sign(molette.somme);
  molette.somme = 0;
  molette.verrou = parGeste;
  return s;
}
let survolMolette = 0;
addEventListener('wheel', (e) => {
  sansSouris(false);
  // Un défilement à la main remplace celui que la manette avait lancé.
  for (let n = e.target; n; n = n.parentElement) n._cible = undefined;
  // Bibliothèque : la molette passe d'un jeu (ou d'une console) à l'autre.
  if (enBiblio() && onglet === 'jeux' && games.length) {
    const d = cran(e, false);
    if (!d) return;
    const z = e.target.closest('#consoles') ? 'consoles' : 'jeux';
    if (z !== zone) zone = z;
    return navJeux(d > 0 ? 'down' : 'up');
  }
  // Ailleurs, la page défile et la sélection suit le pointeur.
  clearTimeout(survolMolette);
  survolMolette = setTimeout(() => survol(document.elementFromPoint(e.clientX, e.clientY)), 120);
}, { passive: true });

/*
 * Appuis rapprochés : les animations accélèrent (body.vite) tant qu'on enchaîne,
 * et reprennent leur lenteur dès qu'on s'arrête. On n'attend jamais une animation.
 */
let dernierAppui = 0, finVite = 0;
function rythme() {
  const maintenant = performance.now();
  if (maintenant - dernierAppui < 450) document.body.classList.add('vite');
  dernierAppui = maintenant;
  clearTimeout(finVite);
  finVite = setTimeout(() => document.body.classList.remove('vite'), 600);
}

// Rien ne se traîne hors de l'app (images, textes) : les éléments de l'accueil ont leur propre glisser-déposer.
addEventListener('dragstart', (e) => e.preventDefault());
