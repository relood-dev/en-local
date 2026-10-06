/*
 * Tournois : un membre organise un tournoi sur un de ses jeux, les autres s'inscrivent, il le lance.
 * Chaque match se joue dans une session En Local : « Jouer » la crée, l'adversaire reçoit le code.
 * Le perdant confirme le résultat (ou l'organisateur). Les données sont chez Loc.
 */
let tournoisListe = [];
let trnOuvert = null; // id du tournoi affiché, null : la liste
let trnFocus = 0;
let trnActions = [];
// Consoles des tournois : celles où un match se rejoint avec un simple code.
const CONSOLES_TOURNOI = ['Switch', '3DS', 'DS'];
// Genres GameTDB où l'on s'affronte. Pokémon compte aussi (combats). Sans genre connu : pas proposé.
const GENRES_TOURNOI = ['fighting', '2d fighting', '3d fighting', 'racing', 'kart racing', 'sports', 'party', 'shooter', 'first-person shooter', 'third-person shooter', 'arcade', 'board game', 'cards', 'puzzle', 'beat \'em up', 'football', 'soccer', 'tennis', 'golf', 'basketball', 'baseball', 'hockey', 'boxing', 'wrestling', 'bowling', 'billiards', 'table tennis', 'chess', 'poker', 'trivia'];
const PAS_TOURNOI = ['virtual pet', 'life simulation', 'educational', 'health', 'demo', 'software', 'drawing', 'cooking'];
function jeuDeTournoi(g) {
  if (!CONSOLES_TOURNOI.includes(g.console) || !enSession(g)) return false;
  const genres = fiche(g)?.genres || [];
  if (genres.some((x) => PAS_TOURNOI.includes(x))) return false;
  return /pok[eé]mon/i.test(titreDe(g)) || genres.some((x) => GENRES_TOURNOI.includes(x));
}

async function chargerTournois() {
  if (!me) return;
  tournoisListe = await api('GET', '/tournois').catch(() => tournoisListe);
  if (onglet === 'tournois') drawTournois();
}
setInterval(() => onglet === 'tournois' && !current && chargerTournois(), 15000);

const trnActuel = () => tournoisListe.find((t) => t.id === trnOuvert);
const nomJoueur = (t, id) => t.joueurs.find((j) => j.id === id)?.name || '…';
const avatarJoueur = (t, id) => t.joueurs.find((j) => j.id === id)?.avatar || 'img/hang-coucou.png';
const monJeuTournoi = (t) => games.find((g) => g.console === t.console && ((t.titleId && g.title_id === t.titleId) || (t.gameKey && dsKey(g) === t.gameKey) || titreDe(g) === t.jeu || g.name === t.jeu));
const jaquetteTournoi = (t) => {
  const g = monJeuTournoi(t);
  return g ? iconeHtml(g, true) : t.gametdb ? coverImg(jeuDeMembre(t.console, t.jeu, t.gametdb), 'icone-img', true) : `<span class="r-ic">${iconeConsole(t.console)}</span>`;
};
const ETATS_TOURNOI = { inscriptions: 'Inscriptions', 'en-cours': 'En cours', fini: 'Terminé' };

function drawTournois() {
  const t = trnActuel();
  if (!t) trnOuvert = null;
  trnActions = [];
  const action = (fn) => trnActions.push(fn) - 1;
  let html;
  if (!me) {
    html = `<div class="trn"><h1>Tournois</h1><p>Connecte-toi avec Discord pour jouer les tournois du Local.</p></div>`;
  } else if (!t) {
    html = `<div class="trn"><h1>Tournois</h1><p>Organise un tournoi sur un de tes jeux : les matchs se jouent dans En Local, avec un code.</p>
      <div class="trn-grille">
        <button class="trn-el trn-carte nouveau" data-n="${action(organiserTournoi)}"><div class="icone">${icone('<path d="M12 5v14M5 12h14"/>')}</div><span><b>Organiser un tournoi</b><small>Switch, 3DS ou DS</small></span></button>
        ${tournoisListe.map((x) => {
          const inscrit = x.joueurs.some((j) => j.id === me.id);
          const etat = x.etat === 'fini' ? `Gagné par ${esc(nomJoueur(x, x.champion))}` : x.etat === 'inscriptions' ? `${x.joueurs.length}/${+x.max || 0} inscrits` : x.monMatch ? 'Ton match est prêt' : 'En cours';
          return `<button class="trn-el trn-carte${x.monMatch ? ' a-jouer' : ''}" data-n="${action(() => ouvrirTournoi(x.id))}"><div class="icone">${jaquetteTournoi(x)}</div><span><b>${esc(x.nom)}</b><small>${esc(x.jeu)} · ${etat}${inscrit && x.etat === 'inscriptions' ? ' · inscrit' : ''}</small></span><i class="trn-etat ${esc(x.etat)}">${ETATS_TOURNOI[x.etat] || ''}</i></button>`;
        }).join('')}
      </div>${tournoisListe.length ? '' : '<div class="col-vide"><img src="img/loc/loc_gg.gif" alt=""><p>Aucun tournoi pour l\'instant. Lance le premier !</p></div>'}</div>`;
  } else {
    const orga = t.organisateur === me.id;
    const inscrit = t.joueurs.some((j) => j.id === me.id);
    const boutons = [];
    if (t.etat === 'inscriptions') {
      if (!inscrit) boutons.push(['S\'inscrire', () => inscrireTournoi(t, true)]);
      else if (!orga) boutons.push(['Se désinscrire', () => inscrireTournoi(t, false)]);
      if (orga) boutons.push([`Lancer (${t.joueurs.length} joueurs)`, () => lancerTournoi(t)]);
    }
    if (orga && t.etat !== 'fini') boutons.push(['Annuler le tournoi', () => annulerTournoi(t)]);
    const m = t.monMatch;
    const match = m && `<div class="trn-match">
      <img class="av" src="${esc(avatarJoueur(t, m.contre))}" alt=""><span><small>Ton match · ${esc(roundNom(m.r, t.rounds.length))}${+t.bo > 1 ? ` · au meilleur des ${+t.bo}` : ''}</small><b>Contre ${esc(nomJoueur(t, m.contre))}</b>${m.code ? `<small>Code de la session : <b>${esc(m.code)}</b></small>` : ''}${m.reclame === m.contre ? `<small>${esc(nomJoueur(t, m.contre))} annonce avoir gagné.</small>` : m.reclame === me.id ? '<small>Victoire annoncée, en attente de confirmation.</small>' : ''}</span>
      <div class="trn-boutons">
        <button class="trn-el choix" data-n="${action(() => jouerMatch(t))}">${m.code ? 'Rejoindre' : 'Jouer'}</button>
        ${m.reclame === m.contre ? `<button class="trn-el choix" data-n="${action(() => resultatMatch(t, m, m.contre))}">Confirmer sa victoire</button>` : `<button class="trn-el choix" data-n="${action(() => resultatMatch(t, m, me.id))}">J'ai gagné</button><button class="trn-el choix" data-n="${action(() => resultatMatch(t, m, m.contre))}">J'ai perdu</button>`}
      </div></div>`;
    const tableau = t.rounds ? `<div class="trn-tableau">${t.rounds.map((round, r) => `<div class="trn-tour"><small>${esc(roundNom(r, t.rounds.length))}</small><div class="trn-duels">${round.map((x, i) => {
      const ligne = (id) => `<span class="${x.winner && x.winner === id ? 'gagne' : x.winner ? 'perd' : ''}">${id ? `<img class="av" src="${esc(avatarJoueur(t, id))}" alt="">${esc(nomJoueur(t, id))}` : '<em>—</em>'}</span>`;
      const jouable = orga && !x.winner && x.a && x.b;
      return `<${jouable ? `button class="trn-el trn-duel" data-n="${action(() => arbitrer(t, r, i, x))}"` : 'div class="trn-duel"'}>${ligne(x.a)}${ligne(x.b)}</${jouable ? 'button' : 'div'}>`;
    }).join('')}</div></div>`).join('')}</div>` : `<div class="trn-joueurs">${t.joueurs.map((j) => `<span><img class="av" src="${esc(j.avatar || 'img/hang-coucou.png')}" alt="">${esc(j.name)}</span>`).join('')}</div>`;
    html = `<div class="trn"><div class="trn-tete"><div class="icone">${jaquetteTournoi(t)}</div><div><h1>${esc(t.nom)}</h1><p>${esc(t.jeu)} · ${esc(LONG[t.console] || t.console)} · ${t.joueurs.length}/${+t.max || 0} joueurs${t.champion ? ` · gagné par <b>${esc(nomJoueur(t, t.champion))}</b>` : ''}</p></div></div>
      ${boutons.length ? `<div class="trn-boutons">${boutons.map(([l, fn]) => `<button class="trn-el choix" data-n="${action(fn)}">${esc(l)}</button>`).join('')}</div>` : ''}
      ${match || ''}${tableau}</div>`;
  }
  $('#section').innerHTML = html;
  $('#section').querySelectorAll('.trn-el').forEach((b) => (b.onclick = () => ((trnFocus = +b.dataset.n), trnActions[trnFocus]())));
  $('#titre').textContent = t ? t.nom : 'Tournois';
  focusTournoi(trnFocus);
}
const roundNom = (r, n) => ['Finale', 'Demi-finales', 'Quarts', 'Huitièmes', 'Seizièmes'][n - 1 - r] || `Tour ${r + 1}`;

function focusTournoi(n) {
  const els = [...$('#section').querySelectorAll('.trn-el')];
  trnFocus = Math.max(0, Math.min(n, els.length - 1));
  els.forEach((el, k) => el.classList.toggle('focus', k === trnFocus));
  montrer($('#section .trn'), els[trnFocus]);
  $('#aide-g').innerHTML = `<div>${glyphs.b}${trnOuvert ? 'Tournois' : 'Accueil'}</div>`;
  $('#aide-d').innerHTML = els.length ? `<div>${glyphs.a}Valider</div>` : '';
}
function navTournois(k) {
  const els = [...$('#section').querySelectorAll('.trn-el')];
  if (['up', 'down', 'left', 'right'].includes(k)) {
    const n = voisin(els, trnFocus, k);
    if (n >= 0) focusTournoi(n);
    return;
  }
  if (k === 'a') return trnActions[trnFocus]?.();
  if (k === 'b') {
    if (trnOuvert) return ((trnOuvert = null), (trnFocus = 0), drawTournois());
    allerA('accueil');
  }
}
function ouvrirTournoi(id) {
  trnOuvert = id;
  trnFocus = 0;
  drawTournois();
  entree($('#section .trn'), 'apparait-seul');
}

/* ---------- Actions ---------- */

const majTournoi = (t) => {
  const k = tournoisListe.findIndex((x) => x.id === t.id);
  if (k >= 0) tournoisListe[k] = t;
  else tournoisListe.unshift(t);
  drawTournois();
};
async function organiserTournoi() {
  const jeux = games.map((g, i) => ({ g, i })).filter(({ g }) => jeuDeTournoi(g)).sort((a, b) => titreDe(a.g).localeCompare(titreDe(b.g), 'fr'));
  if (!jeux.length) return toast('Il te faut un jeu où l\'on s\'affronte (combat, course, sport…) sur Switch, 3DS ou DS.');
  sheet('Organiser un tournoi', 'Sur quel jeu ? Les joueurs devront avoir leur propre exemplaire.', [
    ...jeux.map(({ g }) => ({ label: `${titreDe(g)} · ${NOMS[g.console]}`, fn: () => tailleTournoi(g) })),
    { label: 'Annuler', cancel: true },
  ]);
}
function tailleTournoi(g) {
  sheet(`Tournoi ${titreDe(g)}`, 'Combien de joueurs au plus ? Tu le lances quand tu veux, même incomplet.', [
    ...[4, 8, 16, 32].map((max) => ({ label: `${max} joueurs`, fn: () => creerTournoi(g, max) })),
    { label: 'Annuler', cancel: true },
  ]);
}
async function creerTournoi(g, max) {
  try {
    const t = await api('POST', '/tournois', { jeu: titreDe(g), console: g.console, titleId: g.title_id || '', gameKey: g.console === 'DS' ? dsKey(g) : '', gametdb: idGametdb(g) || '', max });
    majTournoi(t);
    ouvrirTournoi(t.id);
    toast('Tournoi créé : les membres le voient dans Tournois.');
  } catch (e) {
    oops(e);
  }
}
const appel = (methode, chemin, corps) => api(methode, chemin, corps).then(majTournoi).catch(oops);
const inscrireTournoi = (t, oui) => appel(oui ? 'POST' : 'DELETE', `/tournois/${t.id}/inscription`);
function lancerTournoi(t) {
  if (t.joueurs.length < 2) return toast('Il faut au moins deux joueurs.');
  sheet('Lancer le tournoi ?', `${t.joueurs.length} joueurs. Les inscriptions se ferment et le tableau est tiré au sort.`, [
    { label: 'Lancer', fn: () => appel('POST', `/tournois/${t.id}/lancer`) },
    { label: 'Retour', cancel: true },
  ]);
}
function annulerTournoi(t) {
  sheet('Annuler le tournoi ?', 'Il disparaît pour tout le monde.', [
    { label: 'Annuler le tournoi', fn: () => api('DELETE', `/tournois/${t.id}`).then(() => ((tournoisListe = tournoisListe.filter((x) => x.id !== t.id)), (trnOuvert = null), drawTournois())).catch(oops) },
    { label: 'Retour', cancel: true },
  ]);
}
async function jouerMatch(t) {
  if (!monJeuTournoi(t)) return oops(`Il te faut ton propre exemplaire de ${t.jeu}.`);
  try {
    const { code } = await api('POST', `/tournois/${t.id}/jouer`);
    join(code);
  } catch (e) {
    oops(e);
  }
}
function resultatMatch(t, m, gagnant) {
  const moi = gagnant === me.id;
  sheet(moi ? 'Tu as gagné ?' : `${nomJoueur(t, gagnant)} a gagné ?`, moi ? 'Ton adversaire devra confirmer.' : 'Le match est terminé, le tableau avance.', [
    { label: 'Confirmer', fn: () => appel('POST', `/tournois/${t.id}/resultat`, { r: m.r, i: m.i, gagnant }) },
    { label: 'Retour', cancel: true },
  ]);
}
/** L'organisateur tranche n'importe quel match. */
function arbitrer(t, r, i, x) {
  sheet('Qui a gagné ?', 'En tant qu\'organisateur, tu peux donner le résultat de ce match.', [
    ...[x.a, x.b].map((id) => ({ label: nomJoueur(t, id), fn: () => appel('POST', `/tournois/${t.id}/resultat`, { r, i, gagnant: id }) })),
    { label: 'Retour', cancel: true },
  ]);
}
