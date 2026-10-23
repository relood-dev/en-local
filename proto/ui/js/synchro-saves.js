/*
 * Sauvegardes de tous les jeux, les mêmes sur tes PC et Mac (gardées par Loc, avec ton compte Discord).
 * Pour chaque jeu : la version d'ici, celle de Loc, et la dernière synchronisée ici (base).
 * Changée seulement ici : envoyée. Changée seulement ailleurs : reçue (l'ancienne est d'abord copiée
 * dans data\sauvegardes-remplacees). Changée des deux côtés : le joueur choisit. Jamais pendant une partie.
 * Réglages, En ligne, « Synchroniser mes sauvegardes ».
 */
const synchroSavesActive = () => localStorage.synchroSaves !== 'non';
const MAC_SYSTEME = /Mac OS X/.test(navigator.userAgent) ? 'mac' : 'windows';
let savesEnCours = null;

/** Le jeu d'une sauvegarde, pour l'afficher : son titre, sinon la console et le nom du dossier. */
function jeuDeSave(cle) {
  const [zone, ...reste] = cle.split('/');
  const fin = (reste.at(-1) || '').toLowerCase();
  const id = (x) => String(x || '').toLowerCase();
  const sans = (p) => p.split(/[\\/]/).pop().replace(/\.[^.]+$/, '').toLowerCase();
  const ascii = (hex) => (/^[0-9a-f]{8}$/.test(hex) ? hex.match(/../g).map((x) => String.fromCharCode(parseInt(x, 16))).join('').toLowerCase() : '');
  const g = {
    switch: () => games.find((x) => x.console === 'Switch' && id(x.title_id) === fin),
    '3ds': () => games.find((x) => x.console === '3DS' && id(x.title_id).endsWith(fin)),
    wiiu: () => games.find((x) => x.console === 'WiiU' && id(x.title_id).endsWith(fin)),
    wii: () => games.find((x) => x.console === 'Wii' && ascii(fin) && id(x.disc_id).startsWith(ascii(fin))),
    ds: () => games.find((x) => sans(x.path) === sans(fin)),
    retro: () => games.find((x) => sans(x.path) === sans(fin)),
  }[zone]?.();
  const console = { switch: 'Switch', '3ds': '3DS', wiiu: 'WiiU', wii: 'Wii', gc: 'GC', ps3: 'PS3' }[zone];
  return g ? titreDe(g) : `${LONG[console] || 'Sauvegarde'} · ${reste.at(-1) || cle}`;
}

const dateSave = (t) => (t ? new Date(t).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'date inconnue');
const appareilDe = (s) => (s === 'mac' ? 'ton Mac' : 'ton PC');
/** Le joueur choisit la version à garder ; null s'il remet à plus tard. */
const choisirVersion = (cle, ici, loc) => new Promise((ok) => (setTimeout(() => ok(null), 10 * 60_000), sheet(jeuDeSave(cle),
  `Cette sauvegarde a changé ici et sur ${appareilDe(loc.systeme)}. Laquelle garder ? L'autre est copiée de côté (data\\sauvegardes-remplacees), rien n'est perdu.`,
  [
    { label: `Celle de ${appareilDe(loc.systeme)} (${dateSave(loc.mtime || loc.at)})`, fn: () => ok('loc') },
    { label: `Celle d'ici (${dateSave(ici.mtime)})`, fn: () => ok('ici') },
    { label: 'Plus tard', cancel: true, fn: () => ok(null) },
  ])));

async function envoyerSave(cle, ici, base, dejaSurLoc) {
  for (const [rel, [h]] of Object.entries(ici.f)) {
    if (dejaSurLoc.has(h)) continue;
    const octets = await invoke('saves_lire', { cle, rel });
    const r = await fetch(`${API}/sauvegardes/fichiers/${h}`, { method: 'PUT', headers: { Authorization: `Bearer ${localStorage.token}`, 'Content-Type': 'application/octet-stream' }, body: octets });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `envoi refusé (${r.status})`);
    dejaSurLoc.add(h);
  }
  const r = await fetch(`${API}/sauvegardes/jeu`, {
    method: 'PUT', headers: { Authorization: `Bearer ${localStorage.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ cle, base: base || null, f: ici.f, mtime: ici.mtime, systeme: MAC_SYSTEME }),
  });
  const res = await r.json().catch(() => ({}));
  if (r.status === 409) return false; // changée ailleurs entre-temps : prochaine synchro
  if (!r.ok) throw new Error(res.error || `envoi refusé (${r.status})`);
  await invoke('saves_base', { cle, h: res.h });
  return true;
}

async function recevoirSave(cle, loc, ici) {
  for (const [rel, [h]] of Object.entries(loc.f)) {
    if (ici?.f[rel]?.[0] === h) continue;
    const r = await fetch(`${API}/sauvegardes/fichiers/${h}`, { headers: { Authorization: `Bearer ${localStorage.token}` } });
    if (!r.ok) throw new Error(`téléchargement refusé (${r.status})`);
    await invoke('saves_poser', new Uint8Array(await r.arrayBuffer()), { headers: { empreinte: h } });
  }
  await invoke('saves_appliquer', { cle, f: loc.f, h: loc.h });
}

/** Synchronise toutes les sauvegardes. Une seule à la fois ; jamais pendant une partie. */
function synchroSaves() {
  if (!me || !synchroSavesActive() || current) return Promise.resolve();
  return (savesEnCours ||= (async () => {
    try {
      const [moi, loc] = await Promise.all([invoke('saves_local'), api('GET', '/sauvegardes')]);
      if (!moi?.jeux || !loc?.jeux) return;
      const dejaSurLoc = new Set(Object.values(loc.jeux).flatMap((j) => Object.values(j.f || {}).map((v) => v[0])));
      let recues = 0, envoyees = 0;
      for (const cle of new Set([...Object.keys(moi.jeux), ...Object.keys(loc.jeux)])) {
        if (current) return; // une partie vient de commencer : on reprendra après
        const ici = moi.jeux[cle], l = loc.jeux[cle], base = moi.base[cle];
        try {
          if (ici?.h === l?.h) {
            if (ici && base !== ici.h) await invoke('saves_base', { cle, h: ici.h });
          } else if (ici && (!l || l.h === base)) {
            if (await envoyerSave(cle, ici, l?.h, dejaSurLoc)) envoyees++;
          } else if (l && (!ici || ici.h === base)) {
            await recevoirSave(cle, l, ici);
            recues++;
          } else {
            const choix = await choisirVersion(cle, ici, l);
            if (choix === 'loc') (await recevoirSave(cle, l, ici), recues++);
            else if (choix === 'ici' && (await envoyerSave(cle, ici, l.h, dejaSurLoc))) envoyees++;
          }
        } catch (e) {
          invoke('journal', { texte: `sauvegardes, ${cle} : ${e?.message || e}` }).catch(() => {});
        }
      }
      if (recues) toast(`${recues} sauvegarde${recues > 1 ? 's' : ''} reçue${recues > 1 ? 's' : ''} de tes autres appareils`);
      if (recues || envoyees) invoke('journal', { texte: `sauvegardes : ${envoyees} envoyée(s), ${recues} reçue(s)` }).catch(() => {});
    } catch (e) {
      invoke('journal', { texte: `sauvegardes : ${e?.message || e}` }).catch(() => {});
    } finally {
      savesEnCours = null;
    }
  })());
}
