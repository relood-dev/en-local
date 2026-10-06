/* Le dossier des jeux : où il est, ce qu'il contient, et son rangement. */
let dossierInfo = null;
async function chargerDossier() {
  dossierInfo = await invoke('dossier_jeux').catch(() => null);
  return dossierInfo;
}
const nbJeuxDossier = (i) => Object.values(i?.consoles || {}).reduce((t, n) => t + n, 0);
/** Exemple : « Switch 4 · 3DS 9 · Wii U 1 » */
const resumeDossier = (i) => ORDRE.filter((c) => i?.consoles?.[c]).map((c) => `${NOMS[c]} ${i.consoles[c]}`).join(' · ');

/** Choix possibles : [valeur, titre, texte]. */
function choixDossiers(i) {
  const l = [];
  if (i?.existe) l.push([i.chemin, 'Garder ce dossier', `${i.chemin}${nbJeuxDossier(i) ? ` · ${resumeDossier(i)}` : ' · vide pour l\'instant'}`]);
  l.push(['choisir', 'Choisir un dossier existant', 'Où sont déjà tes jeux (la fenêtre de Windows s\'ouvre).']);
  l.push(['creer', 'Créer un nouveau dossier', 'Choisis où, puis donne-lui un nom.']);
  for (const d of i?.disques || []) {
    const chemin = d.lettre === 'C' ? 'C:\\EnLocal\\Jeux' : `${d.lettre}:\\Jeux En Local`;
    if (chemin.toLowerCase() === (i?.chemin || '').toLowerCase()) continue;
    l.push([chemin, `Créer sur le disque ${d.lettre}:`, `${chemin} · ${d.libre} Go libres sur ${d.total}`]);
  }
  return l;
}

/** Applique le choix, puis relit les jeux. */
async function definirDossier(v) {
  let chemin = v;
  try {
    if (v === 'choisir') {
      chemin = await invoke('choisir_dossier', { titre: 'Choisis le dossier de tes jeux' });
      if (!chemin) return false;
      chemin = await invoke('definir_dossier_jeux', { chemin });
    } else if (v === 'creer') {
      const parent = await invoke('choisir_dossier', { titre: 'Où créer le dossier de tes jeux ?' });
      if (!parent) return false;
      chemin = await new Promise((ok) => saisirTexte({
        titre: 'Nom du dossier',
        texte: `Dans ${parent}. En Local y crée un dossier par console.`,
        champs: [{ id: 'nom', label: 'Nom', valeur: 'Jeux En Local' }],
        bouton: 'Créer',
        valider: async ({ nom }) => {
          try {
            ok(await invoke('creer_dossier_jeux', { parent, nom }));
          } catch (e) {
            return String(e);
          }
        },
      }));
    } else {
      chemin = await invoke('definir_dossier_jeux', { chemin });
    }
  } catch (e) {
    oops(e);
    return false;
  }
  await chargerDossier();
  toast(`Dossier des jeux : ${chemin}`);
  if (jeuxCharges) rechargerJeux();
  return true;
}

/** Montre ce qui va bouger, puis range. */
async function rangerDossier() {
  const r = await invoke('ranger_jeux', { simuler: true }).catch(() => null);
  const l = r?.liste || [];
  if (!l.length) return toast('Tout est déjà bien rangé');
  const court = (p) => p.replace(dossierInfo?.chemin || '', '').replace(/^\\/, '');
  sheet(`Ranger ${l.length} fichier${l.length > 1 ? 's' : ''} ?`, 'Chaque jeu va dans le dossier de sa console (Switch : un dossier par jeu), chaque mise à jour et DLC avec son jeu. Rien n\'est supprimé.', [
    { label: `Ranger (${l.length})`, fn: async () => {
      const f = await invoke('ranger_jeux', { simuler: false }).catch(() => null);
      toast(`${f?.faits || 0} fichier${(f?.faits || 0) > 1 ? 's' : ''} rangé${(f?.faits || 0) > 1 ? 's' : ''}`);
      await chargerDossier();
      rechargerJeux();
    } },
    ...l.slice(0, 12).map((x) => ({ label: `${court(x.de)} → ${court(x.vers)}` })),
    { label: 'Annuler', cancel: true },
  ]);
}
