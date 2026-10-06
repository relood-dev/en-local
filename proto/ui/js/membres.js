/*
 * Le Local : membres et sessions, dans un panneau à gauche (L2).
 * Avatars et statuts viennent de Discord, via Loc.
 */
let membres = [];
let panneauOuvert = false;
let panneauFocus = 0;
let filtre = '';
const favoris = new Set(JSON.parse(localStorage.favoris || '[]'));
const garderFavoris = () => (localStorage.favoris = JSON.stringify([...favoris]));

/** Ce que fait un membre, en une ligne. */
function activiteDe(m) {
  if (m.session) return { court: m.session.game, long: `En session : ${m.session.game} (${+m.session.players || 0}/${+m.session.slots || 0})`, kind: 'session' };
  if (m.enlocal?.state === 'jeu') return { court: m.enlocal.game, long: `Joue à ${m.enlocal.game}`, kind: 'jeu' };
  if (m.voice) return { court: m.voice, long: `En vocale : ${m.voice}`, kind: 'vocale' };
  if (m.enlocal) return { court: 'En Local', long: 'Dans les menus d\'En Local', kind: 'enlocal' };
  if (m.activity) return { court: m.activity.text, long: `${m.activity.kind === 'joue' ? 'Joue à ' : m.activity.kind === 'ecoute' ? 'Écoute ' : ''}${m.activity.text}`, kind: m.activity.kind };
  return { court: '', long: { online: 'En ligne sur Discord', idle: 'Absent', dnd: 'Ne pas déranger', offline: 'Hors ligne' }[m.status] || 'Hors ligne', kind: 'statut' };
}
// En ligne = En Local ouvert.
const enLigne = (m) => (m.app ? m.app === 'en-ligne' : m.status !== 'offline');
/** Exemple : « vu il y a 3 h » */
function vuIlYa(t) {
  if (!t) return '';
  const m = Math.round((Date.now() - t) / 60000);
  return m < 60 ? `vu il y a ${Math.max(1, m)} min` : m < 1440 ? `vu il y a ${Math.round(m / 60)} h` : `vu il y a ${Math.round(m / 1440)} j`;
}
const GROUPES = [['en-ligne', 'En ligne sur En Local'], ['hors-ligne', 'Hors ligne'], ['absent', 'Pas encore sur En Local']];
function ligneDe(m) {
  if (m.app === 'hors-ligne') return [vuIlYa(m.seen) || 'Hors ligne', m.voice ? `en vocale : ${m.voice}` : ''].filter(Boolean).join(' · ');
  return activiteDe(m).long;
}
const avatar = (m, cls = 'av') => `<span class="pres s-${esc(m.enlocal || m.app === 'en-ligne' ? 'enlocal' : m.status)}"><img class="${cls}" src="${esc(m.avatar)}" alt="" loading="lazy"></span>`;

/* ---------- Pilule en haut à gauche ---------- */

function drawPilule() {
  const p = $('#pill-local');
  if (!me) {
    p.innerHTML = `<span class="n">Le Local</span>${glyphs.lt}`;
  } else {
    const autresMembres = membres.filter((m) => !m.me);
    const tries = [...autresMembres.filter(enLigne), ...autresMembres.filter((m) => !enLigne(m))];
    const montres = tries.slice(0, 4);
    p.innerHTML = montres.length
      ? `${tries.length > montres.length ? `<span class="plus">+${tries.length - montres.length}</span>` : ''}<div class="stack">${montres.map((m) => avatar(m)).join('')}</div>${glyphs.lt}`
      : `<span class="n">Le Local</span>${glyphs.lt}`;
  }
  p.onclick = () => basculerMembres();
}

/* ---------- Panneau ---------- */

function drawMembres() {
  drawPilule();
  if (!panneauOuvert) return;
  const q = filtre.trim().toLowerCase();
  const autresMembres = membres.filter((m) => !m.me);
  const liste = autresMembres.filter((m) => !q || m.name.toLowerCase().includes(q));
  const favs = (favoris.size ? autresMembres.filter((m) => favoris.has(m.id)) : autresMembres.filter(enLigne)).slice(0, 5);
  const sess = autres();
  const f = (attrs, html, cls = '') => `<button class="pf ${cls}" ${attrs}>${html}</button>`;
  $('#membres').innerHTML = `
    <header><span class="tag">${favoris.size ? 'Favoris' : 'Le Local'}</span><span class="compte">${autresMembres.filter(enLigne).length}/${autresMembres.length} sur En Local</span></header>
    <div class="favs">${favs.map((m) => {
      const a = activiteDe(m);
      return f(`data-m="${esc(m.id)}"`, `${a.court ? `<span class="bulle">${esc(a.court)}</span>` : ''}${avatar(m, 'av grand')}<span class="nom">${esc(m.name)}</span>`, 'fav');
    }).join('') || '<p class="vide">Personne en ligne pour l\'instant.</p>'}</div>
    <div class="outils">
      <label class="recherche">${icone(DOCK.recherche)}<input id="filtre-membres" placeholder="Chercher un membre" value="${esc(filtre)}" spellcheck="false" autocomplete="off"></label>
      ${f('data-a="code" title="Rejoindre avec un code"', icone('<path d="M4 7h16M4 12h10M4 17h7"/>'), 'bouton-rond')}
      ${f('data-a="creer" title="Créer une session"', icone('<path d="M12 5v14M5 12h14"/>'), 'bouton-rond plein')}
    </div>
    ${sess.length ? `<div class="titre-groupe">Sessions ouvertes</div>${sess.map((s) => f(`data-s="${esc(s.code)}"`, `<img class="av" src="${esc(s.host?.avatar || 'img/hang-coucou.png')}" alt=""><span class="t"><b>${esc(s.game)}</b><small>${esc(s.host?.name || '')} · ${+s.players || 0}/${+s.slots || 0} · ${esc(s.code)}</small></span><span class="tag live">Rejoindre</span>`, 'ligne-m')).join('')}` : ''}
    ${GROUPES.map(([cle, titre]) => {
      const g = liste.filter((m) => (m.app || (enLigne(m) ? 'en-ligne' : 'hors-ligne')) === cle);
      if (!g.length) return '';
      return `<div class="titre-groupe">${titre} <span>${g.length}</span></div>`
        + g.map((m) => f(`data-m="${esc(m.id)}"`, `${avatar(m)}<span class="t"><b>${esc(m.name)}${favoris.has(m.id) ? ' <i class="etoile">★</i>' : ''}</b><small>${esc(ligneDe(m))}</small></span><span class="chev">›</span>`, `ligne-m g-${cle}`)).join('');
    }).join('')
      || `<div class="vide"><img src="img/loc/loc_${q ? 'cherche' : me ? 'attente' : 'enligne'}.gif" alt=""><p>${q ? 'Aucun membre ne porte ce nom.' : me ? 'Chargement des membres…' : 'Connecte-toi avec Discord pour voir les membres du Local.'}</p></div>`}`;
  const pfs = [...$('#membres').querySelectorAll('.pf')];
  pfs.forEach((el, n) => (el.onclick = () => ((panneauFocus = n), activerPanneau(el))));
  const input = $('#filtre-membres');
  input.oninput = () => {
    filtre = input.value;
    panneauFocus = 0;
    drawMembres();
    const i = $('#filtre-membres');
    i.focus();
    i.setSelectionRange(filtre.length, filtre.length);
  };
  focusPanneau(Math.min(panneauFocus, pfs.length - 1));
}

function focusPanneau(n) {
  const pfs = [...$('#membres').querySelectorAll('.pf')];
  panneauFocus = Math.max(0, n);
  pfs.forEach((el, k) => el.classList.toggle('focus', k === panneauFocus));
  montrer($('#membres'), pfs[panneauFocus]);
  $('#aide-g').innerHTML = `<div>${glyphs.b}Fermer</div>`;
  $('#aide-d').innerHTML = `<div>${glyphs.a}${pfs[panneauFocus]?.dataset.s ? 'Rejoindre' : 'Choisir'}</div>`;
}

async function basculerMembres(ouvrir = !panneauOuvert) {
  panneauOuvert = ouvrir;
  $('#accueil').classList.toggle('membres-ouvert', ouvrir);
  if (!ouvrir) {
    $('#filtre-membres')?.blur();
    return drawAide();
  }
  panneauFocus = 0;
  drawMembres();
  entree($('#membres'), 'panneau-entre');
  await chargerMembres();
}

async function chargerMembres() {
  if (!me) return drawMembres();
  if (!Object.keys(biblios).length) chargerBiblios();
  membres = await api('GET', '/members').catch(() => membres);
  drawMembres();
}

function activerPanneau(el) {
  if (!el) return;
  if (el.dataset.a === 'code') return ouvrirCode();
  if (el.dataset.a === 'creer') return (basculerMembres(false), choisirJeuSession());
  if (el.dataset.s) {
    const x = autres().find((y) => y.code === el.dataset.s);
    return x ? detailSession(x) : join(el.dataset.s);
  }
  const m = membres.find((x) => x.id === el.dataset.m);
  if (!m) return;
  const maSession = session?.code;
  const actions = [
    ...(m.session && m.session.code !== maSession ? [{ label: `Rejoindre sa session (${m.session.game})`, fn: () => join(m.session.code) }] : []),
    ...(maSession && !(m.session && m.session.code === maSession) ? [{ label: 'L\'inviter dans ma session', fn: () => inviter(m) }] : []),
    { label: 'Voir son profil', fn: () => profilMembre(m) },
    ...(jeuxDuMembre(m.id).length ? [{ label: `Ses jeux (${jeuxDuMembre(m.id).length})`, fn: () => jeuxDe_membre(m) }] : []),
    { label: favoris.has(m.id) ? 'Retirer des favoris' : 'Épingler en favori', fn: () => (favoris.has(m.id) ? favoris.delete(m.id) : favoris.add(m.id), garderFavoris(), drawMembres()) },
    { label: 'Lui écrire sur Discord', fn: () => invoke('open_discord_user', { id: m.id }) },
    { label: 'Fermer', cancel: true },
  ];
  sheet(m.name, esc(activiteDe(m).long), actions);
}

async function inviter(m) {
  try {
    await api('POST', `/members/${encodeURIComponent(m.id)}/invite`, { code: session.code });
    toast(`Invitation envoyée à ${m.name} : il la verra dans ses notifications`);
  } catch (e) {
    oops(e);
  }
}


function navMembres(k) {
  const pfs = [...$('#membres').querySelectorAll('.pf')];
  if (['up', 'down', 'left', 'right'].includes(k)) {
    if (document.activeElement?.id === 'filtre-membres') document.activeElement.blur();
    let best = voisin(pfs, panneauFocus, k);
    if (best < 0 && (k === 'up' || k === 'down')) best = panneauFocus + (k === 'up' ? -1 : 1);
    if (best >= 0 && best < pfs.length) focusPanneau(best);
    return;
  }
  if (k === 'a') return activerPanneau(pfs[panneauFocus]);
  if (k === 'b' || k === 'lt') return basculerMembres(false);
}

/* ---------- Envoyé à Loc ---------- */

/** Présence du joueur, envoyée toutes les 30 s. */
function envoyerPresence() {
  if (!me) return;
  const p = current && (session || partage('montrerJeu')) ? { state: 'jeu', game: fiche(current)?.title || current.name, console: NOMS[current.console] } : { state: 'menus' };
  api('POST', '/presence', p).then((r) => recevoirNotifs(r?.notifications)).catch(() => {}); // les invitations reçues arrivent avec
}
/** Liste des jeux, pour « qui a ce jeu ? ». */
function envoyerBibliotheque() {
  if (!me || !jeuxCharges) return;
  // Partage désactivé : liste vide.
  const liste = games.map((g) => ({ t: fiche(g)?.title || g.name, c: g.console, id: idGametdb(g) || undefined, maj: contenus[g.path]?.maj || undefined, dlc: contenus[g.path]?.dlc || undefined }));
  api('PUT', '/library', partage('partageJeux') ? liste : []).catch(() => {});
}
/** Chiffres du profil, pour /enlocal sur Discord. */
function envoyerStats() {
  if (!me || !jeuxCharges) return;
  if (!partage('partageJeux')) return api('PUT', '/stats', {}).catch(() => {});
  const ds = defis();
  const consoles = {};
  for (const g of games) if (stats[g.path]?.secs) consoles[g.console] = (consoles[g.console] || 0) + stats[g.path].secs;
  const top = games.filter((g) => stats[g.path]?.secs).sort((a, b) => stats[b.path].secs - stats[a.path].secs).slice(0, 5)
    .map((g) => ({ t: fiche(g)?.title || g.name, c: g.console, s: stats[g.path].secs }));
  api('PUT', '/stats', {
    secs: tempsTotal(), jeux: games.length, joues: joues().length, consoles, top,
    defis: ds.filter((d) => d.fait).length, defisTotal: ds.length, serie: serie(), jours: (compteurs.jours || []).length,
    sessions: (compteurs.sessionsCreees || 0) + (compteurs.sessionsRejointes || 0), captures: capturesListe.length,
    pseudo: pseudoConsoles(), defisV: Object.fromEntries(ds.map((d) => [d.id, d.v])),
  }).catch(() => {});
}

/* ---------- Jeux des membres ---------- */

let biblios = {};
async function chargerBiblios() {
  if (!me) return;
  const b = await api('GET', '/libraries').catch(() => null);
  // Données venant d'autres PC : tout ce qui n'a pas la bonne forme est ignoré.
  if (b && typeof b === 'object' && !Array.isArray(b)) biblios = b;
}
setInterval(chargerBiblios, 120000);
/** Profil complet d'un membre. */
async function profilMembre(m) {
  const s = await api('GET', `/stats/${encodeURIComponent(m.id)}`).catch(() => null);
  basculerMembres(false);
  allerA('profil', { m, s: s && typeof s.secs === 'number' ? s : null });
}

const jeuxDuMembre = (id) => (Array.isArray(biblios[id]) ? biblios[id].filter((j) => typeof j?.t === 'string' && j.t) : []);
/** Exemple : « MAJ 13 · 82 DLC » */
const texteContenus = (x) => [x?.maj && (x.maj === '?' ? 'MAJ' : `MAJ ${x.maj}`), x?.dlc && `${x.dlc} DLC`].filter(Boolean).join(' · ');
const majsDifferentes = (a, b) => Boolean(a && b && a !== '?' && b !== '?' && a !== b);
/** Membres qui ont le jeu g. */
function possesseurs(g) {
  const t = plat(titreDe(g));
  return membres.filter((m) => !m.me).flatMap((m) => jeuxDuMembre(m.id).filter((j) => j.c === g.console && plat(j.t) === t).slice(0, 1).map((j) => ({ m, maj: j.maj, dlc: j.dlc })));
}
/** Jeux d'un membre, ceux qu'on a aussi en premier. */
function jeuxDe_membre(m) {
  const liste = jeuxDuMembre(m.id);
  const mien = (j) => games.findIndex((g) => g.console === j.c && plat(titreDe(g)) === plat(j.t));
  const tries = liste.map((j) => ({ j, i: mien(j) })).sort((a, b) => (b.i >= 0) - (a.i >= 0) || (ORDRE.indexOf(a.j.c) - ORDRE.indexOf(b.j.c)) || a.j.t.localeCompare(b.j.t, 'fr'));
  sheet(`Les jeux de ${m.name}`, `${liste.length} jeu${liste.length > 1 ? 'x' : ''}, avec leur mise à jour et leurs DLC. ✓ : tu l'as aussi.`, [
    ...tries.map(({ j, i }) => {
      const chezMoi = i >= 0 ? contenus[games[i].path] : null;
      const diff = i >= 0 && majsDifferentes(j.maj, chezMoi?.maj) ? ` (toi : MAJ ${chezMoi.maj})` : '';
      return { label: `${i >= 0 ? '✓ ' : ''}${j.t} · ${NOMS[j.c] || j.c}${texteContenus(j) ? ` · ${texteContenus(j)}` : ''}${diff}`, fn: () => (i >= 0 ? voirJeu(i) : undefined) };
    }),
    { label: 'Fermer', cancel: true },
  ]);
}
setInterval(envoyerPresence, 30000);
setInterval(() => (panneauOuvert || view() === 'biblio') && chargerMembres(), 20000);
