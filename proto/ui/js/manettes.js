/*
 * Schémas des manettes de chaque console, avec la touche assignée à chaque bouton.
 * Coordonnées dans un cadre de 400 × 256. data-b : bouton de la console.
 */
const rond = (b, x, y, r, t = '') => `<g class="bt" data-b="${b}"><circle cx="${x}" cy="${y}" r="${r}"/>${t ? `<text x="${x}" y="${y}">${t}</text>` : ''}</g>`;
const capsule = (b, x, y, w, h, t = '', rx = h / 2) => `<g class="bt" data-b="${b}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}"/>${t ? `<text x="${x + w / 2}" y="${y + h / 2}">${t}</text>` : ''}</g>`;
const ovale = (b, x, y, rx, ry, rot, t = '') => `<g class="bt" data-b="${b}"><ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" transform="rotate(${rot} ${x} ${y})"/>${t ? `<text x="${x}" y="${y}">${t}</text>` : ''}</g>`;
const levier = (b, x, y, r) => `<g class="bt levier" data-b="${b}"><circle cx="${x}" cy="${y}" r="${r}"/><circle class="interieur" cx="${x}" cy="${y}" r="${r * 0.58}"/></g>`;
const levierFixe = (x, y, r, t = '') => `<g class="fixe"><circle cx="${x}" cy="${y}" r="${r}"/><circle class="interieur" cx="${x}" cy="${y}" r="${r * 0.58}"/>${t ? `<text x="${x}" y="${y}">${t}</text>` : ''}</g>`;
const repere = (x, y, r, t = '') => `<g class="fixe"><circle cx="${x}" cy="${y}" r="${r}"/>${t ? `<text x="${x}" y="${y}">${t}</text>` : ''}</g>`;
function croix(x, y, s = 11) {
  const h = s / 2;
  const forme = `M${x - h} ${y - 3 * h} H${x + h} V${y - h} H${x + 3 * h} V${y + h} H${x + h} V${y + 3 * h} H${x - h} V${y + h} H${x - 3 * h} V${y - h} H${x - h} Z`;
  const branche = (p, dx, dy) => `<rect class="bt branche" data-p="${p}" x="${x + dx - h + 1}" y="${y + dy - h + 1}" width="${s - 2}" height="${s - 2}" rx="1.5"/>`;
  return `<g class="croix"><path class="fond-croix" d="${forme}"/>${branche('up', 0, -s)}${branche('down', 0, s)}${branche('left', -s, 0)}${branche('right', s, 0)}</g>`;
}
const quatre = (x, y, e, r) => rond('x', x, y - e, r, 'X') + rond('a', x + e, y, r, 'A') + rond('b', x, y + e, r, 'B') + rond('y', x - e, y, r, 'Y');
const contour = (d) => `<path class="contour" d="${d}"/>`;

const SCHEMAS = {
  Switch: () => `${capsule('zl', 70, 12, 66, 14, 'ZL', 7)}${capsule('l', 76, 30, 62, 10, 'L', 5)}${capsule('zr', 264, 12, 66, 14, 'ZR', 7)}${capsule('r', 262, 30, 62, 10, 'R', 5)}
    ${contour('M100 46 C150 38 250 38 300 46 C352 54 372 92 380 140 C388 190 376 226 350 232 C328 237 312 222 298 200 L282 176 C262 168 138 168 118 176 L102 200 C88 222 72 237 50 232 C24 226 12 190 20 140 C28 92 48 54 100 46 Z')}
    ${levier('l3', 112, 98, 18)}${croix(150, 150, 12)}${levier('r3', 250, 150, 16)}${quatre(296, 100, 21, 10)}
    ${rond('moins', 168, 78, 6, '−')}${rond('plus', 232, 78, 6, '+')}${repere(184, 104, 5)}${repere(216, 104, 6, '⌂')}`,
  WiiU: () => `${capsule('zl', 40, 12, 66, 14, 'ZL', 7)}${capsule('l', 46, 30, 62, 9, 'L', 4.5)}${capsule('zr', 294, 12, 66, 14, 'ZR', 7)}${capsule('r', 292, 30, 62, 9, 'R', 4.5)}
    ${contour('M58 42 H342 C372 42 390 62 390 92 V176 C390 206 372 222 342 222 H58 C28 222 10 206 10 176 V92 C10 62 28 42 58 42 Z')}
    <rect class="ecran" x="112" y="58" width="176" height="122" rx="4"/>
    ${levier('l3', 62, 88, 16)}${croix(62, 150, 11)}${levier('r3', 338, 88, 16)}${quatre(338, 150, 19, 9)}
    ${rond('moins', 322, 200, 5, '−')}${rond('plus', 352, 200, 5, '+')}${repere(84, 200, 5, '⌂')}`,
  GC: () => `${capsule('l', 58, 14, 82, 16, 'L', 8)}${capsule('r', 260, 14, 82, 16, 'R', 8)}${capsule('z', 276, 34, 56, 10, 'Z', 5)}
    ${contour('M112 48 C160 40 240 40 288 48 C340 56 362 90 370 128 C378 170 366 206 344 216 C326 224 310 212 298 196 C286 180 274 172 260 170 C220 165 180 165 140 170 C126 172 114 180 102 196 C90 212 74 224 56 216 C34 206 22 170 30 128 C38 90 60 56 112 48 Z')}
    ${levierFixe(104, 100, 20)}${croix(134, 162, 10)}${levierFixe(262, 158, 14, 'C')}
    ${rond('a', 298, 104, 17, 'A')}${rond('b', 264, 128, 9, 'B')}${ovale('x', 332, 90, 8, 14, 18, 'X')}${ovale('y', 292, 72, 14, 7.5, 18, 'Y')}${rond('start', 200, 104, 6, '▸')}`,
  Wii: () => `${contour('M162 10 H202 C214 10 222 18 222 30 V214 C222 226 214 234 202 234 H162 C150 234 142 226 142 214 V30 C142 18 150 10 162 10 Z')}
    ${croix(182, 46, 11)}${rond('a', 182, 92, 13, 'A')}${capsule('b', 228, 70, 12, 40, 'B', 6)}
    ${rond('moins', 162, 132, 6, '−')}${repere(182, 132, 6, '⌂')}${rond('plus', 202, 132, 6, '+')}
    ${rond('un', 182, 180, 10, '1')}${rond('deux', 182, 208, 10, '2')}
    <path class="cable" d="M182 234 C182 252 300 252 316 222"/>
    ${contour('M316 64 C344 64 360 100 360 146 C360 192 342 222 316 222 C290 222 272 192 272 146 C272 100 288 64 316 64 Z')}
    ${capsule('c', 298, 40, 36, 11, 'C', 5.5)}${capsule('nz', 294, 54, 44, 14, 'Z', 7)}${levierFixe(316, 116, 17)}
    <g class="bt secouer" data-b="secouer"><path d="M96 98 C88 118 88 136 96 156 M82 88 C70 116 70 138 82 166"/></g>`,
  '3DS': () => `${contour('M88 6 H312 C322 6 330 14 330 24 V104 H70 V24 C70 14 78 6 88 6 Z')}<rect class="ecran" x="114" y="16" width="172" height="80" rx="3"/>
    ${capsule('l', 72, 108, 40, 9, 'L', 4.5)}${capsule('zl', 118, 108, 30, 9, 'ZL', 4.5)}${capsule('zr', 252, 108, 30, 9, 'ZR', 4.5)}${capsule('r', 288, 108, 40, 9, 'R', 4.5)}
    ${contour('M70 122 H330 V222 C330 232 322 240 312 240 H88 C78 240 70 232 70 222 Z')}<rect class="ecran" x="142" y="132" width="116" height="90" rx="3"/>
    ${levierFixe(104, 152, 12)}${croix(104, 198, 10)}${quatre(298, 166, 15, 7.5)}
    ${capsule('select', 270, 216, 22, 7, '', 3.5)}${capsule('start', 296, 216, 22, 7, '', 3.5)}`,
  DS: () => `${contour('M88 6 H312 C322 6 330 14 330 24 V104 H70 V24 C70 14 78 6 88 6 Z')}<rect class="ecran" x="142" y="16" width="116" height="80" rx="3"/>
    ${capsule('l', 72, 108, 48, 9, 'L', 4.5)}${capsule('r', 280, 108, 48, 9, 'R', 4.5)}
    ${contour('M70 122 H330 V222 C330 232 322 240 312 240 H88 C78 240 70 232 70 222 Z')}<rect class="ecran" x="142" y="132" width="116" height="90" rx="3"/>
    ${croix(104, 172, 12)}${quatre(298, 164, 16, 8)}
    ${capsule('select', 286, 204, 24, 8, '', 4)}${capsule('start', 286, 218, 24, 8, '', 4)}`,
};

// Le dessin au centre d'un cadre de 600 × 300, les étiquettes sur les côtés.
const CADRE = { w: 600, h: 300, x: 100, y: 22 };
function schemaManette(c) {
  return `<div class="schema-cadre"><svg class="schema-manette" viewBox="0 0 ${CADRE.w} ${CADRE.h}" aria-hidden="true">
    <g class="traits"></g><svg x="${CADRE.x}" y="${CADRE.y}" width="400" height="256" viewBox="0 0 400 256" overflow="visible">${SCHEMAS[c]?.() || ''}</svg></svg>
    <div class="schema-etiquettes"></div></div>`;
}

/** Étiquettes autour du dessin, reliées à leur bouton, sans se chevaucher. */
function etiqueterSchema(c, ou, parent) {
  const cadre = $('#section .schema-cadre');
  if (!cadre) return;
  const points = [];
  for (const [id, nom, d] of TOUCHES_CONSOLE[c] || []) {
    const el = cadre.querySelector(`svg svg .bt[data-b="${id}"]`);
    if (!el) continue;
    const b = el.getBBox();
    const cx = b.x + b.width / 2 + CADRE.x, cy = b.y + b.height / 2 + CADRE.y;
    const gauche = b.x + b.width / 2 < 200;
    points.push({ id, nom: { l3: 'Stick G', r3: 'Stick D' }[id] || nom.replace(/ \(.*\)/, ''), gauche, cy, bx: gauche ? b.x + CADRE.x : b.x + b.width + CADRE.x, p: ou[`touche_${id}`] || parent?.[`touche_${id}`] || d, perso: Boolean(ou[`touche_${id}`]) });
  }
  const ESPACE = 25, HAUT = 14, BAS = CADRE.h - 14;
  for (const cote of [true, false]) {
    const l = points.filter((p) => p.gauche === cote).sort((a, b) => a.cy - b.cy);
    l.forEach((p, k) => (p.y = Math.max(p.cy, k ? l[k - 1].y + ESPACE : HAUT)));
    for (let k = l.length - 1; k >= 0; k--) l[k].y = Math.min(l[k].y, k < l.length - 1 ? l[k + 1].y - ESPACE : BAS);
    l.forEach((p, k) => (p.y = Math.max(p.y, k ? l[k - 1].y + ESPACE : HAUT)));
  }
  const X_G = 92, X_D = CADRE.w - 92;
  cadre.querySelector('.traits').innerHTML = points.map((p) => {
    const xEtiquette = p.gauche ? X_G : X_D;
    const coude = p.gauche ? Math.min(p.bx - 8, X_G + 14) : Math.max(p.bx + 8, X_D - 14);
    return `<path data-b="${p.id}" d="M${p.bx} ${p.cy} L${coude} ${p.cy} L${coude + (p.gauche ? -6 : 6)} ${p.y} L${xEtiquette} ${p.y}"/><circle data-b="${p.id}" cx="${p.bx}" cy="${p.cy}" r="1.8"/>`;
  }).join('');
  cadre.querySelector('.schema-etiquettes').innerHTML = points.map((p) => `<button class="appel ${p.gauche ? 'g' : 'd'}${p.perso ? ' perso' : ''}" data-b="${p.id}" style="top:${(p.y / CADRE.h) * 100}%;${p.gauche ? `right:${100 - (X_G / CADRE.w) * 100}%` : `left:${(X_D / CADRE.w) * 100}%`}"><b>${esc(p.nom)}</b>${glyphePhys(p.p)}</button>`).join('');
}

function allumerSchema(c, ou, parent, phys) {
  const cadre = $('#section .schema-cadre');
  if (!cadre) return;
  const cibles = [...cadre.querySelectorAll(`[data-p="${phys}"]`)];
  for (const [id, , d] of TOUCHES_CONSOLE[c] || []) {
    if ((ou[`touche_${id}`] || parent?.[`touche_${id}`] || d) === phys) cibles.push(...cadre.querySelectorAll(`[data-b="${id}"]`));
  }
  for (const el of cibles) {
    el.classList.remove('appuye');
    void el.getBoundingClientRect();
    el.classList.add('appuye');
    clearTimeout(el._fin);
    el._fin = setTimeout(() => el.classList.remove('appuye'), 380);
  }
}
function viserSchema(bouton) {
  const cadre = $('#section .schema-cadre');
  if (!cadre) return;
  cadre.classList.toggle('a-vise', Boolean(bouton));
  cadre.querySelectorAll('[data-b]').forEach((el) => el.classList.toggle('vise', Boolean(bouton) && el.dataset.b === bouton));
}

window.__TAURI__.event.listen('pad-brut', (e) => {
  if (onglet !== 'reglages' || !regPage || captureTouche) return;
  const g = regPage.jeu && games.find((x) => x.path === regPage.jeu);
  const c = regPage.console || g?.console;
  if (!c) return;
  allumerSchema(c, g ? emu.jeux[g.path] || {} : emu.consoles[c] || {}, g ? emu.consoles[c] : null, e.payload);
});
