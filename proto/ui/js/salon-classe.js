/*
 * Salon d'une partie classée, en plein écran : les deux joueurs face à face, les étapes au centre
 * (prêt, persos à l'aveugle, bans, stage ou circuits, résultats) et le chat à droite. Les règles
 * sont chez Loc (regles.js) ; l'app relit le salon toutes les 1,5 s tant qu'il est ouvert.
 * B referme le salon sans quitter le match : la carte de Compétition et le menu HOME y ramènent.
 */
let salonClasse = null; // dernier état reçu de Loc
let salonFocus = 0;
let salonCle = ''; // l'élément focalisé, gardé d'un dessin à l'autre
let salonVu = '';
const MESSAGES_RAPIDES = ['GG !', 'Prêt !', 'Une seconde', 'Arène créée', 'Je te rejoins', 'Bien joué'];

/* Images officielles (smashbros.com, mariokart8.nintendo.com), chargées à l'affichage. */
const SMASH_IMG = 'https://www.smashbros.com/assets_v2/img';
const PERSO_IMG = { 'Mario': 'mario', 'Donkey Kong': 'donkey_kong', 'Link': 'link', 'Samus': 'samus', 'Samus sombre': 'dark_samus', 'Yoshi': 'yoshi', 'Kirby': 'kirby', 'Fox': 'fox', 'Pikachu': 'pikachu', 'Luigi': 'luigi', 'Ness': 'ness', 'Captain Falcon': 'captain_falcon', 'Rondoudou': 'purin', 'Peach': 'peach', 'Daisy': 'daisy', 'Bowser': 'koopa', 'Ice Climbers': 'ice_climber', 'Sheik': 'sheik', 'Zelda': 'zelda', 'Dr. Mario': 'dr_mario', 'Pichu': 'pichu', 'Falco': 'falco', 'Marth': 'marth', 'Lucina': 'lucina', 'Link enfant': 'young_link', 'Ganondorf': 'ganondorf', 'Mewtwo': 'mewtwo', 'Roy': 'roy', 'Chrom': 'chrom', 'Mr. Game & Watch': 'mr_game_and_watch', 'Meta Knight': 'meta_knight', 'Pit': 'pit', 'Pit maléfique': 'black_pit', 'Samus sans armure': 'zero_suit_samus', 'Wario': 'wario', 'Snake': 'snake', 'Ike': 'ike', 'Dresseur de Pokémon': 'pokemon_trainer', 'Diddy Kong': 'diddy_kong', 'Lucas': 'lucas', 'Sonic': 'sonic', 'Roi DaDiDou': 'dedede', 'Olimar': 'pikmin_and_olimar', 'Lucario': 'lucario', 'R.O.B.': 'robot', 'Link cartoon': 'toon_link', 'Wolf': 'wolf', 'Villageois': 'murabito', 'Mega Man': 'rockman', 'Entraîneuse Wii Fit': 'wii_fit_trainer', 'Harmonie & Luma': 'rosetta_and_chiko', 'Little Mac': 'little_mac', 'Amphinobi': 'gekkouga', 'Boxeur Mii': 'mii_fighter', 'Épéiste Mii': 'mii_fighter', 'Tireur Mii': 'mii_fighter', 'Palutena': 'palutena', 'Pac-Man': 'pac_man', 'Daraen': 'reflet', 'Shulk': 'shulk', 'Bowser Jr.': 'koopa_jr', 'Duo Duck Hunt': 'duck_hunt', 'Ryu': 'ryu', 'Ken': 'ken', 'Cloud': 'cloud', 'Corrin': 'kamui', 'Bayonetta': 'bayonetta', 'Inkling': 'inkling', 'Ridley': 'ridley', 'Simon': 'simon', 'Richter': 'richter', 'King K. Rool': 'king_k_rool', 'Marie': 'shizue', 'Félinferno': 'gaogaen', 'Plante Piranha': 'packun_flower', 'Joker': 'joker', 'Héros': 'dq_hero', 'Banjo & Kazooie': 'banjo_and_kazooie', 'Terry': 'terry', 'Byleth': 'byleth', 'Min Min': 'minmin', 'Steve / Alex': 'steve', 'Sephiroth': 'sephiroth', 'Pyra / Mythra': 'homura', 'Kazuya': 'kazuya', 'Sora': 'sora' };
const STAGE_IMG = { 'Champ de Bataille': 'stage_img1', 'Petit Champ de Bataille': 'stage_img104', 'Destination Finale': 'stage_img3', 'Stade Pokémon 2': 'stage_img40', 'Smash Ville': 'stage_img44', 'Ville & centre-ville': 'stage_img85_en', 'Ligue Pokémon de Kalos': 'stage_img79', 'Forteresse oubliée': 'stage_addition_img11', 'Yoshi\'s Story': 'stage_img19' };
const MK_IMG = 'https://mariokart8.nintendo.com/assets/img/courses';
const COUPE_IMG = { Champignon: 'mushroom', Fleur: 'flower', Étoile: 'star', Spéciale: 'special', Carapace: 'shell', Banane: 'banana', Feuille: 'leaf', Éclair: 'lightning', Œuf: 'egg', Triforce: 'triforce', Crossing: 'crossing', Clochette: 'bell' };
const imgPerso = (p) => (PERSO_IMG[p] ? `<img class="mt-img" src="${SMASH_IMG}/fighter/thumb_a/${PERSO_IMG[p]}.png" alt="" loading="lazy">` : '');
const imgStage = (x) => (STAGE_IMG[x] ? `<img class="mt-img" src="${SMASH_IMG}/stage/${STAGE_IMG[x]}.jpg" alt="" loading="lazy">` : '');
const imgCoupe = (c) => (COUPE_IMG[c] ? `<img class="mt-img icone-coupe" src="${MK_IMG}/${COUPE_IMG[c]}_icon.png" alt="" loading="lazy">` : '');
/** Image d'un circuit : sa coupe et sa place dans la coupe. */
function imgCircuit(l, x) {
  const c = Object.keys(l.coupes || {}).find((k) => l.coupes[k].includes(x));
  return c && COUPE_IMG[c] ? `<img class="mt-img" src="${MK_IMG}/${COUPE_IMG[c]}_0${l.coupes[c].indexOf(x) + 1}.jpg" alt="" loading="lazy">` : '';
}

async function ouvrirSalonClasse() {
  const e = await api('GET', '/classe/salon').catch(() => null);
  if (e?.etat !== 'salon') return chargerClasses();
  salonClasse = e;
  salonFocus = 0;
  salonCle = '';
  ouvrirSalle({ mode: 'match', actions: [] });
}
function fermerSalonClasse() {
  salonClasse = null;
  fermerSalle();
  chargerClasses();
}
setInterval(async () => {
  if (salle?.mode !== 'match') return;
  const e = await api('GET', '/classe/salon').catch(() => null);
  if (salle?.mode !== 'match' || !e) return;
  if (e.etat !== 'salon') return finSalon();
  const avant = salonClasse;
  salonClasse = e;
  if (JSON.stringify(avant) !== JSON.stringify(e)) {
    if (e.salon.tour.aMoi && !avant?.salon.tour.aMoi) son('notif', true);
    if (e.chat.length > (avant?.chat.length || 0) && e.chat.at(-1).de !== e.moi.id) son('notif', true);
    drawSalle();
  }
}, 1500);
/** Match fini : le résultat, puis retour à Compétition. */
async function finSalon() {
  const s = salonClasse;
  fermerSalonClasse();
  if (!s) return;
  const sc = s.salon.score || {};
  const fin = await api('GET', '/classe/file').catch(() => null);
  if (fin?.etat === 'match') return;
  toast(`Partie classée terminée : ${sc[s.moi.id] || 0} – ${sc[s.contre.id] || 0}. Ta cote est à jour dans Compétition.`);
}

const nomDe = (s, id) => (id === s.moi.id ? 'Toi' : s.contre.name);
function texteTour(s) {
  const t = s.salon.tour, l = s.salon;
  const lui = s.contre.name;
  if (l.etape === 'fini') return 'Match terminé';
  if (t.aMoi) return { pret: 'Prêt ?', perso: l.etape === 'persos' ? 'Choisis ton perso · à l\'aveugle' : 'Choisis ton perso', ban: `Barre ${t.reste > 1 ? `${t.reste} ${l.type === 'mk' ? 'coupes' : 'stages'}` : `${l.type === 'mk' ? 'une coupe' : 'un stage'}`}`, stage: 'Choisis le stage', course: `Choisis un circuit · encore ${t.reste}`, gagnant: 'Qui a gagné la manche ?', place: 'Ta place à cette course ?' }[t.quoi] || '';
  return `${lui} ${({ pret: 'se prépare', perso: 'choisit son perso', ban: 'barre', stage: 'choisit le stage', course: 'choisit un circuit', gagnant: 'donne le résultat', place: 'donne sa place' })[t.quoi] || 'réfléchit'}…`;
}

/** Ce qui se décide en ce moment : boutons, tuiles de persos, de stages ou de circuits. */
function htmlEtape(s, el) {
  const l = s.salon, t = l.tour, mm = l.manches.at(-1);
  const moi = s.moi.id, lui = s.contre.id;
  if (l.etape === 'pret') {
    return `<div class="mt-pret">${[s.moi, s.contre].map((j) => `<div class="mt-pret-j${l.pret.includes(j.id) ? ' ok' : ''}"><img class="av" src="${esc(j.avatar || 'img/hang-coucou.png')}" alt=""><b>${esc(j.name)}</b><small>${l.pret.includes(j.id) ? 'Prêt' : 'En attente'}</small></div>`).join('<i class="mt-vs">VS</i>')}</div>
      <p class="mt-aide">${l.hote === moi ? 'C\'est <b>toi</b> qui crées la salle dans le jeu' : `C'est <b>${esc(s.contre.name)}</b> qui crée la salle dans le jeu`}, en mode sans fil local. ${l.type === 'smash' ? 'Au meilleur des 3 manches.' : '4 courses, le plus petit total de places gagne.'}</p>
      ${t.aMoi ? `<div class="mt-boutons">${el('pret', 'choix main', 'Je suis prêt', { type: 'pret' })}</div>` : ''}`;
  }
  if (l.etape === 'fini') {
    const g = l.vainqueur === moi;
    return `<div class="mt-fin${g ? ' gagne' : ''}"><img src="img/loc/loc_${g ? 'gg' : 'coucou'}.gif" alt=""><b>${g ? 'Victoire !' : `${esc(s.contre.name)} gagne`}</b><small>${l.score[moi]} – ${l.score[lui]}</small></div>`;
  }
  if (t.quoi === 'perso' || (l.etape === 'persos')) {
    const liste = s.salon.liste || [];
    const aveugle = l.etape === 'persos';
    return `<p class="mt-aide">${aveugle ? `Vous choisissez en même temps : le perso de ${esc(s.contre.name)} s'affiche quand vous avez tous les deux choisi.` : l.etape === 'perso-g' ? 'Le gagnant de la manche choisit son perso en premier.' : 'Le perdant choisit ensuite, en voyant le perso de l\'autre.'}</p>
      ${t.aMoi ? `<div class="mt-grille persos">${liste.map((p) => el(`perso:${p}`, `mt-tuile perso${l.persos[moi] === p ? ' pris' : ''}`, `<i>${esc(initiales(p))}</i>${imgPerso(p)}<span>${esc(p)}</span>`, { type: 'perso', valeur: p })).join('')}</div>`
        : `<div class="mt-attente"><img src="img/loc/loc_attente.gif" alt=""><span>${l.persos[moi] && aveugle ? `Tu as pris <b>${esc(l.persos[moi])}</b>. ` : ''}En attente de ${esc(s.contre.name)}…</span></div>`}`;
  }
  if (t.quoi === 'ban' || t.quoi === 'stage') {
    const tous = l.type === 'mk' ? Object.keys(l.coupes) : l.stages || [];
    const libre = new Set(s.salon.liste || []);
    return `<p class="mt-aide">${l.type === 'mk' ? 'Chacun barre une coupe : ses circuits ne seront pas joués.' : l.manches.length === 1 ? 'Manche 1 : on barre chacun son tour (1, 2, 1). Le dernier stage restant est joué.' : 'Le gagnant de la manche barre 3 stages, puis le perdant choisit parmi les autres.'}</p>
      <div class="mt-grille ${l.type === 'mk' ? 'coupes' : 'stages'}">${tous.map((x) => {
        const barre = l.bans.includes(x);
        const action = t.aMoi && libre.has(x) ? { type: t.quoi, valeur: x } : null;
        const inner = l.type === 'mk'
          ? `<div class="mt-coupe-tete">${imgCoupe(x)}<span>Coupe ${esc(x)}</span></div><div class="mt-mini">${l.coupes[x].map((c) => imgCircuit(l, c)).join('')}</div><small>${l.coupes[x].map(esc).join(' · ')}</small>${barre ? '<em>Barré</em>' : ''}`
          : `${imgStage(x)}<span>${esc(x)}</span>${barre ? '<em>Barré</em>' : ''}`;
        return action ? el(`${t.quoi}:${x}`, `mt-tuile stage`, inner, action) : `<div class="mt-tuile stage${barre ? ' barree' : ''}">${inner}</div>`;
      }).join('')}</div>`;
  }
  if (t.quoi === 'course') {
    const libre = new Set(s.salon.liste || []);
    return `<p class="mt-aide">Chacun son tour, 4 circuits en tout. Coupes barrées : ${l.bans.map((x) => `<b>${esc(x)}</b>`).join(', ')}.</p>
      <div class="mt-choisis">${l.choix.map((c, k) => `<span>${imgCircuit(l, c)}<i>${k + 1}</i><b>${esc(c)}</b></span>`).join('')}${Array.from({ length: 4 - l.choix.length }, (_, k) => `<span class="vide"><i>${l.choix.length + k + 1}</i>…</span>`).join('')}</div>
      <div class="mt-grille circuits">${Object.entries(l.coupes).filter(([c]) => !l.bans.includes(c)).map(([c, liste]) => `<div class="mt-coupe"><small>${imgCoupe(c)}Coupe ${esc(c)}</small>${liste.map((x) => (t.aMoi && libre.has(x) ? el(`course:${x}`, 'mt-circuit', `${imgCircuit(l, x)}<span>${esc(x)}</span>`, { type: 'course', valeur: x }) : `<div class="mt-circuit${l.choix.includes(x) ? ' pris' : ' off'}">${imgCircuit(l, x)}<span>${esc(x)}</span></div>`)).join('')}</div>`).join('')}</div>`;
  }
  if (l.etape === 'jeu') {
    const enSessionDuMatch = session?.code && session.code === s.code;
    const lancer = enSessionDuMatch && current ? el('reprendre', 'choix', 'Reprendre le jeu', { local: 'reprendre' }) : s.code ? el('lancer', 'choix', 'Lancer le jeu', { local: 'lancer' }) : '';
    if (l.type === 'smash') {
      const p = mm.persos || {};
      return `<div class="mt-manche image">${imgStage(mm.stage)}<small>Manche ${l.manches.length}</small><b>${esc(mm.stage || '')}</b><div class="mt-duel"><span>${imgPerso(p[moi])}${esc(p[moi] || '?')}</span><i>VS</i><span>${imgPerso(p[lui])}${esc(p[lui] || '?')}</span></div></div>
        <p class="mt-aide">${l.hote === moi ? 'Crée l\'arène dans le jeu (sans fil local)' : `${esc(s.contre.name)} crée l'arène dans le jeu`}, joue la manche, puis reviens ici (${glyphs.home}) pour donner le gagnant.</p>
        <div class="mt-boutons">${lancer}${t.aMoi ? `${el('g:moi', 'choix main', 'J\'ai gagné', { type: 'gagnant', valeur: moi })}${el('g:lui', 'choix', 'J\'ai perdu', { type: 'gagnant', valeur: lui })}` : '<span class="mt-attente-t">Résultat donné, en attente de l\'autre…</span>'}</div>`;
    }
    return `<div class="mt-manche image">${imgCircuit(l, mm.course)}<small>Course ${l.manches.length} sur 4</small><b>${esc(mm.course)}</b><div class="mt-duel"><span>${points(l, moi)}</span><i>total</i><span>${points(l, lui)}</span></div></div>
      <p class="mt-aide">${l.hote === moi ? 'Crée la salle dans le jeu (sans fil local)' : `${esc(s.contre.name)} crée la salle dans le jeu`}, cours, puis reviens ici (${glyphs.home}) pour donner ta place.</p>
      <div class="mt-boutons">${lancer}</div>
      ${t.aMoi ? `<div class="mt-places">${Array.from({ length: 12 }, (_, k) => el(`place:${k + 1}`, 'mt-place', `${k + 1}<sup>${k ? 'e' : 'er'}</sup>`, { type: 'place', valeur: k + 1 })).join('')}</div>` : '<p class="mt-attente-t">Place donnée, en attente de l\'autre…</p>'}`;
  }
  return '';
}
/** Total des places des courses déjà jouées (le plus petit gagne). */
const points = (l, id) => ((n) => `${n} point${n > 1 ? 's' : ''}`)(l.manches.slice(0, -1).reduce((n, c) => n + c.places[id], 0));
const initiales = (nom) => nom.replace(/[^A-Za-zÀ-ÿ0-9 ]/g, '').split(' ').filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase();

function drawSalonClasse() {
  const s = salonClasse;
  if (!s) return;
  const l = s.salon;
  const actions = [];
  let n = 0;
  const el = (cle, cls, html, action) => (actions.push({ cle, action }), `<button class="mt-el ${cls}" data-n="${n++}" data-k="${esc(cle)}">${html}</button>`);
  const g = games.find((x) => (x.title_id || '').toUpperCase() === (l.type === 'smash' ? '01006A800016E000' : '0100152000022000'));
  const joueur = (j, cote) => {
    const perso = l.type === 'smash' && l.persos[j.id];
    return `<div class="mt-joueur${cote === 'd' ? ' droite' : ''}${l.tour.qui.includes(j.id) ? ' agit' : ''}">${perso && perso !== '?' ? `<div class="mt-perso-fond">${imgPerso(perso)}</div>` : ''}<img class="av" src="${esc(j.avatar || 'img/hang-coucou.png')}" alt=""><span><b>${esc(j.name)}</b><small>Cote ${+j.cote || 1000}${perso ? ` · ${esc(perso === '?' ? 'perso choisi' : perso)}` : ''}</small></span><i class="mt-score">${l.score[j.id] || 0}</i></div>`;
  };
  const etape = htmlEtape(s, el);
  const chat = s.chat.map((c) => `<div class="mt-msg${c.de === s.moi.id ? ' moi' : !c.de ? ' loc' : ''}">${c.de && c.de !== s.moi.id ? `<small>${esc(s.contre.name)}</small>` : ''}<span>${esc(c.de ? c.texte : `Loc : ${c.texte}`)}</span></div>`).join('') || '<p class="mt-vide">Dis bonjour à ton adversaire !</p>';
  const rapides = MESSAGES_RAPIDES.map((m) => el(`chat:${m}`, 'mt-rapide', esc(m), { chat: m })).join('') + el('ecrire', 'mt-rapide ecrire', `${glyphs.x || ''}Écrire…`, { local: 'ecrire' });
  $('#salle').innerHTML = `<div class="salle-carte mt">
    <div class="mt-tete"><div class="icone">${g ? iconeHtml(g) : ''}</div><span><small>Partie classée · ${l.type === 'smash' ? 'au meilleur des 3' : '4 courses'}</small><b>${esc(s.jeu)}</b></span><i class="mt-tour${l.tour.aMoi ? ' a-moi' : ''}">${esc(texteTour(s))}</i></div>
    <div class="mt-corps">
      <div class="mt-centre">
        <div class="mt-face">${joueur(s.moi, 'g')}${joueur(s.contre, 'd')}</div>
        <div class="mt-etape">${etape}</div>
      </div>
      <aside class="mt-chat"><div class="mt-fil">${chat}</div><div class="mt-rapides">${rapides}</div></aside>
    </div>
    <div class="mt-pied">${el('fermer', 'mt-lien', `${glyphs.b}Fermer le salon`, { local: 'fermer' })}${l.etape !== 'fini' ? el('abandon', 'mt-lien', 'Abandonner le match', { local: 'abandon' }) : ''}</div>
  </div>`;
  salle.actionsMatch = actions;
  const els = [...$('#salle').querySelectorAll('.mt-el')];
  els.forEach((b) => (b.onclick = () => ((salonFocus = +b.dataset.n), activerSalon())));
  const k = els.findIndex((b) => b.dataset.k === salonCle);
  // Après un choix, le focus va au premier élément de la nouvelle étape.
  focusSalon(k >= 0 ? k : 0);
  // Image indisponible (hors ligne…) : on garde les initiales ou le nom.
  $('#salle').querySelectorAll('img.mt-img').forEach((i) => (i.onerror = () => i.classList.add('ko')));
  const fil = $('#salle .mt-fil');
  if (fil) fil.scrollTop = fil.scrollHeight;
}
function focusSalon(k) {
  const els = [...$('#salle').querySelectorAll('.mt-el')];
  salonFocus = Math.max(0, Math.min(k, els.length - 1));
  els.forEach((b, i) => b.classList.toggle('focus', i === salonFocus));
  salonCle = els[salonFocus]?.dataset.k || '';
  els[salonFocus]?.scrollIntoView({ block: 'nearest' });
  $('#aide-g').innerHTML = `<div>${glyphs.b}Fermer</div>`;
  $('#aide-d').innerHTML = `<div>${glyphs.x}Écrire</div><div>${glyphs.a}Valider</div>`;
}
async function activerSalon() {
  const a = salle?.actionsMatch?.[salonFocus]?.action;
  if (!a) return;
  const s = salonClasse;
  if (a.local === 'fermer') return fermerSalonClasse();
  if (a.local === 'ecrire') return ecrireSalon();
  if (a.local === 'reprendre') return (fermerSalle(), closeMenu());
  if (a.local === 'lancer') {
    const code = s.code;
    fermerSalle();
    return current && enAccueil ? rejoindreDepuisAccueil(code) : join(code);
  }
  if (a.local === 'abandon') {
    return sheet('Abandonner le match ?', `${esc(s.contre.name)} gagne, et ta cote baisse comme pour une défaite.`, [
      { label: 'Abandonner', fn: () => envoyerSalon({ type: 'abandon' }) },
      { label: 'Retour', cancel: true },
    ]);
  }
  if (a.chat) return api('POST', '/classe/salon/chat', { texte: a.chat }).then(majSalon).catch(oops);
  if (a.type === 'perso' && s.salon.etape === 'persos') {
    return sheet(`${a.valeur} ?`, 'Ton adversaire le découvre quand il a choisi aussi.', [
      { label: `Prendre ${a.valeur}`, fn: () => envoyerSalon(a) },
      { label: 'Retour', cancel: true },
    ]);
  }
  if (a.type === 'gagnant') {
    const moi = a.valeur === s.moi.id;
    return sheet(moi ? 'Tu as gagné la manche ?' : `${s.contre.name} a gagné la manche ?`, 'Ton adversaire donne aussi le résultat : s\'il n\'est pas d\'accord, vous le redonnez.', [
      { label: 'Confirmer', fn: () => envoyerSalon(a) },
      { label: 'Retour', cancel: true },
    ]);
  }
  envoyerSalon(a);
}
const envoyerSalon = (a) => api('POST', '/classe/salon', { type: a.type, valeur: a.valeur }).then(majSalon).catch(oops);
function majSalon(e) {
  if (e?.etat !== 'salon') return finSalon();
  salonClasse = e;
  if (salle?.mode === 'match') drawSalle();
}
function ecrireSalon() {
  saisirTexte({
    titre: `Message à ${salonClasse.contre.name}`,
    champs: [{ id: 'texte', label: 'Message', valeur: '' }],
    bouton: 'Envoyer',
    valider: async ({ texte }) => {
      if (!texte.trim()) return 'Écris quelque chose.';
      await api('POST', '/classe/salon/chat', { texte }).then(majSalon).catch(oops);
    },
  });
}
function navSalonClasse(k) {
  const els = [...$('#salle').querySelectorAll('.mt-el')];
  if (['up', 'down', 'left', 'right'].includes(k)) {
    const n = voisin(els, salonFocus, k);
    if (n >= 0) focusSalon(n);
    return;
  }
  if (k === 'a') return activerSalon();
  if (k === 'x') return ecrireSalon();
  if (k === 'b') return fermerSalonClasse();
}
