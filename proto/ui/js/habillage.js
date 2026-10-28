/*
 * Habillage : fenêtre transparente posée sur le jeu (décor, avatar, joueurs de la session).
 * Elle ne prend ni la souris ni le clavier.
 */
const { listen, emitTo } = window.__TAURI__.event;
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
// N'accepte que les images connues (avatars Discord, images d'En Local).
const image = (u) => (/^(https:|asset:|http:\/\/asset\.localhost\/|img\/)/.test(u || '') ? u : 'img/hang-coucou.png');
let d = null;
let vus = null;
const R = 22;

/** Zone du jeu, même calcul que embed.rs (rect_jeu) : sous l'encoche du Mac, s'il y en a une. */
function trou() {
  const f = d?.format || 0, e = d?.encoche || 0, H = innerHeight - e;
  // Même format que l'écran : le jeu prend tout.
  if (!f || Math.abs(innerWidth / H / f - 1) <= 0.04) return { x: 0, y: e, w: innerWidth, h: H };
  const m = Math.min(40, Math.max(12, Math.trunc(H / 30)));
  const w = innerWidth - 2 * m, h = H - 2 * m;
  if (w / h > f) {
    const gw = Math.round(h * f);
    return { x: m + Math.trunc((w - gw) / 2), y: e + m, w: gw, h };
  }
  const gh = Math.round(w / f);
  return { x: m, y: e + m + Math.trunc((h - gh) / 2), w, h: gh };
}

/** Rectangles des écrans en pixels. */
function ecrans() {
  const t = trou();
  const liste = Array.isArray(d?.ecrans) && d.ecrans.length ? d.ecrans : [[0, 0, 1, 1]];
  // 3DS : le décor couvre les lignes noires laissées par Azahar sur les bords.
  const m = liste.length > 1 ? 3 : 0;
  return liste.map(([fx, fy, fw, fh], i) => {
    const haut = i === 0 ? m : 0, bas = i === liste.length - 1 ? m : 0;
    return { x: Math.round(t.x + fx * t.w) + m, y: Math.round(t.y + fy * t.h) + haut, w: Math.round(fw * t.w) - 2 * m, h: Math.round(fh * t.h) - haut - bas };
  });
}
function arrondi({ x, y, w, h }, r, [hg, hd, bd, bg]) {
  const c = (o) => (o ? r : 0);
  return `M${x + c(hg)} ${y}H${x + w - c(hd)}` + (hd ? `A${r} ${r} 0 0 1 ${x + w} ${y + r}` : '') + `V${y + h - c(bd)}` + (bd ? `A${r} ${r} 0 0 1 ${x + w - r} ${y + h}` : '')
    + `H${x + c(bg)}` + (bg ? `A${r} ${r} 0 0 1 ${x} ${y + h - r}` : '') + `V${y + c(hg)}` + (hg ? `A${r} ${r} 0 0 1 ${x + r} ${y}` : '') + 'Z';
}
/** Le décor, troué à la place des écrans. */
function decor() {
  const W = innerWidth, H = innerHeight, e = ecrans();
  const r = Math.min(R, ...e.map((x) => Math.min(x.w, x.h) / 2));
  // Deux écrans empilés : un seul trou en forme de T.
  const trous = e.map((x, i) => {
    const dessus = e[i - 1], dessous = e[i + 1];
    const colle = (v) => v && v.w >= x.w;
    return arrondi(x, r, [!colle(dessus), !colle(dessus), !colle(dessous), !colle(dessous)]);
  }).join(' ');
  // Jeu en plein écran : pas de décor, seulement les bulles.
  const plein = e.length === 1 && e[0].x <= 0 && e[0].y <= 0 && e[0].w >= W && e[0].h >= H;
  $('#decor').style.display = plein ? 'none' : '';
  document.body.classList.toggle('plein', plein);
  if (plein) return;
  $('#decor').style.clipPath = `path(nonzero, 'M0 0V${H}H${W}V0Z ${trous}')`;
  const contour = e.length > 1 ? forme(e, r) : trous;
  // Ombre floutée par un filtre SVG : le filtre CSS ne marche pas sur un tracé SVG dans WebKit (Mac),
  // qui dessinait alors un épais contour noir.
  $('#cadres').innerHTML = `<svg width="${W}" height="${H}"><defs><filter id="flou" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="16"/></filter></defs><path class="ombre" filter="url(#flou)" d="${contour}"/><path class="trait" d="${contour}"/></svg>`;
}
/** Contour d'écrans empilés, en un seul tracé. */
function forme(e, r) {
  const pts = [];
  e.forEach((x) => pts.push([x.x + x.w, x.y], [x.x + x.w, x.y + x.h]));
  [...e].reverse().forEach((x) => pts.push([x.x, x.y + x.h], [x.x, x.y]));
  // Seuls les coins saillants sont arrondis.
  const n = pts.length;
  let dd = '';
  for (let i = 0; i < n; i++) {
    const [px, py] = pts[(i - 1 + n) % n], [cx, cy] = pts[i], [nx, ny] = pts[(i + 1) % n];
    const lin = Math.hypot(cx - px, cy - py), lout = Math.hypot(nx - cx, ny - cy);
    if (!lin || !lout) continue;
    const saillant = (cx - px) * (ny - cy) - (cy - py) * (nx - cx) > 0;
    const k = saillant ? Math.min(r, lin / 2, lout / 2) : 0;
    const a = [cx - ((cx - px) / lin) * k, cy - ((cy - py) / lin) * k], b = [cx + ((nx - cx) / lout) * k, cy + ((ny - cy) / lout) * k];
    dd += `${dd ? 'L' : 'M'}${a[0]} ${a[1]}` + (k ? `Q${cx} ${cy} ${b[0]} ${b[1]}` : '');
  }
  return dd + 'Z';
}

/** Joueurs de la session : à côté du jeu s'il y a la place, sinon dans la marge du bas, à sa taille. */
function placerBas() {
  const t = trou(), libre = innerHeight - (t.y + t.h), cote = innerWidth - (t.x + t.w);
  const b = $('#bas');
  if (cote >= 90 || !d) {
    b.classList.remove('serre');
    b.style.cssText = '';
    return;
  }
  const taille = Math.min(56, libre - 12);
  b.classList.toggle('serre', taille < 22);
  b.style.setProperty('--avatar', `${Math.max(taille, 0)}px`);
  b.style.bottom = `${Math.max(4, Math.round((libre - Math.max(taille, 0)) / 2))}px`;
  b.style.right = `${Math.max(14, Math.round(cote + 8))}px`;
}

/** Décor : le jeu en tout petit, fondu doucement dans le flou (4 fois par seconde). */
const DECOR_JEU_COUPE = true;
const ambiance = $('#ambiance');
const pinceau = ambiance.getContext('2d');
let enCours = false;
setInterval(async () => {
  // Coupé pour l'instant : le décor reste celui de Windows (trame de points). Remettre « false » pour l'essayer.
  if (DECOR_JEU_COUPE || enCours || !d || document.body.classList.contains('plein')) return;
  enCours = true;
  try {
    const buf = await window.__TAURI__.core.invoke('apercu_jeu');
    const v = new DataView(buf);
    if (buf.byteLength <= 4) return ambiance.classList.remove('vue');
    const w = v.getUint16(0, true), h = v.getUint16(2, true);
    if (buf.byteLength < 4 + w * h * 4) return;
    const img = new OffscreenCanvas(w, h);
    img.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(buf, 4, w * h * 4), w, h), 0, 0);
    pinceau.globalAlpha = ambiance.classList.contains('vue') ? 0.35 : 1;
    pinceau.drawImage(img, 0, 0, ambiance.width, ambiance.height);
    ambiance.classList.add('vue');
  } catch {
    ambiance.classList.remove('vue');
  } finally {
    enCours = false;
  }
}, 250);

function bulle(m, texte, part) {
  const b = document.createElement('div');
  b.className = `bulle${part ? ' part' : ''}`;
  b.innerHTML = `<span>${esc(texte)}</span><img src="${esc(image(m.avatar))}" alt="">`;
  $('.bulles').append(b);
  setTimeout(() => b.remove(), 5200);
}

function joueurs() {
  const s = d.session;
  const membres = (Array.isArray(s?.membres) ? s.membres : []).slice(0, 8);
  const ici = new Map(membres.map((m) => [m.id, m]));
  // Bulles d'arrivée et de départ (pas au premier affichage), même sans les widgets.
  if (vus) {
    for (const [id, m] of ici) if (!vus.has(id)) bulle(m, `${m.name} a rejoint la partie`);
    for (const [id, m] of vus) if (!ici.has(id)) bulle(m, `${m.name} est parti`, true);
  }
  const avant = vus;
  vus = s ? ici : null;
  if (!s || !d.widgets) return ($('.joueurs').innerHTML = '', ($('.code').textContent = ''));
  $('.joueurs').innerHTML = membres.map((m) => `<img class="${avant && !avant.has(m.id) ? 'nouveau' : ''}" src="${esc(image(m.avatar))}" title="${esc(m.name)}" alt="">`).join('');
  $('.code').textContent = `Session ${s.code}`;
}

function dessiner() {
  if (!d) return;
  document.body.classList.add('pret');
  document.body.classList.toggle('oled', d.theme === 'oled');
  decor();
  const moi = $('.moi');
  // L'avatar s'affiche seulement s'il ne cache pas le jeu.
  if (d.widgets && d.moi && trou().x >= 110) moi.src = image(d.moi);
  else moi.removeAttribute('src');
  joueurs();
  placerBas();
  // Compteur de la chasse aux chromatiques.
  const c = $('#chasse');
  const n = Number(d.chasse);
  c.hidden = !(n >= 0 && d.chasse !== null && d.chasse !== undefined);
  if (!c.hidden && c.querySelector('span').textContent !== `${n} reset${n > 1 ? 's' : ''}`) {
    c.querySelector('span').textContent = `${n} reset${n > 1 ? 's' : ''}`;
    c.classList.remove('plus');
    void c.offsetWidth;
    c.classList.add('plus');
  }
}

listen('habillage', (e) => {
  if (!d) window.__TAURI__.core.invoke('journal', { texte: `habillage : reçu, format ${e.payload?.format}` }).catch(() => {});
  // Nouvelle session : on repart de zéro.
  if (e.payload?.session?.code !== d?.session?.code) vus = null;
  d = e.payload;
  dessiner();
});
addEventListener('resize', () => (decor(), placerBas()));
// Notification envoyée par la fenêtre principale.
listen('notif', (e) => bulle({ avatar: e.payload?.image }, String(e.payload?.texte || '').slice(0, 120)));
emitTo('main', 'habillage-pret').catch((e) => window.__TAURI__.core.invoke('journal', { texte: `habillage : emitTo ${e}` }));
window.__TAURI__.core.invoke('journal', { texte: 'habillage : page chargée' }).catch(() => {});
