// Voix off : chaque réplique dit par la voix « Thomas » de macOS, en WAV.
// node outils/voix.mjs [textes.js] [durees.json]
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const [textes = 'textes.js', sortie = 'durees.json'] = process.argv.slice(2);
const { REPLIQUES } = await import(`../src/${textes}`);

const durees = {};
for (const [id, texte] of Object.entries(REPLIQUES)) {
  const aiff = `/tmp/voix-${id}.aiff`;
  execFileSync('say', ['-v', 'Thomas', '-r', '178', '-o', aiff, texte]);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', aiff, '-ar', '48000', '-ac', '2', `public/voix/${id}.wav`]);
  const s = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', `public/voix/${id}.wav`]).toString();
  durees[id] = Math.round(parseFloat(s) * 100) / 100;
  fs.rmSync(aiff);
}
fs.writeFileSync(`src/${sortie}`, JSON.stringify(durees, null, 2));
console.log(durees);
