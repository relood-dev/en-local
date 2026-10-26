/*
 * Mii : créé dans En Local, il va sur la 3DS, la Wii, la Wii U et la Switch, et sur le profil.
 * Rangé au format des 3DS et Wii U (96 octets). Son image vient de Mii Studio (Nintendo).
 */
const MII_BASE = {
  gender: 0, month: 0, day: 0, favoriteColor: 0, height: 64, build: 64,
  faceType: 0, skinColor: 0, wrinkles: 0, makeup: 0, hairType: 33, hairColor: 1, hairFlip: 0,
  eyeType: 2, eyeColor: 0, eyeScale: 4, eyeAspect: 3, eyeRotate: 4, eyeX: 2, eyeY: 12,
  browType: 6, browColor: 1, browScale: 4, browAspect: 3, browRotate: 6, browX: 2, browY: 10,
  noseType: 1, noseScale: 4, noseY: 9, mouthType: 23, mouthColor: 0, mouthScale: 4, mouthAspect: 3, mouthY: 13,
  mustacheType: 0, mustacheScale: 4, mustacheY: 10, beardType: 0, beardColor: 0,
  glassType: 0, glassColor: 0, glassScale: 4, glassY: 10, mole: 0, moleScale: 4, moleX: 2, moleY: 20,
};
/** Le Mii du joueur (null s'il n'en a pas). */
function monMii() {
  try {
    const m = JSON.parse(localStorage.mii || 'null');
    return m && typeof m === 'object' ? { ...MII_BASE, ...m } : null;
  } catch {
    return null;
  }
}
/** Nouveau Mii : identifiants tirés une fois, gardés ensuite (les jeux reconnaissent le Mii à son identifiant). */
function nouveauMii() {
  const hex = (n) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, '0')).join('');
  const date = Math.floor((Date.now() - Date.UTC(2010, 0, 1)) / 2000) & 0x0fffffff;
  return { ...MII_BASE, nom: (pseudoConsoles() || 'Joueur').slice(0, 10), systeme: hex(8), id: ((0x80000000 | date) >>> 0).toString(16).padStart(8, '0'), mac: hex(6) };
}

/** CRC des Mii (CRC-16 CCITT, départ à 0). */
function crcMii(b, n) {
  let crc = 0;
  for (let i = 0; i < n; i++) {
    crc ^= b[i] << 8;
    for (let j = 0; j < 8; j++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc;
}
/** Format 3DS et Wii U : 96 octets, champs en petit-boutiste, CRC à la fin. */
function miiVer3(m) {
  const b = new Uint8Array(96);
  const v = new DataView(b.buffer);
  const nom = (o, t) => [...String(t || '')].slice(0, 10).forEach((c, k) => v.setUint16(o + 2 * k, c.charCodeAt(0), true));
  b[0] = 3;
  b[1] = 1; // copie permise
  b[3] = 0x30; // créé sur 3DS
  (m.systeme || '').match(/../g)?.forEach((x, k) => (b[4 + k] = parseInt(x, 16)));
  (m.id || '').match(/../g)?.forEach((x, k) => (b[0x0c + k] = parseInt(x, 16)));
  b[0x0c] |= 0x90; // Mii normal (bit 31), bit 28 toujours mis par les consoles
  (m.mac || '').match(/../g)?.forEach((x, k) => (b[0x10 + k] = parseInt(x, 16)));
  v.setUint16(0x18, m.gender | (m.month << 1) | (m.day << 5) | (m.favoriteColor << 10), true);
  nom(0x1a, m.nom);
  b[0x2e] = m.height;
  b[0x2f] = m.build;
  b[0x30] = (m.faceType << 1) | (m.skinColor << 5);
  b[0x31] = m.wrinkles | (m.makeup << 4);
  b[0x32] = m.hairType;
  b[0x33] = m.hairColor | (m.hairFlip << 3);
  v.setUint32(0x34, (m.eyeType | (m.eyeColor << 6) | (m.eyeScale << 9) | (m.eyeAspect << 13) | (m.eyeRotate << 16) | (m.eyeX << 21) | (m.eyeY << 25)) >>> 0, true);
  v.setUint32(0x38, (m.browType | (m.browColor << 5) | (m.browScale << 8) | (m.browAspect << 12) | (m.browRotate << 16) | (m.browX << 21) | (m.browY << 25)) >>> 0, true);
  v.setUint16(0x3c, m.noseType | (m.noseScale << 5) | (m.noseY << 9), true);
  v.setUint16(0x3e, m.mouthType | (m.mouthColor << 6) | (m.mouthScale << 9) | (m.mouthAspect << 13), true);
  b[0x40] = m.mouthY | (m.mustacheType << 5);
  v.setUint16(0x42, m.beardType | (m.beardColor << 3) | (m.mustacheScale << 6) | (m.mustacheY << 10), true);
  v.setUint16(0x44, m.glassType | (m.glassColor << 4) | (m.glassScale << 7) | (m.glassY << 11), true);
  v.setUint16(0x46, m.mole | (m.moleScale << 1) | (m.moleX << 5) | (m.moleY << 10), true);
  nom(0x48, m.nom);
  v.setUint16(0x5e, crcMii(b, 0x5e));
  return b;
}
const hexMii = (b) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');

/** Données de Mii Studio (46 octets, mélangés comme le fait Nintendo) : l'image du Mii. */
function studioMii(m) {
  const c = (x) => (x === 0 ? 8 : x);
  const d = [
    c(m.beardColor), m.beardType, m.build, m.eyeAspect, m.eyeColor + 8, m.eyeRotate, m.eyeScale, m.eyeType, m.eyeX, m.eyeY,
    m.browAspect, c(m.browColor), m.browRotate, m.browScale, m.browType, m.browX, m.browY,
    m.skinColor, m.makeup, m.faceType, m.wrinkles, m.favoriteColor, m.gender,
    m.glassColor === 0 ? 8 : m.glassColor + 13, m.glassScale, m.glassType, m.glassY,
    c(m.hairColor), m.hairFlip, m.hairType, m.height, m.moleScale, m.mole, m.moleX, m.moleY,
    m.mouthAspect, m.mouthColor + 19, m.mouthScale, m.mouthType, m.mouthY,
    m.mustacheScale, m.mustacheType, m.mustacheY, m.noseScale, m.noseType, m.noseY,
  ];
  let n = 0;
  return '00' + d.map((x) => ((n = (7 + (x ^ n)) & 0xff), n.toString(16).padStart(2, '0'))).join('');
}
/** Image d'un Mii (données Studio) : visage, ou corps entier. Tailles acceptées par Nintendo : 96, 128, 270, 512. */
const imageMii = (studio, corps = false, taille = 512) =>
  `https://studio.mii.nintendo.com/miis/image.png?data=${studio}&type=${corps ? 'all_body' : 'face'}&expression=normal&width=${taille}&bgColor=FFFFFF00`;

/* ---------- Éditeur, dans le profil, façon Mii Maker ---------- */

// Couleurs affichées dans l'éditeur (celles des consoles).
const TEINTES_MII = {
  favoriteColor: ['#d21e14', '#ff6e19', '#ffd820', '#78d220', '#007830', '#0a48b4', '#3caade', '#f55a7d', '#7328ad', '#483818', '#e0e0e0', '#181814'],
  skinColor: ['#ffd8ba', '#ffd5ac', '#dea883', '#ffb68c', '#b0663a', '#5e2e18'],
  hairColor: ['#1e1a18', '#402020', '#5c1812', '#7c3a14', '#787880', '#4e3e10', '#885818', '#d0a04a'],
  eyeColor: ['#000000', '#6c7070', '#663c2c', '#605e30', '#4c80a8', '#387058'],
  mouthColor: ['#d85428', '#f0201c', '#f05484', '#f0a07c', '#181818'],
  glassColor: ['#000000', '#7c5418', '#b03828', '#384c9c', '#c88c14', '#707070'],
};
TEINTES_MII.browColor = TEINTES_MII.beardColor = TEINTES_MII.hairColor;
// Blocs : grille d'aperçus (n formes), couleurs, choix, curseur. inv : la droite fait monter.
const ONGLETS_MII = (() => {
  const g = (k, n, nom) => ({ t: 'grille', k, n, nom });
  const c = (k, nom = 'Couleur') => ({ t: 'couleurs', k, nom });
  const r = (k, nom, min, max, inv = false) => ({ t: 'curseur', k, nom, min, max, inv });
  return [
    ['Toi', [{ t: 'nom', nom: 'Nom' }, { t: 'choix', k: 'gender', nom: 'Genre', noms: ['Garçon', 'Fille'] }, c('favoriteColor', 'Couleur préférée'), r('height', 'Taille', 0, 127), r('build', 'Corpulence', 0, 127)]],
    ['Visage', [g('faceType', 12, 'Forme'), c('skinColor', 'Teint'), g('wrinkles', 12, 'Rides'), g('makeup', 12, 'Maquillage')]],
    ['Cheveux', [c('hairColor'), { t: 'choix', k: 'hairFlip', nom: 'Raie', noms: ['À gauche', 'À droite'] }, g('hairType', 132, 'Coiffure')]],
    ['Sourcils', [c('browColor'), g('browType', 24, 'Forme'), r('browScale', 'Taille', 0, 8), r('browAspect', 'Épaisseur', 0, 6), r('browRotate', 'Angle', 0, 11), r('browX', 'Écart', 0, 12), r('browY', 'Hauteur', 3, 18, true)]],
    ['Yeux', [c('eyeColor'), g('eyeType', 60, 'Forme'), r('eyeScale', 'Taille', 0, 7), r('eyeAspect', 'Ouverture', 0, 6), r('eyeRotate', 'Angle', 0, 7), r('eyeX', 'Écart', 0, 12), r('eyeY', 'Hauteur', 0, 18, true)]],
    ['Nez', [g('noseType', 18, 'Forme'), r('noseScale', 'Taille', 0, 8), r('noseY', 'Hauteur', 0, 18, true)]],
    ['Bouche', [c('mouthColor'), g('mouthType', 36, 'Forme'), r('mouthScale', 'Taille', 0, 8), r('mouthAspect', 'Largeur', 0, 6), r('mouthY', 'Hauteur', 0, 18, true)]],
    ['Barbe', [c('beardColor'), g('mustacheType', 6, 'Moustache'), g('beardType', 6, 'Barbe'), r('mustacheScale', 'Taille de la moustache', 0, 7), r('mustacheY', 'Hauteur de la moustache', 0, 16, true)]],
    ['Lunettes', [c('glassColor'), g('glassType', 9, 'Forme'), r('glassScale', 'Taille', 0, 7), r('glassY', 'Hauteur', 0, 20, true)]],
    ['Grain', [{ t: 'choix', k: 'mole', nom: 'Grain de beauté', noms: ['Sans', 'Avec'] }, r('moleScale', 'Taille', 0, 8), r('moleX', 'Position', 0, 16), r('moleY', 'Hauteur', 0, 30, true)]],
  ];
})();
const COLONNES_MII = 6;

let miiEdition = null; // { m, avant, onglet, ligne, col }

function ouvrirMii() {
  const m = monMii() || nouveauMii();
  miiEdition = { m, avant: JSON.stringify(m), onglet: 0, ligne: 0, col: 0, neuf: !monMii() };
  drawMii();
}
/** Lignes de l'onglet : une grille donne une ligne par rangée de 6 aperçus. */
function lignesMiiOnglet() {
  const out = [];
  for (const b of ONGLETS_MII[miiEdition.onglet][1]) {
    if (b.t === 'grille') for (let v = 0; v < b.n; v += COLONNES_MII) out.push({ b, vals: [...Array(Math.min(COLONNES_MII, b.n - v)).keys()].map((x) => x + v) });
    else if (b.t === 'couleurs') out.push({ b, vals: TEINTES_MII[b.k].map((_, v) => v) });
    else if (b.t === 'choix') out.push({ b, vals: b.noms.map((_, v) => v) });
    else out.push({ b, vals: [0] });
  }
  return out;
}
const apercuCase = (k, v, taille = 128) => imageMii(studioMii({ ...miiEdition.m, [k]: v }), false, taille);

function drawMii() {
  const e = miiEdition;
  const m = e.m;
  const lignes = lignesMiiOnglet();
  let html = '';
  let dernier = null;
  lignes.forEach((l, n) => {
    const b = l.b;
    if (b !== dernier) {
      html += `${dernier ? '</div>' : ''}<div class="mii-bloc mii-b-${b.t}"><h3>${esc(b.nom)}</h3>`;
      dernier = b;
    }
    const pos = (col) => `data-l="${n}" data-c="${col}"`;
    if (b.t === 'grille') html += `<div class="mii-rang">${l.vals.map((v, col) => `<button class="mii-case${m[b.k] === v ? ' choisi' : ''}" ${pos(col)} data-v="${v}"><img loading="lazy" src="${apercuCase(b.k, v)}" alt=""></button>`).join('')}</div>`;
    if (b.t === 'couleurs') html += `<div class="mii-rang">${l.vals.map((v, col) => `<button class="mii-pastille${m[b.k] === v ? ' choisi' : ''}" ${pos(col)} data-v="${v}" style="--teinte:${TEINTES_MII[b.k][v]}"></button>`).join('')}</div>`;
    if (b.t === 'choix') html += `<div class="mii-rang">${b.noms.map((nom, v) => `<button class="mii-option${m[b.k] === v ? ' choisi' : ''}" ${pos(v)} data-v="${v}">${esc(nom)}</button>`).join('')}</div>`;
    if (b.t === 'nom') html += `<button class="mii-option mii-nom" ${pos(0)}><b>${esc(m.nom)}</b><small>Changer</small></button>`;
    if (b.t === 'curseur') html += `<div class="mii-curseur" ${pos(0)}><i data-d="-1">‹</i><span><em></em></span><i data-d="1">›</i></div>`;
  });
  html += '</div>';
  $('#section').html = `<div class="prof mii-edit">
    <div class="mii-apercu"><img id="mii-img" alt=""><b id="mii-nom"></b><small>Ton Mii va sur la 3DS, la Wii, la Wii U et la Switch.</small></div>
    <div class="mii-panneau">
      <div class="mii-onglets">${glyphs.lb}${ONGLETS_MII.map(([nom], k) => `<button class="mii-onglet${k === e.onglet ? ' ici' : ''}" data-o="${k}">${esc(nom)}</button>`).join('')}${glyphs.rb}</div>
      <div class="mii-corps">${html}</div>
      <div class="mii-actions"><button class="prof-bouton" data-a="annuler">Annuler</button><button class="prof-bouton main" data-a="garder">Enregistrer</button></div>
    </div>
  </div>`;
  const s = $('#section');
  s.querySelectorAll('.mii-onglet').forEach((x) => (x.onclick = () => ongletMii(+x.dataset.o)));
  s.querySelectorAll('[data-a]').forEach((x) => (x.onclick = () => (x.dataset.a === 'garder' ? garderMii() : annulerMii())));
  s.querySelectorAll('.mii-corps [data-l]').forEach((x) => {
    x.onclick = (ev) => {
      e.ligne = +x.dataset.l;
      e.col = +x.dataset.c;
      const d = ev.target.dataset.d;
      if (d) return deplacerCurseur(+d), focusMii();
      focusMii();
      activerMii();
    };
  });
  $('#titre').textContent = e.neuf ? 'Créer mon Mii' : 'Mon Mii';
  majMii(true);
  focusMii();
}
/** Après un changement : choix surlignés, curseurs, nom, aperçu. Les petites images suivent un peu après. */
let miiApercus = 0;
function majMii(tout = false) {
  const e = miiEdition;
  const m = e.m;
  const lignes = lignesMiiOnglet();
  $('#section').querySelectorAll('.mii-corps [data-l]').forEach((x) => {
    const b = lignes[+x.dataset.l].b;
    if (x.dataset.v !== undefined) x.classList.toggle('choisi', m[b.k] === +x.dataset.v);
    if (b.t === 'curseur') {
      const p = (m[b.k] - b.min) / (b.max - b.min);
      x.querySelector('em').style.width = `${(b.inv ? 1 - p : p) * 100}%`;
    }
  });
  $('#mii-nom').textContent = m.nom;
  // L'image n'est remplacée qu'une fois chargée : pas de clignotement.
  const src = imageMii(studioMii(m), ONGLETS_MII[e.onglet][0] === 'Toi', 512);
  const img = new Image();
  img.onload = () => miiEdition && ($('#mii-img').src = src);
  img.src = src;
  clearTimeout(miiApercus);
  if (!tout) {
    miiApercus = setTimeout(() => {
      if (!miiEdition) return;
      $('#section').querySelectorAll('.mii-case').forEach((x) => {
        const b = lignesMiiOnglet()[+x.dataset.l].b;
        const neuf = apercuCase(b.k, +x.dataset.v);
        if (x.firstChild.src !== neuf) x.firstChild.src = neuf;
      });
    }, 350);
  }
}
function focusMii() {
  const e = miiEdition;
  const lignes = lignesMiiOnglet();
  e.ligne = Math.max(0, Math.min(e.ligne, lignes.length - 1));
  e.col = Math.max(0, Math.min(e.col, lignes[e.ligne].vals.length - 1));
  let el = null;
  $('#section').querySelectorAll('.mii-corps [data-l]').forEach((x) => {
    const ici = +x.dataset.l === e.ligne && +x.dataset.c === e.col;
    x.classList.toggle('focus', ici);
    if (ici) el = x;
  });
  // Le titre du bloc reste visible en haut de sa première ligne.
  const bloc = el?.closest('.mii-bloc');
  montrer($('#section .mii-corps'), bloc && lignes[e.ligne - 1]?.b !== lignes[e.ligne].b ? bloc : el, 24);
  const b = lignes[e.ligne].b;
  $('#aide-g').innerHTML = `<div>${glyphs.b}Annuler</div><div>${glyphs.lb}${glyphs.rb}Parties</div>`;
  $('#aide-d').innerHTML = `${b.t === 'curseur' ? '<div><span class="k mot">◀ ▶</span>Régler</div>' : b.t === 'nom' ? `<div>${glyphs.a}Écrire</div>` : `<div>${glyphs.a}Choisir</div>`}<div>${glyphs.plus}Enregistrer</div>`;
}
function ongletMii(k) {
  const e = miiEdition;
  e.onglet = (k + ONGLETS_MII.length) % ONGLETS_MII.length;
  e.ligne = 0;
  e.col = 0;
  drawMii();
}
function changerValeurMii(k, v) {
  if (miiEdition.m[k] === v) return;
  miiEdition.m[k] = v;
  majMii();
}
function deplacerCurseur(d) {
  const b = lignesMiiOnglet()[miiEdition.ligne].b;
  if (b.t !== 'curseur') return;
  // Taille et corpulence vont de 0 à 127 : 4 crans par appui.
  const pas = b.max - b.min > 40 ? 4 : 1;
  const v = miiEdition.m[b.k] + (b.inv ? -d : d) * pas;
  changerValeurMii(b.k, Math.max(b.min, Math.min(b.max, v)));
}
function activerMii() {
  const e = miiEdition;
  const l = lignesMiiOnglet()[e.ligne];
  if (l.b.t === 'nom') {
    return saisirTexte({
      titre: 'Le nom de ton Mii',
      champs: [{ id: 'nom', label: '10 caractères au plus', valeur: e.m.nom }],
      valider: ({ nom }) => {
        const t = nom.trim();
        if (!t) return 'Écris un nom.';
        if ([...t].length > 10) return '10 caractères au plus.';
        e.m.nom = t;
        setTimeout(() => miiEdition && drawMii());
      },
    });
  }
  if (l.b.t !== 'curseur') changerValeurMii(l.b.k, l.vals[e.col]);
}
function garderMii() {
  localStorage.mii = JSON.stringify(miiEdition.m);
  son('ok');
  toast('Mii enregistré : il sera dans tes prochains jeux');
  envoyerStats();
  fermerMii();
}
function annulerMii() {
  if (JSON.stringify(miiEdition.m) === miiEdition.avant) return fermerMii();
  sheet('Quitter sans enregistrer ?', 'Les changements de ton Mii seront perdus.', [
    { label: 'Continuer', cancel: true },
    { label: 'Quitter sans enregistrer', fn: fermerMii },
  ]);
}
function fermerMii() {
  miiEdition = null;
  profFocus = 0;
  drawProfil();
}
function navMii(k) {
  const e = miiEdition;
  const lignes = lignesMiiOnglet();
  const l = lignes[e.ligne];
  if (k === 'up' || k === 'down') {
    // On garde la même place dans la rangée d'aperçus en montant ou descendant.
    e.ligne = Math.max(0, Math.min(lignes.length - 1, e.ligne + (k === 'up' ? -1 : 1)));
    return focusMii();
  }
  if (k === 'left' || k === 'right') {
    const d = k === 'left' ? -1 : 1;
    if (l.b.t === 'curseur') return deplacerCurseur(d);
    e.col = Math.max(0, Math.min(l.vals.length - 1, e.col + d));
    focusMii();
    // Couleurs et choix : on voit le résultat tout de suite.
    if (l.b.t === 'couleurs' || l.b.t === 'choix') changerValeurMii(l.b.k, l.vals[e.col]);
    return;
  }
  if (k === 'lb' || k === 'rb') return ongletMii(e.onglet + (k === 'lb' ? -1 : 1));
  if (k === 'a') return activerMii();
  if (k === 'plus') return garderMii();
  if (k === 'b') return annulerMii();
}
