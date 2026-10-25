// Effets sonores des vidéos : ceux de l'app (proto/ui/js/sons.js), plus quelques-uns dans le même style
// (carré 8 bits, souffles), rendus hors ligne en WAV dans public/audio/sfx-<nom>.wav.
// node outils/sons.mjs
import { OfflineAudioContext } from 'node-web-audio-api';
import fs from 'node:fs';
import vm from 'node:vm';

const RATE = 48000;
const code = fs.readFileSync(new URL('../../proto/ui/js/sons.js', import.meta.url), 'utf8');

// Les nôtres, avec les briques de l'app (note, souffle, cloche).
const EN_PLUS = `
SONS.whoosh = (a) => souffle(a, { d: 0.35, v: 0.22, de: 300, vers: 5000, q: 0.6 });
SONS.whooshBas = (a) => souffle(a, { d: 0.4, v: 0.2, de: 4000, vers: 250, q: 0.6 });
SONS.pixel = (a) => [523.25, 783.99, 1046.5].forEach((f, k) => note(a, { f, type: 'square', t: k * 0.045, d: 0.06, v: 0.05 }));
SONS.piece = (a) => { note(a, { f: 987.77, type: 'square', d: 0.07, v: 0.06 }); note(a, { f: 1318.5, type: 'square', t: 0.07, d: 0.32, v: 0.06 }); };
SONS.niveau = (a) => [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5, 1318.5].forEach((f, k) => note(a, { f, type: 'square', t: k * 0.075, d: 0.09, v: 0.05 }));
SONS.impact = (a) => { note(a, { f: 160, vers: 45, type: 'sine', d: 0.35, v: 0.5 }); souffle(a, { d: 0.18, v: 0.18, de: 2000, vers: 200, q: 0.5 }); };
SONS.tape = (a) => { note(a, { f: 2400, vers: 1200, type: 'triangle', d: 0.03, v: 0.14 }); souffle(a, { d: 0.04, v: 0.1, de: 6000, vers: 3000, q: 2 }); };
SONS.envoi = (a) => { note(a, { f: 600, vers: 1800, type: 'sine', d: 0.18, v: 0.12 }); souffle(a, { d: 0.2, v: 0.08, de: 800, vers: 6000, q: 1 }); };
SONS.bouclier = (a) => { note(a, { f: 392, type: 'square', d: 0.1, v: 0.05 }); note(a, { f: 587.33, type: 'square', t: 0.08, d: 0.1, v: 0.05 }); cloche(a, 1174.66, 0.16, 0.14, 0.7); };
SONS.compte = (a) => note(a, { f: 1760, type: 'square', d: 0.025, v: 0.035 });
`;

const nouveaux = ['whoosh', 'whooshBas', 'pixel', 'piece', 'niveau', 'impact', 'tape', 'envoi', 'bouclier', 'compte'];
const app = ['tic', 'ok', 'onglet', 'ouvrir', 'notif', 'lancer', 'arrivee', 'succes', 'pause', 'reprise', 'photo'];
fs.mkdirSync('public/audio', { recursive: true });

for (const nom of [...app, ...nouveaux]) {
  const a = new OfflineAudioContext(2, RATE * 2, RATE);
  a.maitre = a.createGain();
  a.maitre.gain.value = 0.9;
  a.maitre.connect(a.destination);
  const ctx = { Math, console, localStorage: {}, performance: { now: () => 0 }, invoke: () => Promise.resolve() };
  vm.createContext(ctx);
  vm.runInContext(`${code}\n${EN_PLUS}\n;globalThis.__s = SONS;`, ctx);
  ctx.__s[nom](a);
  const buf = await a.startRendering();
  // Coupé au dernier son audible.
  const [g, d] = [buf.getChannelData(0), buf.getChannelData(1)];
  let n = buf.length;
  while (n > 1 && Math.abs(g[n - 1]) < 1e-4 && Math.abs(d[n - 1]) < 1e-4) n--;
  n = Math.min(buf.length, n + RATE * 0.05);
  const out = Buffer.alloc(44 + n * 4);
  out.write('RIFF', 0); out.writeUInt32LE(36 + n * 4, 4); out.write('WAVEfmt ', 8);
  out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(2, 22); out.writeUInt32LE(RATE, 24);
  out.writeUInt32LE(RATE * 4, 28); out.writeUInt16LE(4, 32); out.writeUInt16LE(16, 34); out.write('data', 36); out.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    out.writeInt16LE(Math.max(-1, Math.min(1, g[i])) * 32767 | 0, 44 + i * 4);
    out.writeInt16LE(Math.max(-1, Math.min(1, d[i])) * 32767 | 0, 46 + i * 4);
  }
  fs.writeFileSync(`public/audio/sfx-${nom}.wav`, out);
}
console.log(`${app.length + nouveaux.length} effets dans public/audio`);
