/*
 * Progression partagée entre tes PC et Mac (gardée par Loc) : temps de jeu, compteurs des défis,
 * défis réussis. Chaque appareil envoie seulement la sienne ; l'app additionne celle des autres,
 * donc rien n'est compté deux fois. Le profil (Mii, collections, membres favoris, partage) est le
 * même partout : le dernier modifié l'emporte. Le Pokédex réunit ce qui est attrapé sur chaque appareil.
 * Les jeux, clés et sauvegardes restent sur chaque appareil.
 */
const appareil = (localStorage.appareil ||= crypto.randomUUID());
let progAutres = JSON.parse(localStorage.progAutres || 'null') || { stats: {}, compteurs: {}, defisFaits: [] };
/** Jeux installés sur mes autres appareils : [{ systeme, jeux: [{ k, t, c, id }] }]. */
let jeuxAutres = JSON.parse(localStorage.jeuxAutres || '[]');

/** Le même jeu d'un appareil à l'autre : console et identifiant (sinon le nom du fichier). */
const cleJeu = (g) => `${g.console}:${g.title_id || g.disc_id || (g.console === 'DS' ? dsKey(g) : '') || g.product_code || g.name}`.toLowerCase();

/** Ma progression, à envoyer. */
function maProgression() {
  const s = {};
  for (const g of games) {
    const st = stats[g.path];
    if (st?.secs || st?.last) s[cleJeu(g)] = { secs: st.secs || 0, last: st.last || 0, c: g.console, t: titreDe(g).slice(0, 80) };
  }
  const jeux = {};
  for (const g of games) if (compteurs.jeux?.[g.path]) jeux[cleJeu(g)] = compteurs.jeux[g.path];
  return { stats: s, compteurs: { ...compteurs, jeux }, defisFaits: JSON.parse(localStorage.defisFaits || '[]') };
}
/** Mes jeux installés ici, pour le profil sur mes autres appareils. */
const mesJeux = () => games.slice(0, 1000).map((g) => ({ k: cleJeu(g), t: titreDe(g).slice(0, 80), c: g.console, id: idGametdb(g) || undefined }));
/** Jeux de mes autres appareils absents d'ici (une fois chacun) : { k, t, c, id, systeme }. */
function jeuxAilleurs() {
  const ici = new Set(games.map(cleJeu));
  const vus = new Map();
  for (const a of jeuxAutres) for (const j of a.jeux || []) if (typeof j?.k === 'string' && typeof j.t === 'string' && !ici.has(j.k) && !vus.has(j.k)) vus.set(j.k, { ...j, systeme: a.systeme });
  return [...vus.values()];
}

/** Le profil, les jeux des collections par leur clé (un jeu absent d'ici garde sa clé). */
function profilActuel() {
  const cle = new Map(games.map((g) => [g.path, cleJeu(g)]));
  return {
    mii: JSON.parse(localStorage.mii || 'null'),
    favoris: [...favoris],
    collections: collections.map((c) => ({ ...c, jeux: c.jeux.map((p) => cle.get(p) || p) })),
    partageJeux: localStorage.partageJeux || 'oui',
    montrerJeu: localStorage.montrerJeu || 'oui',
  };
}
/** Le profil daté de sa dernière modification ici (vue à la synchro). */
function monProfil() {
  const p = profilActuel();
  const texte = JSON.stringify(p);
  // Première synchro : un profil déjà rempli passe avant un profil vide, sans écraser une vraie modification.
  if (localStorage.profilEnvoye === undefined) localStorage.profilMaj = p.mii || p.favoris.length || p.collections.some((c) => c.jeux.length || c.id !== 'favoris') ? 1 : 0;
  else if (texte !== localStorage.profilEnvoye) localStorage.profilMaj = Date.now();
  localStorage.profilEnvoye = texte;
  return { ...p, maj: +localStorage.profilMaj || 0 };
}
/** Reprend le profil modifié sur un autre appareil. */
function adopterProfil(p) {
  if (p.mii && typeof p.mii === 'object') localStorage.mii = JSON.stringify(p.mii);
  if (Array.isArray(p.favoris)) (favoris.clear(), p.favoris.forEach((id) => favoris.add(String(id))), garderFavoris());
  if (Array.isArray(p.collections)) {
    const chemin = new Map(games.map((g) => [cleJeu(g), g.path]));
    collections = p.collections.filter((c) => c?.id && Array.isArray(c.jeux)).map((c) => ({ id: String(c.id), nom: String(c.nom || ''), jeux: c.jeux.map((k) => chemin.get(k) || String(k)) }));
    garderCollections();
  }
  for (const k of ['partageJeux', 'montrerJeu']) if (p[k] === 'oui' || p[k] === 'non') localStorage[k] = p[k];
  localStorage.profilEnvoye = JSON.stringify(profilActuel());
  localStorage.profilMaj = p.maj;
}
/** Pokédex : ce qui est attrapé sur les autres appareils s'ajoute ici. */
function reunirPokedex(autre) {
  if (!pokedexCredit || !autre || typeof autre !== 'object') return;
  for (const [k, x] of Object.entries(autre)) {
    if (!/^\d+:\d+$/.test(k)) continue; // « espèce:forme », rien d'autre (pas de __proto__)
    const e = (pokedexCredit[k] ||= { c: 0, j: [] });
    if (!Array.isArray(e.j)) e.j = [];
    if (x?.c) e.c = 1;
    for (const v of Array.isArray(x?.j) ? x.j : []) if (['string', 'number'].includes(typeof v) && !e.j.includes(v)) e.j.push(v);
  }
  garderCredit();
}

/** Additionne des compteurs : nombres sommés, listes réunies, compteurs par jeu fusionnés. */
function additionner(a, b) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b || {})) {
    if (k === 'jeux') {
      const j = { ...(out.jeux || {}) };
      for (const [cle, x] of Object.entries(v || {})) {
        const y = j[cle] || { s: 0, j: [], c: 0 };
        j[cle] = { s: (y.s || 0) + (x.s || 0), c: (y.c || 0) + (x.c || 0), j: [...new Set([...(y.j || []), ...(x.j || [])])].sort() };
      }
      out.jeux = j;
    } else if (Array.isArray(v)) out[k] = [...new Set([...(out[k] || []), ...v])].sort();
    else if (typeof v === 'number') out[k] = (Number(out[k]) || 0) + v;
    else if (!(k in out)) out[k] = v;
  }
  return out;
}

/** Compteurs de tous mes appareils (les miens et ceux des autres). */
const compteursTous = () => additionner(maProgression().compteurs, progAutres.compteurs);

/** Jeux joués sur tous mes appareils : { cle, console, titre, secs, last, g (s'il est ici) }. */
function jouesTous() {
  const par = new Map();
  for (const g of games) {
    const st = stats[g.path];
    if (!st?.secs && !st?.last) continue;
    const cle = cleJeu(g);
    const x = par.get(cle) || { cle, console: g.console, titre: titreDe(g), secs: 0, last: 0, g };
    x.secs += st.secs || 0;
    x.last = Math.max(x.last, st.last || 0);
    par.set(cle, x);
  }
  for (const [cle, st] of Object.entries(progAutres.stats || {})) {
    const x = par.get(cle) || { cle, console: st.c, titre: st.t || cle, secs: 0, last: 0, g: null };
    x.secs += st.secs || 0;
    x.last = Math.max(x.last, st.last || 0);
    par.set(cle, x);
  }
  return [...par.values()];
}
/** Temps de jeu d'un jeu, tous appareils compris. */
const tempsDe = (g) => (stats[g.path]?.secs || 0) + (progAutres.stats?.[cleJeu(g)]?.secs || 0);

/** Récupère la progression des autres appareils et envoie la mienne. */
let synchroEnCours = false;
async function synchroniser() {
  if (!me || !jeuxCharges || synchroEnCours) return;
  synchroEnCours = true;
  try {
    const r = await api('GET', '/progression');
    const autres = Object.entries(r?.appareils || {}).filter(([id]) => id !== appareil).map(([, a]) => a.donnees || {});
    jeuxAutres = Object.entries(r?.appareils || {}).filter(([id]) => id !== appareil).map(([, a]) => ({ systeme: a.systeme, jeux: Array.isArray(a.donnees?.bibliotheque) ? a.donnees.bibliotheque : [] }));
    localStorage.jeuxAutres = JSON.stringify(jeuxAutres);
    // Profil : celui modifié le plus récemment, ici ou ailleurs.
    const ici = monProfil();
    const recent = autres.map((d) => d.profil).filter((p) => p && +p.maj > ici.maj).sort((a, b) => b.maj - a.maj)[0];
    if (recent) adopterProfil(recent);
    for (const d of autres) reunirPokedex(d.pokedex);
    const fusion = { stats: {}, compteurs: {}, defisFaits: [] };
    for (const d of autres) {
      for (const [cle, st] of Object.entries(d.stats || {})) {
        const x = fusion.stats[cle] || { secs: 0, last: 0, c: st.c, t: st.t };
        fusion.stats[cle] = { ...x, secs: x.secs + (Number(st.secs) || 0), last: Math.max(x.last, Number(st.last) || 0) };
      }
      fusion.compteurs = additionner(fusion.compteurs, d.compteurs);
      fusion.defisFaits = [...new Set([...fusion.defisFaits, ...(Array.isArray(d.defisFaits) ? d.defisFaits : [])])];
    }
    progAutres = fusion;
    localStorage.progAutres = JSON.stringify(fusion);
    // Défis déjà réussis ailleurs : pas annoncés une deuxième fois ici.
    const faits = new Set([...JSON.parse(localStorage.defisFaits || '[]'), ...fusion.defisFaits]);
    localStorage.defisFaits = JSON.stringify([...faits]);
    verifierDefis();
    await api('PUT', '/progression', { appareil, systeme: /Mac OS X/.test(navigator.userAgent) ? 'mac' : 'windows', donnees: { ...maProgression(), profil: monProfil(), pokedex: pokedexCredit || {}, bibliotheque: mesJeux() } });
    if (recent) envoyerStats();
    if (onglet === 'profil' || (recent && onglet === 'collections')) drawSection();
  } catch (e) {
    invoke('journal', { texte: `progression : ${e}` }).catch(() => {});
  } finally {
    synchroEnCours = false;
  }
}
setInterval(synchroniser, 10 * 60_000);
