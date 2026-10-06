/*
 * Musique des menus, composée en direct (WebAudio), sans fichier.
 * Coupée pendant un jeu, une vidéo, ta musique, ou quand la fenêtre est réduite.
 */
const midi = (n) => 440 * 2 ** ((n - 69) / 12);

const MORCEAUX = {
  salon: {
    bpm: 82, swing: 0.14,
    accords: [[65, 69, 72, 76], [64, 67, 71, 74], [62, 65, 69, 72], [60, 64, 67, 71]],
    basses: [[41, 0, 6], [40, 0, 6], [38, 0, 6], [36, 0, 6, 10]],
    gamme: [72, 74, 76, 79, 81, 84, 86, 88], densite: 0.42, melodie: 'epiano',
    rythme: { kick: [0, 7, 10], caisse: [4, 12], charley: [0, 2, 4, 6, 8, 10, 12, 14] },
    nappe: false, frappe: [0, 6, 10],
  },
  boutique: {
    bpm: 108, swing: 0.06,
    accords: [[60, 64, 67, 71], [57, 61, 64, 67], [62, 65, 69, 72], [55, 59, 62, 65]],
    basses: [[48, 0, 6, 8, 14], [45, 0, 6, 8, 14], [50, 0, 6, 8, 14], [43, 0, 6, 8, 14]],
    gamme: [76, 79, 81, 83, 84, 86, 88, 91], densite: 0.5, melodie: 'marimba',
    rythme: { kick: [0, 8], bord: [3, 6, 10, 13], charley: [0, 2, 4, 6, 8, 10, 12, 14] },
    nappe: false, frappe: [0, 3, 6, 10, 12],
  },
  nuit: {
    bpm: 64, swing: 0,
    accords: [[57, 60, 64, 67, 71], [53, 57, 60, 64], [48, 52, 55, 59, 62], [55, 59, 62, 66]],
    basses: [[33, 0], [29, 0], [36, 0], [31, 0]],
    gamme: [69, 71, 72, 74, 76, 79, 81, 83], densite: 0.2, melodie: 'cloche',
    rythme: {}, nappe: true, frappe: [],
  },
};

let mm = null;

/** Hasard reproductible : une phrase rejouée sonne comme un motif. */
const graine = (s) => () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);

function reverbe(a) {
  const n = a.sampleRate * 2.4;
  const ir = a.createBuffer(2, n, a.sampleRate);
  for (let c = 0; c < 2; c++) {
    const x = ir.getChannelData(c);
    for (let i = 0; i < n; i++) x[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 3;
  }
  const r = a.createConvolver();
  r.buffer = ir;
  return r;
}

function env(a, t, v, at, d, vers) {
  const g = a.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(v, t + at);
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  g.connect(vers);
  return g;
}
function osc(a, type, f, t, d, vers, detune = 0) {
  const o = a.createOscillator();
  o.type = type;
  o.frequency.value = f;
  o.detune.value = detune;
  o.connect(vers);
  o.start(t);
  o.stop(t + d + 0.05);
}
function bruit(a, t, d, vers, type, f, q = 1) {
  const n = Math.ceil(a.sampleRate * d);
  const buf = a.createBuffer(1, n, a.sampleRate);
  const x = buf.getChannelData(0);
  for (let i = 0; i < n; i++) x[i] = Math.random() * 2 - 1;
  const s = a.createBufferSource();
  s.buffer = buf;
  const filtre = a.createBiquadFilter();
  filtre.type = type;
  filtre.frequency.value = f;
  filtre.Q.value = q;
  s.connect(filtre).connect(vers);
  s.start(t);
}

const INSTRUMENTS = {
  epiano: (a, t, f, d, v, o) => {
    const g = env(a, t, v, 0.01, d + 0.6, o);
    osc(a, 'sine', f, t, d + 0.6, g);
    osc(a, 'triangle', f, t, d + 0.6, env(a, t, v * 0.25, 0.005, 0.5, g), 6);
    osc(a, 'sine', f * 4, t, 0.2, env(a, t, v * 0.12, 0.002, 0.15, g));
  },
  marimba: (a, t, f, d, v, o) => {
    osc(a, 'sine', f, t, 0.5, env(a, t, v, 0.003, 0.45, o));
    osc(a, 'sine', f * 4, t, 0.1, env(a, t, v * 0.25, 0.002, 0.08, o));
  },
  cloche: (a, t, f, d, v, o) => {
    osc(a, 'sine', f, t, 2.2, env(a, t, v, 0.005, 2.2, o));
    osc(a, 'sine', f * 2.76, t, 1, env(a, t, v * 0.2, 0.003, 0.9, o));
    osc(a, 'sine', f * 5.4, t, 0.4, env(a, t, v * 0.08, 0.002, 0.35, o));
  },
  accord: (a, t, f, d, v, o) => {
    const filtre = a.createBiquadFilter();
    filtre.type = 'lowpass';
    filtre.frequency.value = 1400;
    filtre.connect(o);
    const g = env(a, t, v, 0.008, d, filtre);
    osc(a, 'triangle', f, t, d, g);
    osc(a, 'sine', f * 2, t, d * 0.5, env(a, t, v * 0.2, 0.005, d * 0.4, g));
  },
  nappe: (a, t, f, d, v, o) => {
    const filtre = a.createBiquadFilter();
    filtre.type = 'lowpass';
    filtre.frequency.setValueAtTime(500, t);
    filtre.frequency.linearRampToValueAtTime(1100, t + d * 0.5);
    filtre.frequency.linearRampToValueAtTime(500, t + d);
    filtre.connect(o);
    const g = a.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + d * 0.35);
    g.gain.linearRampToValueAtTime(0, t + d + 0.8);
    g.connect(filtre);
    for (const dt of [-8, 8]) osc(a, 'sawtooth', f, t, d + 0.9, g, dt);
  },
  basse: (a, t, f, d, v, o) => {
    const filtre = a.createBiquadFilter();
    filtre.type = 'lowpass';
    filtre.frequency.value = 380;
    filtre.connect(o);
    const g = env(a, t, v, 0.01, d, filtre);
    osc(a, 'triangle', f, t, d, g);
    osc(a, 'sine', f / 2, t, d, env(a, t, v * 0.6, 0.01, d, g));
  },
  kick: (a, t, v, o) => {
    const k = a.createOscillator();
    k.frequency.setValueAtTime(110, t);
    k.frequency.exponentialRampToValueAtTime(42, t + 0.18);
    k.connect(env(a, t, v, 0.003, 0.28, o));
    k.start(t);
    k.stop(t + 0.3);
  },
  caisse: (a, t, v, o) => {
    bruit(a, t, 0.16, env(a, t, v * 0.55, 0.002, 0.15, o), 'bandpass', 1900, 0.8);
    osc(a, 'triangle', 190, t, 0.08, env(a, t, v * 0.4, 0.002, 0.07, o));
  },
  bord: (a, t, v, o) => osc(a, 'square', 1700, t, 0.03, env(a, t, v * 0.18, 0.001, 0.025, o)),
  charley: (a, t, v, o) => bruit(a, t, 0.05, env(a, t, v, 0.001, 0.04, o), 'highpass', 7500),
};

/** Mélodie d'une phrase de 2 mesures. */
function phrase(m, rng, mesure) {
  const notes = [];
  let deg = Math.floor(rng() * 3) + 2;
  for (let p = 0; p < 32; p++) {
    const fort = p % 4 === 0;
    if (rng() > m.densite * (fort ? 1.5 : p % 2 ? 0.5 : 0.9)) continue;
    deg = Math.max(0, Math.min(m.gamme.length - 1, deg + Math.round((rng() - 0.5) * 4)));
    let n = m.gamme[deg];
    if (fort) {
      const acc = m.accords[(mesure + (p >> 4)) % m.accords.length].map((x) => x + 12 * Math.round((n - x) / 12));
      n = acc.reduce((b, x) => (Math.abs(x - n) < Math.abs(b - n) ? x : b), acc[0]);
    }
    notes.push([p, n]);
  }
  return notes.map(([p, n], k) => [p, n, ((notes[k + 1]?.[0] ?? 32) - p)]);
}

function jouerPas(mm, t) {
  const m = MORCEAUX[mm.nom];
  const a = mm.a;
  const pas = mm.pas % 16;
  const mesure = Math.floor(mm.pas / 16);
  const duree = 60 / m.bpm / 4;
  const swing = pas % 2 ? duree * m.swing : 0;
  const tt = t + swing;
  const accord = m.accords[mesure % m.accords.length];
  const [racine, ...coups] = m.basses[mesure % m.basses.length];
  // Nouvelle phrase toutes les 2 mesures, rejouée une fois sur deux.
  if (mesure % 2 === 0 && pas === 0) {
    if (mesure % 4 === 0) mm.graine = Math.floor(Math.random() * 1e9);
    mm.phrase = phrase(m, graine(mm.graine + (mesure % 8 >= 4 ? 7 : 0)), mesure);
  }
  if (m.nappe && pas === 0) accord.forEach((n) => INSTRUMENTS.nappe(a, tt, midi(n), duree * 16, 0.035, mm.sortie));
  if (m.frappe.includes(pas)) accord.forEach((n) => INSTRUMENTS.accord(a, tt, midi(n), duree * (pas === 0 ? 5 : 3), 0.045, mm.sortie));
  if (coups.includes(pas)) INSTRUMENTS.basse(a, tt, midi(pas >= 8 && coups.length > 2 ? racine + 7 : racine), duree * 3.5, 0.26, mm.sortie);
  for (const [k, liste] of Object.entries(m.rythme)) {
    if (liste.includes(pas)) INSTRUMENTS[k](a, tt, k === 'kick' ? 0.32 : k === 'charley' ? (pas % 4 ? 0.035 : 0.06) : 0.3, mm.sec);
  }
  const p = (mesure % 2) * 16 + pas;
  for (const [q, n, l] of mm.phrase || []) if (q === p) INSTRUMENTS[m.melodie](a, tt, midi(n), duree * l, m.melodie === 'cloche' ? 0.07 : 0.1, mm.sortie);
  mm.pas++;
}

function lancerMusiqueMenu(nom) {
  const a = sortie();
  const fondu = a.createGain();
  fondu.gain.setValueAtTime(0, a.currentTime);
  fondu.gain.linearRampToValueAtTime(niveauMusiqueMenu(), a.currentTime + 2.5);
  fondu.connect(a.destination);
  const sortieM = a.createGain();
  const sec = a.createGain();
  const rev = reverbe(a);
  const envoi = a.createGain();
  envoi.gain.value = 0.35;
  sortieM.connect(fondu);
  sortieM.connect(envoi).connect(rev).connect(fondu);
  sec.connect(fondu);
  const envoiSec = a.createGain();
  envoiSec.gain.value = 0.08;
  sec.connect(envoiSec).connect(rev);
  const etat = { a, nom, fondu, sortie: sortieM, sec, pas: 0, prochain: a.currentTime + 0.1, phrase: null, graine: 1 };
  etat.minuterie = setInterval(() => {
    const duree = 60 / MORCEAUX[nom].bpm / 4;
    // Minuterie en retard : on repart de maintenant, sans rafale de notes.
    if (etat.prochain < a.currentTime - 0.2) etat.prochain = a.currentTime + 0.05;
    while (etat.prochain < a.currentTime + 0.15) {
      jouerPas(etat, etat.prochain);
      etat.prochain += duree;
    }
  }, 30);
  mm = etat;
}
const niveauMusiqueMenu = () => 1.2 * vol('general') * vol('musique');
function volumeMusiqueMenu() {
  if (!mm) return;
  const g = mm.fondu.gain;
  g.cancelScheduledValues(mm.a.currentTime);
  g.setValueAtTime(g.value, mm.a.currentTime);
  g.linearRampToValueAtTime(niveauMusiqueMenu(), mm.a.currentTime + 0.15);
}
function arreterMusiqueMenu() {
  if (!mm) return;
  const { a, fondu, minuterie } = mm;
  mm = null;
  clearInterval(minuterie);
  fondu.gain.cancelScheduledValues(a.currentTime);
  fondu.gain.setValueAtTime(fondu.gain.value, a.currentTime);
  fondu.gain.linearRampToValueAtTime(0, a.currentTime + 0.6);
  setTimeout(() => fondu.disconnect(), 700);
}

/** Joue seulement hors jeu, vidéo et musique perso, fenêtre visible. */
function surveillerMusiqueMenu() {
  const nom = localStorage.musiqueMenu || 'salon';
  const veut = MORCEAUX[nom] && vol('musique') > 0 && !current && musique.paused && !(vue?.sorte === 'video') && !document.hidden;
  if (mm && (!veut || mm.nom !== nom)) arreterMusiqueMenu();
  if (veut && !mm) lancerMusiqueMenu(nom);
}
setInterval(surveillerMusiqueMenu, 400);
document.addEventListener('visibilitychange', surveillerMusiqueMenu);
