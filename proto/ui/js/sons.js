/*
 * Sons de l'interface, synthétisés (aucun fichier).
 * Muets pendant un jeu, sauf le menu du jeu et les captures.
 */
let audio = null;
// Volumes doux par défaut.
const VOL_DEFAUT = { general: 60, effets: 60, musique: 30, perso: 80, jeux: 100 };
// Reprend l'ancien réglage « Sons » une seule fois.
if (localStorage.sons && localStorage['vol:effets'] === undefined) localStorage['vol:effets'] = { discrets: 30, coupes: 0 }[localStorage.sons] ?? 70;
const vol = (cle) => Math.max(0, Math.min(100, Number(localStorage['vol:' + cle] ?? VOL_DEFAUT[cle]))) / 100;
const volumeSons = () => vol('general') * vol('effets') * 0.7;

function changerVolume(cle, d) {
  localStorage['vol:' + cle] = Math.max(0, Math.min(100, Math.round(vol(cle) * 100 / 5) * 5 + d * 5));
  appliquerVolumes();
}
function appliquerVolumes() {
  if (audio) audio.maitre.gain.value = volumeSons();
  if (typeof musique !== 'undefined') musique.volume = vol('general') * vol('perso');
  if (typeof volumeMusiqueMenu === 'function') volumeMusiqueMenu();
  if (typeof current !== 'undefined' && current) volumeJeu();
}
/** Volume du jeu en cours (DS : géré par En Local, autres : mélangeur Windows). */
const volumeJeu = () => invoke('volume_jeux', { v: vol('general') * vol('jeux') }).catch(() => 0);

function sortie() {
  if (!audio) {
    audio = new AudioContext();
    audio.maitre = audio.createGain();
    audio.maitre.connect(audio.destination);
  }
  if (audio.state === 'suspended') audio.resume();
  audio.maitre.gain.value = volumeSons();
  return audio;
}

function note(a, { f, vers, type = 'sine', t = 0, d = 0.08, v = 0.3, attaque = 0.004 }) {
  const o = a.createOscillator();
  const g = a.createGain();
  const t0 = a.currentTime + t;
  o.type = type;
  o.frequency.setValueAtTime(f, t0);
  if (vers) o.frequency.exponentialRampToValueAtTime(vers, t0 + d);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(v, t0 + attaque);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
  o.connect(g).connect(a.maitre);
  o.start(t0);
  o.stop(t0 + d + 0.02);
}

function souffle(a, { t = 0, d = 0.12, v = 0.2, de = 800, vers = 3000, q = 1.2 }) {
  const n = Math.ceil(a.sampleRate * d);
  const buf = a.createBuffer(1, n, a.sampleRate);
  const x = buf.getChannelData(0);
  for (let i = 0; i < n; i++) x[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource();
  src.buffer = buf;
  const filtre = a.createBiquadFilter();
  filtre.type = 'bandpass';
  filtre.Q.value = q;
  const t0 = a.currentTime + t;
  filtre.frequency.setValueAtTime(de, t0);
  filtre.frequency.exponentialRampToValueAtTime(vers, t0 + d);
  const g = a.createGain();
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(v, t0 + d * 0.3);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
  src.connect(filtre).connect(g).connect(a.maitre);
  src.start(t0);
}

const cloche = (a, f, t = 0, v = 0.22, d = 0.5) => {
  note(a, { f, t, d, v });
  note(a, { f: f * 2.01, t, d: d * 0.6, v: v * 0.35 });
  note(a, { f: f * 3.02, t, d: d * 0.35, v: v * 0.15 });
};

const SONS = {
  tic: (a) => note(a, { f: 1650, type: 'triangle', d: 0.035, v: 0.16, attaque: 0.002 }),
  ok: (a) => { note(a, { f: 880, type: 'triangle', d: 0.07, v: 0.22 }); note(a, { f: 1320, type: 'triangle', t: 0.05, d: 0.1, v: 0.22 }); },
  retour: (a) => { note(a, { f: 990, type: 'triangle', d: 0.06, v: 0.18 }); note(a, { f: 660, type: 'triangle', t: 0.045, d: 0.09, v: 0.18 }); },
  onglet: (a) => { souffle(a, { d: 0.11, v: 0.12, de: 900, vers: 4200 }); note(a, { f: 1100, vers: 1500, type: 'sine', t: 0.03, d: 0.07, v: 0.12 }); },
  ouvrir: (a) => [660, 880, 1175].forEach((f, k) => note(a, { f, type: 'sine', t: k * 0.035, d: 0.12, v: 0.16 })),
  fermer: (a) => [1175, 880].forEach((f, k) => note(a, { f, type: 'sine', t: k * 0.035, d: 0.1, v: 0.14 })),
  bord: (a) => note(a, { f: 220, vers: 180, type: 'sine', d: 0.07, v: 0.22 }),
  notif: (a) => { cloche(a, 1318.5, 0, 0.16, 0.45); cloche(a, 1975.5, 0.09, 0.14, 0.6); },
  erreur: (a) => { note(a, { f: 196, type: 'square', d: 0.09, v: 0.06 }); note(a, { f: 185, type: 'square', t: 0.11, d: 0.12, v: 0.06 }); },
  lancer: (a) => {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, k) => note(a, { f, type: 'triangle', t: k * 0.06, d: 0.9 - k * 0.1, v: 0.14, attaque: 0.02 }));
    souffle(a, { t: 0.05, d: 0.5, v: 0.06, de: 400, vers: 6000, q: 0.7 });
  },
  arrivee: (a) => [783.99, 987.77, 1318.5].forEach((f, k) => cloche(a, f, k * 0.08, 0.15, 0.5)),
  succes: (a) => [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, k) => cloche(a, f, k * 0.07, 0.14, k === 4 ? 0.9 : 0.35)),
  pause: (a) => {
    souffle(a, { d: 0.22, v: 0.14, de: 5000, vers: 600, q: 0.9 });
    note(a, { f: 1046.5, vers: 523.25, type: 'sine', d: 0.18, v: 0.16 });
    cloche(a, 392, 0.12, 0.16, 0.7);
    cloche(a, 587.33, 0.12, 0.08, 0.7);
  },
  reprise: (a) => {
    souffle(a, { d: 0.18, v: 0.12, de: 600, vers: 5000, q: 0.9 });
    note(a, { f: 523.25, vers: 1046.5, type: 'sine', d: 0.16, v: 0.15 });
    note(a, { f: 1567.98, type: 'triangle', t: 0.12, d: 0.12, v: 0.1 });
  },
  quitter: (a) => [783.99, 587.33, 392].forEach((f, k) => cloche(a, f, k * 0.09, 0.13, k === 2 ? 0.7 : 0.3)),
  photo: (a) => { souffle(a, { d: 0.05, v: 0.35, de: 3000, vers: 1500, q: 0.8 }); souffle(a, { t: 0.07, d: 0.06, v: 0.25, de: 2000, vers: 900, q: 0.8 }); },
};

let dernierTic = 0;
function son(nom, enJeu = false) {
  if (!SONS[nom] || !volumeSons() || (!enJeu && typeof view === 'function' && view() === 'jeu')) return;
  // Touche maintenue : un tic toutes les 45 ms au plus.
  if (nom === 'tic') {
    const now = performance.now();
    if (now - dernierTic < 45) return;
    dernierTic = now;
  }
  try {
    SONS[nom](sortie());
  } catch {}
}

const SON_TOUCHE = { up: 'tic', down: 'tic', left: 'tic', right: 'tic', a: 'ok', b: 'retour', lb: 'onglet', rb: 'onglet', plus: 'ouvrir', lt: 'ouvrir', minus: 'ouvrir' };
const sonTouche = (k) => !(k === 'b' && view() === 'menu') && son(SON_TOUCHE[k]);

