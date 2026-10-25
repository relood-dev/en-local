// Musique des vidéos : les morceaux du menu d'En Local (proto/ui/js/musique-menu.js), rendus hors ligne en WAV.
// node outils/musique.mjs <morceau> <secondes> <sortie.wav>
import { OfflineAudioContext } from 'node-web-audio-api';
import fs from 'node:fs';
import vm from 'node:vm';

const [nom = 'salon', secondes = '90', sortie = 'public/audio/salon.wav'] = process.argv.slice(2);
const code = fs.readFileSync(new URL('../../proto/ui/js/musique-menu.js', import.meta.url), 'utf8')
  .replace(/setInterval\(surveillerMusiqueMenu[\s\S]*$/, '');
const RATE = 48000;
const a = new OfflineAudioContext(2, Math.ceil(RATE * (Number(secondes) + 3)), RATE);
const ctx = { Math, console, document: { addEventListener() {} }, localStorage: {}, setInterval: () => 0, clearInterval() {}, setTimeout() {} };
vm.createContext(ctx);
vm.runInContext(code + '\n;globalThis.__m = { MORCEAUX, jouerPas, reverbe };', ctx);
const { MORCEAUX, jouerPas, reverbe } = ctx.__m;

// Même chaîne que lancerMusiqueMenu, avec fondu d'entrée et de sortie.
const fondu = a.createGain();
fondu.gain.setValueAtTime(0, 0);
fondu.gain.linearRampToValueAtTime(0.9, 2);
fondu.gain.setValueAtTime(0.9, Number(secondes) - 2.5);
fondu.gain.linearRampToValueAtTime(0, Number(secondes));
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

const etat = { a, nom, fondu, sortie: sortieM, sec, pas: 0, phrase: null, graine: 1 };
const pas = 60 / MORCEAUX[nom].bpm / 4;
for (let t = 0.1; t < Number(secondes); t += pas) jouerPas(etat, t);
const buf = await a.startRendering();

// WAV 16 bits stéréo.
const n = buf.length;
const out = Buffer.alloc(44 + n * 4);
out.write('RIFF', 0); out.writeUInt32LE(36 + n * 4, 4); out.write('WAVEfmt ', 8);
out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(2, 22); out.writeUInt32LE(RATE, 24);
out.writeUInt32LE(RATE * 4, 28); out.writeUInt16LE(4, 32); out.writeUInt16LE(16, 34); out.write('data', 36); out.writeUInt32LE(n * 4, 40);
const [g, d] = [buf.getChannelData(0), buf.getChannelData(1)];
for (let i = 0; i < n; i++) {
  out.writeInt16LE(Math.max(-1, Math.min(1, g[i])) * 32767 | 0, 44 + i * 4);
  out.writeInt16LE(Math.max(-1, Math.min(1, d[i])) * 32767 | 0, 46 + i * 4);
}
fs.writeFileSync(sortie, out);
console.log(`${sortie} : ${nom}, ${secondes} s`);
